import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const tempRoot = join(repoRoot, ".tmp");
const outputDir = join(tempRoot, "funds-test");
const testConfigPath = join(tempRoot, "funds-tsconfig.json");
const tscBin = join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);

rmSync(outputDir, { recursive: true, force: true });
rmSync(testConfigPath, { force: true });
mkdirSync(tempRoot, { recursive: true });

const testConfig = {
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "Node",
    target: "ES2022",
    outDir: "./funds-test",
    rootDir: "../src/lib/funds",
    skipLibCheck: true,
    declaration: false,
    sourceMap: false,
    noEmitOnError: true,
    ignoreDeprecations: "6.0",
  },
  files: [
    "../src/lib/funds/types.ts",
    "../src/lib/funds/config.ts",
    "../src/lib/funds/finance.ts",
  ],
};

writeFileSync(testConfigPath, `${JSON.stringify(testConfig, null, 2)}\n`, "utf8");

try {
  execFileSync(tscBin, ["-p", testConfigPath], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  writeFileSync(
    join(outputDir, "package.json"),
    `${JSON.stringify({ type: "commonjs" })}\n`,
    "utf8",
  );

  execFileSync(process.execPath, ["--test", "scripts/funds/finance.test.cjs"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
} finally {
  rmSync(outputDir, { recursive: true, force: true });
  rmSync(testConfigPath, { force: true });
}
