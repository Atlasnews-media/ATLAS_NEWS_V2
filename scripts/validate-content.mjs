import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const editionDir = new URL("src/content/editions/", root);
const readingDir = new URL("src/content/readings/", root);

const editionHeadings = [
  "Hecho central",
  "En una mirada",
  "Por qué importa",
  "Mercados globales",
  "Chile",
  "Tasas, monedas y commodities",
  "Qué observar",
  "Fuentes y metodología",
];

const readingHeadings = [
  "Tesis principal",
  "Por qué fue seleccionada",
  "Contexto y límites",
];
const filenamePattern =
  /^\d{4}-\d{2}-\d{2}-(daily|weekly|reading)-[a-z0-9-]+\.mdx?$/;

function frontmatterValue(text, field) {
  return text
    .match(new RegExp(`^${field}:\\s*["']?([^"'\\r\\n]+)`, "m"))?.[1]
    ?.trim();
}

async function markdownFiles(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
    .map((entry) => entry.name);
}

async function validateFile(directory, filename, requiredHeadings) {
  const text = await readFile(new URL(filename, directory), "utf8");
  const errors = [];

  if (!filenamePattern.test(filename))
    errors.push("nombre de archivo fuera de convención");
  for (const heading of requiredHeadings) {
    if (!text.includes(`## ${heading}`))
      errors.push(`falta la sección \"${heading}\"`);
  }

  const publishedAt = Date.parse(frontmatterValue(text, "publishedAt") ?? "");
  const cutoffAtValue = frontmatterValue(text, "cutoffAt");
  const cutoffAt = cutoffAtValue ? Date.parse(cutoffAtValue) : undefined;
  if (!Number.isFinite(publishedAt))
    errors.push("publishedAt no es una fecha válida");
  if (cutoffAtValue && !Number.isFinite(cutoffAt))
    errors.push("cutoffAt no es una fecha válida");
  if (cutoffAt && publishedAt && cutoffAt > publishedAt) {
    errors.push("cutoffAt no puede ser posterior a publishedAt");
  }

  const status = frontmatterValue(text, "status");
  if (!status || !["draft", "published"].includes(status))
    errors.push("status no es válido");

  if (
    frontmatterValue(text, "demo") === "true" &&
    !text.includes("demostración")
  ) {
    errors.push("el contenido demo no contiene una advertencia visible");
  }

  return errors.map((error) => `${filename}: ${error}`);
}

const editionFiles = await markdownFiles(editionDir);
const readingFiles = await markdownFiles(readingDir);
const errors = (
  await Promise.all([
    ...editionFiles.map((file) =>
      validateFile(editionDir, file, editionHeadings),
    ),
    ...readingFiles.map((file) =>
      validateFile(readingDir, file, readingHeadings),
    ),
  ])
).flat();

if (errors.length) {
  console.error(`Validación editorial fallida:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Contenido validado: ${editionFiles.length} ediciones y ${readingFiles.length} lecturas.`,
);
