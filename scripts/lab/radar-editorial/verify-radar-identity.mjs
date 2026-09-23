import { pathToFileURL } from "node:url";
import { readAndValidateRadarArtifact } from "./validate-radar-artifact.mjs";

const IDENTITY_FIELDS = [
  "radarRunId",
  "sourceMainCommit",
  "radarStateVersion",
  "editorialDate",
];

export function assertRadarIdentity(local, remote) {
  for (const field of IDENTITY_FIELDS) {
    if (local[field] !== remote[field]) {
      throw new Error(
        `${field} mismatch: local=${local[field]} remote=${remote[field]}`,
      );
    }
  }
  return true;
}

async function main() {
  const [localFile, remoteFile] = process.argv.slice(2);
  if (!localFile || !remoteFile) {
    throw new Error("uso: verify-radar-identity.mjs LOCAL REMOTE");
  }
  const local = await readAndValidateRadarArtifact(localFile);
  const remote = await readAndValidateRadarArtifact(remoteFile);
  assertRadarIdentity(local, remote);
  console.log(`RADAR IDENTITY PASS — ${local.radarRunId}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`RADAR IDENTITY FAIL: ${error.message}`);
    process.exit(1);
  });
}
