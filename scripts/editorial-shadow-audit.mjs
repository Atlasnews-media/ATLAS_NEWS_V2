import fs from "node:fs/promises";
import path from "node:path";

const CONTENT_DIRS = [
  { dir: "src/content/editions", fallbackSection: "general" },
  { dir: "src/content/briefings", fallbackSection: "briefing" },
];

const STOPWORDS = new Set([
  "a",
  "al",
  "algo",
  "ante",
  "bajo",
  "cada",
  "como",
  "con",
  "contra",
  "cuando",
  "de",
  "del",
  "desde",
  "donde",
  "el",
  "ella",
  "en",
  "entre",
  "era",
  "es",
  "esa",
  "ese",
  "esta",
  "este",
  "esto",
  "hacia",
  "hasta",
  "la",
  "las",
  "lo",
  "los",
  "mas",
  "más",
  "mientras",
  "muy",
  "no",
  "o",
  "para",
  "pero",
  "por",
  "porque",
  "que",
  "qué",
  "se",
  "sin",
  "sobre",
  "su",
  "sus",
  "tras",
  "un",
  "una",
  "uno",
  "y",
  "ya",
  "the",
  "and",
  "for",
  "from",
  "into",
  "of",
  "on",
  "to",
  "with",
]);

const DEFAULTS = {
  windowDays: 5,
  titleSimilarity: 0.45,
  thesisSimilarity: 0.35,
  crossSectionSimilarity: 0.32,
  lowNovelty: 55,
  outDir: "artifacts/editorial-shadow",
};

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--window="))
      config.windowDays = Number(arg.split("=")[1]);
    if (arg.startsWith("--out=")) config.outDir = arg.split("=")[1];
  }
  if (
    !Number.isInteger(config.windowDays) ||
    config.windowDays < 2 ||
    config.windowDays > 14
  ) {
    throw new Error("--window debe ser un entero entre 2 y 14");
  }
  return config;
}

function stripQuotes(value = "") {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(source) {
  if (!source.startsWith("---")) return {};
  const end = source.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = source.slice(3, end).trim();
  const lines = block.split(/\r?\n/);
  const result = {};
  let activeArray = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const arrayItem = line.match(/^\s+-\s+["']?(.*?)["']?\s*$/);
    if (activeArray && arrayItem) {
      result[activeArray].push(stripQuotes(arrayItem[1]));
      continue;
    }

    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) {
      activeArray = null;
      continue;
    }

    const [, key, rawValue] = match;
    if (rawValue === "") {
      activeArray = key;
      result[key] = [];
    } else {
      activeArray = null;
      result[key] = stripQuotes(rawValue);
    }
  }

  return result;
}

function normalize(text = "") {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text = "") {
  return normalize(text)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function tokenSet(text = "") {
  return new Set(tokens(text));
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function dateFromFilename(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
  return match?.[1] ?? null;
}

function daysAgo(date, latestDate) {
  const ms =
    Date.parse(`${latestDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function classifySection(frontmatter, fallbackSection) {
  if (frontmatter.section === "national") return "national";
  if (frontmatter.section === "markets") return "markets";
  if (fallbackSection === "general") return "general";
  return frontmatter.section || fallbackSection;
}

function topTerms(items, limit = 12) {
  const counts = new Map();
  for (const item of items) {
    const unique = new Set(tokens(`${item.title} ${item.summary}`));
    for (const token of unique) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({
      term,
      count,
      share: round(count / Math.max(items.length, 1), 2),
    }));
}

async function collectItems() {
  const items = [];
  for (const source of CONTENT_DIRS) {
    let filenames = [];
    try {
      filenames = await fs.readdir(source.dir);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }

    for (const filename of filenames.filter((name) => /\.mdx?$/.test(name))) {
      const date = dateFromFilename(filename);
      if (!date) continue;
      const filePath = path.join(source.dir, filename);
      const raw = await fs.readFile(filePath, "utf8");
      const fm = parseFrontmatter(raw);
      if (!fm.title) continue;
      items.push({
        date,
        path: filePath,
        filename,
        section: classifySection(fm, source.fallbackSection),
        status: fm.status || "unknown",
        title: fm.title,
        summary: fm.summary || "",
        publishedAt: fm.publishedAt || null,
        tags: Array.isArray(fm.tags) ? fm.tags : [],
      });
    }
  }
  return items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.section.localeCompare(b.section),
  );
}

function nearestHistorical(item, history, field) {
  const source = tokenSet(
    field === "title" ? item.title : `${item.title} ${item.summary}`,
  );
  let best = null;
  for (const candidate of history) {
    if (candidate.date >= item.date) continue;
    const target = tokenSet(
      field === "title"
        ? candidate.title
        : `${candidate.title} ${candidate.summary}`,
    );
    const similarity = jaccard(source, target);
    if (!best || similarity > best.similarity) best = { candidate, similarity };
  }
  return best;
}

function buildReport(allItems, config) {
  const published = allItems.filter((item) => item.status === "published");
  const latestDate = (published.at(-1) ?? allItems.at(-1))?.date ?? null;
  if (!latestDate) {
    return {
      mode: "shadow",
      generatedAt: new Date().toISOString(),
      message: "No se encontraron publicaciones fechadas.",
      blocking: false,
    };
  }

  const windowItems = allItems.filter((item) => {
    const age = daysAgo(item.date, latestDate);
    return age >= 0 && age < config.windowDays;
  });
  const publishedWindow = windowItems.filter(
    (item) => item.status === "published",
  );
  const historicalPool = allItems.filter(
    (item) =>
      item.status === "published" &&
      daysAgo(item.date, latestDate) < config.windowDays * 2,
  );

  const novelty = publishedWindow.map((item) => {
    const nearest = nearestHistorical(item, historicalPool, "thesis");
    const similarity = nearest?.similarity ?? 0;
    return {
      date: item.date,
      section: item.section,
      title: item.title,
      noveltyScore: Math.round((1 - similarity) * 100),
      closestPrevious: nearest
        ? {
            date: nearest.candidate.date,
            section: nearest.candidate.section,
            title: nearest.candidate.title,
            similarity: round(similarity),
          }
        : null,
    };
  });

  const repetitionFlags = [];
  for (const item of publishedWindow) {
    const titleNearest = nearestHistorical(item, historicalPool, "title");
    if (titleNearest && titleNearest.similarity >= config.titleSimilarity) {
      repetitionFlags.push({
        type: "title",
        date: item.date,
        section: item.section,
        title: item.title,
        comparedWith: titleNearest.candidate.title,
        comparedDate: titleNearest.candidate.date,
        similarity: round(titleNearest.similarity),
      });
    }

    const thesisNearest = nearestHistorical(item, historicalPool, "thesis");
    if (thesisNearest && thesisNearest.similarity >= config.thesisSimilarity) {
      repetitionFlags.push({
        type: "thesis",
        date: item.date,
        section: item.section,
        title: item.title,
        comparedWith: thesisNearest.candidate.title,
        comparedDate: thesisNearest.candidate.date,
        similarity: round(thesisNearest.similarity),
      });
    }
  }

  const overlapFlags = [];
  const byDate = Map.groupBy(publishedWindow, (item) => item.date);
  for (const [date, items] of byDate) {
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        if (items[i].section === items[j].section) continue;
        const similarity = jaccard(
          tokenSet(`${items[i].title} ${items[i].summary}`),
          tokenSet(`${items[j].title} ${items[j].summary}`),
        );
        if (similarity >= config.crossSectionSimilarity) {
          overlapFlags.push({
            date,
            sections: [items[i].section, items[j].section],
            titles: [items[i].title, items[j].title],
            similarity: round(similarity),
          });
        }
      }
    }
  }

  const lowNovelty = novelty.filter(
    (item) => item.noveltyScore < config.lowNovelty,
  );
  const nonPublished = windowItems
    .filter((item) => item.status !== "published")
    .map(({ date, section, status, title, path: itemPath }) => ({
      date,
      section,
      status,
      title,
      path: itemPath,
    }));

  return {
    mode: "shadow",
    blocking: false,
    generatedAt: new Date().toISOString(),
    latestEditorialDate: latestDate,
    windowDays: config.windowDays,
    thresholds: {
      titleSimilarity: config.titleSimilarity,
      thesisSimilarity: config.thesisSimilarity,
      crossSectionSimilarity: config.crossSectionSimilarity,
      lowNoveltyScore: config.lowNovelty,
    },
    scope: {
      publishedItems: publishedWindow.length,
      dates: [...new Set(publishedWindow.map((item) => item.date))],
      sections: [...new Set(publishedWindow.map((item) => item.section))],
    },
    shortMemory: publishedWindow.map(
      ({ date, section, title, summary, tags, path: itemPath }) => ({
        date,
        section,
        title,
        summary,
        tags,
        path: itemPath,
      }),
    ),
    dominantTerms: topTerms(publishedWindow),
    novelty,
    signals: {
      lowNovelty,
      repetition: repetitionFlags,
      crossSectionOverlap: overlapFlags,
      nonPublished,
    },
  };
}

function markdownSummary(report) {
  if (!report.latestEditorialDate)
    return "# ATLAS NEWS — Observación editorial\n\nSin publicaciones para analizar.\n";

  const lines = [
    "# ATLAS NEWS — Observación editorial (shadow)",
    "",
    `- Ventana: **${report.windowDays} días**, hasta **${report.latestEditorialDate}**.`,
    `- Publicaciones analizadas: **${report.scope.publishedItems}**.`,
    "- Este diagnóstico **no bloquea, modifica ni publica contenido**.",
    "",
    "## Señales",
    "",
    `- Baja novedad: **${report.signals.lowNovelty.length}**.`,
    `- Repetición de título/tesis: **${report.signals.repetition.length}**.`,
    `- Solapamiento entre secciones: **${report.signals.crossSectionOverlap.length}**.`,
    `- Piezas no publicadas dentro de la ventana: **${report.signals.nonPublished.length}**.`,
    "",
    "## Términos dominantes",
    "",
    report.dominantTerms.length
      ? report.dominantTerms
          .map(
            (item) =>
              `- ${item.term}: ${item.count}/${report.scope.publishedItems}`,
          )
          .join("\n")
      : "- Sin datos.",
    "",
  ];

  if (report.signals.lowNovelty.length) {
    lines.push("## Novedad baja", "");
    for (const item of report.signals.lowNovelty) {
      lines.push(
        `- ${item.date} · ${item.section} · **${item.noveltyScore}/100** — ${item.title}`,
      );
    }
    lines.push("");
  }

  if (report.signals.repetition.length) {
    lines.push("## Repetición detectada", "");
    for (const item of report.signals.repetition) {
      lines.push(
        `- ${item.date} · ${item.section} · ${item.type} ${item.similarity} — “${item.title}” ↔ “${item.comparedWith}”`,
      );
    }
    lines.push("");
  }

  if (report.signals.crossSectionOverlap.length) {
    lines.push("## Solapamiento del mismo día", "");
    for (const item of report.signals.crossSectionOverlap) {
      lines.push(
        `- ${item.date} · ${item.sections.join(" / ")} · similitud ${item.similarity}`,
      );
    }
    lines.push("");
  }

  if (report.signals.nonPublished.length) {
    lines.push("## Piezas no publicadas", "");
    for (const item of report.signals.nonPublished) {
      lines.push(
        `- ${item.date} · ${item.section} · ${item.status} — ${item.title}`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Interpretación",
    "",
    "Las señales son heurísticas de observación. No constituyen un gate editorial y no deben usarse para descartar un tema material solo por repetición léxica.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

async function main() {
  const config = parseArgs(process.argv);
  const items = await collectItems();
  const report = buildReport(items, config);
  await fs.mkdir(config.outDir, { recursive: true });
  await fs.writeFile(
    path.join(config.outDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(config.outDir, "summary.md"),
    markdownSummary(report),
  );

  console.log(
    `ATLAS editorial shadow: ${report.scope?.publishedItems ?? 0} publicaciones analizadas.`,
  );
  console.log(`Reporte: ${path.join(config.outDir, "report.json")}`);
}

main().catch((error) => {
  console.error("ATLAS editorial shadow falló:", error);
  process.exitCode = 1;
});
