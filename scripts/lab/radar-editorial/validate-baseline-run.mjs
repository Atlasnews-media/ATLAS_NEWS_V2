import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SECTIONS = ["general", "national", "markets"];
const PHASE_STATUS_ORDER = ["GENERAL_PASS", "NATIONAL_PASS", "MARKETS_PASS", "READY"];
const REQUIRED_FRAMEWORK = [
  "AGENTS.md",
  "docs/PROCEDIMIENTO_GPT_PUBLICACION.md",
  "docs/CONTRATO_EDITORIAL.md",
  "data/editorial_state.json",
];
const FORBIDDEN_DECISION_KEYS = new Set([
  "SAME_EVENT",
  "NEW_EVENT",
  "REPETITION",
  "angle_repeated",
  "jev",
  "jevDecision",
  "semanticDecision",
  "memoryDecision",
]);

function fail(message) {
  throw new Error(message);
}

export async function readCanonicalJson(file) {
  const raw = await fs.readFile(file, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    fail(`JSON inválido en ${file}: ${error.message}`);
  }
  if (raw !== `${JSON.stringify(data, null, 2)}\n`) {
    fail(`JSON no canónico: ${file}`);
  }
  return data;
}

function assertIso(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    fail(`${label} debe ser timestamp ISO válido`);
  }
}

function assertIdentity(data, expected, label) {
  for (const field of [
    "radarRunId",
    "sourceMainCommit",
    "radarStateVersion",
    "editorialDate",
  ]) {
    if (data[field] !== expected[field]) {
      fail(`${label}.${field} no coincide con identidad del run`);
    }
  }
}

function assertBaseIdentity(data, label) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(data.radarRunId ?? "")) {
    fail(`${label}.radarRunId inválido`);
  }
  if (!/^[0-9a-f]{40}$/.test(data.sourceMainCommit ?? "")) {
    fail(`${label}.sourceMainCommit debe ser SHA completo`);
  }
  if (!/^radar-state-v[1-9][0-9]*$/.test(data.radarStateVersion ?? "")) {
    fail(`${label}.radarStateVersion inválida`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.editorialDate ?? "")) {
    fail(`${label}.editorialDate debe ser YYYY-MM-DD`);
  }
  if (data.mode !== "LAB_ONLY") fail(`${label}.mode debe ser LAB_ONLY`);
  if (data.experimentMode !== "BASELINE") {
    fail(`${label}.experimentMode debe ser BASELINE`);
  }
  if (data.productionWritesAllowed !== false) {
    fail(`${label}.productionWritesAllowed debe ser false`);
  }
}

function walkForbiddenKeys(value, where = "$") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForbiddenKeys(item, `${where}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_DECISION_KEYS.has(key)) {
      fail(`campo de fase futura prohibido: ${where}.${key}`);
    }
    walkForbiddenKeys(child, `${where}.${key}`);
  }
}

function assertHttps(url, label) {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) {
    fail(`${label} debe usar https://`);
  }
}

function assertRunPath(runPath, radarRunId) {
  const expected = `lab/radar-editorial/runtime/runs/${radarRunId}`;
  if (runPath !== expected) fail(`runPath debe ser ${expected}`);
  if (runPath.includes("..")) fail("runPath no puede contener ..");
}

function assertFrameworkRead(list, label) {
  if (!Array.isArray(list)) fail(`${label} debe ser lista`);
  for (const required of REQUIRED_FRAMEWORK) {
    if (!list.includes(required)) fail(`${label} no registra ${required}`);
  }
}

function assertCandidate(candidate, ids) {
  const required = [
    "candidateId",
    "section",
    "titleOriginal",
    "sourceName",
    "sourceUrl",
    "publishedAt",
    "discoveredAt",
    "description",
    "retrievalOrigin",
    "selected",
    "selectionStage",
  ];
  for (const key of required) {
    if (!(key in candidate)) fail(`candidate sin ${key}`);
  }
  if (ids.has(candidate.candidateId)) fail(`candidateId duplicado: ${candidate.candidateId}`);
  ids.add(candidate.candidateId);
  if (!SECTIONS.includes(candidate.section)) fail(`section inválida en ${candidate.candidateId}`);
  if (typeof candidate.titleOriginal !== "string" || candidate.titleOriginal.length < 4) {
    fail(`titleOriginal inválido en ${candidate.candidateId}`);
  }
  if (typeof candidate.sourceName !== "string" || !candidate.sourceName.trim()) {
    fail(`sourceName inválido en ${candidate.candidateId}`);
  }
  assertHttps(candidate.sourceUrl, `${candidate.candidateId}.sourceUrl`);
  if (candidate.publishedAt !== null) assertIso(candidate.publishedAt, `${candidate.candidateId}.publishedAt`);
  assertIso(candidate.discoveredAt, `${candidate.candidateId}.discoveredAt`);
  if (typeof candidate.description !== "string" || candidate.description.length < 20) {
    fail(`description demasiado breve en ${candidate.candidateId}`);
  }
  if (typeof candidate.retrievalOrigin !== "string" || !candidate.retrievalOrigin.trim()) {
    fail(`retrievalOrigin inválido en ${candidate.candidateId}`);
  }
  if (typeof candidate.selected !== "boolean") fail(`selected inválido en ${candidate.candidateId}`);
  if (!["considered", "screened-out", "selected-final"].includes(candidate.selectionStage)) {
    fail(`selectionStage inválido en ${candidate.candidateId}`);
  }
  if (candidate.selected && candidate.selectionStage !== "selected-final") {
    fail(`candidate seleccionado sin selected-final: ${candidate.candidateId}`);
  }
  walkForbiddenKeys(candidate, `candidate.${candidate.candidateId}`);
}

function assertMetadata(meta, section, identity, candidateMap, runDir) {
  assertIdentity(meta, identity, `${section}/metadata`);
  if (meta.schemaVersion !== 1) fail(`${section}.metadata.schemaVersion debe ser 1`);
  if (meta.section !== section) fail(`${section}.metadata.section inválida`);
  if (meta.status !== "PASS") fail(`${section}.metadata.status debe ser PASS`);
  assertIso(meta.startedAt, `${section}.metadata.startedAt`);
  assertIso(meta.completedAt, `${section}.metadata.completedAt`);
  const maxTitle = section === "general" ? 140 : 160;
  if (typeof meta.title !== "string" || meta.title.length < 8 || meta.title.length > maxTitle) {
    fail(`${section}.title fuera de contrato`);
  }
  if (typeof meta.summary !== "string" || meta.summary.length < 40 || meta.summary.length > 320) {
    fail(`${section}.summary fuera de contrato`);
  }
  if (!Array.isArray(meta.tags) || meta.tags.length < 1) fail(`${section}.tags vacío`);
  if (!Array.isArray(meta.sources) || meta.sources.length < 1) fail(`${section}.sources vacío`);
  for (const [index, source] of meta.sources.entries()) {
    if (typeof source.name !== "string" || !source.name.trim()) fail(`${section}.sources[${index}].name inválido`);
    assertHttps(source.url, `${section}.sources[${index}].url`);
    if (source.publishedAt != null) assertIso(source.publishedAt, `${section}.sources[${index}].publishedAt`);
  }
  const expectedHighlights = section === "general" ? 5 : 3;
  if (!Array.isArray(meta.highlights) || meta.highlights.length !== expectedHighlights) {
    fail(`${section}.highlights debe contener exactamente ${expectedHighlights}`);
  }
  for (const highlight of meta.highlights) {
    if (typeof highlight.label !== "string" || !highlight.label.trim()) fail(`${section}.highlight.label inválido`);
    if (typeof highlight.text !== "string" || !highlight.text.trim()) fail(`${section}.highlight.text inválido`);
  }
  if (!Array.isArray(meta.selectedCandidateIds) || meta.selectedCandidateIds.length < 1) {
    fail(`${section}.selectedCandidateIds vacío`);
  }
  for (const id of meta.selectedCandidateIds) {
    const candidate = candidateMap.get(id);
    if (!candidate) fail(`${section} referencia candidate inexistente ${id}`);
    if (candidate.section !== section || !candidate.selected) {
      fail(`${section} referencia candidate no seleccionado ${id}`);
    }
  }
  if (!Array.isArray(meta.discardedCandidateIds)) fail(`${section}.discardedCandidateIds debe ser lista`);
  for (const id of meta.discardedCandidateIds) {
    const candidate = candidateMap.get(id);
    if (!candidate) fail(`${section} descarta candidate inexistente ${id}`);
    if (candidate.section !== section || candidate.selected) {
      fail(`${section} discardedCandidateIds inconsistente ${id}`);
    }
  }
  const expectedOutput = path.posix.join(runDir, section, "output.md");
  if (meta.outputPath !== expectedOutput) fail(`${section}.outputPath debe ser ${expectedOutput}`);
  walkForbiddenKeys(meta, `${section}.metadata`);
}

async function assertOutputMarkdown(file, section) {
  const output = await fs.readFile(file, "utf8");
  if (output.length < 500) fail(`${section}/output.md demasiado breve`);
  if (output.includes("cite")) fail(`${section}/output.md contiene marcador interno de cita`);
  const required =
    section === "general"
      ? [
          "## Hecho central",
          "## En una mirada",
          "## Por qué importa",
          "## Mercados globales",
          "## Chile",
          "## Tasas, monedas y commodities",
          "## Qué observar",
        ]
      : ["## Desarrollo", "## Implicancias y riesgos", "## Qué observar"];
  for (const heading of required) {
    if (!output.includes(heading)) fail(`${section}/output.md no contiene ${heading}`);
  }
  return output;
}

async function readRunIdentity(runDir) {
  const run = await readCanonicalJson(path.join(runDir, "run.json"));
  assertBaseIdentity(run, "run");
  assertRunPath(`lab/radar-editorial/runtime/runs/${run.radarRunId}`, run.radarRunId);
  if (run.schemaVersion !== 1) fail("run.schemaVersion debe ser 1");
  if (run.memoryMode !== "PRODUCTIVE_READ_ONLY_CONTEXT") fail("run.memoryMode inválido");
  if (run.radarInterventionUsed !== false) fail("run.radarInterventionUsed debe ser false");
  if (run.jevUsed !== false) fail("run.jevUsed debe ser false");
  if (run.corpusUsed !== false) fail("run.corpusUsed debe ser false");
  assertIso(run.startedAt, "run.startedAt");
  if (run.completedAt !== null) assertIso(run.completedAt, "run.completedAt");
  assertFrameworkRead(run.frameworkRead, "run.frameworkRead");
  walkForbiddenKeys(run, "run");
  return run;
}

async function validatePhase(runDir, section, identity, candidateMap) {
  const phaseDir = path.join(runDir, section);
  const input = await readCanonicalJson(path.join(phaseDir, "input.json"));
  const meta = await readCanonicalJson(path.join(phaseDir, "metadata.json"));
  const checkpoint = await readCanonicalJson(path.join(runDir, "checkpoints", `${section}.json`));
  assertIdentity(input, identity, `${section}/input`);
  assertIdentity(checkpoint, identity, `${section}/checkpoint`);
  if (input.schemaVersion !== 1 || input.section !== section) fail(`${section}.input inválido`);
  assertIso(input.startedAt, `${section}.input.startedAt`);
  assertFrameworkRead(input.frameworkRead, `${section}.input.frameworkRead`);
  if (!Array.isArray(input.searchQueryIds) || input.searchQueryIds.length < 1) fail(`${section}.searchQueryIds vacío`);
  if (!Array.isArray(input.candidateIds) || input.candidateIds.length < 1) fail(`${section}.candidateIds vacío`);
  if (checkpoint.schemaVersion !== 1 || checkpoint.phase !== section || checkpoint.status !== "PASS") {
    fail(`checkpoint ${section} inválido`);
  }
  assertIso(checkpoint.completedAt, `${section}.checkpoint.completedAt`);
  assertMetadata(meta, section, identity, candidateMap, `lab/radar-editorial/runtime/runs/${identity.radarRunId}`);
  await assertOutputMarkdown(path.join(phaseDir, "output.md"), section);
  return { input, meta, checkpoint };
}

export async function validateBaselineRun(runDir, latest = null, options = {}) {
  const run = await readRunIdentity(runDir);
  if (run.completedAt === null) fail("run completo requiere completedAt");
  if (
    run.phases?.general !== "PASS" ||
    run.phases?.national !== "PASS" ||
    run.phases?.markets !== "PASS"
  ) {
    fail("run completo requiere General/Nacional/Mercados PASS");
  }

  const searchLog = await readCanonicalJson(path.join(runDir, "search-log.json"));
  assertIdentity(searchLog, run, "search-log");
  if (searchLog.schemaVersion !== 1 || !Array.isArray(searchLog.entries) || searchLog.entries.length < 3) {
    fail("search-log inválido");
  }
  const queryIds = new Set();
  for (const entry of searchLog.entries) {
    if (!entry.queryId || queryIds.has(entry.queryId)) fail("queryId inválido o duplicado");
    queryIds.add(entry.queryId);
    if (!SECTIONS.includes(entry.section)) fail(`search-log section inválida: ${entry.section}`);
    if (typeof entry.query !== "string" || entry.query.length < 3) fail("query vacía");
    assertIso(entry.executedAt, `${entry.queryId}.executedAt`);
    if (!Number.isInteger(entry.resultCount) || entry.resultCount < 0) fail("resultCount inválido");
  }

  const candidatesDoc = await readCanonicalJson(path.join(runDir, "candidates.json"));
  assertIdentity(candidatesDoc, run, "candidates");
  if (candidatesDoc.schemaVersion !== 1 || !Array.isArray(candidatesDoc.candidates)) {
    fail("candidates.json inválido");
  }
  walkForbiddenKeys(candidatesDoc, "candidates");
  const candidateIds = new Set();
  for (const candidate of candidatesDoc.candidates) assertCandidate(candidate, candidateIds);
  const candidateMap = new Map(candidatesDoc.candidates.map((candidate) => [candidate.candidateId, candidate]));
  for (const section of SECTIONS) {
    if (!candidatesDoc.candidates.some((candidate) => candidate.section === section && candidate.selected)) {
      fail(`no hay candidate seleccionado para ${section}`);
    }
  }

  for (const section of SECTIONS) await validatePhase(runDir, section, run, candidateMap);

  const result = await readCanonicalJson(path.join(runDir, "result.json"));
  assertIdentity(result, run, "result");
  if (result.schemaVersion !== 1 || result.status !== "PASS") fail("result.status debe ser PASS");
  if (result.experimentMode !== "BASELINE" || result.mode !== "LAB_ONLY") fail("result modo inválido");
  if (result.productionWritesAllowed !== false) fail("result permite production writes");
  for (const section of SECTIONS) {
    if (result.sections?.[section]?.status !== "PASS") fail(`result ${section} no está PASS`);
  }
  walkForbiddenKeys(result, "result");

  const request = await readCanonicalJson(path.join(runDir, "publish-request.json"));
  assertIdentity(request, run, "publish-request");
  if (request.schemaVersion !== 1 || request.status !== "READY") fail("publish-request no está READY");
  if (request.mode !== "LAB_ONLY" || request.experimentMode !== "BASELINE") fail("publish-request modo inválido");
  if (request.productionWritesAllowed !== false) fail("publish-request permite production writes");
  const logicalRunPath = `lab/radar-editorial/runtime/runs/${run.radarRunId}`;
  assertRunPath(request.runPath, run.radarRunId);
  if (request.resultPath !== `${logicalRunPath}/result.json`) fail("publish-request.resultPath inválido");
  if (request.viewPath !== `${logicalRunPath}/index.html`) fail("publish-request.viewPath inválido");
  walkForbiddenKeys(request, "publish-request");

  if (options.requireView !== false) {
    const indexHtml = await fs.readFile(path.join(runDir, "index.html"), "utf8");
    if (!indexHtml.includes(run.radarRunId) || !indexHtml.includes("BASELINE")) {
      fail("index.html no identifica run BASELINE");
    }
  }

  if (latest) {
    assertIdentity(latest, run, "latest");
    assertRunPath(latest.runPath, run.radarRunId);
    if (latest.resultPath !== request.resultPath || latest.publishRequestPath !== `${logicalRunPath}/publish-request.json`) {
      fail("latest paths no coinciden con run");
    }
    if (latest.viewPath !== request.viewPath) fail("latest.viewPath no coincide");
  }

  console.log(`BASELINE RUN PASS — ${run.radarRunId}`);
  return { run, searchLog, candidatesDoc, result, request };
}

export async function validateBaselineCheckpoint(activeFile) {
  const active = await readCanonicalJson(activeFile);
  assertBaseIdentity(active, "active");
  if (active.schemaVersion !== 1) fail("active.schemaVersion debe ser 1");
  if (!PHASE_STATUS_ORDER.includes(active.status)) fail("active.status inválido");
  assertRunPath(active.runPath, active.radarRunId);
  assertIso(active.updatedAt, "active.updatedAt");
  const runDir = active.runPath;
  const run = await readRunIdentity(runDir);
  assertIdentity(active, run, "active");

  if (active.status === "READY") {
    return validateBaselineRun(runDir);
  }

  const searchLog = await readCanonicalJson(path.join(runDir, "search-log.json"));
  const candidatesDoc = await readCanonicalJson(path.join(runDir, "candidates.json"));
  assertIdentity(searchLog, run, "search-log");
  assertIdentity(candidatesDoc, run, "candidates");
  if (!Array.isArray(candidatesDoc.candidates)) fail("candidates debe contener lista");
  walkForbiddenKeys(candidatesDoc, "candidates");
  const ids = new Set();
  for (const candidate of candidatesDoc.candidates) assertCandidate(candidate, ids);
  const candidateMap = new Map(candidatesDoc.candidates.map((candidate) => [candidate.candidateId, candidate]));

  const requiredCount = PHASE_STATUS_ORDER.indexOf(active.status) + 1;
  for (const section of SECTIONS.slice(0, Math.min(requiredCount, 3))) {
    await validatePhase(runDir, section, run, candidateMap);
  }
  console.log(`BASELINE CHECKPOINT PASS — ${active.radarRunId} · ${active.status}`);
  return { active, run };
}

async function main() {
  const [mode, target, latestFile] = process.argv.slice(2);
  if (mode === "--active" && target) {
    await validateBaselineCheckpoint(target);
    return;
  }
  if (mode === "--run" && target) {
    await validateBaselineRun(target);
    return;
  }
  if (mode === "--latest" && target) {
    const latest = await readCanonicalJson(target);
    await validateBaselineRun(latest.runPath, latest);
    return;
  }
  if (mode === "--run-with-latest" && target && latestFile) {
    const latest = await readCanonicalJson(latestFile);
    await validateBaselineRun(target, latest);
    return;
  }
  fail("uso: validate-baseline-run.mjs --active FILE | --run DIR | --latest FILE");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`BASELINE VALIDATION FAIL: ${error.message}`);
    process.exit(1);
  });
}
