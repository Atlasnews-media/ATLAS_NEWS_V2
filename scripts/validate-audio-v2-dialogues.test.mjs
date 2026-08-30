import assert from "node:assert/strict";
import { validateDialogue } from "./validate-audio-v2-dialogues.mjs";

assert.doesNotThrow(() =>
  validateDialogue("VOZ 1: Apertura.\nVOZ 2: Respuesta.", "valid"),
);
assert.throws(() =>
  validateDialogue("VOZ 1: Apertura.\nContinuación sin voz.", "continuation"),
);
assert.throws(() => validateDialogue("VOZ 1: Sólo una voz.", "missing-voice"));
assert.throws(() =>
  validateDialogue("VOZ 3: Voz no permitida.\nVOZ 2: Respuesta.", "unknown-voice"),
);

console.log("Audio V2 dialogue contract tests: PASS");
