import { pathToFileURL } from "node:url";
import { readAndValidateRadarArtifact } from "./validate-radar-artifact.mjs";
import { readCanonicalJson } from "./validate-baseline-run.mjs";

const IDENTITY = [
  "radarRunId",
  "sourceMainCommit",
  "radarStateVersion",
  "editorialDate",
];

function assertSame(left, right, label) {
  for (const field of IDENTITY) {
    if (left[field] !== right[field]) {
      throw new Error(`${label}: ${field} mismatch`);
    }
  }
}

async function main() {
  const [localLatestFile, remoteLatestFile, remoteRequestFile] =
    process.argv.slice(2);
  if (!localLatestFile || !remoteLatestFile || !remoteRequestFile) {
    throw new Error(
      "uso: verify-baseline-publication.mjs LOCAL_LATEST REMOTE_LATEST REMOTE_REQUEST",
    );
  }
  const local = await readAndValidateRadarArtifact(localLatestFile);
  const remote = await readAndValidateRadarArtifact(remoteLatestFile);
  const request = await readCanonicalJson(remoteRequestFile);
  if (
    local.experimentMode !== "BASELINE" ||
    remote.experimentMode !== "BASELINE"
  ) {
    throw new Error("verificación baseline recibió artefacto no BASELINE");
  }
  if (request.status !== "READY" || request.experimentMode !== "BASELINE") {
    throw new Error("publish-request remoto no está READY BASELINE");
  }
  if (request.productionWritesAllowed !== false) {
    throw new Error("publish-request remoto permite producción");
  }
  assertSame(local, remote, "latest remoto");
  assertSame(local, request, "publish-request remoto");
  console.log(`BASELINE REMOTE IDENTITY PASS — ${local.radarRunId}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`BASELINE REMOTE IDENTITY FAIL: ${error.message}`);
    process.exit(1);
  });
}
