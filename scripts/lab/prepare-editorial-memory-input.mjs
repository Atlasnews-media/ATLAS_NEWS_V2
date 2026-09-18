import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const CONTENT_DIRS = [
  { dir: "src/content/editions", fallbackSection: "general", requireDaily: true },
  { dir: "src/content/briefings", fallbackSection: "briefing", requireDaily: false },
];

const DEFAULTS = {
  shadowPath: "artifacts/editorial-shadow/report.json",
  outPath: "artifacts/editorial-memory-input/input.json",
  sourceRef: "main",
  shortMemoryDays: 5,
  comparisonPoolDays: 10,
};

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--shadow=")) config.shadowPath = arg.slice(9);
    if (arg.startsWith("--out=")) config.outPath = arg.slice(6);
    if (arg.startsWith("--source-ref=")) config.sourceRef = arg.slice(13);
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

function splitFrontmatter(source) {
  if (!source.startsWith("---")) return { frontmatter: "", body: source };
  const end = source.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: "", body: source };
  return {
    frontmatter: source.slice(3, end).trim(),
    body: source.slice(end + 4).trim(),
  };
}

function parseFrontmatter(block) {
  const result = { tags: [], sources: [], highlights: [] };
  const lines = block.split(/\r?\n/);
  let active = null;
  let currentSource = null;
  let currentHighlight = null;

  for (const raw of lines) {
    const top = raw.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (top) {
      const [, key, rawValue] = top;
      active = rawValue === "" ? key : null;
      currentSource = null;
      currentHighlight = null;
      if (rawValue !== "") result[key] = stripQuotes(rawValue);
      continue;
    }

    if (active === "tags") {
      const match = raw.match(/^\s+-\s+(.*)$/);
      if (match) result.tags.push(stripQuotes(match[1]));
      continue;
    }

    if (active === "sources") {
      const name = raw.match(/^\s+-\s+name:\s*(.*)$/);
      if (name) {
        currentSource = { name: stripQuotes(name[1]), url: null };
        result.sources.push(currentSource);
        continue;
      }
      const url = raw.match(/^\s+url:\s*(.*)$/);
      if (url && currentSource) {
        currentSource.url = stripQuotes(url[1]);
      }
      continue;
    }

    if (active === "highlights") {
      const label = raw.match(/^\s+-\s+label:\s*(.*)$/);
      if (label) {
        currentHighlight = { label: stripQuotes(label[1]), text: null };
        result.highlights.push(currentHighlight);
        continue;
      }
      const text = raw.match(/^\s+text:\s*(.*)$/);
      if (text && currentHighlight) {
        currentHighlight.text = stripQuotes(text[1]);
      }
    }
  }

  result.sources = result.sources.filter(
    (source) => source.name && typeof source.url === "string" && source.url,
  );
  result.highlights = result.highlights.filter(
    (item) => item.label && typeof item.text === "string" && item.text,
  );
  return result;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function dateFromFilename(filename) {
  return filename.match(/^(\d{4}-\d{2}-\d{2})-/)?.[1] ?? null;
}

function daysBetween(olderDate, newerDate) {
  return Math.round(
    (Date.parse(`${newerDate}T00:00:00Z`) -
      Date.parse(`${olderDate}T00:00:00Z`)) /
      86_400_000,
  );
}

function sectionOf(frontmatter, fallbackSection) {
  if (frontmatter.section === "national") return "national";
  if (frontmatter.section === "markets") return "markets";
  return fallbackSection === "general"
    ? "general"
    : frontmatter.section || fallbackSection;
}

function candidateId(itemPath) {
  return `CAND-${sha256(itemPath).slice(0, 16)}`;
}

function buildClaims(item) {
  const sourceRefs = item.sources.map((source) => source.url);
  const base =
    item.highlights.length > 0
      ? item.highlights.map((highlight) => ({
          label: highlight.label,
          statement: highlight.text,
          basis: "PUBLISHED_HIGHLIGHT",
        }))
      : [
          {
            label: "summary",
            statement: item.summary,
            basis: "PUBLISHED_SUMMARY_FALLBACK",
          },
        ];

  return base
    .filter((entry) => entry.statement)
    .map((entry, index) => ({
      claim_id: `${candidateId(item.path)}-CLM-${String(index + 1).padStart(2, "0")}`,
      statement: entry.statement,
      evidence: {
        type: entry.basis,
        label: entry.label,
        publication_ref: item.path,
      },
      sources: sourceRefs,
      fact_date: item.date,
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

      const itemPath = path.join(source.dir, filename);
      const raw = await fs.readFile(itemPath, "utf8");
      const { frontmatter: block, body } = splitFrontmatter(raw);
      const frontmatter = parseFrontmatter(block);

      if (!frontmatter.title || frontmatter.status !== "published") continue;
      if (source.requireDaily && frontmatter.type !== "daily") continue;

      items.push({
        date,
        path: itemPath.replaceAll("\\", "/"),
        filename,
        section: sectionOf(frontmatter, source.fallbackSection),
        status: frontmatter.status,
        type: frontmatter.type ?? null,
        title: frontmatter.title,
        summary: frontmatter.summary ?? "",
        publishedAt: frontmatter.publishedAt ?? null,
        cutoffAt: frontmatter.cutoffAt ?? null,
        tags: frontmatter.tags,
        sources: frontmatter.sources,
        highlights: frontmatter.highlights,
        body,
        contentHash: sha256(raw),
      });
    }
  }

  return items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.section.localeCompare(b.section) ||
      a.path.localeCompare(b.path),
  );
}

function publicItem(item, { includeBody = false } = {}) {
  const base = {
    record_ref: item.path,
    candidate_id: candidateId(item.path),
    lineage_id: null,
    editorial_date: item.date,
    section: item.section,
    publication_state: item.status,
    published_title: item.title,
    published_summary: item.summary,
    published_at: item.publishedAt,
    cutoff_at: item.cutoffAt,
    tags: item.tags,
    sources: item.sources,
    related_entities: [],
    claims: buildClaims(item),
    content_hash_sha256: item.contentHash,
  };

  if (includeBody) {
    return { ...base, published_body_markdown: item.body };
  }

  return {
    ...base,
    published_body_excerpt: item.body.slice(0, 5000),
    body_excerpt_truncated: item.body.length > 5000,
  };
}

function candidateControl(candidate, shadow) {
  const novelty =
    shadow.novelty?.find(
      (item) =>
        item.date === candidate.date &&
        item.section === candidate.section &&
        item.title === candidate.title,
    ) ?? null;

  const repetition = (shadow.signals?.repetition ?? []).filter(
    (item) =>
      item.date === candidate.date &&
      item.section === candidate.section &&
      item.title === candidate.title,
  );

  const crossSectionOverlap = (shadow.signals?.crossSectionOverlap ?? []).filter(
    (item) =>
      item.date === candidate.date && item.titles?.includes(candidate.title),
  );

  return {
    candidate_id: candidateId(candidate.path),
    novelty,
    repetition,
    cross_section_overlap: crossSectionOverlap,
  };
}

async function main() {
  const config = parseArgs(process.argv);
  const allItems = await collectItems();
  const latestDate = allItems.at(-1)?.date;

  if (!latestDate) {
    throw new Error("No existen publicaciones válidas para preparar EXP-011.");
  }

  const current = allItems.filter((item) => item.date === latestDate);
  if (current.length < 1 || current.length > 3) {
    throw new Error(
      `EXP-011 esperaba entre 1 y 3 piezas publicadas en ${latestDate}; encontró ${current.length}.`,
    );
  }

  const history = allItems.filter((item) => {
    const age = daysBetween(item.date, latestDate);
    return age >= 1 && age < config.comparisonPoolDays;
  });

  const rawShadow = await fs.readFile(config.shadowPath, "utf8");
  const shadow = JSON.parse(rawShadow);

  if (shadow.latestEditorialDate !== latestDate) {
    throw new Error(
      `Shadow desalineado: ${shadow.latestEditorialDate} != ${latestDate}`,
    );
  }

  const sourceCommit =
    process.env.ATLAS_SOURCE_COMMIT ||
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  const generatedAt = new Date().toISOString();

  const retrieval = current.map((candidate) => ({
    candidate_id: candidateId(candidate.path),
    retrieved_at: generatedAt,
    retrieval_config: {
      short_memory_days: config.shortMemoryDays,
      comparison_pool_days: config.comparisonPoolDays,
      strategy: "FULL_COMPARISON_POOL_RECALL_FIRST",
    },
    retrieved_prior_items: history
      .map((prior) => {
        const age = daysBetween(prior.date, latestDate);
        return {
          ...publicItem(prior),
          retrieval_reasons: [
            "COMPARISON_POOL_WINDOW",
            ...(age < config.shortMemoryDays ? ["SHORT_MEMORY_WINDOW"] : []),
            ...(prior.section === candidate.section ? ["SECTION_MATCH"] : []),
          ],
          lexical_signals: {
            novelty_score: null,
            title_similarity: null,
            thesis_similarity: null,
            status: "NOT_RECOMPUTED_USE_SHADOW_CONTROL",
          },
          age_days: age,
        };
      })
      .sort(
        (a, b) =>
          a.age_days - b.age_days ||
          a.section.localeCompare(b.section) ||
          a.record_ref.localeCompare(b.record_ref),
      )
      .map((item, index) => ({ ...item, retrieval_rank: index + 1 })),
  }));

  const payload = {
    schema_version: 1,
    experiment_id: "EXP-011",
    mode: "LAB_ONLY",
    generated_at: generatedAt,
    source: {
      repository: "Atlasnews-media/ATLAS_NEWS_V2",
      source_ref: config.sourceRef,
      source_commit: sourceCommit,
      editorial_date: latestDate,
    },
    skill_snapshot: {
      name: "atlas-editorial-memory",
      version: "0.2.0-candidate",
      drive_folder_id: "1oZLcsmCwPV0KapLAHbaGuUoDfodUGUky",
      frozen_on: "2026-09-18",
    },
    retrieval_policy: {
      short_memory_days: config.shortMemoryDays,
      comparison_pool_days: config.comparisonPoolDays,
      scope: "ALL_PRIOR_PUBLISHED_ITEMS_IN_WINDOW",
      semantic_authority: false,
    },
    safety: {
      production_writes_allowed: false,
      production_branch_writes_allowed: false,
      morning_package_writes_allowed: false,
      canonical_memory_writes_allowed: false,
      producer_public_write_target:
        "Atlasnews-media/Atlasnews-media.github.io:lab/editorial-memory-judge/input.json",
      judge_public_write_target:
        "Atlasnews-media/Atlasnews-media.github.io:lab/editorial-memory-judge/latest.json",
      forbidden_paths: [
        "src/content/editions/**",
        "src/content/briefings/**",
        "data/editorial_state.json",
        ".github/workflows/publish-site.yml",
      ],
    },
    questions: [
      {
        id: "Q1_SEMANTIC_CONTINUITY",
        output: "boolean_or_uncertain",
        text: "¿Existe continuidad semántica con algún antecedente recuperado?",
      },
      {
        id: "Q2_EVENT_RELATION",
        output: "SAME_EVENT|NEW_EVENT|UNRELATED|UNCERTAIN",
        text: "¿La pieza representa un evento nuevo o el mismo evento?",
      },
      {
        id: "Q3_INFORMATION_RELATION",
        output:
          "NEW|CONTINUATION|MEANINGFUL_UPDATE|REPETITION|CONTRADICTION|UNCERTAIN",
        text: "¿Qué relación informativa tiene respecto del antecedente más relevante?",
      },
      {
        id: "Q4_CLAIM_RELATIONS",
        output:
          "SAME_FACT|NEW_EVIDENCE|MATERIAL_UPDATE|CONTRADICTION|UNRELATED|UNCERTAIN",
        text: "¿Cómo se relaciona cada claim con los antecedentes relevantes?",
      },
      {
        id: "Q5_ADDS_NEW_INFORMATION",
        output: "boolean_or_uncertain",
        text: "¿Añade información nueva?",
      },
      {
        id: "Q6_HISTORICAL_CONTEXT_NEEDED",
        output: "boolean_or_uncertain",
        text: "¿Necesita contexto histórico para representar correctamente la noticia?",
      },
      {
        id: "Q7_ANGLE_REPEATED",
        output: "boolean_or_uncertain",
        text: "¿Repite un ángulo editorial ya utilizado?",
      },
    ],
    candidates: current.map((item) => publicItem(item, { includeBody: true })),
    retrieval,
    control: {
      engine: "scripts/editorial-shadow-audit.mjs",
      mode: shadow.mode,
      blocking: shadow.blocking,
      window_days: shadow.windowDays,
      thresholds: shadow.thresholds,
      candidate_results: current.map((candidate) =>
        candidateControl(candidate, shadow),
      ),
      same_day_overlap_all: (shadow.signals?.crossSectionOverlap ?? []).filter(
        (item) => item.date === latestDate,
      ),
    },
    experiment_notes: [
      "El pool comparativo conserva todos los antecedentes publicados dentro de la ventana para maximizar recall en la primera fase.",
      "No se asigna lineage y no se aplican thresholds semánticos en este productor.",
      "Los claims se derivan determinísticamente de highlights publicados; si faltan, se usa el summary publicado como fallback trazable.",
      "related_entities queda vacío porque esta fase no incorpora extracción semántica de entidades.",
      "Las similitudes léxicas no se recomputan por par; el control usa exclusivamente el Shadow autorizado.",
    ],
  };

  await fs.mkdir(path.dirname(config.outPath), { recursive: true });
  await fs.writeFile(config.outPath, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(
    `EXP-011 input: ${current.length} candidatos, ${history.length} antecedentes, fecha ${latestDate}.`,
  );
  console.log(`Salida: ${config.outPath}`);
}

main().catch((error) => {
  console.error("EXP-011 input producer falló:", error.message);
  process.exitCode = 1;
});
