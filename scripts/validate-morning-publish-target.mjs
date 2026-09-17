import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);

function frontmatterValue(text, field) {
  return text
    .match(new RegExp(`^${field}:\\s*["']?([^"'\\r\\n]+)`, "m"))?.[1]
    ?.trim();
}

async function requirePublished(path, label) {
  const source = await readFile(new URL(path, root), "utf8");
  const status = frontmatterValue(source, "status");
  if (status !== "published") {
    throw new Error(
      `${label} objetivo no está published antes del deploy: ${path} (status=${status ?? "missing"}).`,
    );
  }
}

if (process.env.GITHUB_EVENT_NAME !== "push") {
  console.log(
    "Identidad de publicación matutina: omitida fuera de un push a producción.",
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
    "Identidad de publicación matutina: este push no contiene una edición diaria objetivo.",
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

await requirePublished(generalPath, "General");
if (nationalPath) await requirePublished(nationalPath, "Nacional");
if (marketsPath) await requirePublished(marketsPath, "Mercados");

const manifest = JSON.parse(
  await readFile(new URL("dist/status.json", root), "utf8"),
);

if (manifest.latestDaily?.id !== editionId) {
  throw new Error(
    `El build no seleccionó la edición objetivo: expected=${editionId}, observed=${manifest.latestDaily?.id ?? "null"}.`,
  );
}
if (manifest.morningPackage?.date !== editionDate) {
  throw new Error(
    `El morningPackage no corresponde a la fecha objetivo: expected=${editionDate}, observed=${manifest.morningPackage?.date ?? "null"}.`,
  );
}
if (manifest.morningPackage?.generalPublished !== true) {
  throw new Error("La General objetivo no figura publicada en el manifiesto.");
}

if (nationalId) {
  if (manifest.latestNational?.id !== nationalId) {
    throw new Error(
      `Nacional objetivo no coincide con latestNational: expected=${nationalId}, observed=${manifest.latestNational?.id ?? "null"}.`,
    );
  }
  if (manifest.morningPackage?.nationalPublished !== true) {
    throw new Error("Nacional objetivo no figura publicado en morningPackage.");
  }
}

if (marketsId) {
  if (manifest.latestMarkets?.id !== marketsId) {
    throw new Error(
      `Mercados objetivo no coincide con latestMarkets: expected=${marketsId}, observed=${manifest.latestMarkets?.id ?? "null"}.`,
    );
  }
  if (manifest.morningPackage?.marketsPublished !== true) {
    throw new Error("Mercados objetivo no figura publicado en morningPackage.");
  }
}

console.log(
  `Identidad matutina validada: ${editionDate} · General=${editionId}` +
    `${nationalId ? ` · Nacional=${nationalId}` : ""}` +
    `${marketsId ? ` · Mercados=${marketsId}` : ""}.`,
);
