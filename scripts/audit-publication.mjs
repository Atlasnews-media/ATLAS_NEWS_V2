import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = new URL("../", import.meta.url);
const editionDir = new URL("src/content/editions/", root);
const briefingDir = new URL("src/content/briefings/", root);
const readingDir = new URL("src/content/readings/", root);
const publicDir = process.env.ATLAS_PUBLIC_DIR;
const expectedCommit = process.env.ATLAS_SOURCE_SHA ?? process.env.GITHUB_SHA;

if (!publicDir) {
  throw new Error("ATLAS_PUBLIC_DIR es obligatorio para auditar producción.");
}
if (!expectedCommit) {
  throw new Error("ATLAS_SOURCE_SHA o GITHUB_SHA es obligatorio.");
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
for (const filename of editionFiles) {
  const text = await readFile(new URL(filename, editionDir), "utf8");
  if (frontmatterValue(text, "status") !== "published") continue;
  if (frontmatterValue(text, "type") !== "daily") continue;
  publishedDailies.push({
    id: filename.replace(/\.mdx?$/, ""),
    title: frontmatterValue(text, "title") ?? "",
    publishedAt: frontmatterValue(text, "publishedAt") ?? "",
  });
}
publishedDailies.sort(oldestFirst);

const publishedNational = [];
const publishedMarkets = [];
for (const filename of briefingFiles) {
  const text = await readFile(new URL(filename, briefingDir), "utf8");
  if (frontmatterValue(text, "status") !== "published") continue;
  const record = {
    id: filename.replace(/\.mdx?$/, ""),
    title: frontmatterValue(text, "title") ?? "",
    publishedAt: frontmatterValue(text, "publishedAt") ?? "",
  };
  const section = frontmatterValue(text, "section");
  if (section === "national") publishedNational.push(record);
  if (section === "markets") publishedMarkets.push(record);
}
publishedNational.sort(oldestFirst);
publishedMarkets.sort(oldestFirst);

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

if (status.sourceCommit !== expectedCommit) {
  errors.push(
    `producción usa ${status.sourceCommit}, pero main está en ${expectedCommit}`,
  );
}

if (latestDaily) {
  if (status.latestDaily?.id !== latestDaily.id) {
    errors.push(
      `producción muestra ${status.latestDaily?.id ?? "ninguna edición"}, pero main espera ${latestDaily.id}`,
    );
  }
  if (status.latestDaily?.issueNumber !== publishedDailies.length) {
    errors.push(
      `producción informa N° ${status.latestDaily?.issueNumber ?? "sin número"}, pero main espera N° ${publishedDailies.length}`,
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
      errors.push(`${statusKey} debería ser null porque no hay ${label} publicado`);
    }
    return;
  }

  if (manifestRecord?.id !== record.id) {
    errors.push(
      `${statusKey} informa ${manifestRecord?.id ?? "ninguno"}, pero se espera ${record.id}`,
    );
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

const expectedTotal =
  publishedDailies.length +
  status.publications.weekly +
  publishedNational.length +
  publishedMarkets.length +
  publishedReadingCount;

if (status.publications?.daily !== publishedDailies.length) {
  errors.push("el conteo daily de status.json no coincide con el contenido publicado");
}
if (status.publications?.national !== publishedNational.length) {
  errors.push(
    "el conteo national de status.json no coincide con el contenido publicado",
  );
}
if (status.publications?.markets !== publishedMarkets.length) {
  errors.push(
    "el conteo markets de status.json no coincide con el contenido publicado",
  );
}
if (status.publications?.readings !== publishedReadingCount) {
  errors.push(
    "el conteo readings de status.json no coincide con el contenido publicado",
  );
}
if (status.publications?.total !== expectedTotal) {
  errors.push("el total de status.json no coincide con las publicaciones publicadas");
}

if (errors.length) {
  console.error(`Auditoría de producción fallida:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Producción alineada: N° ${publishedDailies.length}, Nacional ${publishedNational.length}, Mercados ${publishedMarkets.length}, commit ${expectedCommit.slice(0, 7)}.`,
);
