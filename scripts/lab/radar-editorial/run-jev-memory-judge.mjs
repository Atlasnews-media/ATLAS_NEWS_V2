// Compatibility wrapper. Canonical JEV implementation lives under scripts/jev/.
import fs from "node:fs/promises";
import path from "node:path";
import { runLabAdapter } from "../../jev/adapters/lab-radar-adapter.mjs";
const get=(n)=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:null};
const input=get("--request"), output=get("--output");
if(!input||!output) throw new Error("uso: run-jev-memory-judge.mjs --request FILE --output FILE");
const request=JSON.parse(await fs.readFile(input,"utf8"));
const result=await runLabAdapter(request);
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify(result,null,2)+"\n");
console.log(`JEV MEMORY PASS — ${result.radarRunId} · ${result.judgments.length} candidate(s)`);
