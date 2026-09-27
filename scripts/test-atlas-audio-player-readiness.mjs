import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/components/AtlasAudioPlayer.astro", import.meta.url),
  "utf8",
);

assert.match(source, /WaveSurfer\.create/);
assert.doesNotMatch(source, /Preparando audio/);
assert.doesNotMatch(source, /state === "loading" \|\|/);
assert.match(source, /data-waveform-state="loading"[\s\S]*opacity: 1;/);

console.log("ATLAS NEWS RADIO readiness contract OK.");
