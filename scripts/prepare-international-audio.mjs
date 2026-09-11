import { appendFile, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("../", import.meta.url);
const editionDir = new URL("src/content/editions/", root);
const SCRIPT_VERSION = 1;
const TARGET_MIN_WORDS = 280;
const TARGET_MAX_WORDS = 360;

function frontmatter(text) {
  return text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

function markdownBody(text) {
  return text.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*/, "").trim();
}

function parseScalar(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.replace(/^["']|["']$/g, "");
  }
}

function field(text, name) {
  const value = frontmatter(text).match(
    new RegExp(`^${name}:\\s*(.+)$`, "m"),
  )?.[1];
  return parseScalar(value);
}

function highlights(text) {
  const lines = frontmatter(text).split(/\r?\n/);
  const items = [];
  let active = false;
  let current = null;

  for (const line of lines) {
    if (/^highlights:\s*$/.test(line)) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (/^[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(line)) break;

    const label = line.match(/^\s*-\s+label:\s*(.+)$/)?.[1];
    if (label) {
      current = { label: parseScalar(label), text: undefined };
      items.push(current);
      continue;
    }

    const itemText = line.match(/^\s+text:\s*(.+)$/)?.[1];
    if (itemText && current) current.text = parseScalar(itemText);
  }

  return items.filter((item) => item.text);
}

function normalizeHeading(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .trim();
}

function bodySections(text) {
  const sections = new Map();
  let heading = "inicio";
  let buffer = [];

  function flush() {
    const paragraph = buffer.join(" ").trim();
    if (paragraph) {
      const key = normalizeHeading(heading);
      const paragraphs = sections.get(key) ?? [];
      paragraphs.push(paragraph);
      sections.set(key, paragraphs);
    }
    buffer = [];
  }

  for (const rawLine of markdownBody(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    const nextHeading = line.match(/^##\s+(.+)$/)?.[1];
    if (nextHeading) {
      flush();
      heading = nextHeading;
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return sections;
}

function speechText(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[`_*#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text) {
  return String(text ?? "")
    .split(/\s+/)
    .filter(Boolean).length;
}

function sentenceList(paragraphs) {
  const segmenter = new Intl.Segmenter("es", { granularity: "sentence" });
  return paragraphs.flatMap((paragraph) =>
    [...segmenter.segment(paragraph)]
      .map(({ segment }) => segment.trim())
      .filter(Boolean),
  );
}

function tokenSet(text) {
  return new Set(
    speechText(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-CL")
      .replace(/[^a-z0-9ñ]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
}

function nearDuplicate(text, accepted) {
  const incoming = tokenSet(text);
  if (incoming.size < 4) return false;

  return accepted.some((existing) => {
    const current = tokenSet(existing);
    if (current.size < 4) return false;
    let overlap = 0;
    for (const token of incoming) {
      if (current.has(token)) overlap += 1;
    }
    return overlap / Math.min(incoming.size, current.size) >= 0.72;
  });
}

function formatSpanishDate(date) {
  const parsed = new Date(`${date}T12:00:00-03:00`);
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  })
    .format(parsed)
    .replace(",", "");
}

function sectionParagraphs(record, heading) {
  return record.sections.get(normalizeHeading(heading)) ?? [];
}

const files = (await readdir(editionDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
  .map((entry) => entry.name);

const editions = await Promise.all(
  files.map(async (filename) => {
    const text = await readFile(new URL(filename, editionDir), "utf8");
    return {
      id: filename.replace(/\.mdx?$/, ""),
      title: field(text, "title"),
      summary: field(text, "summary"),
      publishedAt: field(text, "publishedAt"),
      type: field(text, "type"),
      status: field(text, "status"),
      highlights: highlights(text),
      sections: bodySections(text),
    };
  }),
);

const latestDaily = editions
  .filter(({ status, type }) => status === "published" && type === "daily")
  .sort(
    (a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""),
  )[0];

if (!latestDaily) {
  throw new Error(
    "No existe una edición Internacional publicada para generar audio.",
  );
}

const date = latestDaily.id.slice(0, 10);
const parts = [];
const accepted = [];

function add(text, { force = false } = {}) {
  const normalized = speechText(text);
  if (!normalized || nearDuplicate(normalized, accepted)) return false;
  const nextWords = countWords(parts.join(" ")) + countWords(normalized);
  if (!force && nextWords > TARGET_MAX_WORDS) return false;
  parts.push(normalized);
  accepted.push(normalized);
  return true;
}

function addSection(label, paragraphs, targetWords) {
  add(label, { force: true });
  const start = countWords(parts.join(" "));
  for (const sentence of sentenceList(paragraphs)) {
    add(sentence);
    if (countWords(parts.join(" ")) - start >= targetWords) break;
  }
}

add(
  `ATLAS NEWS. Análisis internacional del ${formatSpanishDate(date)}.`,
  { force: true },
);
add("El hecho central.", { force: true });
add(latestDaily.summary);
for (const item of latestDaily.highlights) add(item.text);
addSection(
  "Qué está cambiando.",
  [
    ...sectionParagraphs(latestDaily, "Hecho central"),
    ...sectionParagraphs(latestDaily, "En una mirada"),
    ...sectionParagraphs(latestDaily, "Por qué importa"),
  ],
  190,
);
addSection(
  "Qué observar ahora.",
  sectionParagraphs(latestDaily, "Qué observar"),
  90,
);

if (countWords(parts.join(" ")) < TARGET_MIN_WORDS) {
  const reserve = [
    ...sectionParagraphs(latestDaily, "Mercados globales"),
    ...sectionParagraphs(latestDaily, "Tasas, monedas y commodities"),
  ];
  for (const sentence of sentenceList(reserve)) {
    add(sentence);
    if (countWords(parts.join(" ")) >= TARGET_MIN_WORDS) break;
  }
}

add(
  "La señal a vigilar es si los próximos datos confirman esta lectura o devuelven al mercado hacia un escenario menos restrictivo.",
  { force: true },
);

const script = parts.join("\n\n");
const wordCount = countWords(script);
const outputPath =
  process.env.ATLAS_INTERNATIONAL_PLAN ??
  path.resolve(process.cwd(), ".atlas-international-audio-plan.json");

const plan = {
  schemaVersion: 1,
  scriptVersion: SCRIPT_VERSION,
  date,
  sourceId: latestDaily.id,
  title: latestDaily.title,
  voice: "em_alex",
  engine: "Kokoro-82M",
  language: "es",
  wordCount,
  estimatedDurationSeconds: Math.max(60, Math.round((wordCount / 125) * 60)),
  script,
};

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `source_id=${plan.sourceId}\n`);
  await appendFile(process.env.GITHUB_OUTPUT, `word_count=${wordCount}\n`);
}

console.log(
  `Audio Internacional ${date}: plan listo (${wordCount} palabras, Alex).`,
);
