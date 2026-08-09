import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const editionDir = new URL("src/content/editions/", root);
const briefingDir = new URL("src/content/briefings/", root);
const readingDir = new URL("src/content/readings/", root);
const editorialStateFile = new URL("data/editorial_state.json", root);

const editionHeadings = [
  "Hecho central",
  "En una mirada",
  "Por qué importa",
  "Mercados globales",
  "Chile",
  "Tasas, monedas y commodities",
  "Qué observar",
];

const readingHeadings = [
  "Tesis principal",
  "Por qué fue seleccionada",
  "Contexto y límites",
];
const editionFilenamePattern =
  /^\d{4}-\d{2}-\d{2}-(daily|weekly)-[a-z0-9-]+\.mdx?$/;
const briefingFilenamePattern =
  /^\d{4}-\d{2}-\d{2}-(national|markets)-[a-z0-9-]+\.mdx?$/;
const readingFilenamePattern =
  /^\d{4}-\d{2}-\d{2}-reading-[a-z0-9-]+\.mdx?$/;
const editorialStatuses = new Set([
  "new",
  "continues",
  "confirmed",
  "weakened",
  "changed",
  "contradicted",
  "closed",
]);
const editorialThreadFields = [
  "id",
  "topic",
  "thesis",
  "status",
  "last_evidence",
  "effect",
  "base_scenario",
  "invalidate_if",
  "watch",
  "last_publication",
];

function frontmatterValue(text, field) {
  return text
    .match(new RegExp(`^${field}:\\s*["']?([^"'\\r\\n]+)`, "m"))?.[1]
    ?.trim();
}

function frontmatterText(text) {
  return text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

function parseYamlScalar(value) {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.replace(/^["']|["']$/g, "");
  }
}

function normalizeSourceUrl(value) {
  try {
    const url = new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return undefined;

    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const parameter of [...url.searchParams.keys()]) {
      if (
        parameter.toLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid"].includes(parameter.toLowerCase())
      ) {
        url.searchParams.delete(parameter);
      }
    }
    url.searchParams.sort();
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, "");

    return url.toString();
  } catch {
    return undefined;
  }
}

function santiagoDate(timestamp) {
  if (!Number.isFinite(timestamp)) return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

async function markdownFiles(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
    .map((entry) => entry.name);
}

async function validateEditorialState() {
  let document;
  try {
    document = JSON.parse(await readFile(editorialStateFile, "utf8"));
  } catch (error) {
    return [
      `data/editorial_state.json: no puede leerse como JSON válido (${error.message})`,
    ];
  }

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return ["data/editorial_state.json: la raíz debe ser un objeto"];
  }
  if (!Array.isArray(document.threads)) {
    return ["data/editorial_state.json: threads debe ser un arreglo"];
  }

  const errors = [];
  const ids = new Set();

  for (const [index, thread] of document.threads.entries()) {
    const label = `data/editorial_state.json: threads[${index}]`;
    if (!thread || typeof thread !== "object" || Array.isArray(thread)) {
      errors.push(`${label} debe ser un objeto`);
      continue;
    }

    for (const field of editorialThreadFields) {
      if (typeof thread[field] !== "string" || !thread[field].trim()) {
        errors.push(`${label}.${field} debe ser un texto no vacío`);
      }
    }

    if (typeof thread.id === "string") {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(thread.id)) {
        errors.push(`${label}.id debe usar minúsculas, números y guiones`);
      } else if (ids.has(thread.id)) {
        errors.push(`${label}.id repite el identificador ${thread.id}`);
      } else {
        ids.add(thread.id);
      }
    }

    if (
      typeof thread.status === "string" &&
      !editorialStatuses.has(thread.status)
    ) {
      errors.push(`${label}.status no es válido`);
    }

    if (
      typeof thread.last_publication === "string" &&
      !/^\/(ediciones|lecturas)\/[a-z0-9-]+\/$/.test(thread.last_publication)
    ) {
      errors.push(`${label}.last_publication no es una ruta pública válida`);
    }
  }

  return errors;
}

async function validateFile(
  directory,
  filename,
  requiredHeadings,
  filenamePattern,
) {
  const text = await readFile(new URL(filename, directory), "utf8");
  const frontmatter = frontmatterText(text);
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

  const filenameDate = filename.match(/^(\d{4}-\d{2}-\d{2})-/)?.[1];
  const editorialDate = santiagoDate(publishedAt);
  if (filenameDate && editorialDate && filenameDate !== editorialDate) {
    errors.push(
      `la fecha del nombre (${filenameDate}) no coincide con publishedAt en Santiago (${editorialDate})`,
    );
  }

  const status = frontmatterValue(text, "status");
  if (!status || !["draft", "published"].includes(status))
    errors.push("status no es válido");
  if (
    status === "published" &&
    filename.includes("-daily-") &&
    !text.includes("\nhighlights:")
  ) {
    errors.push("la edición diaria publicada no contiene tres destacados");
  }

  const pendingVerification = frontmatter.includes("pendiente-verificacion");
  const radarReading = filename.includes("-reading-radar-");
  const editorialInboxReading = filename.includes("-reading-buzon-");
  const automatedReading = radarReading || editorialInboxReading;

  if (radarReading && !frontmatter.includes("radar-ipsa")) {
    errors.push("el candidato Radar IPSA no contiene su etiqueta de origen");
  }
  if (editorialInboxReading && !frontmatter.includes("buzon-editorial")) {
    errors.push("el candidato del Buzón no contiene su etiqueta de origen");
  }
  if (automatedReading && status === "draft" && !pendingVerification) {
    errors.push("el candidato automático no está marcado para verificación");
  }
  if (status === "published" && pendingVerification) {
    errors.push("la publicación conserva la etiqueta pendiente-verificacion");
  }

  if (status === "published" && /\bbr(?:ie|i)fings?\b/i.test(text)) {
    errors.push("la publicación expone terminología interna de preparación");
  }

  if (status === "published" && text.includes("cite")) {
    errors.push("la publicación contiene referencias internas de ChatGPT");
  }

  if (
    status === "published" &&
    /no constituye (?:una )?recomendación|no (?:son|es) (?:una )?recomendación|no instrucciones para/i.test(
      text,
    )
  ) {
    errors.push("la publicación repite el aviso general del sitio");
  }

  if (
    frontmatterValue(text, "demo") === "true" &&
    !text.includes("demostración")
  ) {
    errors.push("el contenido demo no contiene una advertencia visible");
  }

  return errors.map((error) => `${filename}: ${error}`);
}

async function validateBriefingFile(filename) {
  const errors = await validateFile(
    briefingDir,
    filename,
    [],
    briefingFilenamePattern,
  );
  const text = await readFile(new URL(filename, briefingDir), "utf8");
  const section = frontmatterValue(text, "section");
  const filenameSection = filename.match(
    /^\d{4}-\d{2}-\d{2}-(national|markets)-/,
  )?.[1];

  if (!section || !["national", "markets"].includes(section)) {
    errors.push(`${filename}: section no es válido`);
  } else if (filenameSection && section !== filenameSection) {
    errors.push(
      `${filename}: section ${section} no coincide con ${filenameSection} en el nombre`,
    );
  }

  if (!frontmatterValue(text, "cutoffAt")) {
    errors.push(`${filename}: cutoffAt es obligatorio`);
  }

  return errors;
}

async function duplicateReadingSourceErrors(files) {
  const ownersByUrl = new Map();
  const errors = [];

  for (const filename of files) {
    const text = await readFile(new URL(filename, readingDir), "utf8");
    const rawUrl = text.match(/^\s*url:\s*(.+)$/m)?.[1];
    if (!rawUrl) continue;

    const normalizedUrl = normalizeSourceUrl(parseYamlScalar(rawUrl));
    if (!normalizedUrl) continue;

    const previousOwner = ownersByUrl.get(normalizedUrl);
    if (previousOwner) {
      errors.push(
        `${filename}: repite la URL fuente ya registrada en ${previousOwner}`,
      );
    } else {
      ownersByUrl.set(normalizedUrl, filename);
    }
  }

  return errors;
}

async function duplicatePublishedEditionErrors(files) {
  const ownersByEdition = new Map();
  const errors = [];

  for (const filename of files) {
    const text = await readFile(new URL(filename, editionDir), "utf8");
    if (frontmatterValue(text, "status") !== "published") continue;

    const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(daily|weekly)-/);
    if (!match) continue;

    const key = `${match[1]}:${match[2]}`;
    const previousOwner = ownersByEdition.get(key);
    if (previousOwner) {
      errors.push(
        `${filename}: duplica la edición publicada ${key} ya registrada en ${previousOwner}`,
      );
    } else {
      ownersByEdition.set(key, filename);
    }
  }

  return errors;
}

async function duplicatePublishedBriefingErrors(files) {
  const ownersByBriefing = new Map();
  const errors = [];

  for (const filename of files) {
    const text = await readFile(new URL(filename, briefingDir), "utf8");
    if (frontmatterValue(text, "status") !== "published") continue;

    const match = filename.match(
      /^(\d{4}-\d{2}-\d{2})-(national|markets)-/,
    );
    if (!match) continue;

    const key = `${match[1]}:${match[2]}`;
    const previousOwner = ownersByBriefing.get(key);
    if (previousOwner) {
      errors.push(
        `${filename}: duplica la publicación ${key} ya registrada en ${previousOwner}`,
      );
    } else {
      ownersByBriefing.set(key, filename);
    }
  }

  return errors;
}

const editionFiles = await markdownFiles(editionDir);
const briefingFiles = await markdownFiles(briefingDir);
const readingFiles = await markdownFiles(readingDir);
const errors = (
  await Promise.all([
    ...editionFiles.map((file) =>
      validateFile(editionDir, file, editionHeadings, editionFilenamePattern),
    ),
    ...briefingFiles.map((file) => validateBriefingFile(file)),
    ...readingFiles.map((file) =>
      validateFile(readingDir, file, readingHeadings, readingFilenamePattern),
    ),
    duplicateReadingSourceErrors(readingFiles),
    duplicatePublishedEditionErrors(editionFiles),
    duplicatePublishedBriefingErrors(briefingFiles),
    validateEditorialState(),
  ])
).flat();

if (errors.length) {
  console.error(`Validación editorial fallida:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Contenido validado: ${editionFiles.length} ediciones, ${briefingFiles.length} briefings y ${readingFiles.length} lecturas.`,
);
