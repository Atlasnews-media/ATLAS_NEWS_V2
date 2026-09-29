import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const runtimeRoot = join(repoRoot, ".tmp", "funds-runtime");
const outputDir = join(runtimeRoot, "build");
const configPath = join(runtimeRoot, "tsconfig.json");
const tscBin = join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);
const require = createRequire(import.meta.url);

function writeCompilerConfig() {
  const config = {
    compilerOptions: {
      module: "CommonJS",
      moduleResolution: "Node",
      target: "ES2022",
      outDir: "./build",
      rootDir: "../../src/lib/funds",
      skipLibCheck: true,
      declaration: false,
      sourceMap: false,
      noEmitOnError: true,
      ignoreDeprecations: "6.0",
    },
    files: [
      "../../src/lib/funds/types.ts",
      "../../src/lib/funds/config.ts",
      "../../src/lib/funds/finance.ts",
    ],
  };

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function cleanupFundsRuntime() {
  rmSync(runtimeRoot, { recursive: true, force: true });
}

export function loadFundsRuntime() {
  cleanupFundsRuntime();
  mkdirSync(runtimeRoot, { recursive: true });
  writeCompilerConfig();

  execFileSync(tscBin, ["-p", configPath], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  writeFileSync(
    join(outputDir, "package.json"),
    `${JSON.stringify({ type: "commonjs" })}\n`,
    "utf8",
  );

  return {
    finance: require(join(outputDir, "finance.js")),
    config: require(join(outputDir, "config.js")),
  };
}
