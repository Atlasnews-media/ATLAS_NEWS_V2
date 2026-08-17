import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createBuscaFondosClient } from "./buscafondos-client.mjs";
import { cleanupFundsRuntime, loadFundsRuntime } from "./load-runtime.mjs";
import { buildFundsSnapshot } from "./snapshot.mjs";

function parseOutputPath(argv) {
  const outputIndex = argv.indexOf("--output");
  if (outputIndex === -1) {
    return resolve(".artifacts/funds/funds-beagf.json");
  }

  const value = argv[outputIndex + 1];
  if (!value) {
    throw new Error("--output requiere una ruta de destino.");
  }
  return resolve(value);
}

function writeSnapshotAtomic(outputPath, snapshot) {
  const directory = dirname(outputPath);
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  mkdirSync(directory, { recursive: true });

  try {
    writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    renameSync(tempPath, outputPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

async function main() {
  const outputPath = parseOutputPath(process.argv.slice(2));
  const runtime = loadFundsRuntime();
  const {
    BEAGF_FUNDS,
    BUSCAFONDOS_BASE_URL,
    EXPECTED_FUND_COUNT,
  } = runtime.config;
  const client = createBuscaFondosClient({ baseUrl: BUSCAFONDOS_BASE_URL });

  const snapshot = await buildFundsSnapshot({
    client,
    configs: BEAGF_FUNDS,
    finance: runtime.finance,
    expectedCount: EXPECTED_FUND_COUNT,
    baseUrl: BUSCAFONDOS_BASE_URL,
  });

  writeSnapshotAtomic(outputPath, snapshot);
  console.log(
    `Snapshot Fondos generado: ${snapshot.funds.length} fondos · datos al ${snapshot.asOf}.`,
  );
  console.log(`Salida: ${outputPath}`);
}

try {
  await main();
} catch (error) {
  console.error(
    `La actualización de Fondos falló: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  cleanupFundsRuntime();
}
