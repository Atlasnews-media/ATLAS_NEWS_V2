import { mkdir, readFile, writeFile } from "node:fs/promises";
import { serializeCanonicalJson } from "./lib/serialize-canonical-json.mjs";

const root = new URL("../", import.meta.url);
const sourcePath = new URL("src/data/market-pulse.json", root);
const publicDirectory = new URL("public/data/", root);
const publicPath = new URL("public/data/market-pulse.json", root);
const publishedSnapshotUrl =
  process.env.ATLAS_PUBLIC_MARKET_SNAPSHOT_URL ??
  "https://atlasnews-media.github.io/data/market-pulse.json";

const expectedAssetIds = new Set([
  "usdclp",
  "eurclp",
  "tpm",
  "uf",
  "copper",
  "sp500",
  "nasdaq",
  "dow",
  "stoxx50",
  "ipsa",
  "ust10y",
  "brent",
  "gold",
  "eurusd",
  "usdjpy",
  "bitcoin",
]);

function usable(asset) {
  return Boolean(
    asset &&
    typeof asset.id === "string" &&
    Number.isFinite(asset.value) &&
    typeof asset.unit === "string" &&
    typeof asset.effectiveAt === "string" &&
    Number.isFinite(Date.parse(asset.effectiveAt)),
  );
}

async function fetchPublishedSnapshot() {
  const separator = publishedSnapshotUrl.includes("?") ? "&" : "?";
  const response = await fetch(
    `${publishedSnapshotUrl}${separator}recovery=${Date.now()}`,
    {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "ATLAS-NEWS/1.0",
      },
      signal: AbortSignal.timeout(12_000),
    },
  );

  if (!response.ok) {
    throw new Error(`snapshot público respondió ${response.status}`);
  }

  return response.json();
}

const current = JSON.parse(await readFile(sourcePath, "utf8"));
const currentById = new Map(
  (current.assets ?? []).filter(usable).map((asset) => [asset.id, asset]),
);

const missingIds = [...expectedAssetIds].filter((id) => !currentById.has(id));
if (missingIds.length === 0) {
  console.log("Pulso de mercado: no requiere recuperación desde producción.");
  process.exit(0);
}

let published;
try {
  published = await fetchPublishedSnapshot();
} catch (error) {
  console.warn(
    `Pulso de mercado: no fue posible recuperar producción (${error.message}).`,
  );
  process.exit(0);
}

const publishedById = new Map(
  (published.assets ?? []).filter(usable).map((asset) => [asset.id, asset]),
);
const recovered = [];

for (const id of missingIds) {
  const previous = publishedById.get(id);
  if (!previous) continue;

  currentById.set(id, {
    ...previous,
    status: "fallback",
    displayEligible: true,
    recoverySource: "published-market-snapshot",
    recoveredAt: new Date().toISOString(),
  });
  recovered.push(id);
}

if (recovered.length === 0) {
  console.warn(
    `Pulso de mercado: faltan ${missingIds.length} activo(s) y producción no tenía respaldo utilizable.`,
  );
  process.exit(0);
}

const diagnostics = [...(current.diagnostics ?? [])];
for (const id of recovered) {
  diagnostics.push({
    id: `${id}-recovery`,
    ok: true,
    recovered: true,
    source: "published-market-snapshot",
  });
}

const next = {
  ...current,
  status: "partial",
  assets: Array.from(currentById.values()),
  diagnostics,
  recoveredAssets: recovered,
  recoverySourceGeneratedAt: published.generatedAt ?? null,
};

const serialized = await serializeCanonicalJson(next);
await mkdir(publicDirectory, { recursive: true });
await Promise.all([
  writeFile(sourcePath, serialized),
  writeFile(publicPath, serialized),
]);

console.warn(
  `Pulso de mercado: recuperados desde producción ${recovered.length} activo(s): ${recovered.join(", ")}.`,
);
