import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = new URL("../", import.meta.url);
const editionDir = new URL("src/content/editions/", root);
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

const editionFiles = (await readdir(editionDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

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

publishedDailies.sort(
  (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt),
);
const latestDaily = publishedDailies.at(-1);
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

if (errors.length) {
  console.error(`Auditoría de producción fallida:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(
  latestDaily
    ? `Producción alineada: N° ${publishedDailies.length}, ${latestDaily.id}, commit ${expectedCommit.slice(0, 7)}.`
    : `Producción alineada sin ediciones diarias, commit ${expectedCommit.slice(0, 7)}.`,
);
