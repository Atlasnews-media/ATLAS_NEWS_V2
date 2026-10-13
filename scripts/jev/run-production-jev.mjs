import fs from "node:fs/promises";
import path from "node:path";
import { createTypeSafeJevClient } from "../lab/radar-editorial/typesafe-jev-client.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function nonempty(s) {
  return typeof s === "string" && s.trim().length > 0;
}
const choices = {
  event_relation: ["SAME_EVENT", "NEW_EVENT", "UNRELATED", "UNCERTAIN"],
  information_relation: [
    "NEW",
    "CONTINUATION",
    "MEANINGFUL_UPDATE",
    "REPETITION",
    "CONTRADICTION",
    "UNCERTAIN",
  ],
};
const questions = {
  event_relation: {
    type: "choice",
    instructions:
      "Compare the current candidate with published historical priors. Identify whether it is the same underlying event.",
    criteria: Object.fromEntries(
      choices.event_relation.map((k) => [
        k,
        k === "SAME_EVENT"
          ? "Same underlying event"
          : k === "NEW_EVENT"
            ? "Materially distinct event"
            : k === "UNRELATED"
              ? "No meaningful relationship"
              : "Insufficient evidence",
      ]),
    ),
  },
  information_relation: {
    type: "choice",
    instructions:
      "Evaluate the material informational contribution compared with published priors; do not confuse topic overlap with repetition.",
    criteria: {
      NEW: "New material information",
      CONTINUATION: "Same story without material change",
      MEANINGFUL_UPDATE: "Material change to known story",
      REPETITION: "Substantially repeats prior information",
      CONTRADICTION: "Contradicts a prior fact",
      UNCERTAIN: "Insufficient evidence",
    },
  },
  adds_new_information: {
    type: "noul",
    instructions:
      "Does the candidate add materially new information relative to the published priors?",
  },
  historical_context_needed: {
    type: "noul",
    instructions: "Would published historical context materially help readers?",
  },
  angle_repeated: {
    type: "noul",
    instructions:
      "Does the candidate repeat the prior editorial angle, rather than merely sharing a topic?",
  },
};
const choice = (a) => ({
  value: a?.choice ?? null,
  confidence: a?.confidence ?? null,
});
const noul = (a) => ({
  probability: a?.noul ?? null,
  confidence: a?.confidence ?? null,
});
async function main() {
  const args = process.argv.slice(2),
    i = args.indexOf("--request"),
    o = args.indexOf("--output");
  assert(
    i >= 0 && o >= 0 && args[i + 1] && args[o + 1],
    "usage: --request FILE --output FILE",
  );
  const request = JSON.parse(await fs.readFile(args[i + 1], "utf8"));
  assert(
    request.schemaVersion === 1 && request.mode === "PRODUCTION_JEV",
    "production request identity invalid",
  );
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(request.editorialDate ?? ""),
    "editorialDate invalid",
  );
  assert(
    ["morning", "midday"].includes(request.editionSlot),
    "editionSlot invalid",
  );
  assert(
    /^[0-9a-f]{40}$/.test(request.sourceCommit ?? ""),
    "sourceCommit invalid",
  );
  assert(
    nonempty(request.requestId) &&
      /^[A-Za-z0-9._-]{8,100}$/.test(request.requestId),
    "requestId invalid",
  );
  assert(
    Array.isArray(request.candidates) &&
      request.candidates.length >= 1 &&
      request.candidates.length <= 30,
    "candidates invalid",
  );
  const keys = new Set(),
    judgments = [],
    telemetry = [];
  const client = createTypeSafeJevClient({
    model: "jev-latest",
    timeoutMs: 30000,
    maxRetries: 1,
  });
  for (const c of request.candidates) {
    assert(
      nonempty(c.candidateKey) && !keys.has(c.candidateKey),
      "duplicate or missing candidateKey",
    );
    keys.add(c.candidateKey);
    assert(
      nonempty(c.title) &&
        nonempty(c.description) &&
        c.description.length >= 20,
      "candidate text invalid",
    );
    assert(
      Array.isArray(c.priors),
      "historical priors required (empty list allowed)",
    );
    for (const p of c.priors)
      assert(
        nonempty(p.title) && nonempty(p.publishedAt) && nonempty(p.sourcePath),
        "prior lacks published evidence",
      );
    const result = await client.runQuestions({
      state: { currentCandidate: c, historicalPriors: c.priors },
      questions,
    });
    telemetry.push({
      candidateKey: c.candidateKey,
      status: result.status,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
      error: result.error,
      usage: result.payload?.usage ?? null,
    });
    assert(
      result.ok && result.payload?.answers,
      "TypeSafe JEV failed for " +
        c.candidateKey +
        ": " +
        JSON.stringify(result.error),
    );
    const a = result.payload.answers;
    for (const k of Object.keys(questions))
      assert(a[k], "missing JEV answer " + k);
    for (const k of Object.keys(choices))
      assert(choices[k].includes(a[k].choice), "invalid choice " + k);
    for (const k of [
      "adds_new_information",
      "historical_context_needed",
      "angle_repeated",
    ])
      assert(
        typeof a[k].noul === "number" && a[k].noul >= 0 && a[k].noul <= 1,
        "invalid probability " + k,
      );
    judgments.push({
      candidateKey: c.candidateKey,
      eventRelation: choice(a.event_relation),
      informationRelation: choice(a.information_relation),
      addsNewInformation: noul(a.adds_new_information),
      historicalContextNeeded: noul(a.historical_context_needed),
      angleRepeated: noul(a.angle_repeated),
    });
  }
  const output = {
    schemaVersion: 1,
    mode: "PRODUCTION_JEV",
    requestId: request.requestId,
    editorialDate: request.editorialDate,
    editionSlot: request.editionSlot,
    sourceCommit: request.sourceCommit,
    engine: "JEV_TYPESAFE",
    modelRequested: "jev-latest",
    status: "PASS",
    thresholdsApplied: false,
    generatedAt: new Date().toISOString(),
    judgments,
    telemetry,
  };
  await fs.mkdir(path.dirname(args[o + 1]), { recursive: true });
  await fs.writeFile(args[o + 1], JSON.stringify(output, null, 2) + "\n");
  console.log("PRODUCTION JEV PASS", request.requestId, judgments.length);
}
main().catch((e) => {
  console.error("PRODUCTION JEV FAIL:", e.message);
  process.exitCode = 1;
});
