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
