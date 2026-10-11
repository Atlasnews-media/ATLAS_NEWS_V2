import fs from "node:fs/promises";
import path from "node:path";
import { executeJev } from "../jev-core.mjs";

export function radarToCore(request) {
  if (request.experimentMode !== "RADAR_JEV" || request.mode !== "LAB_ONLY" || request.productionWritesAllowed !== false) throw new Error("contrato RADAR_JEV LAB inválido");
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(request.radarRunId ?? "")) throw new Error("radarRunId inválido");
  return {
    schemaVersion: 1, requestId: request.radarRunId, consumer: "LAB_RADAR", sourceCommit: request.sourceMainCommit,
    editorialDate: request.editorialDate,
    candidates: (request.candidateReviews ?? []).map((c) => ({
      candidateKey:c.candidateKey, section:c.section??null, title:c.title, description:c.description,
      sourceName:c.sourceName??null, publishedAt:c.publishedAt??null, historicalPriors:c.priors??[],
    })),
  };
}
export function coreToRadar(request, result) {
  if (result.requestId !== request.radarRunId || result.sourceCommit !== request.sourceMainCommit || result.editorialDate !== request.editorialDate) throw new Error("identity mismatch CORE→RADAR");
  return {
    schemaVersion:1, radarRunId:request.radarRunId, sourceMainCommit:request.sourceMainCommit, radarStateVersion:request.radarStateVersion,
    editorialDate:request.editorialDate, experimentMode:"RADAR_JEV", mode:"LAB_ONLY", productionWritesAllowed:false,
    engine:result.engine, modelRequested:result.modelRequested, modelObserved:result.modelObserved, thresholdsApplied:result.thresholdsApplied,
    generatedAt:result.generatedAt, judgments:result.judgments, telemetry:result.telemetry, status:result.status,
  };
}
export async function runLabAdapter(request, options) { const core=await executeJev(radarToCore(request),options); return coreToRadar(request,core); }

if (process.argv[1]?.endsWith("lab-radar-adapter.mjs")) {
  const get=(n)=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:null};
  const input=get("--request"), output=get("--output");
  if (!input || !output) throw new Error("uso: lab-radar-adapter.mjs --request FILE --output FILE");
  const request=JSON.parse(await fs.readFile(input,"utf8"));
  const result=await runLabAdapter(request);
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,JSON.stringify(result,null,2)+"\n");
  console.log(`JEV LAB ADAPTER PASS — ${result.radarRunId}`);
}
