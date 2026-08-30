import assert from "node:assert/strict";

function validateDialogue(text) {
  const requiredSpeakers = new Set(["VOZ 1", "VOZ 2"]);
  const speakers = new Set();
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) throw new Error("diálogo vacío");

  for (const line of lines) {
    const match = line.match(/^(VOZ [12]):\s+(.+)$/);
    if (!match) throw new Error("línea inválida");
    speakers.add(match[1]);
  }

  for (const speaker of requiredSpeakers) {
    if (!speakers.has(speaker)) throw new Error(`falta ${speaker}`);
  }
}

assert.doesNotThrow(() =>
  validateDialogue("VOZ 1: Apertura.\nVOZ 2: Respuesta."),
);
assert.throws(() => validateDialogue("VOZ 1: Apertura.\nContinuación sin voz."));
assert.throws(() => validateDialogue("VOZ 1: Sólo una voz."));
assert.throws(() => validateDialogue("VOZ 3: Voz no permitida.\nVOZ 2: Respuesta."));

console.log("Audio V2 dialogue contract tests: PASS");
