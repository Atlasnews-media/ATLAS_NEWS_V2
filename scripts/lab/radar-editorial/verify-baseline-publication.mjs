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
    !["BASELINE", "RADAR_JEV"].includes(local.experimentMode) ||
    remote.experimentMode !== local.experimentMode
  ) {
    throw new Error("verificación remota recibió modos experimentales incompatibles");
  }
  if (
    request.status !== "READY" ||
    request.experimentMode !== local.experimentMode
  ) {
    throw new Error("publish-request remoto no está READY para el modo vigente");
  }
  if (request.productionWritesAllowed !== false) {
    throw new Error("publish-request remoto permite producción");
  }
  assertSame(local, remote, "latest remoto");
  assertSame(local, request, "publish-request remoto");
  console.log(
    `RADAR REMOTE IDENTITY PASS — ${local.radarRunId} · ${local.experimentMode}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`RADAR REMOTE IDENTITY FAIL: ${error.message}`);
    process.exit(1);
  });
}
