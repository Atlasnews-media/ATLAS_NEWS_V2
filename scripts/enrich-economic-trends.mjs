import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const snapshotPath = new URL("src/data/economic-indicators.json", root);
const publicSnapshotPath = new URL("public/data/economic-indicators.json", root);
const providerBaseUrl =
  process.env.ATLAS_INDICATORS_API_BASE ?? "https://mindicador.cl/api";

const trendDefinitions = new Map([
  ["dolar", "dolar"],
  ["euro", "euro"],
  ["cobre", "libra_cobre"],
]);

function dateInSantiago(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "user-agent": "ATLAS-NEWS/1.0",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`${url} respondió con estado ${response.status}.`);
  }

  return response.json();
}

async function enrichIndicator(indicator) {
  const providerCode = trendDefinitions.get(indicator.code);
  if (!providerCode) return indicator;

  const payload = await fetchJson(`${providerBaseUrl}/${providerCode}`);
  const observations = (Array.isArray(payload?.serie) ? payload.serie : [])
    .filter(
      (observation) =>
        Number.isFinite(observation?.valor) &&
        typeof observation?.fecha === "string",
    )
    .map((observation) => ({
      value: observation.valor,
      effectiveDate: dateInSantiago(observation.fecha),
    }))
    .filter((observation) => observation.effectiveDate <= indicator.effectiveDate)
    .sort((left, right) =>
      right.effectiveDate.localeCompare(left.effectiveDate),
    );

  const currentIndex = observations.findIndex(
    (observation) => observation.effectiveDate === indicator.effectiveDate,
  );
  const current = currentIndex >= 0 ? observations[currentIndex] : observations[0];
  const previous = observations.find(
    (observation, index) =>
      index > currentIndex &&
      current &&
      observation.effectiveDate < current.effectiveDate,
  );

  if (!current || !previous || previous.value === 0) return indicator;

  const rawChange = (current.value / previous.value - 1) * 100;
  const changePercent = Math.round(rawChange * 100) / 100;
  const trend =
    Math.abs(changePercent) < 0.01 ? "flat" : changePercent > 0 ? "up" : "down";

  return {
    ...indicator,
    previousValue: previous.value,
    previousEffectiveDate: previous.effectiveDate,
    changePercent,
    trend,
  };
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const enrichedIndicators = [];

for (const indicator of snapshot.indicators ?? []) {
  try {
    enrichedIndicators.push(await enrichIndicator(indicator));
  } catch (error) {
    console.warn(`Tendencia ${indicator.label}: ${error.message}`);
    enrichedIndicators.push(indicator);
  }
}

const enrichedSnapshot = {
  ...snapshot,
  indicators: enrichedIndicators,
};
const serialized = `${JSON.stringify(enrichedSnapshot, null, 2)}\n`;

await Promise.all([
  writeFile(snapshotPath, serialized),
  writeFile(publicSnapshotPath, serialized),
]);

console.log("Tendencias económicas calculadas para dólar, euro y cobre.");
