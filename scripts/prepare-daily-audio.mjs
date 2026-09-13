import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const root = new URL("../", import.meta.url);
const editionDir = new URL("src/content/editions/", root);
const briefingDir = new URL("src/content/briefings/", root);
const SCRIPT_VERSION = 9;
const SPEECH_NORMALIZER_VERSION = 5;
const TARGET_MIN_WORDS = 260;
const TARGET_MAX_WORDS = 340;

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

async function records(directory) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
    .map((entry) => entry.name);

  return Promise.all(
    files.map(async (filename) => {
      const text = await readFile(new URL(filename, directory), "utf8");
      return {
        id: filename.replace(/\.mdx?$/, ""),
        title: field(text, "title"),
        summary: field(text, "summary"),
        publishedAt: field(text, "publishedAt"),
        type: field(text, "type"),
        section: field(text, "section"),
        status: field(text, "status"),
        highlights: highlights(text),
        bodySections: bodySections(text),
      };
    }),
  );
}

function newestFirst(a, b) {
  return Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "");
}

// El guion conserva el texto editorial. Speech Normalizer V5 adapta la forma
// hablada justo antes de Kokoro sin modificar el contenido publicado.
function speechText(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[`_*#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSpanishDate(date) {
  const parsed = new Date(`${date}T12:00:00-04:00`);
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

function sentencesFrom(record, headings) {
  if (!record) return [];
  return headings.flatMap((heading) =>
    sentenceList(record.bodySections.get(normalizeHeading(heading)) ?? []),
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

function numberSet(text) {
  return new Set(
    speechText(text)
      .match(/\b\d[\d.,]*\b/g)
      ?.map((value) => value.replace(/[.,]/g, "")) ?? [],
  );
}

function sharedNumberCount(left, right) {
  const leftNumbers = numberSet(left);
  const rightNumbers = numberSet(right);
  let overlap = 0;
  for (const value of leftNumbers) {
    if (rightNumbers.has(value)) overlap += 1;
  }
  return overlap;
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
    const lexicalOverlap = overlap / Math.min(incoming.size, current.size);
    if (lexicalOverlap >= 0.58) return true;

    const numericOverlap = sharedNumberCount(text, existing);
    return numericOverlap >= 1 && lexicalOverlap >= 0.26;
  });
}

function addSegment(parts, accepted, text, { force = false } = {}) {
  const normalized = speechText(text);
  if (!normalized || nearDuplicate(normalized, accepted)) return false;
  const nextWords = countWords(parts.join(" ")) + countWords(normalized);
  if (!force && nextWords > TARGET_MAX_WORDS) return false;
  parts.push(normalized);
  accepted.push(normalized);
  return true;
}

function addContribution(
  parts,
  accepted,
  label,
  summary,
  candidates,
  { maxSentences = 1 } = {},
) {
  addSegment(parts, accepted, label, { force: true });
  addSegment(parts, accepted, summary);

  let added = 0;
  for (const candidate of candidates) {
    if (addSegment(parts, accepted, candidate)) added += 1;
    if (added >= maxSentences) break;
  }
}

const editions = await records(editionDir);
const briefings = await records(briefingDir);
const international = editions
  .filter(({ status, type }) => status === "published" && type === "daily")
  .sort(newestFirst)[0];

const publicDir = process.env.ATLAS_PUBLIC_REPO_DIR;
const planPath =
  process.env.ATLAS_AUDIO_PLAN ??
  path.resolve(process.cwd(), ".atlas-audio-plan.json");
const voice = process.env.ATLAS_AUDIO_VOICE ?? "ef_dora";
const audioOwner = process.env.ATLAS_AUDIO_OWNER ?? null;
const ownerAllowsGeneration =
  audioOwner === "audio-v2" || audioOwner === "manual-legacy";

if (!international) {
  const plan = { needsGeneration: false, reason: "no_published_international" };
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, "needs_generation=false\n");
  }
  console.log(
    "Audio diario omitido: no existe una edición Internacional publicada.",
  );
  process.exit(0);
}

const date = international.id.slice(0, 10);
const national = briefings
  .filter(
    ({ id, status, section }) =>
      status === "published" &&
      section === "national" &&
      id.startsWith(`${date}-national-`),
  )
  .sort(newestFirst)[0];
const markets = briefings
  .filter(
    ({ id, status, section }) =>
      status === "published" &&
      section === "markets" &&
      id.startsWith(`${date}-markets-`),
  )
  .sort(newestFirst)[0];

// `general` se conserva temporalmente como alias compatible con consumidores
// existentes. La fuente editorial de esa pieza ya se declara como Internacional.
const sourceIds = {
  international: international.id,
  general: international.id,
  national: national?.id ?? null,
  markets: markets?.id ?? null,
};
const completeness =
  Number(Boolean(international)) +
  Number(Boolean(national)) +
  Number(Boolean(markets));

let existing = null;
if (publicDir) {
  try {
    existing = JSON.parse(
      await readFile(path.join(publicDir, "audio", "latest.json"), "utf8"),
    );
  } catch {
    existing = null;
  }
}

const existingInternationalId =
  existing?.sourceIds?.international ?? existing?.sourceIds?.general ?? null;
const sameSources =
  existing?.scriptVersion === SCRIPT_VERSION &&
  existing?.speechNormalizerVersion === SPEECH_NORMALIZER_VERSION &&
  existing?.date === date &&
  existingInternationalId === sourceIds.international &&
  existing?.sourceIds?.national === sourceIds.national &&
  existing?.sourceIds?.markets === sourceIds.markets;

// Portada V9 es un briefing transversal. Cada sección aporta una contribución
// breve e incremental; ninguna se desarrolla como cápsula completa.
const internationalCandidates = [
  ...sentencesFrom(international, ["Hecho central", "Por qué importa"]),
  ...international.highlights.map(({ text }) => text),
  ...sentencesFrom(international, ["En una mirada"]),
];
const nationalCandidates = national
  ? [
      ...sentencesFrom(national, ["Implicancias y riesgos", "Desarrollo"]),
      ...national.highlights.map(({ text }) => text),
    ]
  : [];
const marketsCandidates = markets
  ? [
      ...sentencesFrom(markets, ["Desarrollo", "Implicancias y riesgos"]),
      ...markets.highlights.map(({ text }) => text),
    ]
  : [];

const internationalWatch = sentencesFrom(international, ["Qué observar"]);
const nationalWatch = sentencesFrom(national, ["Qué observar"]);
const marketsWatch = sentencesFrom(markets, ["Qué observar"]);
const observationCandidates = [
  internationalWatch[0],
  nationalWatch[0],
  marketsWatch[0],
  ...internationalWatch.slice(1),
  ...nationalWatch.slice(1),
  ...marketsWatch.slice(1),
].filter(Boolean);

const parts = [];
const accepted = [];
addSegment(
  parts,
  accepted,
  `ATLAS NEWS. Briefing de la mañana del ${formatSpanishDate(date)}. Estas son las señales que conviene tener presentes hoy.`,
  { force: true },
);

addContribution(
  parts,
  accepted,
  "La señal central.",
  international.summary?.replace(/^La semana abre\b/i, "La jornada abre"),
  internationalCandidates,
);

if (national) {
  addContribution(
    parts,
    accepted,
    "En Chile.",
    national.summary,
    nationalCandidates,
  );
}

if (markets) {
  addContribution(
    parts,
    accepted,
    "Ahora, mercados.",
    markets.summary,
    marketsCandidates,
  );
}

addContribution(
  parts,
  accepted,
  "Qué seguir durante la jornada.",
  null,
  observationCandidates,
  { maxSentences: 2 },
);

// Si el briefing queda demasiado corto, se agrega como máximo una segunda
// contribución por sección, siempre pasando por el filtro de no repetición.
if (countWords(parts.join(" ")) < TARGET_MIN_WORDS) {
  const reserve = [
    internationalCandidates[1],
    nationalCandidates[1],
    marketsCandidates[1],
  ].filter(Boolean);

  for (const candidate of reserve) {
    addSegment(parts, accepted, candidate);
    if (countWords(parts.join(" ")) >= TARGET_MIN_WORDS) break;
  }
}

// Inicio y cierre se mantienen exactamente iguales a V8.
addSegment(
  parts,
  accepted,
  "La idea para comenzar el día es quedarse con esta señal central y seguir cómo evoluciona durante la jornada, a medida que entren nuevos datos y reaccione el mercado.",
  { force: true },
);
addSegment(
  parts,
  accepted,
  "Ese es el briefing de ATLAS NEWS para comenzar el día. Para profundizar, en Internacional, Nacional y Mercados están disponibles las cápsulas de audio de cada sección, junto con sus desarrollos completos, fuentes y riesgos.",
  { force: true },
);

const script = parts.join("\n\n");
const wordCount = countWords(script);
const estimatedDurationSeconds = Math.max(
  60,
  Math.round((wordCount / 125) * 60),
);
const plan = {
  scriptVersion: SCRIPT_VERSION,
  needsGeneration: ownerAllowsGeneration && !sameSources,
  date,
  title: `ATLAS NEWS — Resumen diario — ${formatSpanishDate(date)}`,
  summary: "Un briefing transversal de Internacional, Nacional y Mercados.",
  voice,
  engine: "Kokoro-82M",
  language: "es",
  completeness,
  sourceIds,
  targetWords: { min: TARGET_MIN_WORDS, max: TARGET_MAX_WORDS },
  wordCount,
  estimatedDurationSeconds,
  script,
};

await mkdir(path.dirname(planPath), { recursive: true });
await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `needs_generation=${plan.needsGeneration ? "true" : "false"}\n`,
  );
  await appendFile(process.env.GITHUB_OUTPUT, `audio_date=${date}\n`);
  await appendFile(process.env.GITHUB_OUTPUT, `completeness=${completeness}\n`);
}

console.log(
  !ownerAllowsGeneration && !sameSources
    ? `Audio ${date}: generación delegada al owner Audio V2; este proceso sólo planifica.`
    : plan.needsGeneration
      ? `Audio ${date}: generación requerida (${completeness}/3, ${wordCount} palabras, objetivo ${TARGET_MIN_WORDS}-${TARGET_MAX_WORDS}).`
      : `Audio ${date}: ya coincide con Internacional, Nacional y Mercados y el guion v${SCRIPT_VERSION}; se conserva el archivo vigente.`,
);
