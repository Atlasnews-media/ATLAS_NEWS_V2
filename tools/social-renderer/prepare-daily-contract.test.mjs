import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "prepare-daily-contract.mjs");
const EDITION_ID = "2026-09-07-daily-hormuz";
const EDITION_FILE = `src/content/editions/${EDITION_ID}.mdx`;
const OTHER_COMMIT = "a".repeat(40);
const NEWER_COMMIT = "b".repeat(40);

const EDITION = `---
title: "Hormuz bajo presión, mercados atentos"
summary: "La ruta marítima concentra riesgo operativo relevante. Los mercados siguen el impacto sobre energía y transporte."
publishedAt: "2026-09-07T07:00:00-03:00"
status: published
type: daily
highlights:
  - label: "Energía"
    text: "El mercado sigue la prima de riesgo asociada al tránsito marítimo."
  - label: "Transporte"
    text: "Las rutas alternativas elevan tiempos y costos logísticos."
  - label: "Mercados"
    text: "Los activos sensibles a energía reaccionan a cada señal operacional."
---

## Hecho central
La situación en Hormuz mantiene elevada la atención sobre el tránsito marítimo y la energía.

## Por qué importa
Las carteras pueden enfrentar mayor volatilidad si sube la prima energética. Las decisiones de cobertura ganan relevancia ante interrupciones logísticas. El contexto global sigue condicionado por la disponibilidad efectiva de rutas marítimas.
`;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function makeRepo() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "atlas-readiness-"));
  await mkdir(path.join(cwd, "src/content/editions"), { recursive: true });
  git(cwd, ["init", "-q"]);
  git(cwd, ["config", "user.name", "ATLAS Test"]);
  git(cwd, ["config", "user.email", "atlas-test@example.invalid"]);
  await writeFile(path.join(cwd, "README.md"), "baseline\n");
  git(cwd, ["add", "README.md"]);
  git(cwd, ["commit", "-qm", "baseline"]);
  await writeFile(path.join(cwd, EDITION_FILE), EDITION);
  git(cwd, ["add", EDITION_FILE]);
  git(cwd, ["commit", "-qm", "daily"]);
  return { cwd, sourceCommit: git(cwd, ["rev-parse", "HEAD"]) };
}

function startStatusServer(sequenceFactory, sourceCommit) {
  const requests = [];
  let index = 0;
  const sequence = sequenceFactory(sourceCommit);
  const server = http.createServer((req, res) => {
    requests.push({
      url: req.url,
      cacheControl: req.headers["cache-control"] || "",
      pragma: req.headers.pragma || "",
    });
    const item = sequence[Math.min(index, sequence.length - 1)];
    index += 1;
    if (item.networkError) {
      req.socket.destroy();
      return;
    }
    res.statusCode = item.status ?? 200;
    if (item.raw !== undefined) {
      res.setHeader("content-type", "application/json");
      res.end(item.raw);
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(item.json ?? {}));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        requests,
        url: `http://127.0.0.1:${address.port}/status.json`,
      });
    });
  });
}

async function runScenario(sequenceFactory, options = {}) {
  const { cwd, sourceCommit } = await makeRepo();
  const preload = path.join(cwd, "mock-canonical.mjs");
  await writeFile(
    preload,
    `const realFetch = globalThis.fetch;\nglobalThis.fetch = async (input, init) => {\n  const url = new URL(typeof input === "string" ? input : input.url);\n  if (url.hostname === "eldesiempre100.github.io" && url.pathname.startsWith("/ediciones/")) {\n    return new Response("ok", { status: 200 });\n  }\n  return realFetch(input, init);\n};\n`,
  );
  const statusServer = await startStatusServer(sequenceFactory, sourceCommit);
  const output = path.join(cwd, "github-output.txt");
  const env = {
    ...process.env,
    ATLAS_SOURCE_COMMIT: sourceCommit,
    ATLAS_PUBLIC_STATUS_URL: statusServer.url,
    ATLAS_SOCIAL_CONTRACT_OUTPUT: ".generated/contract.json",
    ATLAS_PUBLIC_STATUS_TIMEOUT_MS: String(options.timeoutMs ?? 220),
    ATLAS_PUBLIC_STATUS_FETCH_TIMEOUT_MS: String(options.fetchTimeoutMs ?? 50),
    ATLAS_PUBLIC_STATUS_RETRY_DELAYS_MS: options.delays ?? "0,5,10,15,20",
    GITHUB_OUTPUT: output,
    NODE_OPTIONS: `--import=${preload}`,
  };

  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], { cwd, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

  await new Promise((resolve) => statusServer.server.close(resolve));
  let githubOutput = "";
  try {
    githubOutput = await readFile(output, "utf8");
  } catch {}

  const states = result.stdout
    .split(/\r?\n/)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed.state ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const contractPath = path.join(cwd, ".generated/contract.json");
  let contractExists = true;
  try {
    await readFile(contractPath, "utf8");
  } catch {
    contractExists = false;
  }

  const response = {
    ...result,
    sourceCommit,
    requests: statusServer.requests,
    states,
    githubOutput,
    contractExists,
  };
  await rm(cwd, { recursive: true, force: true });
  return response;
}

function ready(sourceCommit) {
  return { json: { sourceCommit, latestDaily: { id: EDITION_ID } } };
}

function older(sourceCommit = OTHER_COMMIT) {
  return {
    json: {
      sourceCommit,
      latestDaily: { id: "2026-09-06-daily-hormuz" },
    },
  };
}

test("1. status correcto en primer intento -> READY", async () => {
  const result = await runScenario((sourceCommit) => [ready(sourceCommit)]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.states.at(-1)?.state, "READY");
  assert.equal(result.states.length, 1);
  assert.match(result.githubOutput, /eligible=true/);
  assert.equal(result.contractExists, true);
  assert.equal(result.requests[0].cacheControl, "no-cache");
  assert.equal(result.requests[0].pragma, "no-cache");
  assert.match(result.requests[0].url, /readiness=/);
});

test("2. status anterior -> luego converge", async () => {
  const result = await runScenario((sourceCommit) => [older(), ready(sourceCommit)]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    result.states.map((item) => item.state),
    ["WAITING_PUBLIC_STATUS", "READY"],
  );
});

test("3. commit correcto + edición incorrecta -> espera", async () => {
  const result = await runScenario((sourceCommit) => [older(sourceCommit), ready(sourceCommit)]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.states[0]?.state, "WAITING_PUBLIC_STATUS");
  assert.equal(result.states.at(-1)?.state, "READY");
});

test("4. edición correcta + commit incorrecto -> espera", async () => {
  const result = await runScenario((sourceCommit) => [
    { json: { sourceCommit: OTHER_COMMIT, latestDaily: { id: EDITION_ID } } },
    ready(sourceCommit),
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.states[0]?.state, "WAITING_PUBLIC_STATUS");
  assert.equal(result.states.at(-1)?.state, "READY");
});

test("5. nunca converge -> PUBLIC_STATUS_TIMEOUT fail-closed", async () => {
  const result = await runScenario(() => [older()], { timeoutMs: 90 });
  assert.notEqual(result.code, 0);
  assert.equal(result.states.at(-1)?.state, "PUBLIC_STATUS_TIMEOUT");
  assert.equal(result.contractExists, false);
  assert.doesNotMatch(result.githubOutput, /eligible=true/);
});

test("6. HTTP 404/429/500/502/503 transitorios -> retry -> READY", async () => {
  const result = await runScenario((sourceCommit) => [
    { status: 404 },
    { status: 429 },
    { status: 500 },
    { status: 502 },
    { status: 503 },
    ready(sourceCommit),
  ], { timeoutMs: 400 });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.states.at(-1)?.state, "READY");
  assert.equal(result.states.filter((item) => item.state === "WAITING_PUBLIC_STATUS").length, 5);
});

test("7. error de red transitorio -> retry -> READY", async () => {
  const result = await runScenario((sourceCommit) => [
    { networkError: true },
    ready(sourceCommit),
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.states[0]?.state, "WAITING_PUBLIC_STATUS");
  assert.equal(result.states.at(-1)?.state, "READY");
});

test("8. JSON inválido -> PUBLIC_STATUS_INVALID", async () => {
  const result = await runScenario(() => [{ raw: "{not-json" }]);
  assert.notEqual(result.code, 0);
  assert.equal(result.states.at(-1)?.state, "PUBLIC_STATUS_INVALID");
  assert.equal(result.contractExists, false);
});

test("9. falta sourceCommit -> PUBLIC_STATUS_INVALID", async () => {
  const result = await runScenario(() => [
    { json: { latestDaily: { id: EDITION_ID } } },
  ]);
  assert.notEqual(result.code, 0);
  assert.equal(result.states.at(-1)?.state, "PUBLIC_STATUS_INVALID");
  assert.equal(result.contractExists, false);
});

test("10. falta latestDaily -> PUBLIC_STATUS_INVALID", async () => {
  const result = await runScenario(() => [
    { json: { sourceCommit: OTHER_COMMIT } },
  ]);
  assert.notEqual(result.code, 0);
  assert.equal(result.states.at(-1)?.state, "PUBLIC_STATUS_INVALID");
  assert.equal(result.contractExists, false);
});

test("11. edición posterior detectable -> SUPERSEDED_BY_NEWER_RELEASE", async () => {
  const result = await runScenario(() => [
    {
      json: {
        sourceCommit: NEWER_COMMIT,
        latestDaily: { id: "2026-09-08-daily-hormuz" },
      },
    },
  ]);
  assert.notEqual(result.code, 0);
  assert.equal(result.states.at(-1)?.state, "SUPERSEDED_BY_NEWER_RELEASE");
  assert.equal(result.contractExists, false);
});
