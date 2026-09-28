import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readAndValidateRadarArtifact } from "./validate-radar-artifact.mjs";
import { assertRuntimeScope } from "./assert-runtime-scope.mjs";
import { assertRadarIdentity } from "./verify-radar-identity.mjs";

const fixture = "lab/radar-editorial/fixtures/isolation-fixture.json";

const valid = await readAndValidateRadarArtifact(fixture);
console.log("CASE A CONTRACT: PASS");

let scopeFailed = false;
try {
  assertRuntimeScope([
    "lab/radar-editorial/runtime/latest.json",
    "src/content/forbidden.md",
  ]);
} catch {
  scopeFailed = true;
}
if (!scopeFailed) throw new Error("CASE B no rechazó path prohibido");
console.log("CASE B FORBIDDEN PATH: PASS");

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "radar-identity-"));
const alteredFile = path.join(temp, "altered.json");
const altered = { ...valid, radarRunId: `${valid.radarRunId}-ALTERED` };
await fs.writeFile(alteredFile, `${JSON.stringify(altered, null, 2)}\n`);
const remote = await readAndValidateRadarArtifact(alteredFile);
let identityFailed = false;
try {
  assertRadarIdentity(valid, remote);
} catch {
  identityFailed = true;
}
if (!identityFailed) throw new Error("CASE C no rechazó identidad alterada");
console.log("CASE C IDENTITY MISMATCH: PASS");


const jevEngineWorkflow = await fs.readFile(
  ".github/workflows/lab-radar-editorial-jev-engine.yml",
  "utf8",
);
const jevIngressWorkflow = await fs.readFile(
  ".github/workflows/lab-radar-jev-resolver.yml",
  "utf8",
);

for (const required of [
  "workflow_call:",
  "request_path:",
  "request_ref:",
  "run-jev-memory-judge.mjs",
  "jev-request.json",
  "jev-judgments.json",
  "thresholdsApplied must remain false",
]) {
  if (!jevEngineWorkflow.includes(required)) {
    throw new Error(`CASE D durable JEV engine missing: ${required}`);
  }
}
if (jevEngineWorkflow.includes('test "$GITHUB_REF_NAME" = "radar-ingress/editorial"')) {
  throw new Error("CASE D durable JEV engine still depends on ingress branch");
}
if (!jevIngressWorkflow.includes("lab-radar-editorial-jev-engine.yml")) {
  throw new Error("CASE D ingress does not delegate to durable JEV engine");
}
if (jevIngressWorkflow.includes("run-jev-memory-judge.mjs")) {
  throw new Error("CASE D ingress duplicates JEV execution");
}
console.log("CASE D DURABLE JEV ENGINE: PASS");
