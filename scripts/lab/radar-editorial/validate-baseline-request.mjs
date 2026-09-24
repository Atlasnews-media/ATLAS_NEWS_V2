import fs from "node:fs/promises";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

export const REQUIRED_ARTIFACTS = [
  "run.json",
  "search-log.json",
  "candidates.json",
  "general/input.json",
  "general/metadata.json",
  "general/output.md",
  "checkpoints/general.json",
  "national/input.json",
  "national/metadata.json",
  "national/output.md",
  "checkpoints/national.json",
  "markets/input.json",
  "markets/metadata.json",
  "markets/output.md",
  "checkpoints/markets.json",
  "result.json",
  "publish-request.json",
  "index.html",
];

const REQUEST_KEYS = [
  "schemaVersion",
  "radarRunId",
  "sourceMainCommit",
  "radarStateVersion",
  "editorialDate",
  "experimentMode",
  "mode",
  "productionWritesAllowed",
  "createdAt",
  "producer",
  "artifacts",
];

const FORBIDDEN_KEYS = new Set([
  "sourceCommit",
  "latestDaily",
  "latestNational",
  "latestMarkets",
  "morningPackage",
  "publications",
  "audio",
  "instagram",
]);

function fail(message) {
  throw new Error(message);
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(label + " claves inválidas: " + actual.join(", "));
  }
}

function assertIso(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    fail(label + " debe ser timestamp ISO válido");
  }
}

function walkForbidden(value, where) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkForbidden(item, where + "[" + index + "]"),
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      fail("campo productivo prohibido: " + where + "." + key);
    }
    walkForbidden(child, where + "." + key);
  }
}

function assertIdentity(value, request, label) {
  for (const key of [
    "radarRunId",
    "sourceMainCommit",
    "radarStateVersion",
    "editorialDate",
    "experimentMode",
    "mode",
    "productionWritesAllowed",
  ]) {
    if (value[key] !== request[key]) {
      fail(label + "." + key + " no coincide con request");
    }
  }
}

export function validateBaselineRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    fail("request debe ser objeto");
  }
  assertExactKeys(request, REQUEST_KEYS, "request");
  if (request.schemaVersion !== 1) fail("request.schemaVersion debe ser 1");
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(request.radarRunId || "")) {
    fail("radarRunId inválido");
  }
  if (!/^[0-9a-f]{40}$/.test(request.sourceMainCommit || "")) {
    fail("sourceMainCommit debe ser SHA completo");
  }
  if (!/^radar-state-v[1-9][0-9]*$/.test(request.radarStateVersion || "")) {
    fail("radarStateVersion inválida");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.editorialDate || "")) {
    fail("editorialDate inválida");
  }
  if (request.experimentMode !== "BASELINE") {
    fail("V1 sólo acepta experimentMode BASELINE");
  }
  if (request.mode !== "LAB_ONLY") fail("mode debe ser LAB_ONLY");
  if (request.productionWritesAllowed !== false) {
    fail("productionWritesAllowed debe ser false");
  }
  if (request.producer !== "CHATGPT_TASK") {
    fail("producer debe ser CHATGPT_TASK");
  }
  assertIso(request.createdAt, "createdAt");
  if (
    !request.artifacts ||
    typeof request.artifacts !== "object" ||
    Array.isArray(request.artifacts)
  ) {
    fail("artifacts debe ser objeto");
  }
  assertExactKeys(request.artifacts, REQUIRED_ARTIFACTS, "artifacts");
  for (const key of REQUIRED_ARTIFACTS) {
    const value = request.artifacts[key];
    if (key.endsWith(".md") || key.endsWith(".html")) {
      if (typeof value !== "string" || !value.trim()) {
        fail("artifact textual inválido: " + key);
      }
    } else if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail("artifact JSON inválido: " + key);
    }
  }
  assertIdentity(request.artifacts["run.json"], request, "run.json");
  walkForbidden(request.artifacts, "artifacts");
  return request;
}

export async function readAndValidateBaselineRequest(file) {
  const raw = await fs.readFile(file, "utf8");
  let request;
  try {
    request = JSON.parse(raw);
  } catch (error) {
    fail("request JSON inválido: " + error.message);
  }
  const canonical = JSON.stringify(request, null, 2) + "\n";
  if (raw !== canonical) fail("request JSON no canónico");
  validateBaselineRequest(request);
  const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
  return { request, sha256 };
}

async function main() {
  const file = process.argv[2];
  if (!file) fail("uso: validate-baseline-request.mjs FILE");
  const { request, sha256 } = await readAndValidateBaselineRequest(file);
  console.log(
    "RADAR REQUEST PASS — " + request.radarRunId + " · sha256=" + sha256,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error("RADAR REQUEST FAIL: " + error.message);
    process.exit(1);
  });
}
