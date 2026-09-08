import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("../", import.meta.url);
const ANALYSIS_SCRIPT_VERSION = 3;
const PLAN_FILE = ".atlas-audio-v2-plan.json";
const lexiconConfig = JSON.parse(
  await readFile(new URL("config/audio/lexicon-v3.json", root), "utf8"),
);
const LEXICON_VERSION = Number(lexiconConfig.version ?? 0);
const LEXICON_REVISION = Number(lexiconConfig.revision ?? 0);

if (LEXICON_VERSION !== 3 || LEXICON_REVISION < 1) {
  throw new Error("Lexicon V3 inválido para planificación de Audio V2.");
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function readScript(filePath) {
  try {
    const text = (await readFile(filePath, "utf8")).trim();
    return text || null;
  } catch {
    return null;
  }
}

async function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  const line = `${name}=${value}\n`;
  await appendFile(process.env.GITHUB_OUTPUT, line);
}

function productState(product) {
  if (product.needsGeneration) {
    return "generar";
  }

  if (product.unavailableReason) {
    return product.unavailableReason;
  }

  return "conservar";
}

const publicDir = process.env.ATLAS_PUBLIC_REPO_DIR;
const coverPlanPath = process.env.ATLAS_COVER_PLAN;
const configuredPlanPath = process.env.ATLAS_AUDIO_V2_PLAN;
const outputPath = configuredPlanPath || path.resolve(process.cwd(), PLAN_FILE);
const simulateMarketsFailure =
  process.env.ATLAS_AUDIO_V2_SIMULATE_MARKETS_FAILURE === "true";

if (!publicDir || !coverPlanPath) {
  throw new Error("Falta configuración requerida de Audio V2.");
}

const coverPlan = await readJson(coverPlanPath);
if (!coverPlan?.date || !coverPlan?.sourceIds?.general) {
  throw new Error(
    "El plan de Portada no contiene una edición publicada válida.",
  );
}

const date = coverPlan.date;
const sourceIds = coverPlan.sourceIds;
const manifestPath = path.join(publicDir, "audio", "analysis-latest.json");
const coverManifestPath = path.join(publicDir, "audio", "latest.json");
const existingAnalysis = await readJson(manifestPath);
const existingCover = await readJson(coverManifestPath);

function sameLexicon(existing) {
  return (
    existing?.lexiconVersion === LEXICON_VERSION &&
    existing?.lexiconRevision === LEXICON_REVISION
  );
}

async function analysisProduct(section) {
  const sourceId = sourceIds[section] ?? null;
  const fileName = `${date}-${section}-dialogue.txt`;
  const scriptUrl = new URL(`lab/audio-v2/${fileName}`, root);
  const scriptPath = path.resolve(scriptUrl.pathname);
  const script = sourceId ? await readScript(scriptPath) : null;
  const scriptHash = script ? hashText(script) : null;
  const existing = existingAnalysis?.[section] ?? null;

  const sameSource = existing?.sourceId === sourceId;
  const sameVersion = existing?.scriptVersion === ANALYSIS_SCRIPT_VERSION;
  const sameHash = existing?.scriptHash === scriptHash;
  const hasPublishedPath =
    existing?.status === "published" && Boolean(existing?.path);
  const isCurrent =
    sameSource &&
    sameVersion &&
    sameHash &&
    sameLexicon(existing) &&
    hasPublishedPath;

  let unavailableReason = null;
  if (!sourceId) {
    unavailableReason = "source_missing";
  } else if (!script) {
    unavailableReason = "script_missing";
  }

  const needsGeneration = Boolean(sourceId && script && !isCurrent);

  return {
    section,
    sourceId,
    scriptPath,
    script,
    scriptHash,
    scriptVersion: ANALYSIS_SCRIPT_VERSION,
    lexiconVersion: LEXICON_VERSION,
    lexiconRevision: LEXICON_REVISION,
    needsGeneration,
    unavailableReason,
  };
}

const national = await analysisProduct("national");
const markets = await analysisProduct("markets");
const coverLexiconCurrent = sameLexicon(existingCover);
const cover = {
  section: "cover",
  sourceId: sourceIds.general,
  scriptVersion: coverPlan.scriptVersion ?? 1,
  lexiconVersion: LEXICON_VERSION,
  lexiconRevision: LEXICON_REVISION,
  needsGeneration: Boolean(coverPlan.needsGeneration || !coverLexiconCurrent),
  plan: coverPlan,
};

const products = {
  cover,
  national,
  markets,
};

const plan = {
  schemaVersion: 1,
  date,
  sourceIds,
  lexiconVersion: LEXICON_VERSION,
  lexiconRevision: LEXICON_REVISION,
  simulateMarketsFailure,
  products,
};

plan.needsGeneration = Object.values(products).some((product) => {
  return product.needsGeneration;
});

const serializedPlan = `${JSON.stringify(plan, null, 2)}\n`;
await writeFile(outputPath, serializedPlan, "utf8");

const nationalReady = Boolean(national.sourceId && national.script);
const marketsReady = Boolean(markets.sourceId && markets.script);

await setOutput("needs_generation", String(plan.needsGeneration));
await setOutput("audio_date", date);
await setOutput("national_ready", String(nationalReady));
await setOutput("markets_ready", String(marketsReady));

const stateSummary = [
  `portada=${productState(cover)}`,
  `nacional=${productState(national)}`,
  `mercados=${productState(markets)}`,
].join(", ");

console.log(`Audio V2 ${date}: ${stateSummary}.`);
