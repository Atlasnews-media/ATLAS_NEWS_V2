import fs from "node:fs";
import { pathToFileURL } from "node:url";

const PREFIX = "lab/radar-editorial/";

export function assertRuntimeScope(paths) {
  const normalized = paths.map((item) => item.trim()).filter(Boolean);
  if (normalized.length === 0) throw new Error("runtime sin paths modificados");
  const forbidden = normalized.filter((item) => !item.startsWith(PREFIX));
  if (forbidden.length > 0) {
    throw new Error(`paths fuera de scope: ${forbidden.join(", ")}`);
  }
  return normalized;
}

function main() {
  const input = fs.readFileSync(0, "utf8");
  const paths = assertRuntimeScope(input.split(/\r?\n/));
  console.log(`RADAR SCOPE PASS — ${paths.length} path(s)`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(`RADAR SCOPE FAIL: ${error.message}`);
    process.exit(1);
  }
}
