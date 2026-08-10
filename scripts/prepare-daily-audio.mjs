import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("../", import.meta.url);
const editionDir = new URL("src/content/editions/", root);
const briefingDir = new URL("src/content/briefings/", root);

function frontmatter(text) {
  return text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
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
      };
    }),
  );
}

function newestFirst(a, b) {
  return Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "");
}

function speechText(value) {
  return String(value ?? "")
    .replace(/\bEE\.\s?UU\.\b/g, "Estados Unidos")
    .replace(/\bS&P\s*500\b/gi, "ese y pe quinientos")
    .replace(/\bTPM\b/g, "tasa de política monetaria")
    .replace(/\bIPC\b/g, "índice de precios al consumidor")
    .replace(/\bFed\b/g, "Reserva Federal")
    .replace(/US\$/g, "dólares ")
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

function addUnique(parts, seen, text) {
  const normalized = speechText(text);
  if (!normalized) return;
  const key = normalized.toLocaleLowerCase("es-CL");
  if (seen.has(key)) return;
  seen.add(key);
  parts.push(normalized);
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
  Number(Boolean(latestDaily)) + Number(Boolean(national)) + Number(Boolean(markets));

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
  existing?.date === date &&
  existing?.sourceIds?.general === sourceIds.general &&
  existing?.sourceIds?.national === sourceIds.national &&
  existing?.sourceIds?.markets === sourceIds.markets;

const parts = [];
const seen = new Set();
addUnique(parts, seen, `ATLAS NEWS. Resumen de audio del ${formatSpanishDate(date)}.`);
addUnique(parts, seen, `La señal central. ${latestDaily.summary}`);
for (const item of latestDaily.highlights.slice(0, 3)) {
  addUnique(parts, seen, `${item.label}. ${item.text}`);
}
if (national) {
  addUnique(parts, seen, `Chile. ${national.summary}`);
  for (const item of national.highlights.slice(0, 3)) {
    addUnique(parts, seen, `${item.label}. ${item.text}`);
  }
}
if (markets) {
  addUnique(parts, seen, `Mercados. ${markets.summary}`);
  for (const item of markets.highlights.slice(0, 3)) {
    addUnique(parts, seen, `${item.label}. ${item.text}`);
  }
}
addUnique(
  parts,
  seen,
  "Hasta aquí el resumen diario de ATLAS NEWS. Puedes abrir la edición completa para revisar contexto, fuentes e implicancias.",
);

const script = parts.join("\n\n");
const wordCount = script.split(/\s+/).filter(Boolean).length;
const estimatedDurationSeconds = Math.max(60, Math.round((wordCount / 125) * 60));
const plan = {
  needsGeneration: !sameSources,
  date,
  title: `ATLAS NEWS — Resumen diario — ${formatSpanishDate(date)}`,
  summary: `Una cápsula con las señales principales de General${national ? ", Nacional" : ""}${markets ? " y Mercados" : ""}.`,
  voice,
  engine: "Kokoro-82M",
  language: "es",
  completeness,
  sourceIds,
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
  plan.needsGeneration
    ? `Audio ${date}: generación requerida (${completeness}/3, ${wordCount} palabras).`
    : `Audio ${date}: ya coincide con las piezas publicadas; se conserva el archivo vigente.`,
);
