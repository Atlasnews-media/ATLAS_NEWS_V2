import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/components/AtlasAudioPlayer.astro", import.meta.url),
  "utf8",
);

assert.match(source, /WaveSurfer\.create/);
assert.doesNotMatch(source, /Preparando audio/);
assert.doesNotMatch(source, /state === "loading" \|\|/);
assert.match(source, /data-waveform-state=.*"idle"/);
assert.match(source, /aria-busy=.*"false"/);
assert.match(source, /data-waveform-state="idle"[\s\S]*opacity: 1;/);

const mounts = source.match(/void mountWaveform\(\);/g) ?? [];
assert.equal(mounts.length, 1);

const playStart = source.indexOf('audio.addEventListener("play"');
const pauseStart = source.indexOf('audio.addEventListener("pause"', playStart);
assert.ok(playStart >= 0);
assert.ok(pauseStart > playStart);
assert.match(source.slice(playStart, pauseStart), /mountWaveform/);

console.log("ATLAS NEWS RADIO progressive WaveSurfer contract OK.");
