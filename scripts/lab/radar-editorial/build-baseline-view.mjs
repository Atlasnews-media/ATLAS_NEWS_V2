import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateBaselineRun } from "./validate-baseline-run.mjs";

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function main() {
  const runDir = process.argv[2];
  if (!runDir) throw new Error("uso: build-baseline-view.mjs RUN_DIR");
  const { run, searchLog, candidatesDoc } = await validateBaselineRun(
    runDir,
    null,
    { requireView: false },
  );
  const sections = {};
  for (const section of ["general", "national", "markets"]) {
    sections[section] = {
      meta: await readJson(path.join(runDir, section, "metadata.json")),
      output: await fs.readFile(
        path.join(runDir, section, "output.md"),
        "utf8",
      ),
    };
  }
  const publicBase = `/lab/radar-editorial/runs/${run.radarRunId}`;
  const candidateRows = candidatesDoc.candidates
    .map(
      (candidate) =>
        `<tr><td>${esc(candidate.section)}</td><td>${esc(candidate.titleOriginal)}</td><td>${esc(candidate.sourceName)}</td><td>${candidate.selected ? "sí" : "no"}</td><td>${esc(candidate.selectionStage)}</td></tr>`,
    )
    .join("");
  const queryRows = searchLog.entries
    .map(
      (entry) =>
        `<tr><td>${esc(entry.section)}</td><td>${esc(entry.query)}</td><td>${esc(entry.executedAt)}</td><td>${entry.resultCount}</td></tr>`,
    )
    .join("");
  const cards = ["general", "national", "markets"]
    .map((section) => {
      const meta = sections[section].meta;
      return `<section><h2>${section.toUpperCase()} LAB</h2><h3>${esc(meta.title)}</h3><p>${esc(meta.summary)}</p><p><strong>Fuentes:</strong> ${meta.sources.map((source) => esc(source.name)).join(", ")}</p><p><strong>Candidatos seleccionados:</strong> ${meta.selectedCandidateIds.map(esc).join(", ")}</p><pre>${esc(sections[section].output)}</pre></section>`;
    })
    .join("");
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ATLAS NEWS LAB — RADAR EDITORIAL — ${esc(run.radarRunId)}</title>
<style>
body{font-family:Georgia,serif;max-width:1100px;margin:0 auto;padding:32px;background:#f7f2e8;color:#17243c}header,section{border-bottom:1px solid #b9b1a2;padding:20px 0}code,pre,table{font-family:ui-monospace,monospace}pre{white-space:pre-wrap;background:#fff;padding:16px;border:1px solid #ddd;overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #ccc;padding:8px;text-align:left}.lab{font-weight:700;letter-spacing:.08em;color:#8b1e1e}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}.trace{overflow:auto}
</style>
</head>
<body>
<header>
<div class="lab">ATLAS NEWS LAB · RADAR EDITORIAL</div>
<h1>BASELINE editorial</h1>
<div class="meta">
<p><strong>Fecha:</strong> ${esc(run.editorialDate)}</p>
<p><strong>Run ID:</strong> <code>${esc(run.radarRunId)}</code></p>
<p><strong>sourceMainCommit:</strong> <code>${esc(run.sourceMainCommit)}</code></p>
<p><strong>Modo:</strong> BASELINE · LAB_ONLY</p>
</div>
<p>Sin intervención RADAR, JEV, Corpus, Audio ni Social.</p>
</header>
${cards}
<section class="trace"><h2>Trazabilidad de búsqueda</h2><table><thead><tr><th>Sección</th><th>Query</th><th>Ejecutada</th><th>Resultados</th></tr></thead><tbody>${queryRows}</tbody></table></section>
<section class="trace"><h2>Candidatos</h2><table><thead><tr><th>Sección</th><th>Título original</th><th>Fuente</th><th>Seleccionado</th><th>Etapa</th></tr></thead><tbody>${candidateRows}</tbody></table></section>
<footer><p><a href="${publicBase}/result.json">result.json</a> · <a href="${publicBase}/search-log.json">search-log.json</a> · <a href="${publicBase}/candidates.json">candidates.json</a></p></footer>
</body>
</html>
`;
  await fs.writeFile(path.join(runDir, "index.html"), html);
  console.log(`BASELINE VIEW WRITTEN — ${run.radarRunId}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`BASELINE VIEW FAIL: ${error.message}`);
    process.exit(1);
  });
}
