import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const sourcePath = new URL("src/data/market-pulse.json", root);
const publicPath = new URL("public/data/market-pulse.json", root);

const MAX_AGE_HOURS = new Map([
  ["sp500", 96],
  ["nasdaq", 96],
  ["dow", 96],
  ["stoxx50", 96],
  ["ipsa", 96],
  ["ust10y", 96],
  ["brent", 96],
  ["gold", 96],
  ["eurusd", 120],
  ["usdjpy", 120],
  ["bitcoin", 48],
]);

function ageHours(effectiveAt, now) {
  const timestamp = Date.parse(effectiveAt ?? "");
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - timestamp) / 3_600_000);
}

const snapshot = JSON.parse(await readFile(sourcePath, "utf8"));
const now = new Date();
const staleIds = [];

const assets = (snapshot.assets ?? []).map((asset) => {
  const maxAgeHours = MAX_AGE_HOURS.get(asset.id);
  if (!maxAgeHours) return asset;

  const age = ageHours(asset.effectiveAt, now);
  if (age <= maxAgeHours) return asset;

  staleIds.push(asset.id);
  return {
    ...asset,
    status: "stale",
    displayEligible: false,
    staleReason: `dato con ${Math.round(age)} horas de antigüedad; máximo ${maxAgeHours}`,
  };
});

const diagnostics = [...(snapshot.diagnostics ?? [])];
for (const id of staleIds) {
  const asset = assets.find((candidate) => candidate.id === id);
  diagnostics.push({
    id: `${id}-freshness`,
    ok: false,
    error: asset?.staleReason ?? "dato desactualizado",
  });
}

const guardedSnapshot = {
  ...snapshot,
  status: staleIds.length > 0 ? "partial" : snapshot.status,
  freshnessCheckedAt: now.toISOString(),
  assets,
  diagnostics,
};

const serialized = `${JSON.stringify(guardedSnapshot, null, 2)}\n`;
await Promise.all([
  writeFile(sourcePath, serialized),
  writeFile(publicPath, serialized),
]);

if (staleIds.length > 0) {
  console.warn(
    `Pulso de mercado: ${staleIds.length} activo(s) fuera de vigencia: ${staleIds.join(", ")}.`,
  );
} else {
  console.log("Pulso de mercado: control de vigencia OK.");
}
