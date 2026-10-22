import { createTypeSafeJevClient } from "./typesafe-jev-client.mjs";

export const JEV_ENGINE = "JEV_TYPESAFE";
export const JEV_MODEL = "jev-latest";
const EVENT = new Set(["SAME_EVENT","NEW_EVENT","UNRELATED","UNCERTAIN"]);
const INFO = new Set(["NEW","CONTINUATION","MEANINGFUL_UPDATE","REPETITION","CONTRADICTION","UNCERTAIN"]);

function fail(message) { throw new Error(message); }
function nonEmpty(value, label) { if (typeof value !== "string" || !value.trim()) fail(`${label} inválido`); return value; }

export function jevQuestions() {
  return {
    event_relation: { type: "choice", instructions: "Judge the relationship between the current candidate event and the supplied historical priors. Choose one option only.", criteria: {
      SAME_EVENT: "The candidate concerns the same underlying event already represented in the priors.",
      NEW_EVENT: "The candidate concerns a materially distinct event, even if topic or entities overlap.",
      UNRELATED: "The candidate is not meaningfully related to the supplied priors.",
      UNCERTAIN: "The supplied evidence is insufficient to resolve the event relationship.",
    }},
    information_relation: { type: "choice", instructions: "Judge the information contribution of the current candidate relative to the supplied priors. Event identity and information contribution are separate judgments.", criteria: {
      NEW: "The candidate contributes substantially new information not present in the priors.",
      CONTINUATION: "The candidate continues an existing story without a material change in the core facts.",
      MEANINGFUL_UPDATE: "The candidate materially changes or advances the known situation.",
      REPETITION: "The candidate substantially repeats information already present in the priors.",
      CONTRADICTION: "The candidate materially contradicts a prior fact or claim.",
      UNCERTAIN: "The supplied evidence is insufficient to resolve the information relationship.",
    }},
    adds_new_information: { type: "noul", instructions: "Does the candidate add materially new information relative to the supplied priors?" },
    historical_context_needed: { type: "noul", instructions: "Would the candidate be materially easier to understand if the supplied historical context were surfaced?" },
    angle_repeated: { type: "noul", instructions: "Does the candidate substantially repeat the same essential editorial angle or thesis used in the supplied priors, rather than merely sharing a topic?" },
  };
}

export function validateJevRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) fail("JEV request inválido");
  if (request.schemaVersion !== 1) fail("schemaVersion debe ser 1");
  nonEmpty(request.requestId, "requestId");
  nonEmpty(request.consumer, "consumer");
  if (!/^[0-9a-f]{40}$/.test(request.sourceCommit ?? "")) fail("sourceCommit inválido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.editorialDate ?? "")) fail("editorialDate inválido");
  if (!Array.isArray(request.candidates) || request.candidates.length < 1) fail("candidates debe contener al menos un candidato");
  const keys = new Set();
  for (const candidate of request.candidates) {
    if (!candidate || typeof candidate !== "object") fail("candidate inválido");
    nonEmpty(candidate.candidateKey, "candidateKey");
    if (keys.has(candidate.candidateKey)) fail(`candidateKey duplicado: ${candidate.candidateKey}`);
    keys.add(candidate.candidateKey);
    nonEmpty(candidate.title, `${candidate.candidateKey}.title`);
    if (typeof candidate.description !== "string" || candidate.description.length < 20) fail(`${candidate.candidateKey}.description inválida`);
    if (!Array.isArray(candidate.historicalPriors)) fail(`${candidate.candidateKey}.historicalPriors debe ser lista`);
  }
  return request;
}

function choice(answer, allowed, label) {
  const value = typeof answer?.choice === "string" ? answer.choice : null;
  if (!allowed.has(value)) fail(`${label}: choice inválido`);
  return { value, confidence: typeof answer?.confidence === "number" ? answer.confidence : null, probabilities: answer?.probabilities && typeof answer.probabilities === "object" ? answer.probabilities : null };
}
function noul(answer, label) {
  if (typeof answer?.noul !== "number") fail(`${label}: noul inválido`);
  return { probability: answer.noul, confidence: typeof answer?.confidence === "number" ? answer.confidence : null };
}

export async function executeJev(request, { client } = {}) {
  validateJevRequest(request);
  const jev = client ?? createTypeSafeJevClient({ model: JEV_MODEL, timeoutMs: 30_000, maxRetries: 1 });
  const judgments = [], telemetry = [];
  let modelObserved = null;
  for (const candidate of request.candidates) {
    const currentCandidate = {
      candidateKey: candidate.candidateKey, section: candidate.section ?? null, title: candidate.title,
      description: candidate.description, sourceName: candidate.sourceName ?? null, publishedAt: candidate.publishedAt ?? null,
    };
    const result = await jev.runQuestions({ state: { currentCandidate, historicalPriors: candidate.historicalPriors }, questions: jevQuestions() });
    telemetry.push({ candidateKey: candidate.candidateKey, status: result.status, latencyMs: result.latencyMs, attempts: result.attempts, usage: result.payload?.usage ?? null, error: result.error });
    if (!result.ok || !result.payload?.answers) fail(`JEV no devolvió respuesta válida para ${candidate.candidateKey}: ${JSON.stringify(result.error)}`);
    modelObserved ??= typeof result.payload.model === "string" ? result.payload.model : null;
    const a = result.payload.answers;
    for (const key of ["event_relation","information_relation","adds_new_information","historical_context_needed","angle_repeated"]) if (!a[key]) fail(`${candidate.candidateKey}: falta answer ${key}`);
    judgments.push({
      candidateKey: candidate.candidateKey, section: candidate.section ?? null,
      eventRelation: choice(a.event_relation, EVENT, `${candidate.candidateKey}.event_relation`),
      informationRelation: choice(a.information_relation, INFO, `${candidate.candidateKey}.information_relation`),
      addsNewInformation: noul(a.adds_new_information, `${candidate.candidateKey}.adds_new_information`),
      historicalContextNeeded: noul(a.historical_context_needed, `${candidate.candidateKey}.historical_context_needed`),
      angleRepeated: noul(a.angle_repeated, `${candidate.candidateKey}.angle_repeated`),
    });
  }
  return {
    schemaVersion: 1, requestId: request.requestId, sourceCommit: request.sourceCommit, editorialDate: request.editorialDate,
    consumer: request.consumer, engine: JEV_ENGINE, modelRequested: JEV_MODEL, modelObserved, thresholdsApplied: false,
    generatedAt: new Date().toISOString(), judgments, telemetry, status: "PASS",
  };
}
