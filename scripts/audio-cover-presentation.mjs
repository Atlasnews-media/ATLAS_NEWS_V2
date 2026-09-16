export const AUDIO_PRESENTATION_TIME_ZONE = "America/Santiago";

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
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
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
  if (changePercent === null || changePercent === undefined || changePercent === "") {
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
