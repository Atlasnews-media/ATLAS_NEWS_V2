import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/components/DailyAudio.astro", import.meta.url),
  "utf8",
);

assert.match(
  source,
  /const speculativePath = `\/audio\/\$\{expectedDate\}-resumen-diario\.mp3`;/,
);
assert.match(source, /fetch\(`\/audio\/latest\.json\?v=\$\{Date\.now\(\)\}`/);
assert.match(source, /\{ cache: "no-store" \}/);

const speculativeIndex = source.indexOf("const speculativePath");
const loadIndex = source.indexOf("player.load();", speculativeIndex);
const metadataFetchIndex = source.indexOf(
  "fetch(`/audio/latest.json",
  speculativeIndex,
);

assert.ok(speculativeIndex >= 0);
assert.ok(loadIndex > speculativeIndex);
assert.ok(metadataFetchIndex > loadIndex);

assert.match(
  source,
  /metadata\?\.status !== "published"[\s\S]*metadata\?\.date !== expectedDate[\s\S]*!metadata\?\.path/,
);
assert.match(source, /root\.dataset\.audioContentKey = contentKey;/);
assert.match(source, /root\.hidden = false;/);

const revealIndex = source.lastIndexOf("root.hidden = false;");
const contentKeyIndex = source.lastIndexOf(
  "root.dataset.audioContentKey = contentKey;",
);
assert.ok(contentKeyIndex >= 0);
assert.ok(revealIndex > contentKeyIndex);

console.log("Daily audio parallel resolution contract OK.");
