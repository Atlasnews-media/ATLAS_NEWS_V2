import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const FIXTURE_KEYS = [
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

const BASELINE_KEYS = [
  "schemaVersion",
  "radarRunId",
  "sourceMainCommit",
  "radarStateVersion",
  "editorialDate",
  "mode",
  "experimentMode",
  "status",
  "productionWritesAllowed",
  "runPath",
  "resultPath",
  "publishRequestPath",
  "viewPath",
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

function assertCommon(data) {
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
}

function assertExactKeys(data, expected) {
  const actualKeys = Object.keys(data).sort();
  const expectedKeys = [...expected].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    fail(`claves inválidas: ${actualKeys.join(", ")}`);
  }
}

export function validateRadarArtifact(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    fail("artefacto RADAR debe ser un objeto JSON");
  }

  if (["BASELINE", "RADAR_JEV"].includes(data.experimentMode)) {
    assertExactKeys(data, BASELINE_KEYS);
    if (data.schemaVersion !== 2) fail("runtime schemaVersion debe ser 2");
    assertCommon(data);
    const expectedRunPath = `lab/radar-editorial/runtime/runs/${data.radarRunId}`;
    if (data.runPath !== expectedRunPath) fail("runPath runtime inválido");
    if (data.resultPath !== `${expectedRunPath}/result.json`) {
      fail("resultPath runtime inválido");
    }
    if (data.publishRequestPath !== `${expectedRunPath}/publish-request.json`) {
      fail("publishRequestPath runtime inválido");
    }
    if (data.viewPath !== `${expectedRunPath}/index.html`) {
      fail("viewPath runtime inválido");
    }
    const expectedMessage =
      data.experimentMode === "BASELINE"
        ? "ATLAS NEWS LAB baseline READY"
        : "ATLAS NEWS LAB radar+jev READY";
    if (data.message !== expectedMessage) {
      fail("message runtime inválido");
    }
  } else {
    assertExactKeys(data, FIXTURE_KEYS);
    if (data.schemaVersion !== 1) fail("fixture schemaVersion debe ser 1");
    assertCommon(data);
    if (data.message !== "RADAR isolation fixture") {
      fail("message no corresponde al fixture de aislamiento");
    }
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
    `RADAR CONTRACT PASS — ${data.radarRunId} · ${data.editorialDate} · ${data.experimentMode ?? "ISOLATION"}`,
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
