import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

async function main() {
  const file = process.argv[2] ?? "lab/radar-editorial/state/radar-state.json";
  const raw = await fs.readFile(file, "utf8");
  const data = JSON.parse(raw);
  const canonical = `${JSON.stringify(data, null, 2)}\n`;
  if (raw !== canonical)
    throw new Error("radar-state no está en formato canónico");
  if (data?._radar?.schemaVersion !== 1)
    throw new Error("schemaVersion inválida");
  if (data?._radar?.mode !== "LAB_ONLY")
    throw new Error("state debe ser LAB_ONLY");
  if (data?._radar?.productionWritesAllowed !== false)
    throw new Error("state permite producción");
  if (data?._radar?.syncBackToProductionAllowed !== false)
    throw new Error("sync inversa debe estar prohibida");
  if (!/^radar-state-v[1-9][0-9]*$/.test(data?._radar?.radarStateVersion ?? ""))
    throw new Error("radarStateVersion inválida");
  if (!/^[0-9a-f]{40}$/.test(data?._radar?.sourceMainCommit ?? ""))
    throw new Error("sourceMainCommit inválido");
  if (data?._radar?.origin !== "data/editorial_state.json")
    throw new Error("origen inválido");
  if (!Array.isArray(data?.threads)) throw new Error("threads debe ser lista");
  console.log(
    `RADAR STATE PASS — ${data._radar.radarStateVersion} · ${data.threads.length} thread(s)`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`RADAR STATE FAIL: ${error.message}`);
    process.exit(1);
  });
}
