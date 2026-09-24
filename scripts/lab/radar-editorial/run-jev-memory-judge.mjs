import fs from "node:fs/promises";
import path from "node:path";
import { createTypeSafeJevClient } from "./typesafe-jev-client.mjs";

function fail(message) {
  throw new Error(message);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function assertIdentity(request) {
  if (request.schemaVersion !== 1) fail("jev-request.schemaVersion debe ser 1");
  if (request.experimentMode !== "RADAR_JEV") fail("jev-request.experimentMode debe ser RADAR_JEV");
  if (request.mode !== "LAB_ONLY") fail("jev-request.mode debe ser LAB_ONLY");
  if (request.productionWritesAllowed !== false) fail("jev-request.productionWritesAllowed debe ser false");
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(request.radarRunId ?? "")) fail("jev-request.radarRunId inválido");
  if (!/^[0-9a-f]{40}$/.test(request.sourceMainCommit ?? "")) fail("jev-request.sourceMainCommit inválido");
  if (!/^radar-state-v[1-9][0-9]*$/.test(request.radarStateVersion ?? "")) fail("jev-request.radarStateVersion inválido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.editorialDate ?? "")) fail("jev-request.editorialDate inválido");
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") fail("candidateReview inválido");
  if (typeof candidate.candidateKey !== "string" || !candidate.candidateKey) fail("candidateReview.candidateKey inválido");
  if (typeof candidate.title !== "string" || !candidate.title.trim()) fail(`${candidate.candidateKey}: title inválido`);
  if (typeof candidate.description !== "string" || candidate.description.length < 20) fail(`${candidate.candidateKey}: description inválida`);
  if (!Array.isArray(candidate.priors)) fail(`${candidate.candidateKey}: priors debe ser lista`);
  return {
    candidateKey: candidate.candidateKey,
    section: candidate.section ?? null,
    title: candidate.title,
    description: candidate.description,
    sourceName: candidate.sourceName ?? null,
    publishedAt: candidate.publishedAt ?? null,
    priors: candidate.priors,
  };
}

function questions() {
  return {
    event_relation: {
      type: "choice",
      instructions: "Judge the relationship between the current candidate event and the supplied historical priors. Choose one option only.",
      criteria: {
        SAME_EVENT: "The candidate concerns the same underlying event already represented in the priors.",
        NEW_EVENT: "The candidate concerns a materially distinct event, even if topic or entities overlap.",
        UNRELATED: "The candidate is not meaningfully related to the supplied priors.",
        UNCERTAIN: "The supplied evidence is insufficient to resolve the event relationship.",
      },
    },
    information_relation: {
      type: "choice",
      instructions: "Judge the information contribution of the current candidate relative to the supplied priors. Event identity and information contribution are separate judgments.",
      criteria: {
        NEW: "The candidate contributes substantially new information not present in the priors.",
        CONTINUATION: "The candidate continues an existing story without a material change in the core facts.",
        MEANINGFUL_UPDATE: "The candidate materially changes or advances the known situation.",
        REPETITION: "The candidate substantially repeats information already present in the priors.",
        CONTRADICTION: "The candidate materially contradicts a prior fact or claim.",
        UNCERTAIN: "The supplied evidence is insufficient to resolve the information relationship.",
      },
    },
    adds_new_information: {
      type: "noul",
      instructions: "Does the candidate add materially new information relative to the supplied priors?",
    },
    historical_context_needed: {
      type: "noul",
      instructions: "Would the candidate be materially easier to understand if the supplied historical context were surfaced?",
    },
    angle_repeated: {
      type: "noul",
      instructions: "Does the candidate substantially repeat the same essential editorial angle or thesis used in the supplied priors, rather than merely sharing a topic?",
    },
  };
}

function answerChoice(answer) {
  return {
    value: typeof answer?.choice === "string" ? answer.choice : null,
    confidence: typeof answer?.confidence === "number" ? answer.confidence : null,
    probabilities: answer?.probabilities && typeof answer.probabilities === "object" ? answer.probabilities : null,
  };
}

function answerNoul(answer) {
  return {
    probability: typeof answer?.noul === "number" ? answer.noul : null,
    confidence: typeof answer?.confidence === "number" ? answer.confidence : null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const requestIndex = args.indexOf("--request");
  const outputIndex = args.indexOf("--output");
  if (requestIndex < 0 || outputIndex < 0) fail("uso: run-jev-memory-judge.mjs --request FILE --output FILE");

  const requestFile = args[requestIndex + 1];
  const outputFile = args[outputIndex + 1];
  const request = await readJson(requestFile);
  assertIdentity(request);

  if (!Array.isArray(request.candidateReviews) || request.candidateReviews.length < 1) {
    fail("jev-request.candidateReviews debe contener al menos un candidato");
  }

  const candidates = request.candidateReviews.map(normalizeCandidate);
  const client = createTypeSafeJevClient({ model: "jev-latest", timeoutMs: 30_000, maxRetries: 1 });
  const judgments = [];
  const telemetry = [];
  let modelObserved = null;

  for (const candidate of candidates) {
    const result = await client.runQuestions({
      state: { currentCandidate: candidate, historicalPriors: candidate.priors },
      questions: questions(),
    });

    telemetry.push({
      candidateKey: candidate.candidateKey,
      status: result.status,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
      usage: result.payload?.usage ?? null,
      error: result.error,
    });

    if (!result.ok || !result.payload?.answers) {
      fail(`JEV no devolvió respuesta válida para ${candidate.candidateKey}: ${JSON.stringify(result.error)}`);
    }

    modelObserved ??= typeof result.payload.model === "string" ? result.payload.model : null;
    const answers = result.payload.answers;
    for (const key of ["event_relation", "information_relation", "adds_new_information", "historical_context_needed", "angle_repeated"]) {
      if (!answers[key]) fail(`${candidate.candidateKey}: falta answer ${key}`);
    }

    judgments.push({
      candidateKey: candidate.candidateKey,
      section: candidate.section,
      eventRelation: answerChoice(answers.event_relation),
      informationRelation: answerChoice(answers.information_relation),
      addsNewInformation: answerNoul(answers.adds_new_information),
      historicalContextNeeded: answerNoul(answers.historical_context_needed),
      angleRepeated: answerNoul(answers.angle_repeated),
    });
  }

  const output = {
    schemaVersion: 1,
    radarRunId: request.radarRunId,
    sourceMainCommit: request.sourceMainCommit,
    radarStateVersion: request.radarStateVersion,
    editorialDate: request.editorialDate,
    experimentMode: "RADAR_JEV",
    mode: "LAB_ONLY",
    productionWritesAllowed: false,
    engine: "JEV_TYPESAFE",
    modelRequested: "jev-latest",
    modelObserved,
    thresholdsApplied: false,
    generatedAt: new Date().toISOString(),
    judgments,
    telemetry,
    status: "PASS",
  };

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`JEV MEMORY PASS — ${request.radarRunId} · ${judgments.length} candidate(s)`);
}

main().catch((error) => {
  console.error(`JEV MEMORY FAIL: ${error.code ?? error.name ?? "Error"}: ${error.message}`);
  process.exit(1);
});
