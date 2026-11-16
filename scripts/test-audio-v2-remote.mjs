import assert from "node:assert/strict";
import { verifyRemoteAudio } from "./verify-audio-v2-remote.mjs";

const date = "2026-11-16";
const sourceCommit = "a".repeat(40);
const published = (sourceId, scriptHash, section) => ({
  status: "published",
  sourceId,
  scriptHash,
  voiceProfileVersion: "alex-c-v1",
  fallbackUsed: false,
  durationSeconds: 155.1,
  path: "/audio/" + date + "-" + section + "-analysis.mp3",
});
const missing = () => ({
  status: "unavailable",
  sourceId: null,
  reason: "source_missing",
});

const plan = {
  date,
  sourceIds: { general: "general-16" },
  products: {
    international: {
      sourceId: "general-16",
      scriptHash: "intl-script",
      unavailableReason: null,
    },
    national: { sourceId: null, unavailableReason: "source_missing" },
    markets: { sourceId: null, unavailableReason: "source_missing" },
    cover: {
      needsGeneration: false,
      needsPeaks: false,
      unavailableReason: "cover_contract_failed",
    },
  },
};
const analysis = {
  date,
  sourceCommit,
  voiceProfileTarget: "alex-c-v1",
  international: published("general-16", "intl-script", "international"),
  national: missing(),
  markets: missing(),
};
const cover = {
  status: "published",
  date: "2026-11-15",
  path: "/audio/2026-11-15-resumen-diario.mp3",
  sourceIds: { general: "general-15" },
};
const input = { plan, analysis, cover, date, sourceCommit };

const partial = verifyRemoteAudio(input);
assert.deepEqual(partial.missing, ["national", "markets"]);
assert.equal(partial.paths.length, 2);
assert.ok(partial.paths.includes("audio/2026-11-15-resumen-diario.mp3"));

assert.throws(
  () =>
    verifyRemoteAudio({
      ...input,
      analysis: {
        ...analysis,
        national: { status: "unavailable", reason: "generation_failed" },
      },
    }),
  /ausencia de fuente/,
);

assert.throws(
  () =>
    verifyRemoteAudio({
      ...input,
      plan: {
        ...plan,
        products: {
          ...plan.products,
          national: {
            sourceId: "national-16",
            scriptHash: "national-script",
            unavailableReason: "script_missing",
          },
        },
      },
    }),
  /no puede producirse/,
);

assert.throws(
  () =>
    verifyRemoteAudio({
      ...input,
      analysis: { ...analysis, sourceCommit: "otro" },
    }),
  /commit esperados/,
);

assert.throws(
  () =>
    verifyRemoteAudio({
      ...input,
      analysis: {
        ...analysis,
        international: { ...analysis.international, fallbackUsed: true },
      },
    }),
  /voz requeridas/,
);

const fullPlan = {
  ...plan,
  products: {
    ...plan.products,
    national: {
      sourceId: "national-16",
      scriptHash: "national-script",
    },
    markets: {
      sourceId: "markets-16",
      scriptHash: "markets-script",
    },
    cover: { needsGeneration: true, unavailableReason: null },
  },
};
const fullAnalysis = {
  ...analysis,
  national: published("national-16", "national-script", "national"),
  markets: published("markets-16", "markets-script", "markets"),
};
const fullCover = {
  ...cover,
  date,
  sourceIds: { general: "general-16" },
  path: "/audio/2026-11-16-resumen-diario.mp3",
};

assert.deepEqual(
  verifyRemoteAudio({
    ...input,
    plan: fullPlan,
    analysis: fullAnalysis,
    cover: fullCover,
  }).missing,
  [],
);

assert.throws(
  () =>
    verifyRemoteAudio({
      ...input,
      plan: fullPlan,
      analysis: {
        ...fullAnalysis,
        markets: { status: "unavailable", reason: "generation_failed" },
      },
      cover: fullCover,
    }),
  /no quedó publicado/,
);

assert.throws(
  () =>
    verifyRemoteAudio({
      ...input,
      plan: fullPlan,
      analysis: fullAnalysis,
      cover,
    }),
  /Portada actual/,
);

console.log(
  "Contrato remoto Audio V2: parcial legítimo y completo válidos; fallos reales rechazados.",
);
