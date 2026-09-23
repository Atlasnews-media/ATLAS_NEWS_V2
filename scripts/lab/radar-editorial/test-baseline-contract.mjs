import { validateRadarArtifact } from "./validate-radar-artifact.mjs";
import { assertRuntimeScope } from "./assert-runtime-scope.mjs";

const valid = {
  schemaVersion: 2,
  radarRunId: "RADAR-BASELINE-TEST-001",
  sourceMainCommit: "0123456789abcdef0123456789abcdef01234567",
  radarStateVersion: "radar-state-v1",
  editorialDate: "2026-09-23",
  mode: "LAB_ONLY",
  experimentMode: "BASELINE",
  status: "READY",
  productionWritesAllowed: false,
  runPath: "lab/radar-editorial/runtime/runs/RADAR-BASELINE-TEST-001",
  resultPath:
    "lab/radar-editorial/runtime/runs/RADAR-BASELINE-TEST-001/result.json",
  publishRequestPath:
    "lab/radar-editorial/runtime/runs/RADAR-BASELINE-TEST-001/publish-request.json",
  viewPath:
    "lab/radar-editorial/runtime/runs/RADAR-BASELINE-TEST-001/index.html",
  message: "ATLAS NEWS LAB baseline READY",
};

validateRadarArtifact(valid);
console.log("BASELINE CONTRACT VALID: PASS");

let productionFieldRejected = false;
try {
  validateRadarArtifact({ ...valid, sourceCommit: valid.sourceMainCommit });
} catch {
  productionFieldRejected = true;
}
if (!productionFieldRejected)
  throw new Error("sourceCommit productivo no fue rechazado");
console.log("BASELINE SOURCECOMMIT FORBIDDEN: PASS");

assertRuntimeScope([
  "lab/radar-editorial/runtime/active.json",
  "lab/radar-editorial/runtime/runs/RADAR-BASELINE-TEST-001/general/output.md",
]);
console.log("BASELINE RUNTIME SCOPE: PASS");
