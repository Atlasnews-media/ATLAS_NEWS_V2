import { execFileSync } from "node:child_process";
import { appendFile, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { normalizeEditionSlot } from "./edition-slot-contract.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const editionDir = new URL("src/content/editions/", root);
const publicStatusUrl =
  process.env.ATLAS_PUBLIC_STATUS_URL ||
  "https://atlasnews-media.github.io/status.json";
const buildCommit =
  process.env.ATLAS_SOURCE_SHA ?? process.env.GITHUB_SHA ?? "local";

function field(text, name) {
  return text
    .match(new RegExp(`^${name}:\\s*["']?([^"'\\r\\n]+)`, "m"))?.[1]
    ?.trim();
}

function currentCommitChanged(path) {
  if (!/^[0-9a-f]{40}$/i.test(buildCommit)) return false;
  const changed = execFileSync(
    "git",
    ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
    { cwd: rootPath, encoding: "utf8" },
  )
    .split(/\r?\n/)
    .map((value) => value.trim());
  return changed.includes(path);
}

async function publicSourceCommit(currentId) {
  try {
    const response = await fetch(
      `${publicStatusUrl}?identity=${encodeURIComponent(buildCommit)}&t=${Date.now()}`,
      {
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      },
    );
    if (!response.ok) return null;
    const status = await response.json();
    if (
      status?.latestDaily?.id === currentId &&
      /^[0-9a-f]{40}$/i.test(String(status?.sourceCommit ?? ""))
    ) {
      return status.sourceCommit;
    }
  } catch {
    return null;
  }
  return null;
}

const records = [];
for (const entry of await readdir(editionDir, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) continue;
  const text = await readFile(new URL(entry.name, editionDir), "utf8");
  if (field(text, "status") !== "published") continue;
  if (field(text, "type") !== "daily") continue;
  records.push({
    id: entry.name.replace(/\.mdx?$/, ""),
    path: `src/content/editions/${entry.name}`,
    publishedAt: field(text, "publishedAt") ?? "",
    editionSlot: normalizeEditionSlot(field(text, "editionSlot")),
  });
}

records.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
const current = records[0];
if (!current) {
  throw new Error(
    "No existe una edición daily publicada para resolver identidad.",
  );
}

let sourceCommit;
if (currentCommitChanged(current.path) && /^[0-9a-f]{40}$/i.test(buildCommit)) {
  sourceCommit = buildCommit;
} else {
  sourceCommit = await publicSourceCommit(current.id);
}

if (!sourceCommit) {
  if (process.env.GITHUB_EVENT_NAME === "push") {
    throw new Error(
      "No fue posible preservar la identidad editorial pública durante un push técnico.",
    );
  }
  sourceCommit = execFileSync(
    "git",
    ["log", "-1", "--format=%H", "HEAD", "--", current.path],
    { cwd: rootPath, encoding: "utf8" },
  ).trim();
}

if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
  throw new Error(
    `No se pudo resolver sourceCommit editorial para ${current.path}.`,
  );
}

const outputs = {
  editorial_source_sha: sourceCommit,
  edition_id: current.id,
  edition_date: current.id.slice(0, 10),
  edition_slot: current.editionSlot,
};

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
    "utf8",
  );
}
if (process.env.GITHUB_ENV) {
  await appendFile(
    process.env.GITHUB_ENV,
    `ATLAS_EDITORIAL_SOURCE_SHA=${sourceCommit}\n`,
    "utf8",
  );
}

console.log(
  `Identidad editorial vigente: ${current.id} · ${current.editionSlot} · sourceCommit=${sourceCommit} · buildCommit=${buildCommit}.`,
);
