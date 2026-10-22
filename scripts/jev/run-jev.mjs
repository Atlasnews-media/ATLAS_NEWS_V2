import fs from "node:fs/promises";
import path from "node:path";
import { executeJev } from "./jev-core.mjs";

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }
const requestFile = arg("--request");
const outputFile = arg("--output");
if (!requestFile || !outputFile) throw new Error("uso: run-jev.mjs --request FILE --output FILE");
const request = JSON.parse(await fs.readFile(requestFile, "utf8"));
const result = await executeJev(request);
await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, JSON.stringify(result, null, 2) + "\n");
console.log(`JEV CORE PASS — ${result.requestId} · ${result.judgments.length} candidate(s)`);
