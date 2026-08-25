import { appendFile, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("../", import.meta.url);
const INPUT_DIR = new URL("lab/exp2/inputs/", ROOT);
const PLAN_PATH =
  process.env.ATLAS_LAB_EXP2_PLAN ??
  path.resolve(process.cwd(), ".atlas-lab-exp2-plan.json");
const TARGET_DATE = process.env.ATLAS_LAB_EXP2_DATE?.trim();
const WORDS_PER_MINUTE = 125;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function wordCount(text) {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function speechText(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[`_*#>]/g, "")
    .replace(/\bEE\.\s?UU\.\b/g, "Estados Unidos")
    .replace(/\bS&P\s*500\b/gi, "ese y pe quinientos")
    .replace(/\bTPM\b/g, "tasa de política monetaria")
    .replace(/\bIPC\b/g, "índice de precios al consumidor")
    .replace(/\bIPP\b/g, "índice de precios de productor")
    .replace(/\bFed\b/g, "Reserva Federal")
    .replace(/\bTreasury\b/gi, "bono del Tesoro estadounidense")
    .replace(/US\$/g, "dólares ")
    .replace(/(\d[\d.,]*)%/g, "$1 por ciento")
    .replace(/\s+/g, " ")
    .trim();
}

function validateDialogue(record, expectedSection) {
  assert(record && typeof record === "object", `${expectedSection}: JSON inválido.`);
  assert(record.schemaVersion === 1, `${expectedSection}: schemaVersion debe ser 1.`);
  assert(Number.isInteger(record.scriptVersion) && record.scriptVersion >= 1, `${expectedSection}: scriptVersion inválido.`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(record.date ?? ""), `${expectedSection}: date inválida.`);
  assert(record.section === expectedSection, `${expectedSection}: section no coincide.`);
  assert(record.sourceIds?.general, `${expectedSection}: falta sourceIds.general.`);
  assert(Array.isArray(record.topicsChosen) && record.topicsChosen.length >= 1 && record.topicsChosen.length <= 3, `${expectedSection}: topicsChosen debe contener 1–3 temas.`);
  assert(Array.isArray(record.discarded), `${expectedSection}: discarded debe ser arreglo.`);
  assert(Array.isArray(record.dialogue) && record.dialogue.length >= 6, `${expectedSection}: dialogue requiere al menos 6 intervenciones.`);
  assert(record.voices?.A && record.voices?.B, `${expectedSection}: faltan voces A/B.`);

  let previous = null;
  const speakers = new Set();
  for (const [index, turn] of record.dialogue.entries()) {
    assert(turn && typeof turn === "object", `${expectedSection}: turno ${index + 1} inválido.`);
    assert(turn.speaker === "A" || turn.speaker === "B", `${expectedSection}: speaker inválido en turno ${index + 1}.`);
    assert(typeof turn.text === "string" && turn.text.trim(), `${expectedSection}: texto vacío en turno ${index + 1}.`);
    assert(turn.speaker !== previous, `${expectedSection}: dos turnos consecutivos pertenecen a ${turn.speaker}.`);
    previous = turn.speaker;
    speakers.add(turn.speaker);
  }
  assert(speakers.has("A") && speakers.has("B"), `${expectedSection}: deben participar A y B.`);

  const normalizedDialogue = record.dialogue.map((turn) => ({
    speaker: turn.speaker,
    text: speechText(turn.text),
  }));
  const computedWords = normalizedDialogue.reduce((sum, turn) => sum + wordCount(turn.text), 0);
  const estimatedDurationSeconds = Math.max(30, Math.round((computedWords / WORDS_PER_MINUTE) * 60));

  assert(
    Math.abs(computedWords - Number(record.wordCount ?? 0)) <= 2,
    `${expectedSection}: wordCount declarado ${record.wordCount} no coincide con ${computedWords}.`,
  );

  return {
    schemaVersion: record.schemaVersion,
    scriptVersion: record.scriptVersion,
    date: record.date,
    section: record.section,
    sourceIds: record.sourceIds,
    topicsChosen: record.topicsChosen,
    discarded: record.discarded,
    voices: record.voices,
    dialogue: normalizedDialogue,
    wordCount: computedWords,
    estimatedDurationSeconds,
  };
}

const names = (await readdir(INPUT_DIR)).filter((name) => /\.json$/.test(name));
const dates = [...new Set(names.map((name) => name.match(/^(\d{4}-\d{2}-\d{2})-/)?.[1]).filter(Boolean))].sort();
const date = TARGET_DATE || dates.at(-1);
assert(date, "No hay inputs de LAB exp2 disponibles.");

async function load(section) {
  const filename = `${date}-${section}.json`;
  const raw = JSON.parse(await readFile(new URL(filename, INPUT_DIR), "utf8"));
  return validateDialogue(raw, section);
}

const national = await load("national");
const markets = await load("markets");
assert(national.date === markets.date, "Nacional y Mercados no pertenecen a la misma fecha.");
assert(national.sourceIds.general === markets.sourceIds.general, "Nacional y Mercados no comparten la misma General fuente.");

const plan = {
  experiment: "exp2",
  schemaVersion: 1,
  date,
  generatedAt: new Date().toISOString(),
  sections: { national, markets },
  totals: {
    wordCount: national.wordCount + markets.wordCount,
    estimatedDurationSeconds:
      national.estimatedDurationSeconds + markets.estimatedDurationSeconds,
  },
};

await writeFile(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `exp2_date=${date}\n`);
  await appendFile(process.env.GITHUB_OUTPUT, `national_words=${national.wordCount}\n`);
  await appendFile(process.env.GITHUB_OUTPUT, `markets_words=${markets.wordCount}\n`);
}

console.log(
  `LAB exp2 preparado: ${date} · Nacional ${national.wordCount} palabras · Mercados ${markets.wordCount} palabras.`,
);
