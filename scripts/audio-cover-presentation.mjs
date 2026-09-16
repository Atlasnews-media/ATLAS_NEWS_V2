import {
  countWords,
  validateCoverContract,
} from "./cover-briefing-contract.mjs";

export const AUDIO_PRESENTATION_TIME_ZONE = "America/Santiago";
export const AUDIO_COVER_SCRIPT_VERSION = 13;

const SMALL_NUMBERS = [
  "cero",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidós",
  "veintitrés",
  "veinticuatro",
  "veinticinco",
  "veintiséis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
];

const TENS = {
  30: "treinta",
  40: "cuarenta",
  50: "cincuenta",
};

function numberToWordsUnder60(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 59) {
    throw new RangeError(`Valor fuera de rango para hora hablada: ${value}`);
  }
  if (numeric < 30) return SMALL_NUMBERS[numeric];
  const tens = Math.floor(numeric / 10) * 10;
  const unit = numeric % 10;
  return unit === 0 ? TENS[tens] : `${TENS[tens]} y ${SMALL_NUMBERS[unit]}`;
}

function chileClockParts(instant, timeZone = AUDIO_PRESENTATION_TIME_ZONE) {
  const parsed = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Instante inválido para Portada: ${instant}`);
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return { hour24: Number(byType.hour), minute: Number(byType.minute) };
}

function daypartForHour(hour24) {
  if (hour24 < 6) return "de la madrugada";
  if (hour24 < 12) return "de la mañana";
  if (hour24 < 20) return "de la tarde";
  return "de la noche";
}

export function formatGenerationTimeSpeech(
  instant,
  timeZone = AUDIO_PRESENTATION_TIME_ZONE,
) {
  const { hour24, minute } = chileClockParts(instant, timeZone);
  const hour12 = hour24 % 12 || 12;
  const hourWords = hour12 === 1 ? "una" : numberToWordsUnder60(hour12);
  const minuteWords = minute === 0 ? "" : ` ${numberToWordsUnder60(minute)}`;
  return `Son las ${hourWords}${minuteWords} ${daypartForHour(hour24)}.`;
}

export function formatDollarVariationSpeech(changePercent) {
  if (
    changePercent === null ||
    changePercent === undefined ||
    changePercent === ""
  ) {
    return null;
  }
  const change = Number(changePercent);
  if (!Number.isFinite(change)) return null;
  if (Math.abs(change) < 0.01) {
    return "sin variación relevante frente a la jornada hábil anterior";
  }
  const magnitude = new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(change));
  return `con una variación ${change > 0 ? "positiva" : "negativa"} de ${magnitude}% frente a la jornada hábil anterior`;
}

function upgradeDollarSentence(snapshot) {
  const sentences =
    String(snapshot ?? "").match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return sentences
    .map((sentence) => {
      if (!/dólar observado/i.test(sentence)) return sentence.trim();
      return sentence
        .replace(
          /un\s+([\d.,]+)%\s+por encima de la jornada hábil anterior/i,
          "con una variación positiva de $1% frente a la jornada hábil anterior",
        )
        .replace(
          /un\s+([\d.,]+)%\s+por debajo de la jornada hábil anterior/i,
          "con una variación negativa de $1% frente a la jornada hábil anterior",
        )
        .replace(
          /sin cambios frente a la jornada hábil anterior/i,
          "sin variación relevante frente a la jornada hábil anterior",
        )
        .trim();
    })
    .join(" ")
    .trim();
}

function parseCoverScript(script, { hasNational, hasMarkets }) {
  const parts = String(script ?? "")
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const next = () => parts.shift() ?? "";
  const expect = (label) => {
    const value = next();
    if (value !== label) {
      throw new Error(
        `Portada V13: se esperaba bloque '${label}' y llegó '${value}'.`,
      );
    }
  };

  const opening = next();
  let snapshot = "";
  if (parts[0] !== "La señal central.") snapshot = next();
  expect("La señal central.");
  const central = next();

  let chile = "";
  if (hasNational) {
    expect("En Chile.");
    chile = next();
  }

  let markets = "";
  if (hasMarkets) {
    expect("Ahora, mercados.");
    markets = next();
  }

  expect("Qué seguir durante la jornada.");
  const watch = next();
  const closing = parts.join("\n\n").trim();
  if (!opening || !central || !watch || !closing) {
    throw new Error(
      "Portada V13: estructura V12 incompleta para promover presentación.",
    );
  }

  return { opening, snapshot, central, chile, markets, watch, closing };
}

function buildCoverScript(blocks, { hasNational, hasMarkets }) {
  const parts = [blocks.opening];
  if (blocks.snapshot) parts.push(blocks.snapshot);
  parts.push("La señal central.", blocks.central);
  if (hasNational) parts.push("En Chile.", blocks.chile);
  if (hasMarkets) parts.push("Ahora, mercados.", blocks.markets);
  parts.push("Qué seguir durante la jornada.", blocks.watch, blocks.closing);
  return parts.filter(Boolean).join("\n\n");
}

function sameEditorialIdentity(existing, plan) {
  const existingInternational =
    existing?.sourceIds?.international ?? existing?.sourceIds?.general ?? null;
  const planInternational =
    plan?.sourceIds?.international ?? plan?.sourceIds?.general ?? null;
  return (
    existing?.scriptVersion === AUDIO_COVER_SCRIPT_VERSION &&
    existing?.date === plan?.date &&
    existingInternational === planInternational &&
    existing?.sourceIds?.national === (plan?.sourceIds?.national ?? null) &&
    existing?.sourceIds?.markets === (plan?.sourceIds?.markets ?? null)
  );
}

export function upgradeCoverPlanToV13(
  plan,
  { existingCover = null, generatedAt = new Date() } = {},
) {
  if (!plan?.date || !plan?.script || !plan?.sourceIds?.general) {
    throw new Error("Portada V13: plan base inválido.");
  }

  const hasNational = Boolean(plan.sourceIds.national);
  const hasMarkets = Boolean(plan.sourceIds.markets);
  const blocks = parseCoverScript(plan.script, { hasNational, hasMarkets });
  const spokenTime = formatGenerationTimeSpeech(generatedAt);
  blocks.opening = blocks.opening.includes("Estas son las señales")
    ? blocks.opening.replace(
        "Estas son las señales",
        `${spokenTime} Estas son las señales`,
      )
    : `${blocks.opening} ${spokenTime}`;
  blocks.snapshot = upgradeDollarSentence(blocks.snapshot);

  const script = buildCoverScript(blocks, { hasNational, hasMarkets });
  const contract = validateCoverContract({
    blocks: {
      snapshot: blocks.snapshot,
      central: blocks.central,
      chile: blocks.chile,
      markets: blocks.markets,
      watch: blocks.watch,
      closing: blocks.closing,
    },
    fullScript: script,
    hasNational,
    hasMarkets,
  });
  const wordCount = countWords(script);
  const generatedAtIso =
    generatedAt instanceof Date
      ? generatedAt.toISOString()
      : new Date(generatedAt).toISOString();

  return {
    ...plan,
    scriptVersion: AUDIO_COVER_SCRIPT_VERSION,
    needsGeneration: Boolean(
      contract.valid && !sameEditorialIdentity(existingCover, plan),
    ),
    generationBlockedReason: contract.valid ? null : "cover_contract_failed",
    summary:
      "Briefing de Portada V13: snapshot con hora de corte hablada, dólar con dirección explícita, señal central, Chile, mercados y variables a seguir.",
    presentationAt: generatedAtIso,
    presentationTimeZone: AUDIO_PRESENTATION_TIME_ZONE,
    wordCount,
    estimatedDurationSeconds: Math.max(60, Math.round((wordCount / 125) * 60)),
    contract,
    script,
  };
}
