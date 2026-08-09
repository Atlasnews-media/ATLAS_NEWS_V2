import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const editionDir = new URL("src/content/editions/", root);
const briefingDir = new URL("src/content/briefings/", root);
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
        section: field(text, "section"),
        status: field(text, "status"),
      };
    }),
  );
}

function oldestFirst(a, b) {
  return Date.parse(a.publishedAt ?? "") - Date.parse(b.publishedAt ?? "");
}

function latestBriefingRecord(record) {
  return record
    ? {
        id: record.id,
        title: record.title,
        publishedAt: record.publishedAt,
        cutoffAt: record.cutoffAt,
      }
    : null;
}

const [editions, briefings, readings, indicators] = await Promise.all([
  markdownRecords(editionDir),
  markdownRecords(briefingDir),
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
  .sort(oldestFirst);
const publishedWeeklies = publishedEditions.filter(
  ({ type }) => type === "weekly",
);
const publishedBriefings = briefings.filter(
  ({ status }) => status === "published",
);
const publishedNational = publishedBriefings
  .filter(({ section }) => section === "national")
  .sort(oldestFirst);
const publishedMarkets = publishedBriefings
  .filter(({ section }) => section === "markets")
  .sort(oldestFirst);
const publishedReadings = readings.filter(
  ({ status }) => status === "published",
);

const latestDaily = publishedDailies.at(-1);
const latestNational = publishedNational.at(-1);
const latestMarkets = publishedMarkets.at(-1);
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
  latestNational: latestBriefingRecord(latestNational),
  latestMarkets: latestBriefingRecord(latestMarkets),
  publications: {
    daily: publishedDailies.length,
    weekly: publishedWeeklies.length,
    national: publishedNational.length,
    markets: publishedMarkets.length,
    readings: publishedReadings.length,
    total:
      publishedDailies.length +
      publishedWeeklies.length +
      publishedNational.length +
      publishedMarkets.length +
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
  `Estado generado: ${publishedDailies.length} diarias, ${publishedNational.length} nacionales, ${publishedMarkets.length} de mercados y ${publishedReadings.length} lecturas.`,
);
