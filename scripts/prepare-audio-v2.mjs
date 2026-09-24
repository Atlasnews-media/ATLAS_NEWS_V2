import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { upgradeCoverPlanToV15 } from "./audio-cover-presentation.mjs";

const root = new URL("../", import.meta.url);
const ANALYSIS_SCRIPT_VERSION = 3;
const SPEECH_NORMALIZER_VERSION = 5;
const ALEXC_DIALOGUE_RHYTHM_VERSION = 2;
const COVER_RENDER_VERSION = 2;
const INTERNATIONAL_DORA_RENDER_VERSION = 2;
const PLAN_FILE = ".atlas-audio-v2-plan.json";
const lexiconConfig = JSON.parse(
  await readFile(new URL("config/audio/lexicon-v3.json", root), "utf8"),
);
const voiceProfileConfig = JSON.parse(
  await readFile(new URL("config/audio/alex-c-v1.json", root), "utf8"),
);
const LEXICON_VERSION = Number(lexiconConfig.version ?? 0);
const LEXICON_REVISION = Number(lexiconConfig.revision ?? 0);
const VOICE_PROFILE_VERSION = String(voiceProfileConfig.profile ?? "");

if (LEXICON_VERSION !== 3 || LEXICON_REVISION < 1) {
  throw new Error("Lexicon V3 inválido para planificación de Audio V2.");
}
if (VOICE_PROFILE_VERSION !== "alex-c-v1") {
  throw new Error("Perfil de voz Alex C inválido para Audio V2.");
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
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function productState(product) {
  if (product.needsGeneration) return "generar";
  if (product.unavailableReason) return product.unavailableReason;
  return "conservar";
}

const publicDir = process.env.ATLAS_PUBLIC_REPO_DIR;
const coverPlanPath = process.env.ATLAS_COVER_PLAN;
const internationalPlanPath = process.env.ATLAS_INTERNATIONAL_PLAN;
const configuredPlanPath = process.env.ATLAS_AUDIO_V2_PLAN;
const outputPath = configuredPlanPath || path.resolve(process.cwd(), PLAN_FILE);
const simulateMarketsFailure =
  process.env.ATLAS_AUDIO_V2_SIMULATE_MARKETS_FAILURE === "true";

if (!publicDir || !coverPlanPath) {
  throw new Error("Falta configuración requerida de Audio V2.");
}

const coverPlanBase = await readJson(coverPlanPath);
const internationalPlan = internationalPlanPath
  ? await readJson(internationalPlanPath)
  : null;

if (!coverPlanBase?.date || !coverPlanBase?.sourceIds?.general) {
  throw new Error(
    "El plan de Portada no contiene una edición publicada válida.",
  );
}

const date = coverPlanBase.date;
const sourceIds = {
  ...coverPlanBase.sourceIds,
  international:
    internationalPlan?.sourceId ?? coverPlanBase.sourceIds?.general ?? null,
};
const manifestPath = path.join(publicDir, "audio", "analysis-latest.json");
const coverManifestPath = path.join(publicDir, "audio", "latest.json");
const existingAnalysis = await readJson(manifestPath);
const existingCover = await readJson(coverManifestPath);
const presentationInstant =
  process.env.ATLAS_AUDIO_PRESENTATION_INSTANT ?? new Date().toISOString();
const coverPlan = upgradeCoverPlanToV15(coverPlanBase, {
  existingCover,
  generatedAt: presentationInstant,
});

function sameLexicon(existing) {
  return (
    existing?.lexiconVersion === LEXICON_VERSION &&
    existing?.lexiconRevision === LEXICON_REVISION
  );
}

function currentAnalysisState({ sourceId, script, scriptVersion, section }) {
  const scriptHash = script ? hashText(script) : null;
  const existing = existingAnalysis?.[section] ?? null;
  const sameSource = existing?.sourceId === sourceId;
  const sameVersion = existing?.scriptVersion === scriptVersion;
  const sameHash = existing?.scriptHash === scriptHash;
  const hasPublishedPath =
    existing?.status === "published" && Boolean(existing?.path);
  const isCurrent =
    sameSource &&
    sameVersion &&
    sameHash &&
    existing?.speechNormalizerVersion === SPEECH_NORMALIZER_VERSION &&
    existing?.voiceProfileVersion === VOICE_PROFILE_VERSION &&
    existing?.dialogueRhythmVersion === ALEXC_DIALOGUE_RHYTHM_VERSION &&
    (section !== "international" ||
      existing?.doraRenderVersion === INTERNATIONAL_DORA_RENDER_VERSION) &&
    sameLexicon(existing) &&
    hasPublishedPath;

  let unavailableReason = null;
  if (!sourceId) unavailableReason = "source_missing";
  else if (!script) unavailableReason = "script_missing";

  return {
    scriptHash,
    needsGeneration: Boolean(sourceId && script && !isCurrent),
    unavailableReason,
  };
}

async function dialogueProduct(section) {
  const sourceId = sourceIds[section] ?? null;
  const fileName = `${date}-${section}-dialogue.txt`;
  const scriptUrl = new URL(`lab/audio-v2/${fileName}`, root);
  const scriptPath = path.resolve(scriptUrl.pathname);
  const script = sourceId ? await readScript(scriptPath) : null;
  const state = currentAnalysisState({
    sourceId,
    script,
    scriptVersion: ANALYSIS_SCRIPT_VERSION,
    section,
  });

  return {
    section,
    sourceId,
    scriptPath,
    script,
    scriptHash: state.scriptHash,
    scriptVersion: ANALYSIS_SCRIPT_VERSION,
    lexiconVersion: LEXICON_VERSION,
    lexiconRevision: LEXICON_REVISION,
    voiceProfileVersion: VOICE_PROFILE_VERSION,
    dialogueRhythmVersion: ALEXC_DIALOGUE_RHYTHM_VERSION,
    doraRenderVersion: INTERNATIONAL_DORA_RENDER_VERSION,
    needsGeneration: state.needsGeneration,
    unavailableReason: state.unavailableReason,
  };
}

function internationalProduct() {
  const sourceId = internationalPlan?.sourceId ?? sourceIds.general ?? null;
  const script = String(internationalPlan?.script ?? "").trim() || null;
  const scriptVersion = Number(internationalPlan?.scriptVersion ?? 1);
  const state = currentAnalysisState({
    sourceId,
    script,
    scriptVersion,
    section: "international",
  });

  return {
    section: "international",
    sourceId,
    scriptPath: internationalPlanPath ?? null,
    script,
    scriptHash: state.scriptHash,
    scriptVersion,
    voice: internationalPlan?.voice ?? "em_alex",
    title: internationalPlan?.title ?? null,
    lexiconVersion: LEXICON_VERSION,
    lexiconRevision: LEXICON_REVISION,
    voiceProfileVersion: VOICE_PROFILE_VERSION,
    dialogueRhythmVersion: ALEXC_DIALOGUE_RHYTHM_VERSION,
    needsGeneration: state.needsGeneration,
    unavailableReason:
      internationalPlanPath && !internationalPlan
        ? "plan_missing"
        : state.unavailableReason,
  };
}

const international = internationalProduct();
const national = await dialogueProduct("national");
const markets = await dialogueProduct("markets");
const coverLexiconCurrent = sameLexicon(existingCover);
const coverContractValid = coverPlan?.contract?.valid !== false;
const cover = {
  section: "cover",
  sourceId: sourceIds.general,
  scriptVersion: coverPlan.scriptVersion ?? 1,
  lexiconVersion: LEXICON_VERSION,
  lexiconRevision: LEXICON_REVISION,
  coverRenderVersion: COVER_RENDER_VERSION,
  needsGeneration: Boolean(
    coverContractValid &&
      (coverPlan.needsGeneration ||
        !coverLexiconCurrent ||
        existingCover?.speechNormalizerVersion !== SPEECH_NORMALIZER_VERSION ||
        existingCover?.coverRenderVersion !== COVER_RENDER_VERSION),
  ),
  unavailableReason: coverContractValid ? null : "cover_contract_failed",
  plan: {
    ...coverPlan,
    coverRenderVersion: COVER_RENDER_VERSION,
  },
};

const products = {
  cover,
  international,
  national,
  markets,
};

const plan = {
  schemaVersion: 1,
  date,
  sourceIds,
  speechNormalizerVersion: SPEECH_NORMALIZER_VERSION,
  lexiconVersion: LEXICON_VERSION,
  lexiconRevision: LEXICON_REVISION,
  voiceProfileVersion: VOICE_PROFILE_VERSION,
  dialogueRhythmVersion: ALEXC_DIALOGUE_RHYTHM_VERSION,
  simulateMarketsFailure,
  products,
};

plan.needsGeneration = Object.values(products).some(
  (product) => product.needsGeneration,
);

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

const internationalReady = Boolean(
  international.sourceId && international.script,
);
const nationalReady = Boolean(national.sourceId && national.script);
const marketsReady = Boolean(markets.sourceId && markets.script);

await setOutput("needs_generation", String(plan.needsGeneration));
await setOutput("audio_date", date);
await setOutput("international_ready", String(internationalReady));
await setOutput("national_ready", String(nationalReady));
await setOutput("markets_ready", String(marketsReady));

const stateSummary = [
  `portada=${productState(cover)}`,
  `internacional=${productState(international)}`,
  `nacional=${productState(national)}`,
  `mercados=${productState(markets)}`,
].join(", ");

console.log(`Audio V2 ${date}: ${stateSummary}.`);
