import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readingsPath = resolve(root, "src/content/readings");
const issuePath = resolve(
  root,
  process.env.ATLAS_EDITORIAL_ISSUE_PATH ?? "tmp/editorial-issue.json",
);
const outputPath = resolve(
  root,
  process.env.ATLAS_EDITORIAL_OUTPUT_DIR ?? "src/content/readings",
);
const reportPath = process.env.ATLAS_EDITORIAL_REPORT_PATH
  ? resolve(root, process.env.ATLAS_EDITORIAL_REPORT_PATH)
  : undefined;
const dryRun = process.env.ATLAS_EDITORIAL_DRY_RUN === "1";

const trackingParameters = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTitle(value) {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeTitle(value).replace(/\s+/g, "-").slice(0, 60);
}

function truncateAtWord(value, maximumLength) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maximumLength) return normalized;

  const shortened = normalized.slice(0, Math.max(1, maximumLength - 1));
  const lastSpace = shortened.lastIndexOf(" ");
  const boundary =
    lastSpace > maximumLength * 0.6 ? lastSpace : shortened.length;
  return `${shortened.slice(0, boundary).trim()}…`;
}

function markdownText(value) {
  return normalizeWhitespace(value).replace(/([\\`*_{}[\]<>])/g, "\\$1");
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return undefined;

    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const parameter of [...url.searchParams.keys()]) {
      const normalizedParameter = parameter.toLowerCase();
      if (
        normalizedParameter.startsWith("utm_") ||
        trackingParameters.has(normalizedParameter)
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function issueField(body, label) {
  const match = body.match(
    new RegExp(
      `^### ${escapeRegex(label)}\\s*\\r?\\n+([\\s\\S]*?)(?=\\r?\\n### |$)`,
      "m",
    ),
  );
  const value = match?.[1]?.trim();
  if (!value || value === "_No response_") {
    throw new Error(`El issue no contiene el campo obligatorio: ${label}.`);
  }
  return value;
}

function dateInSantiago(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.map(({ type, value: partValue }) => [type, partValue]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function sourceDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function parseYamlScalar(value) {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.replace(/^["']|["']$/g, "");
  }
}

async function existingSourceUrls() {
  const urls = new Set();

  for (const directory of new Set([readingsPath, outputPath])) {
    let entries = [];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) continue;
      const text = await readFile(resolve(directory, entry.name), "utf8");
      for (const match of text.matchAll(/^\s*url:\s*(.+)$/gm)) {
        const url = normalizeUrl(parseYamlScalar(match[1]));
        if (url) urls.add(url);
      }
    }
  }

  return urls;
}

function inlineJsonArray(values) {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function readingMarkdown(proposal, detectedAt) {
  const prefix = "Buzón editorial · ";
  const title = `${prefix}${truncateAtWord(
    proposal.sourceTitle,
    160 - prefix.length,
  )}`;
  const summary = truncateAtWord(
    `Propuesta editorial recibida para revisar «${proposal.sourceTitle}». ` +
      "La fuente y su relevancia deben verificarse antes de cualquier publicación.",
    320,
  );
  const tags = inlineJsonArray([
    "buzon-editorial",
    slugify(proposal.section),
    "pendiente-verificacion",
  ]);
  const publishedAt = detectedAt.toISOString();
  const sourcePublishedAt = sourceDate(proposal.sourceDate);
  const sourcePublishedLine = sourcePublishedAt
    ? `  publishedAt: ${JSON.stringify(sourcePublishedAt)}\n`
    : "";

  return `---\ntitle: ${JSON.stringify(title)}\nsummary: ${JSON.stringify(summary)}\npublishedAt: ${JSON.stringify(publishedAt)}\nstatus: draft\ntags: ${tags}\nsource:\n  name: ${JSON.stringify(proposal.author)}\n  url: ${JSON.stringify(proposal.sourceUrl)}\n${sourcePublishedLine}author: ${JSON.stringify("ATLAS Buzón")}\ndemo: false\n---\n\n## Tesis principal\n\nEl Buzón Editorial recibió la fuente «${markdownText(proposal.sourceTitle)}». La propuesta sostiene que merece revisión por la siguiente razón: ${markdownText(proposal.relevance)}\n\n## Por qué fue seleccionada\n\nLa propuesta fue registrada para **${markdownText(proposal.section)}** mediante el issue #${proposal.issueNumber}. La entidad o autor informado es ${markdownText(proposal.author)} y la fecha declarada por quien propone es ${markdownText(proposal.sourceDate)}.\n\nFuente primaria relacionada informada: ${markdownText(proposal.primarySource)}\n\n## Contexto y límites\n\nEsta ficha conserva la descripción de la propuesta, pero ATLAS NEWS todavía no ha confirmado la disponibilidad de la URL, la fecha, la autoría ni el hecho central. Observaciones recibidas: ${markdownText(proposal.notes)}\n\nAntes de retirar la etiqueta \`pendiente-verificacion\`, se debe abrir la fuente original, contrastar la evidencia primaria y reescribir las tres secciones con criterio editorial.\n\nIssue de origen: ${proposal.issueUrl}\n`;
}

async function writeReport(report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) {
    await mkdir(resolve(reportPath, ".."), { recursive: true });
    await writeFile(reportPath, serialized);
  }

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `created_count=${report.created}\ncreated_file=${report.file ?? ""}\nreason=${report.reason ?? ""}\n`,
    );
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Buzón Editorial\n\n- Issue: #${report.issueNumber}\n- Borradores creados: ${report.created}\n- Resultado: ${report.reason}\n`,
    );
  }
}

const issue = JSON.parse(await readFile(issuePath, "utf8"));
if (!Number.isInteger(issue.number) || typeof issue.body !== "string") {
  throw new Error("El archivo de entrada no contiene un issue válido.");
}

const proposal = {
  issueNumber: issue.number,
  issueUrl:
    typeof issue.url === "string"
      ? issue.url
      : `https://github.com/Atlasnews-media/ATLAS_NEWS_V2/issues/${issue.number}`,
  sourceTitle: issueField(issue.body, "Título de la fuente"),
  sourceUrl: normalizeUrl(issueField(issue.body, "URL de la fuente")),
  sourceDate: issueField(issue.body, "Fecha de publicación"),
  author: issueField(issue.body, "Autor o entidad responsable"),
  relevance: issueField(issue.body, "Por qué merece revisión"),
  primarySource: issueField(issue.body, "Fuente primaria relacionada"),
  section: issueField(issue.body, "Sección propuesta"),
  notes: issueField(issue.body, "Observaciones y límites"),
};

if (!proposal.sourceUrl) {
  throw new Error("La URL propuesta no es una URL HTTP o HTTPS válida.");
}

const existingUrls = await existingSourceUrls();
if (existingUrls.has(proposal.sourceUrl)) {
  await writeReport({
    created: 0,
    file: null,
    issueNumber: proposal.issueNumber,
    reason: "La URL ya existe en Lecturas.",
  });
  console.log("Buzón Editorial: la URL propuesta ya estaba registrada.");
  process.exit(0);
}

const detectedAt = new Date();
const filename = `${dateInSantiago(detectedAt)}-reading-buzon-${proposal.issueNumber}-${slugify(proposal.sourceTitle)}.md`;

if (!dryRun) {
  await mkdir(outputPath, { recursive: true });
  await writeFile(
    resolve(outputPath, filename),
    readingMarkdown(proposal, detectedAt),
  );
}

await writeReport({
  created: dryRun ? 0 : 1,
  file: dryRun ? null : filename,
  issueNumber: proposal.issueNumber,
  reason: dryRun ? "Validación en seco completada." : "Borrador creado.",
});

console.log(
  dryRun
    ? "Buzón Editorial: propuesta válida; no se escribió ningún archivo."
    : `Buzón Editorial: borrador creado en ${filename}.`,
);
