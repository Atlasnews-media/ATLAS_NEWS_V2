import fs from "node:fs/promises";
import path from "node:path";
import { executeJev } from "../jev-core.mjs";

export function toCoreRequest(request) {
  if (!request || request.adapter !== "ATLAS_PRODUCTION_JEV_V1") throw new Error("adapter productivo inválido");
  if (typeof request.consumer !== "string" || !/^(T1|T2|T3|PRODUCTION_[A-Z0-9_-]+)$/.test(request.consumer)) throw new Error("consumer productivo inválido");
  const candidates = Array.isArray(request.candidates) ? request.candidates : request.candidate ? [request.candidate] : [];
  return {
    schemaVersion: 1, requestId: request.requestId, consumer: request.consumer, sourceCommit: request.sourceCommit,
    editorialDate: request.editorialDate,
    candidates: candidates.map((c) => ({ ...c, historicalPriors: c.historicalPriors ?? c.priors ?? [] })),
  };
}
export async function runProductionAdapter(request, options) { return executeJev(toCoreRequest(request), options); }

if (process.argv[1]?.endsWith("production-adapter.mjs")) {
  const get=(n)=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:null};
  const input=get("--request"), output=get("--output");
  if (!input || !output) throw new Error("uso: production-adapter.mjs --request FILE --output FILE");
  const request=JSON.parse(await fs.readFile(input,"utf8"));
  const result=await runProductionAdapter(request);
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,JSON.stringify(result,null,2)+"\n");
  console.log(`JEV PRODUCTION ADAPTER PASS — ${result.requestId}`);
}
