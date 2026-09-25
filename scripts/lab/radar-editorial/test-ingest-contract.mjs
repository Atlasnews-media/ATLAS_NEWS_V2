import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  REQUIRED_ARTIFACTS,
  validateBaselineRequest,
} from "./validate-baseline-request.mjs";
import { materializeRequest } from "./materialize-baseline-request.mjs";

const runId = "RADAR-BASELINE-INGEST-TEST-001";
const sourceMainCommit = "0123456789abcdef0123456789abcdef01234567";
const identity = {
  radarRunId: runId,
  sourceMainCommit,
  radarStateVersion: "radar-state-v1",
  editorialDate: "2026-09-24",
  experimentMode: "BASELINE",
  mode: "LAB_ONLY",
  productionWritesAllowed: false,
};
const artifacts = {};
for (const key of REQUIRED_ARTIFACTS) {
  artifacts[key] =
    key.endsWith(".md") || key.endsWith(".html") ? "fixture " + key : {};
}
artifacts["run.json"] = {
  schemaVersion: 1,
  ...identity,
  startedAt: "2026-09-24T09:00:00-03:00",
  completedAt: "2026-09-24T09:05:00-03:00",
  phases: { general: "PASS", national: "PASS", markets: "PASS" },
};
for (const section of ["general", "national", "markets"]) {
  artifacts["checkpoints/" + section + ".json"] = {
    schemaVersion: 1,
    ...identity,
    phase: section,
    status: "PASS",
    completedAt:
      "2026-09-24T09:0" +
      (section === "general" ? "1" : section === "national" ? "2" : "3") +
      ":00-03:00",
  };
}

const request = {
  schemaVersion: 1,
  ...identity,
  createdAt: "2026-09-24T09:05:00-03:00",
  producer: "CHATGPT_TASK",
  artifacts,
};
validateBaselineRequest(request);
console.log("INGEST REQUEST VALID: PASS");

let forbiddenRejected = false;
try {
  validateBaselineRequest({
    ...request,
    artifacts: {
      ...artifacts,
      "result.json": { sourceCommit: sourceMainCommit },
    },
  });
} catch {
  forbiddenRejected = true;
}
if (!forbiddenRejected) {
  throw new Error("campo productivo no fue rechazado");
}
console.log("INGEST PRODUCT FIELD FORBIDDEN: PASS");

let scopeRejected = false;
try {
  validateBaselineRequest({
    ...request,
    artifacts: { ...artifacts, "../status.json": {} },
  });
} catch {
  scopeRejected = true;
}
if (!scopeRejected) {
  throw new Error("artifact fuera de contrato no fue rechazado");
}
console.log("INGEST ARTIFACT SCOPE: PASS");

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "radar-ingest-"));
const requestFile = path.join(temp, "request.json");
await fs.writeFile(requestFile, JSON.stringify(request, null, 2) + "\n");
await materializeRequest(requestFile, temp, "general");
const active = JSON.parse(
  await fs.readFile(
    path.join(temp, "lab/radar-editorial/runtime/active.json"),
    "utf8",
  ),
);
if (active.status !== "GENERAL_PASS") {
  throw new Error("materializador no dejó GENERAL_PASS");
}
if (
  await fs
    .stat(
      path.join(
        temp,
        "lab/radar-editorial/runtime/runs",
        runId,
        "general/output.md",
      ),
    )
    .then(
      () => false,
      () => true,
    )
) {
  throw new Error("materializador no creó General");
}
console.log("INGEST GENERAL MATERIALIZATION: PASS");


const jevIdentity = {
  ...identity,
  radarRunId: "RADAR-JEV-INGEST-TEST-001",
  experimentMode: "RADAR_JEV",
};
const jevArtifacts = {
  ...artifacts,
  "run.json": {
    schemaVersion: 1,
    ...jevIdentity,
    startedAt: "2026-09-24T09:00:00-03:00",
    completedAt: "2026-09-24T09:05:00-03:00",
    phases: { general: "PASS", national: "PASS", markets: "PASS" },
    memoryMode: "RADAR_PLUS_CORPUS",
    radarInterventionUsed: true,
    jevUsed: true,
    corpusUsed: true,
    frameworkRead: [
      "AGENTS.md",
      "docs/PROCEDIMIENTO_GPT_PUBLICACION.md",
      "docs/CONTRATO_EDITORIAL.md",
      "data/editorial_state.json",
    ],
  },
  "radar-context.json": {
    schemaVersion: 1,
    ...jevIdentity,
    signals: [{ id: "signal-1" }],
  },
  "corpus-retrieval.json": {
    schemaVersion: 1,
    ...jevIdentity,
    candidateRetrievals: [{ candidateKey: "candidate-1", priors: [] }],
  },
  "jev-judgments.json": {
    schemaVersion: 1,
    ...jevIdentity,
    engine: "JEV_TYPESAFE",
    thresholdsApplied: false,
    judgments: [{ candidateKey: "candidate-1" }],
  },
};
const jevRequest = {
  schemaVersion: 1,
  ...jevIdentity,
  createdAt: "2026-09-24T09:05:00-03:00",
  producer: "CHATGPT_TASK",
  artifacts: jevArtifacts,
};
validateBaselineRequest(jevRequest);
console.log("INGEST RADAR_JEV REQUEST VALID: PASS");

let jevEvidenceRequired = false;
try {
  const missingEvidence = { ...jevArtifacts };
  delete missingEvidence["jev-judgments.json"];
  validateBaselineRequest({ ...jevRequest, artifacts: missingEvidence });
} catch {
  jevEvidenceRequired = true;
}
if (!jevEvidenceRequired) {
  throw new Error("RADAR_JEV aceptó request sin jev-judgments");
}
console.log("INGEST RADAR_JEV EVIDENCE REQUIRED: PASS");

const jevTemp = await fs.mkdtemp(path.join(os.tmpdir(), "radar-jev-ingest-"));
const jevRequestFile = path.join(jevTemp, "request.json");
await fs.writeFile(
  jevRequestFile,
  JSON.stringify(jevRequest, null, 2) + "\n",
);
await materializeRequest(jevRequestFile, jevTemp, "general");
const jevActive = JSON.parse(
  await fs.readFile(
    path.join(jevTemp, "lab/radar-editorial/runtime/active.json"),
    "utf8",
  ),
);
if (
  jevActive.status !== "GENERAL_PASS" ||
  jevActive.experimentMode !== "RADAR_JEV"
) {
  throw new Error("materializador no preservó identidad RADAR_JEV");
}
for (const evidence of [
  "radar-context.json",
  "corpus-retrieval.json",
  "jev-judgments.json",
]) {
  await fs.stat(
    path.join(
      jevTemp,
      "lab/radar-editorial/runtime/runs",
      jevIdentity.radarRunId,
      evidence,
    ),
  );
}
console.log("INGEST RADAR_JEV MATERIALIZATION: PASS");
