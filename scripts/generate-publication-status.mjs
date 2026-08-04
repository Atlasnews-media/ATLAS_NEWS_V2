import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const editionDir = new URL("src/content/editions/", root);
const readingDir = new URL("src/content/readings/", root);
const outputDir = new URL("public/", root);
const outputFile = new URL("status.json", outputDir);

function frontmatter(text) {
  return text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

function parseScalar(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.replace(/^["']|["']$/g, "");
  }
}

function field(text, name) {
  const value = frontmatter(text).match(
    new RegExp(`^${name}:\\s*(.+)$`, "m"),
  )?.[1];
  return parseScalar(value);
}

async function markdownRecords(directory) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (filename) => {
      const text = await readFile(new URL(filename, directory), "utf8");
      return {
        id: filename.replace(/\.mdx?$/, ""),
        filename,
        title: field(text, "title"),
        publishedAt: field(text, "publishedAt"),
        cutoffAt: field(text, "cutoffAt"),
        type: field(text, "type"),
        status: field(text, "status"),
      };
    }),
  );
}

const [editions, readings, indicators] = await Promise.all([
  markdownRecords(editionDir),
  markdownRecords(readingDir),
  readFile(new URL("src/data/economic-indicators.json", root), "utf8").then(
    JSON.parse,
  ),
]);

const publishedEditions = editions.filter(
  ({ status }) => status === "published",
);
const publishedDailies = publishedEditions
  .filter(({ type }) => type === "daily")
  .sort(
    (a, b) =>
      Date.parse(a.publishedAt ?? "") - Date.parse(b.publishedAt ?? ""),
  );
const publishedWeeklies = publishedEditions.filter(
  ({ type }) => type === "weekly",
);
const publishedReadings = readings.filter(
  ({ status }) => status === "published",
);
const latestDaily = publishedDailies.at(-1);
const sourceCommit =
  process.env.ATLAS_SOURCE_SHA ?? process.env.GITHUB_SHA ?? "local";

const status = {
  schemaVersion: 1,
  sourceCommit,
  latestDaily: latestDaily
    ? {
        id: latestDaily.id,
        issueNumber: publishedDailies.length,
        title: latestDaily.title,
        publishedAt: latestDaily.publishedAt,
        cutoffAt: latestDaily.cutoffAt,
      }
    : null,
  publications: {
    daily: publishedDailies.length,
    weekly: publishedWeeklies.length,
    readings: publishedReadings.length,
    total:
      publishedDailies.length +
      publishedWeeklies.length +
      publishedReadings.length,
  },
  indicators: {
    status: indicators.status,
    asOf: indicators.asOf,
    sourceName: indicators.sourceName,
  },
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, `${JSON.stringify(status, null, 2)}\n`, "utf8");

console.log(
  latestDaily
    ? `Estado generado: edición diaria ${publishedDailies.length}, ${latestDaily.id}.`
    : "Estado generado: no hay una edición diaria publicada.",
);
