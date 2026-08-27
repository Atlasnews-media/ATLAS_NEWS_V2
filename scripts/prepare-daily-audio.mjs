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
const SCRIPT_VERSION = 4;
const TARGET_MIN_WORDS = 550;
const TARGET_MAX_WORDS = 650;

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

function speechText(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[`_*#>]/g, "")
    .replace(/\bEE\.\s?UU\.\b/g, "Estados Unidos")
    .replace(/\bS&P\s*500\b/gi, "ese y pe quinientos")
    .replace(/\bTPM\b/g, "tasa de política monetaria")
    .replace(/\bIPC\b/g, "índice de precios al consumidor")
    .replace(/\bIPoM\b/g, "Informe de Política Monetaria")
    .replace(/\bEEE\b/g, "Encuesta de Expectativas Económicas")
    .replace(/\bEOF\b/g, "Encuesta de Operadores Financieros")
    .replace(/\bFed\b/g, "Reserva Federal")
    .replace(/\bTreasury\b/gi, "bono del Tesoro estadounidense")
    .replace(/US\$/g, "dólares ")
    .replace(/(\d+),(\d)0%/g, "$1,$2%")
    .replace(/(\d+),00%/g, "$1%")
    .replace(/(\d[\d.,]*)%/g, "$1 por ciento")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSpanishDate(date) {
  const parsed = new Date(`${date}T12:00:00-04:00`);
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(parsed);
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

function addSegment(parts, accepted, text, { force = false } = {}) {
  const normalized = speechText(text);
  if (!normalized || nearDuplicate(normalized, accepted)) return false;
  const nextWords = countWords(parts.join(" ")) + countWords(normalized);
  if (!force && nextWords > TARGET_MAX_WORDS) return false;
  parts.push(normalized);
  accepted.push(normalized);
  return true;
}

function addEditorialSection(
  parts,
  accepted,
  label,
  summary,
  candidates,
  targetWords,
) {
  addSegment(parts, accepted, label, { force: true });
  addSegment(parts, accepted, summary);
  const startWords = countWords(parts.join(" "));

  for (const candidate of candidates) {
    addSegment(parts, accepted, candidate);
    if (countWords(parts.join(" ")) - startWords >= targetWords) break;
  }
}

const editions = await records(editionDir);
const briefings = await records(briefingDir);
const latestDaily = editions
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

if (!latestDaily) {
  const plan = { needsGeneration: false, reason: "no_published_daily" };
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, "needs_generation=false\n");
  }
  console.log("Audio diario omitido: no existe una edición General publicada.");
  process.exit(0);
}

const date = latestDaily.id.slice(0, 10);
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

const sourceIds = {
  general: latestDaily.id,
  national: national?.id ?? null,
  markets: markets?.id ?? null,
};
const completeness =
  Number(Boolean(latestDaily)) +
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

const sameSources =
  existing?.scriptVersion === SCRIPT_VERSION &&
  existing?.date === date &&
  existing?.sourceIds?.general === sourceIds.general &&
  existing?.sourceIds?.national === sourceIds.national &&
  existing?.sourceIds?.markets === sourceIds.markets;

const generalCandidates = [
  ...latestDaily.highlights.map(({ text }) => text),
  ...sentencesFrom(latestDaily, [
    "Hecho central",
    "Por qué importa",
    "En una mirada",
  ]),
];
const nationalCandidates = national
  ? [
      ...national.highlights.map(({ text }) => text),
      ...sentencesFrom(national, ["Desarrollo", "Implicancias y riesgos"]),
    ]
  : [];
const marketsCandidates = markets
  ? [
      ...markets.highlights.map(({ text }) => text),
      ...sentencesFrom(markets, ["Desarrollo", "Implicancias y riesgos"]),
    ]
  : [];
const observationCandidates = sentencesFrom(latestDaily, ["Qué observar"]);

const parts = [];
const accepted = [];
addSegment(
  parts,
  accepted,
  `ATLAS NEWS. Briefing de la mañana del ${formatSpanishDate(date)}. Estas son las señales que conviene tener presentes hoy.`,
  { force: true },
);
addEditorialSection(
  parts,
  accepted,
  "La señal central.",
  latestDaily.summary?.replace(/^La semana abre\b/i, "La jornada abre"),
  generalCandidates,
  145,
);
if (national) {
  addEditorialSection(
    parts,
    accepted,
    "En Chile.",
    national.summary,
    nationalCandidates,
    125,
  );
}
if (markets) {
  addEditorialSection(
    parts,
    accepted,
    "Ahora, mercados.",
    markets.summary,
    marketsCandidates,
    125,
  );
}
addEditorialSection(
  parts,
  accepted,
  "Qué observar hoy y durante los próximos días.",
  "La agenda importa porque puede confirmar o invalidar la lectura con la que comienza la jornada.",
  observationCandidates,
  110,
);

if (countWords(parts.join(" ")) < TARGET_MIN_WORDS) {
  const reserve = [
    ...generalCandidates,
    ...nationalCandidates,
    ...marketsCandidates,
  ];
  for (const candidate of reserve) {
    addSegment(parts, accepted, candidate);
    if (countWords(parts.join(" ")) >= TARGET_MIN_WORDS) break;
  }
}

addSegment(
  parts,
  accepted,
  "La idea para comenzar el día es quedarse con la señal central y observar si los próximos datos la confirman o la contradicen.",
  { force: true },
);
addSegment(
  parts,
  accepted,
  "Ese es el briefing de ATLAS NEWS para comenzar el día. En la portada quedan disponibles la edición General y los desarrollos completos de Nacional y Mercados, con sus fuentes y riesgos.",
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
  summary: `Una cápsula con las señales principales de General${national ? ", Nacional" : ""}${markets ? " y Mercados" : ""}.`,
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
      : `Audio ${date}: ya coincide con las piezas publicadas y el guion v${SCRIPT_VERSION}; se conserva el archivo vigente.`,
);
