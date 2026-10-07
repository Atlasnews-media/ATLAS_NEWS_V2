import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  dailyIssueNumberFromRecords,
  normalizeEditionSlot,
  packageForSlot,
} from "./edition-slot-contract.mjs";

const root = new URL("../", import.meta.url);
const editionDir = new URL("src/content/editions/", root);
const briefingDir = new URL("src/content/briefings/", root);
const readingDir = new URL("src/content/readings/", root);
const publicDir = process.env.ATLAS_PUBLIC_DIR;
const expectedBuildCommit =
  process.env.ATLAS_SOURCE_SHA ?? process.env.GITHUB_SHA;
const expectedEditorialCommit =
  process.env.ATLAS_EDITORIAL_SOURCE_SHA ?? expectedBuildCommit;

if (!publicDir) {
  throw new Error("ATLAS_PUBLIC_DIR es obligatorio para auditar producción.");
}
if (!expectedBuildCommit || !expectedEditorialCommit) {
  throw new Error(
    "ATLAS_SOURCE_SHA/GITHUB_SHA y la identidad editorial son obligatorios.",
  );
}

function frontmatterValue(text, field) {
  return text
    .match(new RegExp(`^${field}:\\s*["']?([^"'\\r\\n]+)`, "m"))?.[1]
    ?.trim();
}

async function markdownFiles(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function oldestFirst(a, b) {
  return Date.parse(a.publishedAt) - Date.parse(b.publishedAt);
}

const editionFiles = await markdownFiles(editionDir);
const briefingFiles = await markdownFiles(briefingDir);
const readingFiles = await markdownFiles(readingDir);

const publishedDailies = [];
let publishedWeeklyCount = 0;
for (const filename of editionFiles) {
  const text = await readFile(new URL(filename, editionDir), "utf8");
  if (frontmatterValue(text, "status") !== "published") continue;
  const type = frontmatterValue(text, "type");
  if (type === "weekly") {
    publishedWeeklyCount += 1;
    continue;
  }
  if (type !== "daily") continue;
  publishedDailies.push({
    id: filename.replace(/\.mdx?$/, ""),
    title: frontmatterValue(text, "title") ?? "",
    publishedAt: frontmatterValue(text, "publishedAt") ?? "",
    editionSlot: normalizeEditionSlot(frontmatterValue(text, "editionSlot")),
  });
}
publishedDailies.sort(oldestFirst);

const publishedBriefings = [];
for (const filename of briefingFiles) {
  const text = await readFile(new URL(filename, briefingDir), "utf8");
  if (frontmatterValue(text, "status") !== "published") continue;
  const section = frontmatterValue(text, "section");
  if (!["national", "markets"].includes(section)) continue;
  publishedBriefings.push({
    id: filename.replace(/\.mdx?$/, ""),
    title: frontmatterValue(text, "title") ?? "",
    publishedAt: frontmatterValue(text, "publishedAt") ?? "",
    section,
    editionSlot: normalizeEditionSlot(frontmatterValue(text, "editionSlot")),
  });
}
publishedBriefings.sort(oldestFirst);
const publishedNational = publishedBriefings.filter(
  ({ section }) => section === "national",
);
const publishedMarkets = publishedBriefings.filter(
  ({ section }) => section === "markets",
);

let publishedReadingCount = 0;
for (const filename of readingFiles) {
  const text = await readFile(new URL(filename, readingDir), "utf8");
  if (frontmatterValue(text, "status") === "published") {
    publishedReadingCount += 1;
  }
}

const latestDaily = publishedDailies.at(-1);
const latestNational = publishedNational.at(-1);
const latestMarkets = publishedMarkets.at(-1);
const statusPath = resolve(publicDir, "status.json");
const indexPath = resolve(publicDir, "index.html");
const status = JSON.parse(await readFile(statusPath, "utf8"));
const index = await readFile(indexPath, "utf8");
const errors = [];

if (status.sourceCommit !== expectedEditorialCommit) {
  errors.push(
    `producción usa sourceCommit ${status.sourceCommit}, pero la edición vigente espera ${expectedEditorialCommit}`,
  );
}
if (status.buildCommit !== expectedBuildCommit) {
  errors.push(
    `producción usa buildCommit ${status.buildCommit}, pero el build espera ${expectedBuildCommit}`,
  );
}

if (latestDaily) {
  const issueNumber = dailyIssueNumberFromRecords(
    latestDaily,
    publishedDailies,
  );
  if (status.latestDaily?.id !== latestDaily.id) {
    errors.push(
      `producción muestra ${status.latestDaily?.id ?? "ninguna edición"}, pero main espera ${latestDaily.id}`,
    );
  }
  if (status.latestDaily?.editionSlot !== latestDaily.editionSlot) {
    errors.push("latestDaily no conserva la identidad de tramo editorial.");
  }
  if (status.latestDaily?.issueNumber !== issueNumber) {
    errors.push(
      `producción informa N° ${status.latestDaily?.issueNumber ?? "sin número"}, pero main espera N° ${issueNumber}`,
    );
  }
  if (!index.includes(`/ediciones/${latestDaily.id}/`)) {
    errors.push("la portada pública no enlaza la edición diaria más reciente");
  }
}

async function auditBriefing({ record, statusKey, route, label }) {
  const manifestRecord = status[statusKey];
  if (!record) {
    if (manifestRecord !== null) {
      errors.push(
        `${statusKey} debería ser null porque no hay ${label} publicado`,
      );
    }
    return;
  }

  if (manifestRecord?.id !== record.id) {
    errors.push(
      `${statusKey} informa ${manifestRecord?.id ?? "ninguno"}, pero se espera ${record.id}`,
    );
  }
  if (manifestRecord?.editionSlot !== record.editionSlot) {
    errors.push(`${statusKey} no conserva editionSlot de ${label}.`);
  }

  const outputPath = resolve(publicDir, route, record.id, "index.html");
  try {
    await access(outputPath);
  } catch {
    errors.push(`falta la URL pública esperada /${route}/${record.id}/`);
  }

  if (!index.includes(`/${route}/${record.id}/`)) {
    errors.push(`la portada pública no enlaza el ${label} más reciente`);
  }
}

await auditBriefing({
  record: latestNational,
  statusKey: "latestNational",
  route: "nacional",
  label: "Nacional",
});
await auditBriefing({
  record: latestMarkets,
  statusKey: "latestMarkets",
  route: "mercados",
  label: "Mercados",
});

const expectedMorning = packageForSlot({
  dailies: publishedDailies,
  briefings: publishedBriefings,
  slot: "morning",
});
const expectedMidday = packageForSlot({
  dailies: publishedDailies,
  briefings: publishedBriefings,
  slot: "midday",
});
for (const [key, expected] of [
  ["morningPackage", expectedMorning],
  ["middayPackage", expectedMidday],
]) {
  if (
    JSON.stringify(status[key] ?? null) !== JSON.stringify(expected ?? null)
  ) {
    errors.push(`${key} no coincide con el contenido publicado.`);
  }
}

const expectedTotal =
  publishedDailies.length +
  publishedWeeklyCount +
  publishedNational.length +
  publishedMarkets.length +
  publishedReadingCount;

if (status.publications?.daily !== publishedDailies.length) {
  errors.push(
    "el conteo daily de status.json no coincide con el contenido publicado",
  );
}
if (status.publications?.weekly !== publishedWeeklyCount) {
  errors.push(
    "el conteo weekly de status.json no coincide con los panoramas semanales",
  );
}
if (status.publications?.national !== publishedNational.length) {
  errors.push("el conteo national de status.json no coincide con Nacional");
}
if (status.publications?.markets !== publishedMarkets.length) {
  errors.push("el conteo markets de status.json no coincide con Mercados");
}
if (status.publications?.readings !== publishedReadingCount) {
  errors.push(
    "el conteo readings de status.json no coincide con las publicaciones publicadas",
  );
}
if (status.publications?.total !== expectedTotal) {
  errors.push(
    "el total de status.json no coincide con las publicaciones publicadas",
  );
}

if (errors.length) {
  console.error(`Auditoría de producción fallida:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Producción alineada: edición vigente ${latestDaily?.id ?? "ninguna"} (${latestDaily?.editionSlot ?? "sin slot"}), Nacional ${publishedNational.length}, Mercados ${publishedMarkets.length}, sourceCommit ${expectedEditorialCommit.slice(0, 7)}, buildCommit ${expectedBuildCommit.slice(0, 7)}.`,
);
