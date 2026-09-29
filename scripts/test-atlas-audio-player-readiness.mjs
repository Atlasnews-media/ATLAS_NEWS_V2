import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/components/AtlasAudioPlayer.astro", import.meta.url),
  "utf8",
);

assert.match(source, /WaveSurfer\.create/);
assert.match(source, /peaks: waveform\.peaks/);
assert.match(source, /duration: waveform\.durationSeconds/);
assert.match(source, /\.replace\(\/\\\.mp3\$\/, "\.peaks\.json"\)/);
assert.match(source, /fetch\(waveformUrl, \{ cache: "force-cache" \}\)/);
assert.doesNotMatch(source, /Preparando audio/);
assert.doesNotMatch(source, /state === "loading" \|\|/);
assert.doesNotMatch(
  source,
  /data-waveform-state="loading"\]\s*\.atlas-audio-waveform--fallback/,
);
assert.match(
  source,
  /data-waveform-state="fallback"\]\s*\.atlas-audio-waveform--fallback\s*\{\s*opacity:\s*1;/,
);

console.log("ATLAS NEWS RADIO precomputed waveform contract OK.");
