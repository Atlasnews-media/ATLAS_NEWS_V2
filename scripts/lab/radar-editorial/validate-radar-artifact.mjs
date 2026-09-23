import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const REQUIRED_KEYS = [
  "schemaVersion",
  "radarRunId",
  "sourceMainCommit",
  "radarStateVersion",
  "editorialDate",
  "mode",
  "status",
  "productionWritesAllowed",
  "message",
];

const FORBIDDEN_KEYS = new Set([
  "sourceCommit",
  "latestDaily",
  "latestNational",
  "latestMarkets",
  "morningPackage",
  "publishedAt",
  "publications",
  "audio",
  "instagram",
]);

function fail(message) {
  throw new Error(message);
}

function walkForbidden(value, path = "$") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForbidden(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      fail(`campo productivo prohibido: ${path}.${key}`);
    }
    walkForbidden(child, `${path}.${key}`);
  }
}

export function validateRadarArtifact(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    fail("artefacto RADAR debe ser un objeto JSON");
  }

  const actualKeys = Object.keys(data).sort();
  const expectedKeys = [...REQUIRED_KEYS].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    fail(`claves inválidas: ${actualKeys.join(", ")}`);
  }

  if (data.schemaVersion !== 1) fail("schemaVersion debe ser 1");
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(data.radarRunId ?? "")) {
    fail("radarRunId inválido");
  }
  if (!/^[0-9a-f]{40}$/.test(data.sourceMainCommit ?? "")) {
    fail("sourceMainCommit debe ser SHA completo");
  }
  if (!/^radar-state-v[1-9][0-9]*$/.test(data.radarStateVersion ?? "")) {
    fail("radarStateVersion inválida");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.editorialDate ?? "")) {
    fail("editorialDate debe ser YYYY-MM-DD");
  }
  if (data.mode !== "LAB_ONLY") fail("mode debe ser LAB_ONLY");
  if (data.status !== "READY") fail("status debe ser READY");
  if (data.productionWritesAllowed !== false) {
    fail("productionWritesAllowed debe ser false");
  }
  if (data.message !== "RADAR isolation fixture") {
    fail("message no corresponde al fixture de aislamiento");
  }

  walkForbidden(data);
  return data;
}

export async function readAndValidateRadarArtifact(file) {
  const raw = await fs.readFile(file, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    fail(`JSON inválido: ${error.message}`);
  }
  const canonical = `${JSON.stringify(data, null, 2)}\n`;
  if (raw !== canonical) fail("formato JSON no canónico");
  return validateRadarArtifact(data);
}

async function main() {
  const file = process.argv[2] ?? "lab/radar-editorial/runtime/latest.json";
  const data = await readAndValidateRadarArtifact(file);
  console.log(
    `RADAR CONTRACT PASS — ${data.radarRunId} · ${data.editorialDate}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`RADAR CONTRACT FAIL: ${error.message}`);
    process.exit(1);
  });
}
