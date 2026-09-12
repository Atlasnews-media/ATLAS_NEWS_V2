import { mkdir, readFile, writeFile } from "node:fs/promises";

const CACHE_DIR = new URL("../.atlas-cache/", import.meta.url);
const CACHE_PATH = new URL("front-page-visual-locks.json", CACHE_DIR);
const SOURCES = [
  "https://eldesiempre100.github.io/data/front-page-visual-locks.json",
  "https://raw.githubusercontent.com/EldeSiempre100/EldeSiempre100.github.io/main/data/front-page-visual-locks.json",
];
const TIMEOUT_MS = 4_000;
const VISUAL_FIELDS = [
  "src",
  "alt",
  "source",
  "sourceUrl",
  "author",
  "license",
];

function normalizeLocks(payload) {
  const isValid =
    payload &&
    payload.schemaVersion === 1 &&
    typeof payload.locks === "object";
  if (!isValid) return null;

  const locks = {};
  for (const [key, value] of Object.entries(payload.locks)) {
    if (!value || typeof value !== "object") continue;
    const valid = VISUAL_FIELDS.every(
      (field) => typeof value[field] === "string",
    );
    if (!valid) continue;

    const entries = VISUAL_FIELDS.map((field) => [field, value[field]]);
    locks[key] = Object.fromEntries(entries);
  }
  return locks;
}

async function fetchLocks(url) {
  const response = await fetch(`${url}?v=${Date.now()}`, {
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return normalizeLocks(await response.json());
}

function contentPathFor(key) {
  const separator = key.indexOf(":");
  if (separator === -1) return null;

  const section = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (!id) return null;

  if (section === "international") {
    return new URL(`../src/content/editions/${id}.md`, import.meta.url);
  }
  if (section === "national" || section === "markets") {
    return new URL(`../src/content/briefings/${id}.md`, import.meta.url);
  }
  return null;
}

function editorialVisualBlock(visual) {
  return [
    "editorialVisual:",
    `  src: ${JSON.stringify(visual.src)}`,
    `  alt: ${JSON.stringify(visual.alt)}`,
    `  source: ${JSON.stringify(visual.source)}`,
    `  sourceUrl: ${JSON.stringify(visual.sourceUrl)}`,
    `  author: ${JSON.stringify(visual.author)}`,
    `  license: ${JSON.stringify(visual.license)}`,
  ].join("\n");
}

async function applyLockToContent(key, visual) {
  const path = contentPathFor(key);
  if (!path) return false;

  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return false;
  }

  if (/^editorialVisual:\s*$/m.test(content)) return false;

  const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = content.match(frontmatterPattern);
  if (!match) return false;

  const block = editorialVisualBlock(visual);
  const frontmatter = `---\n${match[1].trimEnd()}\n${block}\n---`;
  const updated = content.replace(frontmatterPattern, frontmatter);
  await writeFile(path, updated, "utf8");
  return true;
}

let resolved = null;
let source = null;
for (const url of SOURCES) {
  try {
    const locks = await fetchLocks(url);
    if (locks) {
      resolved = locks;
      source = url;
      break;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[visual-lock] Fuente no disponible: ${url} (${reason})`);
  }
}

await mkdir(CACHE_DIR, { recursive: true });
const cachePayload = { schemaVersion: 1, locks: resolved ?? {} };
await writeFile(CACHE_PATH, `${JSON.stringify(cachePayload, null, 2)}\n`, "utf8");

if (!resolved) {
  console.warn(
    "[visual-lock] Sin manifiesto previo; el resolver determinista seguirá operando y esta publicación sembrará el primer lock.",
  );
  process.exit(0);
}

if (process.env.GITHUB_ACTIONS !== "true") {
  console.log(
    `[visual-lock] ${Object.keys(resolved).length} locks recuperados; no se modifican fuentes fuera de GitHub Actions.`,
  );
  process.exit(0);
}

let applied = 0;
for (const [key, visual] of Object.entries(resolved)) {
  if (await applyLockToContent(key, visual)) applied += 1;
}

const recovered = Object.keys(resolved).length;
console.log(
  `[visual-lock] ${recovered} asignaciones recuperadas desde ${source}; ${applied} aplicadas temporalmente al build.`,
);
