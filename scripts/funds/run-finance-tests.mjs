import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const outputDir = join(repoRoot, ".tmp", "funds-test");
const tscBin = join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

try {
  execFileSync(
    tscBin,
    [
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--target",
      "ES2022",
      "--outDir",
      outputDir,
      "--rootDir",
      "src/lib/funds",
      "--skipLibCheck",
      "src/lib/funds/types.ts",
      "src/lib/funds/config.ts",
      "src/lib/funds/finance.ts",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );

  writeFileSync(
    join(outputDir, "package.json"),
    `${JSON.stringify({ type: "commonjs" })}\n`,
    "utf8",
  );

  execFileSync(
    process.execPath,
    ["--test", "scripts/funds/finance.test.cjs"],
    { cwd: repoRoot, stdio: "inherit" },
  );
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}
