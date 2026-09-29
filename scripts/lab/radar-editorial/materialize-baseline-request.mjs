import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  readAndValidateBaselineRequest,
  RADAR_JEV_EVIDENCE_ARTIFACTS,
  requiredArtifactsForMode,
} from "./validate-baseline-request.mjs";

function fail(message) {
  throw new Error(message);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function jsonText(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

async function writeImmutable(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (await exists(file)) {
    const current = await fs.readFile(file, "utf8");
    if (current !== content) fail("idempotency conflict: " + file);
    return;
  }
  await fs.writeFile(file, content);
}

async function writeMutable(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

function phaseRun(finalRun, phase) {
  if (phase === "ready") return structuredClone(finalRun);
  const run = structuredClone(finalRun);
  run.completedAt = null;
  run.phases = {
    general: "PASS",
    national: ["national", "markets"].includes(phase) ? "PASS" : "PENDING",
    markets: phase === "markets" ? "PASS" : "PENDING",
  };
  return run;
}

function activeFor(request, runPath, phase) {
  const statusMap = {
    general: "GENERAL_PASS",
    national: "NATIONAL_PASS",
    markets: "MARKETS_PASS",
    ready: "READY",
  };
  const checkpointKey =
    phase === "ready"
      ? "checkpoints/markets.json"
      : "checkpoints/" + phase + ".json";
  const checkpoint = request.artifacts[checkpointKey];
  const finalRun = request.artifacts["run.json"];
  const updatedAt =
    phase === "ready" ? finalRun.completedAt : checkpoint.completedAt;
  if (typeof updatedAt !== "string") {
    fail("timestamp de active no disponible para " + phase);
  }
  return {
    schemaVersion: 1,
    radarRunId: request.radarRunId,
    sourceMainCommit: request.sourceMainCommit,
    radarStateVersion: request.radarStateVersion,
    editorialDate: request.editorialDate,
    mode: "LAB_ONLY",
    experimentMode: request.experimentMode,
    status: statusMap[phase],
    productionWritesAllowed: false,
    runPath,
    updatedAt,
  };
}

function latestFor(request, runPath) {
  return {
    schemaVersion: 2,
    radarRunId: request.radarRunId,
    sourceMainCommit: request.sourceMainCommit,
    radarStateVersion: request.radarStateVersion,
    editorialDate: request.editorialDate,
    mode: "LAB_ONLY",
    experimentMode: request.experimentMode,
    status: "READY",
    productionWritesAllowed: false,
    runPath,
    resultPath: runPath + "/result.json",
    publishRequestPath: runPath + "/publish-request.json",
    viewPath: runPath + "/index.html",
    message:
      request.experimentMode === "RADAR_JEV"
        ? "ATLAS NEWS LAB radar+jev READY"
        : "ATLAS NEWS LAB baseline READY",
  };
}

function artifactSet(request, phase) {
  const general = [
    "search-log.json",
    "candidates.json",
    "general/input.json",
    "general/metadata.json",
    "general/output.md",
    "checkpoints/general.json",
  ];
  const national = [
    "national/input.json",
    "national/metadata.json",
    "national/output.md",
    "checkpoints/national.json",
  ];
  const markets = [
    "markets/input.json",
    "markets/metadata.json",
    "markets/output.md",
    "checkpoints/markets.json",
  ];
  const experimental =
    request.experimentMode === "RADAR_JEV" ? RADAR_JEV_EVIDENCE_ARTIFACTS : [];
  if (phase === "general") return [...experimental, ...general];
  if (phase === "national") return national;
  if (phase === "markets") return markets;
  if (phase === "ready") {
    return requiredArtifactsForMode(request.experimentMode).filter(
      (key) => key !== "run.json",
    );
  }
  fail("phase inválida: " + phase);
}

export async function materializeRequest(requestFile, targetRoot, phase) {
  const { request } = await readAndValidateBaselineRequest(requestFile);
  const runPath = "lab/radar-editorial/runtime/runs/" + request.radarRunId;
  const runDir = path.join(targetRoot, runPath);
  await fs.mkdir(runDir, { recursive: true });

  for (const key of artifactSet(request, phase)) {
    const value = request.artifacts[key];
    const content =
      typeof value === "string"
        ? value.endsWith("\n")
          ? value
          : value + "\n"
        : jsonText(value);
    await writeImmutable(path.join(runDir, key), content);
  }

  await writeMutable(
    path.join(runDir, "run.json"),
    jsonText(phaseRun(request.artifacts["run.json"], phase)),
  );
  const runtimeRoot = path.join(targetRoot, "lab/radar-editorial/runtime");
  await writeMutable(
    path.join(runtimeRoot, "active.json"),
    jsonText(activeFor(request, runPath, phase)),
  );
  if (phase === "ready") {
    await writeMutable(
      path.join(runtimeRoot, "latest.json"),
      jsonText(latestFor(request, runPath)),
    );
  }
  return { request, runPath };
}

async function main() {
  const args = process.argv.slice(2);
  const requestIndex = args.indexOf("--request");
  const rootIndex = args.indexOf("--target-root");
  const phaseIndex = args.indexOf("--phase");
  if (requestIndex < 0 || rootIndex < 0 || phaseIndex < 0) {
    fail(
      "uso: materialize-baseline-request.mjs --request FILE --target-root DIR --phase general|national|markets|ready",
    );
  }
  const requestFile = args[requestIndex + 1];
  const targetRoot = args[rootIndex + 1];
  const phase = args[phaseIndex + 1];
  const { request } = await materializeRequest(requestFile, targetRoot, phase);
  console.log("RADAR MATERIALIZE PASS — " + request.radarRunId + " · " + phase);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error("RADAR MATERIALIZE FAIL: " + error.message);
    process.exit(1);
  });
}
