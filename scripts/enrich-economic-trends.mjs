import { readFile, writeFile } from "node:fs/promises";
import { serializeCanonicalJson } from "./lib/serialize-canonical-json.mjs";
import { computeEconomicVariation } from "./lib/economic-variation.mjs";

const root = new URL("../", import.meta.url);
const snapshotPath = new URL("src/data/economic-indicators.json", root);
const publicSnapshotPath = new URL(
  "public/data/economic-indicators.json",
  root,
);
const providerBaseUrl =
  process.env.ATLAS_INDICATORS_API_BASE ?? "https://mindicador.cl/api";

const trendDefinitions = new Map([
  ["uf", "uf"],
  ["dolar", "dolar"],
  ["euro", "euro"],
  ["utm", "utm"],
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
  if (!providerCode || Number.isFinite(indicator.changePercent)) {
    return indicator;
  }

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
    .filter(
      (observation) => observation.effectiveDate <= indicator.effectiveDate,
    )
    .sort((left, right) =>
      right.effectiveDate.localeCompare(left.effectiveDate),
    );

  const currentIndex = observations.findIndex(
    (observation) => observation.effectiveDate === indicator.effectiveDate,
  );
  if (currentIndex < 0) return indicator;
  const current = observations[currentIndex];
  if (current.value !== indicator.value) return indicator;
  const previous = observations.find(
    (observation, index) =>
      index > currentIndex && observation.effectiveDate < current.effectiveDate,
  );

  if (!current || !previous || previous.value === 0) return indicator;

  const variation = computeEconomicVariation(current.value, previous.value);
  if (!variation) return indicator;

  return {
    ...indicator,
    previousValue: previous.value,
    previousEffectiveDate: previous.effectiveDate,
    ...variation,
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
const serialized = await serializeCanonicalJson(enrichedSnapshot);

await Promise.all([
  writeFile(snapshotPath, serialized),
  writeFile(publicSnapshotPath, serialized),
]);

console.log("Tendencias verificadas para UF, dólar, euro, UTM y cobre.");
