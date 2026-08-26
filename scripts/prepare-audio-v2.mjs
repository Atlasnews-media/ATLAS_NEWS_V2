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

const publicDir = process.env.ATLAS_PUBLIC_REPO_DIR;
const coverPlanPath = process.env.ATLAS_COVER_PLAN;
const outputPath =
  process.env.ATLAS_AUDIO_V2_PLAN ??
  path.resolve(process.cwd(), ".atlas-audio-v2-plan.json");
const simulateMarketsFailure =
  String(process.env.ATLAS_AUDIO_V2_SIMULATE_MARKETS_FAILURE ?? "false") ===
  "true";

if (!publicDir || !coverPlanPath) {
  throw new Error(
    "ATLAS_PUBLIC_REPO_DIR y ATLAS_COVER_PLAN son obligatorios para Audio V2.",
  );
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
  const scriptPath = path.resolve(
    new URL(`lab/audio-v2/${date}-${section}-dialogue.txt`, root).pathname,
  );
  const script = sourceId ? await readScript(scriptPath) : null;
  const scriptHash = script ? hashText(script) : null;
  const existing = existingAnalysis?.[section] ?? null;
  const same =
    existing?.status === "published" &&
    existing?.sourceId === sourceId &&
    existing?.scriptVersion === ANALYSIS_SCRIPT_VERSION &&
    existing?.scriptHash === scriptHash &&
    Boolean(existing?.path);

  return {
    section,
    sourceId,
    scriptPath,
    script,
    scriptHash,
    scriptVersion: ANALYSIS_SCRIPT_VERSION,
    needsGeneration: Boolean(sourceId && script && !same),
    unavailableReason: !sourceId
      ? "source_missing"
      : !script
        ? "script_missing"
        : null,
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

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `needs_generation=${plan.needsGeneration ? "true" : "false"}\n`,
  );
  await appendFile(process.env.GITHUB_OUTPUT, `audio_date=${date}\n`);
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `national_ready=${national.sourceId && national.script ? "true" : "false"}\n`,
  );
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `markets_ready=${markets.sourceId && markets.script ? "true" : "false"}\n`,
  );
}

console.log(
  `Audio V2 ${date}: portada=${cover.needsGeneration ? "generar" : "conservar"}, ` +
    `nacional=${national.needsGeneration ? "generar" : national.unavailableReason ?? "conservar"}, ` +
    `mercados=${markets.needsGeneration ? "generar" : markets.unavailableReason ?? "conservar"}.`,
);
