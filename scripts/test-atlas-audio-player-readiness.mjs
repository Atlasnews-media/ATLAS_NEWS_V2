import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const componentPath = new URL(
  "../src/components/AtlasAudioPlayer.astro",
  import.meta.url,
);
const source = await readFile(componentPath, "utf8");

assert.ok(
  source.includes(
    'data-waveform-state={visualVariant === "radio" ? "loading" : undefined}',
  ),
  "El player radio debe conservar el estado loading para WaveSurfer.",
);
assert.ok(
  source.includes('waveSurfer = WaveSurfer.create({'),
  "WaveSurfer debe seguir siendo parte de la implementación productiva.",
);
assert.ok(
  !source.includes('content: "Preparando audio…";'),
  'El estado loading no debe sustituir el player por "Preparando audio…".',
);

const waveformStateStart = source.indexOf("const setWaveformState");
const waveformStateEnd = source.indexOf(
  "const resolveSource",
  waveformStateStart,
);
assert.ok(waveformStateStart >= 0 && waveformStateEnd > waveformStateStart);
const waveformStateBlock = source.slice(waveformStateStart, waveformStateEnd);

assert.ok(
  waveformStateBlock.includes('state === "ready"'),
  "El range fallback debe deshabilitarse cuando la waveform real está lista.",
);
assert.ok(
  !waveformStateBlock.includes('state === "loading" ||'),
  "Cargar WaveSurfer no debe deshabilitar el seek fallback si hay metadata.",
);

assert.match(
  source,
  /data-waveform-state="loading"\]\s*\.atlas-audio-waveform--fallback,[\s\S]*?data-waveform-state="fallback"\]\s*\.atlas-audio-waveform--fallback\s*\{\s*opacity:\s*1;/,
  "La waveform CSS fallback debe permanecer visible durante loading y fallback.",
);

console.log("ATLAS NEWS RADIO: fallback funcional durante carga de WaveSurfer OK.");
