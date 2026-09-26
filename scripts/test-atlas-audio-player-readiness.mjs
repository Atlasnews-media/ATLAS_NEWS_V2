import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = "../src/components/AtlasAudioPlayer.astro";
const componentPath = new URL(component, import.meta.url);
const source = await readFile(componentPath, "utf8");

assert.ok(source.includes('data-waveform-state={visualVariant === "radio" ? "loading" : undefined}'));
assert.ok(source.includes("waveSurfer = WaveSurfer.create({"));
assert.ok(!source.includes('content: "Preparando audio…";'));

const stateStart = source.indexOf("const setWaveformState");
const stateEnd = source.indexOf("const resolveSource", stateStart);
assert.ok(stateStart >= 0);
assert.ok(stateEnd > stateStart);

const stateBlock = source.slice(stateStart, stateEnd);
assert.ok(stateBlock.includes('state === "ready"'));
assert.ok(!stateBlock.includes('state === "loading" ||'));

const loadingSelector =
  '.atlas-audio-player--radio[data-waveform-state="loading"]';
const loadingStart = source.indexOf(loadingSelector);
const readySelector =
  '.atlas-audio-player--radio[data-waveform-ready="true"]';
const loadingEnd = source.indexOf(readySelector, loadingStart);

assert.ok(loadingStart >= 0);
assert.ok(loadingEnd > loadingStart);

const loadingCss = source.slice(loadingStart, loadingEnd);
assert.ok(loadingCss.includes(".atlas-audio-waveform--fallback"));
assert.ok(loadingCss.includes("opacity: 1;"));

console.log("ATLAS NEWS RADIO readiness contract OK.");
