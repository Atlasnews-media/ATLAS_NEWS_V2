import { readFile, writeFile } from "node:fs/promises";

import { serializeCanonicalJson } from "./lib/serialize-canonical-json.mjs";

const root = new URL("../", import.meta.url);
const sourcePath = new URL("src/data/market-pulse.json", root);
const publicPath = new URL("public/data/market-pulse.json", root);
const TIME_ZONE = "America/Santiago";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const POLICIES = new Map([
  ["sp500", { kind: "market", currentMinutes: 45, hardMaxHours: 96 }],
  ["nasdaq", { kind: "market", currentMinutes: 45, hardMaxHours: 96 }],
  ["dow", { kind: "market", currentMinutes: 45, hardMaxHours: 96 }],
  ["stoxx50", { kind: "market", currentMinutes: 45, hardMaxHours: 96 }],
  ["ipsa", { kind: "market", currentMinutes: 45, hardMaxHours: 96 }],
  ["ust10y", { kind: "market", currentMinutes: 45, hardMaxHours: 96 }],
  ["brent", { kind: "market", currentMinutes: 45, hardMaxHours: 96 }],
  ["gold", { kind: "market", currentMinutes: 45, hardMaxHours: 96 }],
  ["eurusd", { kind: "fx", currentMinutes: 60, hardMaxHours: 120 }],
  ["usdjpy", { kind: "fx", currentMinutes: 60, hardMaxHours: 120 }],
  ["bitcoin", { kind: "crypto", currentMinutes: 45, hardMaxHours: 48 }],
  ["usdclp", { kind: "official", hardMaxDays: 7 }],
  ["eurclp", { kind: "official", hardMaxDays: 7 }],
  ["uf", { kind: "official", hardMaxDays: 3 }],
  ["copper", { kind: "official", hardMaxDays: 7 }],
  ["tpm", { kind: "official", hardMaxDays: 45 }],
]);

function ageHours(effectiveAt, now) {
  const timestamp = Date.parse(effectiveAt ?? "");
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - timestamp) / HOUR_MS);
}

function ageDays(effectiveAt, now) {
  return ageHours(effectiveAt, now) / 24;
}

function localClock(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    weekday: map.weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function isOperationalWindow(now) {
  const { weekday, hour } = localClock(now);
  const weekdayOpen = !["Sat", "Sun"].includes(weekday);
  return weekdayOpen && hour >= 8 && hour < 20;
}

function freshnessFor(asset, now) {
  const policy = POLICIES.get(asset.id);
  if (!policy) {
    return {
      ...asset,
      displayEligible: asset.displayEligible !== false,
      freshnessState: "unmanaged",
    };
  }

  const hours = ageHours(asset.effectiveAt, now);
  if (!Number.isFinite(hours)) {
    return {
      ...asset,
      status: "stale",
      displayEligible: false,
      freshnessState: "stale",
      staleReason: "dato sin fecha efectiva válida",
    };
  }

  if (policy.kind === "official") {
    const days = ageDays(asset.effectiveAt, now);
    if (days > policy.hardMaxDays) {
      return {
        ...asset,
        status: "stale",
        displayEligible: false,
        freshnessState: "stale",
        staleReason: `dato oficial con ${Math.round(days)} días de antigüedad; máximo ${policy.hardMaxDays}`,
      };
    }

    return {
      ...asset,
      displayEligible: true,
      freshnessState: "official",
      staleReason: undefined,
    };
  }

  const activeWindow = policy.kind === "crypto" || isOperationalWindow(now);
  if (!activeWindow) {
    return {
      ...asset,
      displayEligible: true,
      freshnessState: "closed",
      staleReason: undefined,
    };
  }

  if (hours <= policy.currentMinutes / 60) {
    return {
      ...asset,
      status: asset.status === "fallback" ? "fallback" : "current",
      displayEligible: true,
      freshnessState: "current",
      staleReason: undefined,
    };
  }

  if (hours <= policy.hardMaxHours) {
    return {
      ...asset,
      status: asset.status === "fallback" ? "fallback" : "delayed",
      displayEligible: true,
      freshnessState: "delayed",
      freshnessNote: `último dato disponible; ${Math.round(hours * 60)} min desde su marca efectiva`,
      staleReason: undefined,
    };
  }

  return {
    ...asset,
    status: "stale",
    displayEligible: false,
    freshnessState: "stale",
    staleReason: `dato con ${Math.round(hours)} horas de antigüedad; máximo ${policy.hardMaxHours}`,
  };
}

const snapshot = JSON.parse(await readFile(sourcePath, "utf8"));
const now = new Date();
const assets = (snapshot.assets ?? []).map((asset) => freshnessFor(asset, now));
const staleAssets = assets.filter((asset) => asset.freshnessState === "stale");
const delayedAssets = assets.filter(
  (asset) => asset.freshnessState === "delayed",
);
const diagnostics = [...(snapshot.diagnostics ?? [])];

for (const asset of staleAssets) {
  diagnostics.push({
    id: `${asset.id}-freshness`,
    ok: false,
    error: asset.staleReason ?? "dato desactualizado",
  });
}

for (const asset of delayedAssets) {
  diagnostics.push({
    id: `${asset.id}-freshness`,
    ok: true,
    delayed: true,
    warning: asset.freshnessNote,
  });
}

const guardedSnapshot = {
  ...snapshot,
  status:
    staleAssets.length > 0 || delayedAssets.length > 0
      ? "partial"
      : snapshot.status,
  freshnessCheckedAt: now.toISOString(),
  freshnessPolicy: "intraday-v2",
  assets,
  diagnostics,
};

const serialized = await serializeCanonicalJson(guardedSnapshot);
await Promise.all([
  writeFile(sourcePath, serialized),
  writeFile(publicPath, serialized),
]);

if (staleAssets.length > 0) {
  console.warn(
    `Pulso de mercado: ${staleAssets.length} activo(s) excluido(s) por vigencia: ${staleAssets.map(({ id }) => id).join(", ")}.`,
  );
}
if (delayedAssets.length > 0) {
  console.warn(
    `Pulso de mercado: ${delayedAssets.length} activo(s) usando último dato disponible: ${delayedAssets.map(({ id }) => id).join(", ")}.`,
  );
}
if (staleAssets.length === 0 && delayedAssets.length === 0) {
  console.log("Pulso de mercado: control de vigencia intradía OK.");
}
