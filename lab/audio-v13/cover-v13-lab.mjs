import assert from "node:assert/strict";

const DEFAULT_TIME_ZONE = "America/Santiago";
const FLAT_THRESHOLD = 0.01;

const HOURS = {
  0: "doce",
  1: "una",
  2: "dos",
  3: "tres",
  4: "cuatro",
  5: "cinco",
  6: "seis",
  7: "siete",
  8: "ocho",
  9: "nueve",
  10: "diez",
  11: "once",
  12: "doce",
};

const UNITS = [
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
];

const TEENS = {
  10: "diez",
  11: "once",
  12: "doce",
  13: "trece",
  14: "catorce",
  15: "quince",
  16: "dieciséis",
  17: "diecisiete",
  18: "dieciocho",
  19: "diecinueve",
  20: "veinte",
  21: "veintiuno",
  22: "veintidós",
  23: "veintitrés",
  24: "veinticuatro",
  25: "veinticinco",
  26: "veintiséis",
  27: "veintisiete",
  28: "veintiocho",
  29: "veintinueve",
};

const TENS = {
  30: "treinta",
  40: "cuarenta",
  50: "cincuenta",
};

function minuteWords(value) {
  const minute = Number(value);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new RangeError("minute debe estar entre 0 y 59");
  }
  if (minute === 0) return "";
  if (minute < 10) return UNITS[minute];
  if (minute <= 29) return TEENS[minute];
  const tens = Math.floor(minute / 10) * 10;
  const unit = minute % 10;
  return unit === 0 ? TENS[tens] : `${TENS[tens]} y ${UNITS[unit]}`;
}

function generationClockParts(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { hour: Number(map.hour), minute: Number(map.minute) };
}

function daypart(hour24) {
  if (hour24 >= 5 && hour24 < 12) return "de la mañana";
  if (hour24 >= 12 && hour24 < 20) return "de la tarde";
  return "de la noche";
}

export function formatGenerationTime(date, timeZone = DEFAULT_TIME_ZONE) {
  const { hour, minute } = generationClockParts(date, timeZone);
  const hour12 = hour % 12 || 12;
  const hourText = HOURS[hour12];
  const minuteText = minuteWords(minute);
  const prefix = hour12 === 1 ? "Es la" : "Son las";
  const minuteClause = minuteText ? ` ${minuteText}` : "";
  return `${prefix} ${hourText}${minuteClause} ${daypart(hour)}.`;
}

function formatPercent(value) {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(value)));
}

export function dollarVariationPhrase(changePercent) {
  if (changePercent === null || changePercent === undefined || changePercent === "") {
    return null;
  }
  const change = Number(changePercent);
  if (!Number.isFinite(change)) return null;
  if (Math.abs(change) < FLAT_THRESHOLD) {
    return "sin variación relevante frente a la jornada hábil anterior";
  }
  return change > 0
    ? `con una variación positiva de ${formatPercent(change)}% frente a la jornada hábil anterior`
    : `con una variación negativa de ${formatPercent(change)}% frente a la jornada hábil anterior`;
}

export function composeOpening({ dateText, generatedAt }) {
  return `ATLAS NEWS. Briefing de la mañana del ${dateText}. ${formatGenerationTime(generatedAt)} Estas son las señales que conviene tener presentes hoy.`;
}

export function composeDollarSentence({ pesosText, changePercent }) {
  const variation = dollarVariationPhrase(changePercent);
  return `En monedas, el dólar observado marcó ${pesosText}${variation ? `, ${variation}` : ""}.`;
}

function runLab() {
  const sampleDate = "miércoles 16 de septiembre de 2026";
  const generatedAt = new Date("2026-09-16T10:25:00Z"); // 07:25 America/Santiago

  const opening = composeOpening({ dateText: sampleDate, generatedAt });
  const dollarPositive = composeDollarSentence({
    pesosText: "932 pesos con 40 centavos",
    changePercent: 0.42,
  });
  const dollarNegative = composeDollarSentence({
    pesosText: "932 pesos con 40 centavos",
    changePercent: -0.42,
  });
  const dollarFlat = composeDollarSentence({
    pesosText: "932 pesos con 40 centavos",
    changePercent: 0.004,
  });

  assert.equal(
    formatGenerationTime(generatedAt),
    "Son las siete veinticinco de la mañana.",
  );
  assert.equal(
    dollarVariationPhrase(0.42),
    "con una variación positiva de 0,42% frente a la jornada hábil anterior",
  );
  assert.equal(
    dollarVariationPhrase(-0.42),
    "con una variación negativa de 0,42% frente a la jornada hábil anterior",
  );
  assert.equal(
    dollarVariationPhrase(0.004),
    "sin variación relevante frente a la jornada hábil anterior",
  );
  assert.equal(formatGenerationTime(new Date("2026-09-16T12:00:00Z")), "Son las nueve de la mañana.");

  console.log("A/B textual — Portada V13 LAB");
  console.log("");
  console.log("APERTURA PROPUESTA");
  console.log(opening);
  console.log("");
  console.log("DÓLAR — POSITIVO");
  console.log(dollarPositive);
  console.log("");
  console.log("DÓLAR — NEGATIVO");
  console.log(dollarNegative);
  console.log("");
  console.log("DÓLAR — PLANO");
  console.log(dollarFlat);
  console.log("");
  console.log("LAB OK: 5 verificaciones deterministas superadas.");
}

if (import.meta.url === `file://${process.argv[1]}`) runLab();
