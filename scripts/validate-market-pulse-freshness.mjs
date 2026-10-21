import { readFile, writeFile } from "node:fs/promises";
import { serializeCanonicalJson } from "./lib/serialize-canonical-json.mjs";
import { assessMarketAsset } from "../public/js/market-data-policy.mjs";

const root = new URL("../", import.meta.url);
const sourcePath = new URL("src/data/market-pulse.json", root);
const publicPath = new URL("public/data/market-pulse.json", root);

const snapshot = JSON.parse(await readFile(sourcePath, "utf8"));
const now = new Date();
const assets = (snapshot.assets ?? []).map((asset) =>
  assessMarketAsset(asset, now),
);
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
  freshnessPolicy: "market-sessions-v3",
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
    `Pulso de mercado: ${staleAssets.length} activo(s) excluido(s): ${staleAssets.map(({ id }) => id).join(", ")}.`,
  );
}
if (delayedAssets.length > 0) {
  console.warn(
    `Pulso de mercado: ${delayedAssets.length} activo(s) con último dato disponible: ${delayedAssets.map(({ id }) => id).join(", ")}.`,
  );
}
console.log("Pulso de mercado: control de vigencia por sesión completo.");
