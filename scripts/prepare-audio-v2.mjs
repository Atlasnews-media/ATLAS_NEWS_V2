import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("../", import.meta.url);
const ANALYSIS_SCRIPT_VERSION = 1;

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
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function productState(product) {
  if (product.needsGeneration) return "generar";
  return product.unavailableReason ?? "conservar";
}

const publicDir = process.env.ATLAS_PUBLIC_REPO_DIR;
const coverPlanPath = process.env.ATLAS_COVER_PLAN;
const outputPath =
  process.env.ATLAS_AUDIO_V2_PLAN ??
  path.resolve(process.cwd(), ".atlas-audio-v2-plan.json");
const simulateMarketsFailure =
  process.env.ATLAS_AUDIO_V2_SIMULATE_MARKETS_FAILURE === "true";

if (!publicDir || !coverPlanPath) {
  throw new Error("Falta configuración requerida de Audio V2.");
}

const coverPlan = await readJson(coverPlanPath);
if (!coverPlan?.date || !coverPlan?.sourceIds?.general) {
  throw new Error("El plan de Portada no contiene una edición publicada válida.");
}

const date = coverPlan.date;
const sourceIds = coverPlan.sourceIds;
const analysisManifestPath = path.join(
  publicDir,
  "audio",
  "analysis-latest.json",
);
const existingAnalysis = await readJson(analysisManifestPath);

async function analysisProduct(section) {
  const sourceId = sourceIds[section] ?? null;
  const scriptUrl = new URL(
    `lab/audio-v2/${date}-${section}-dialogue.txt`,
    root,
  );
  const scriptPath = path.resolve(scriptUrl.pathname);
  const script = sourceId ? await readScript(scriptPath) : null;
  const scriptHash = script ? hashText(script) : null;
  const existing = existingAnalysis?.[section] ?? null;
  const same =
    existing?.status === "published" &&
    existing?.sourceId === sourceId &&
    existing?.scriptVersion === ANALYSIS_SCRIPT_VERSION &&
    existing?.scriptHash === scriptHash &&
    Boolean(existing?.path);

  let unavailableReason = null;
  if (!sourceId) {
    unavailableReason = "source_missing";
  } else if (!script) {
    unavailableReason = "script_missing";
  }

  return {
    section,
    sourceId,
    scriptPath,
    script,
    scriptHash,
    scriptVersion: ANALYSIS_SCRIPT_VERSION,
    needsGeneration: Boolean(sourceId && script && !same),
    unavailableReason,
  };
}

const national = await analysisProduct("national");
const markets = await analysisProduct("markets");
const cover = {
  section: "cover",
  sourceId: sourceIds.general,
  scriptVersion: coverPlan.scriptVersion ?? 1,
  needsGeneration: Boolean(coverPlan.needsGeneration),
  plan: coverPlan,
};

const plan = {
  schemaVersion: 1,
  date,
  sourceIds,
  simulateMarketsFailure,
  products: {
    cover,
    national,
    markets,
  },
};

plan.needsGeneration = Object.values(plan.products).some(
  (product) => product.needsGeneration,
);

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

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
