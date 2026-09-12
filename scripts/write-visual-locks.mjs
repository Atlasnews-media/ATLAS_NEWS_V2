import { mkdir, readFile, writeFile } from "node:fs/promises";

const HOME_PATH = new URL("../dist/index.html", import.meta.url);
const CACHE_PATH = new URL(
  "../.atlas-cache/front-page-visual-locks.json",
  import.meta.url,
);
const OUTPUT_DIR = new URL("../dist/data/", import.meta.url);
const OUTPUT_PATH = new URL("front-page-visual-locks.json", OUTPUT_DIR);
const REMOTE_IMAGE_HOSTS = new Set([
  "commons.wikimedia.org",
  "upload.wikimedia.org",
]);

function decodeHtml(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function plainText(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag, name) {
  const pattern = new RegExp(
    `\\b${name}=(?:"([^"]*)"|'([^']*)')`,
    "i",
  );
  const match = tag.match(pattern);
  return decodeHtml(match?.[1] ?? match?.[2] ?? "");
}

function visualKeyFromHref(href) {
  const routes = [
    ["international", /^\/ediciones\/([^/]+)\/?$/],
    ["national", /^\/nacional\/([^/]+)\/?$/],
    ["markets", /^\/mercados\/([^/]+)\/?$/],
  ];

  for (const [section, pattern] of routes) {
    const match = href.match(pattern);
    if (match) return `${section}:${match[1]}`;
  }
  return null;
}

function isRemoteEditorialImage(src) {
  try {
    return REMOTE_IMAGE_HOSTS.has(new URL(src).hostname);
  } catch {
    return false;
  }
}

async function readPreviousLocks() {
  try {
    const payload = JSON.parse(await readFile(CACHE_PATH, "utf8"));
    const valid = payload?.schemaVersion === 1 && payload?.locks;
    return valid ? payload.locks : {};
  } catch {
    return {};
  }
}

const home = await readFile(HOME_PATH, "utf8");
const locks = { ...(await readPreviousLocks()) };
const headlinePattern =
  /<section\b[^>]*class=(?:"[^"]*\bheadline-item\b[^"]*"|'[^']*\bheadline-item\b[^']*')[^>]*>([\s\S]*?)<\/section>/gi;
const headlineBlocks = [...home.matchAll(headlinePattern)];

let captured = 0;
for (const [, block] of headlineBlocks) {
  const hrefPattern =
    /<h2\b[^>]*>[\s\S]*?<a\b[^>]*\bhref=(?:"([^"]+)"|'([^']+)')/i;
  const hrefMatch = block.match(hrefPattern);
  const href = decodeHtml(hrefMatch?.[1] ?? hrefMatch?.[2] ?? "");
  const key = visualKeyFromHref(href);
  if (!key) continue;

  const imageTag = block.match(/<img\b[^>]*>/i)?.[0] ?? "";
  const src = attr(imageTag, "src");
  if (!isRemoteEditorialImage(src)) continue;

  const alt = attr(imageTag, "alt");
  const captionMatch = block.match(
    /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i,
  );
  const caption = plainText(captionMatch?.[1] ?? "");
  const parts = caption.split("·").map((part) => part.trim());
  const [source = "Wikimedia Commons", author = "", license = ""] = parts;
  const previous = locks[key];
  const sameSource = previous?.src === src;
  const sourceUrl = sameSource ? previous.sourceUrl : src;

  locks[key] = {
    src,
    alt,
    source,
    sourceUrl: typeof sourceUrl === "string" ? sourceUrl : src,
    author,
    license,
  };
  captured += 1;
}

await mkdir(OUTPUT_DIR, { recursive: true });
const payload = {
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  locks,
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const accumulated = Object.keys(locks).length;
console.log(
  `[visual-lock] Manifiesto preparado: ${accumulated} locks acumulados; ${captured} titulares actuales confirmados.`,
);
