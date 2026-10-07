import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { normalizeEditionSlot } from "./edition-slot-contract.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);

function frontmatterValue(text, field) {
  return text
    .match(new RegExp(`^${field}:\\s*["']?([^"'\\r\\n]+)`, "m"))?.[1]
    ?.trim();
}

async function publishedRecord(path, label) {
  const source = await readFile(new URL(path, root), "utf8");
  const status = frontmatterValue(source, "status");
  if (status !== "published") {
    throw new Error(
      `${label} objetivo no está published antes del deploy: ${path} (status=${status ?? "missing"}).`,
    );
  }
  return {
    editionSlot: normalizeEditionSlot(frontmatterValue(source, "editionSlot")),
  };
}

if (process.env.GITHUB_EVENT_NAME !== "push") {
  console.log(
    "Identidad de publicación editorial: omitida fuera de un push a producción.",
  );
  process.exit(0);
}

const changedFiles = execFileSync(
  "git",
  ["diff", "--name-only", "HEAD^", "HEAD"],
  {
    cwd: rootPath,
    encoding: "utf8",
  },
)
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);

const dailyFiles = changedFiles.filter((path) =>
  /^src\/content\/editions\/\d{4}-\d{2}-\d{2}-daily-.*\.md$/.test(path),
);

if (dailyFiles.length === 0) {
  console.log(
    "Identidad de publicación editorial: este push no contiene una edición diaria objetivo.",
  );
  process.exit(0);
}

if (dailyFiles.length !== 1) {
  throw new Error(
    `El push productivo contiene ${dailyFiles.length} ediciones diarias objetivo; se esperaba exactamente una.`,
  );
}

const generalPath = dailyFiles[0];
const generalMatch = generalPath.match(
  /^src\/content\/editions\/(\d{4}-\d{2}-\d{2})-daily-(.+)\.md$/,
);
if (!generalMatch) {
  throw new Error(`No se pudo derivar la fecha objetivo desde ${generalPath}.`);
}

const editionDate = generalMatch[1];
const editionId = generalPath.split("/").at(-1).replace(/\.md$/, "");
const general = await publishedRecord(generalPath, "General");
const editionSlot = general.editionSlot;

const nationalFiles = changedFiles.filter((path) =>
  new RegExp(`^src/content/briefings/${editionDate}-national-.*\\.md$`).test(
    path,
  ),
);
const marketsFiles = changedFiles.filter((path) =>
  new RegExp(`^src/content/briefings/${editionDate}-markets-.*\\.md$`).test(
    path,
  ),
);

if (nationalFiles.length > 1 || marketsFiles.length > 1) {
  throw new Error(
    "El push productivo contiene más de una pieza Nacional o Mercados para la fecha objetivo.",
  );
}

const nationalPath = nationalFiles[0];
const marketsPath = marketsFiles[0];
const nationalId = nationalPath
  ? nationalPath.split("/").at(-1).replace(/\.md$/, "")
  : undefined;
const marketsId = marketsPath
  ? marketsPath.split("/").at(-1).replace(/\.md$/, "")
  : undefined;

if (nationalPath) {
  const national = await publishedRecord(nationalPath, "Nacional");
  if (national.editionSlot !== editionSlot) {
    throw new Error(
      `Nacional pertenece a ${national.editionSlot}, pero General pertenece a ${editionSlot}.`,
    );
  }
}
if (marketsPath) {
  const markets = await publishedRecord(marketsPath, "Mercados");
  if (markets.editionSlot !== editionSlot) {
    throw new Error(
      `Mercados pertenece a ${markets.editionSlot}, pero General pertenece a ${editionSlot}.`,
    );
  }
}

const manifest = JSON.parse(
  await readFile(new URL("dist/status.json", root), "utf8"),
);

if (manifest.latestDaily?.id !== editionId) {
  throw new Error(
    `El build no seleccionó la edición objetivo: expected=${editionId}, observed=${manifest.latestDaily?.id ?? "null"}.`,
  );
}
if (manifest.latestDaily?.editionSlot !== editionSlot) {
  throw new Error(
    `latestDaily no conserva editionSlot: expected=${editionSlot}, observed=${manifest.latestDaily?.editionSlot ?? "null"}.`,
  );
}

const packageKey =
  editionSlot === "midday" ? "middayPackage" : "morningPackage";
const packageState = manifest[packageKey];
if (packageState?.date !== editionDate) {
  throw new Error(
    `El ${packageKey} no corresponde a la fecha objetivo: expected=${editionDate}, observed=${packageState?.date ?? "null"}.`,
  );
}
if (packageState?.editionSlot !== editionSlot) {
  throw new Error(`El ${packageKey} no conserva editionSlot.`);
}
if (packageState?.generalPublished !== true) {
  throw new Error(`La General objetivo no figura publicada en ${packageKey}.`);
}
if (packageState?.generalId !== editionId) {
  throw new Error(`La General objetivo no coincide con ${packageKey}.`);
}

if (nationalId) {
  if (manifest.latestNational?.id !== nationalId) {
    throw new Error(
      `Nacional objetivo no coincide con latestNational: expected=${nationalId}, observed=${manifest.latestNational?.id ?? "null"}.`,
    );
  }
  if (
    packageState?.nationalPublished !== true ||
    packageState?.nationalId !== nationalId
  ) {
    throw new Error(`Nacional objetivo no figura publicado en ${packageKey}.`);
  }
}

if (marketsId) {
  if (manifest.latestMarkets?.id !== marketsId) {
    throw new Error(
      `Mercados objetivo no coincide con latestMarkets: expected=${marketsId}, observed=${manifest.latestMarkets?.id ?? "null"}.`,
    );
  }
  if (
    packageState?.marketsPublished !== true ||
    packageState?.marketsId !== marketsId
  ) {
    throw new Error(`Mercados objetivo no figura publicado en ${packageKey}.`);
  }
}

console.log(
  `Identidad ${editionSlot} validada: ${editionDate} · General=${editionId}` +
    `${nationalId ? ` · Nacional=${nationalId}` : ""}` +
    `${marketsId ? ` · Mercados=${marketsId}` : ""}.`,
);
