import assert from "node:assert/strict";

import {
  formatDollarVariationSpeech,
  formatGenerationTimeSpeech,
} from "./audio-cover-presentation.mjs";

assert.equal(
  formatGenerationTimeSpeech("2026-09-16T10:25:00Z"),
  "Son las siete veinticinco de la mañana.",
);
assert.equal(
  formatGenerationTimeSpeech("2026-09-16T12:00:00Z"),
  "Son las nueve de la mañana.",
);
assert.equal(
  formatGenerationTimeSpeech("2026-09-16T17:05:00Z"),
  "Son las dos cinco de la tarde.",
);

assert.equal(
  formatDollarVariationSpeech(0.42),
  "con una variación positiva de 0,42% frente a la jornada hábil anterior",
);
assert.equal(
  formatDollarVariationSpeech(-0.42),
  "con una variación negativa de 0,42% frente a la jornada hábil anterior",
);
assert.equal(
  formatDollarVariationSpeech(0.004),
  "sin variación relevante frente a la jornada hábil anterior",
);
assert.equal(formatDollarVariationSpeech(null), null);

console.log("Audio Portada V13: hora y dirección del dólar OK.");
