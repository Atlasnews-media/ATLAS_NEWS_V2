import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SECTIONS = [
  { technical: "general", visible: "internacional", label: "Internacional" },
  { technical: "national", visible: "nacional", label: "Nacional" },
  { technical: "markets", visible: "mercados", label: "Mercados" },
];
const PUBLIC_BASE = "/lab/radar-editorial/";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function assertSafeRunId(value) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value ?? "")) {
    throw new Error("radarRunId inválido: " + value);
  }
  return value;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function inlineMarkdown(value) {
  let text = esc(value);
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  text = text.replace(/\x60([^\x60]+)\x60/g, "<code>$1</code>");
  return text;
}

export function renderMarkdown(markdown) {
  const source = typeof markdown === "string" ? markdown.trim() : "";
  if (!source) return '<p class="empty">Sin cuerpo editorial disponible.</p>';

  const lines = source.split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  let list = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push("<p>" + inlineMarkdown(paragraph.join(" ").trim()) + "</p>");
    paragraph = [];
  }

  function flushList() {
    if (!list.length) return;
    blocks.push(
      "<ul>" +
        list.map((item) => "<li>" + inlineMarkdown(item) + "</li>").join("") +
        "</ul>",
    );
    list = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push("<h2>" + inlineMarkdown(line.slice(3).trim()) + "</h2>");
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push("<h3>" + inlineMarkdown(line.slice(4).trim()) + "</h3>");
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks.join("\n");
}

function dateLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return esc(value ?? "—");
  const parts = value.split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

const STYLE =
  ":root{--paper:#f5f0e6;--ink:#20211d;--muted:#66665f;--rule:#272822;--accent:#9d1717;--sans:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--serif:Georgia,'Times New Roman',serif}" +
  "*{box-sizing:border-box}html,body{margin:0;background:var(--paper);color:var(--ink)}body{font-family:var(--serif)}a{color:inherit}" +
  ".shell{width:min(88rem,calc(100% - 2rem));margin:0 auto;padding:1rem 0 4rem}.labbar{display:flex;justify-content:space-between;gap:1rem;padding:.55rem 0;border-bottom:1px solid var(--rule);font:800 .64rem/1.2 var(--sans);letter-spacing:.13em;text-transform:uppercase}.labbar strong,.eyebrow{color:var(--accent)}" +
  ".masthead{padding:1.1rem 0;border-bottom:4px double var(--rule)}.masthead h1{margin:0;font-size:clamp(3rem,8vw,7rem);line-height:.86;letter-spacing:-.055em}.masthead p,.deck{max-width:58rem;color:var(--muted);line-height:1.42}.masthead p{font-size:clamp(1rem,2vw,1.3rem)}" +
  ".identity{display:flex;flex-wrap:wrap;gap:.45rem 1rem;padding:.72rem 0;border-bottom:1px solid var(--rule);font:700 .61rem/1.3 var(--sans);letter-spacing:.04em;text-transform:uppercase}.identity code{font-size:.58rem;text-transform:none}" +
  ".grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:4px double var(--rule)}.card{padding:1.15rem;border-right:1px solid var(--rule)}.card:first-child{padding-left:0}.card:last-child{padding-right:0;border-right:0}.eyebrow{margin:0;font:800 .68rem/1.2 var(--sans);letter-spacing:.14em;text-transform:uppercase}.card h2{margin:.45rem 0 .65rem;font-size:clamp(1.75rem,3vw,3rem);line-height:.94;letter-spacing:-.035em}.card p:not(.eyebrow){margin:0;color:var(--muted);line-height:1.45}" +
  ".cta{display:inline-block;margin-top:.85rem;color:var(--accent);font:800 .66rem/1.2 var(--sans);letter-spacing:.08em;text-decoration:none;text-transform:uppercase}.block{padding:1.25rem 0;border-bottom:4px double var(--rule)}.blockhead{display:flex;justify-content:space-between;gap:1rem;align-items:end}.block h2,.section-title{margin:.2rem 0 0;font:800 clamp(1.8rem,4vw,3.2rem)/1 var(--sans);letter-spacing:-.03em}" +
  ".archive{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:.8rem;border-top:1px solid var(--rule)}.item{padding:.9rem 1rem .9rem 0;border-bottom:1px solid var(--rule)}.item:nth-child(even){padding-left:1rem;border-left:1px solid var(--rule)}.item h3{margin:.25rem 0 .35rem;font-size:1.25rem;line-height:1.06}.item p{margin:0;color:var(--muted);font:.84rem/1.4 var(--sans)}" +
  ".hero{padding:1rem 0 1.15rem;border-bottom:4px double var(--rule)}.hero h1{max-width:72rem;margin:.4rem 0 .65rem;font-size:clamp(2.5rem,6vw,5.3rem);line-height:.9;letter-spacing:-.05em}.deck{margin:0;font-size:clamp(1.05rem,2vw,1.34rem)}" +
  ".article{max-width:54rem;margin:1.8rem auto 0;font-size:1.08rem;line-height:1.7}.article p{margin:0 0 1.15rem}.article h2{margin:2.2rem 0 .8rem;padding-top:.65rem;border-top:4px double var(--rule);font:800 clamp(1.5rem,3vw,2.2rem)/1 var(--sans)}.article h3{font:800 1.3rem/1.1 var(--sans)}.article li{margin:.5rem 0}" +
  ".meta{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;padding:1rem 0;border-bottom:1px solid var(--rule)}.meta h2{margin:0 0 .5rem;font:800 .7rem/1.2 var(--sans);letter-spacing:.12em;text-transform:uppercase}.chips{display:flex;flex-wrap:wrap;gap:.35rem}.chips span{padding:.25rem .42rem;border:1px solid var(--rule);font:700 .61rem/1.2 var(--sans);text-transform:uppercase}" +
  ".sources{max-width:54rem;margin:2rem auto 0;padding-top:1rem;border-top:4px double var(--rule)}.sources h2{font:800 1rem/1 var(--sans);letter-spacing:.1em;text-transform:uppercase}.sources li{margin:.6rem 0;line-height:1.4}.trace{margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--rule);font:700 .67rem/1.4 var(--sans);text-transform:uppercase}.trace a{margin-right:.9rem}.trace-table{width:100%;border-collapse:collapse;margin-top:.8rem;font:.76rem/1.35 var(--sans)}.trace-table th,.trace-table td{padding:.55rem;border:1px solid var(--rule);text-align:left;vertical-align:top}.footer{display:flex;justify-content:space-between;gap:1rem;margin-top:2.2rem;padding-top:.9rem;border-top:4px double var(--rule);font:800 .67rem/1.3 var(--sans);letter-spacing:.08em;text-transform:uppercase}" +
  "@media(max-width:48rem){.shell{width:min(100% - 1.2rem,88rem);padding-top:.45rem}.labbar{font-size:.56rem}.masthead h1{font-size:clamp(3rem,15vw,4.8rem)}.grid,.archive,.meta{grid-template-columns:1fr}.card,.card:first-child,.card:last-child{padding:1rem 0;border-right:0;border-bottom:1px solid var(--rule)}.item,.item:nth-child(even){padding:.8rem 0;border-left:0}.hero h1{font-size:clamp(2.35rem,10vw,3.35rem)}.article{font-size:1rem;line-height:1.62}.trace-table{display:block;overflow-x:auto}.footer{flex-direction:column}}";

function page(title, description, body) {
  return [
    '<!doctype html><html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    "<title>",
    esc(title),
    '</title><meta name="description" content="',
    esc(description),
    '"><style>',
    STYLE,
    "</style></head><body>",
    body,
    "</body></html>\n",
  ].join("");
}

function labBar(label) {
  return (
    '<div class="labbar"><strong>ATLAS NEWS LAB</strong><span>' +
    esc(label) +
    " · NO PRODUCCIÓN</span></div>"
  );
}

function identity(run) {
  return [
    '<div class="identity" aria-label="Identidad LAB"><span><b>LAB</b> ',
    esc(run.experimentMode),
    "</span><span>",
    esc(run.editorialDate),
    "</span><span><code>",
    esc(run.radarRunId),
    "</code></span><span><code>sourceMainCommit ",
    esc(run.sourceMainCommit.slice(0, 12)),
    "</code></span></div>",
  ].join("");
}

function chips(meta) {
  const tags = Array.isArray(meta.tags) ? meta.tags : [];
  if (!tags.length) return "";
  return (
    '<div class="chips">' +
    tags.map((tag) => "<span>" + esc(tag) + "</span>").join("") +
    "</div>"
  );
}

function sources(meta) {
  if (!Array.isArray(meta.sources) || !meta.sources.length) return "";
  return (
    '<section class="sources"><h2>Fuentes documentadas</h2><ul>' +
    meta.sources
      .map(
        (source) =>
          '<li><a href="' +
          esc(source.url) +
          '" rel="noopener noreferrer">' +
          esc(source.name) +
          "</a></li>",
      )
      .join("") +
    "</ul></section>"
  );
}

async function readReadyRun(runDir) {
  const run = await readJson(path.join(runDir, "run.json"));
  assertSafeRunId(run.radarRunId);
  const request = await readJson(path.join(runDir, "publish-request.json"));
  const result = await readJson(path.join(runDir, "result.json"));

  if (run.mode !== "LAB_ONLY" || run.productionWritesAllowed !== false) {
    throw new Error(run.radarRunId + ": identidad LAB inválida");
  }
  if (request.status !== "READY" || request.radarRunId !== run.radarRunId) {
    throw new Error(run.radarRunId + ": publish-request no READY");
  }
  if (result.status !== "PASS" || result.radarRunId !== run.radarRunId) {
    throw new Error(run.radarRunId + ": result no PASS");
  }

  const sections = {};
  for (const section of SECTIONS) {
    const dir = path.join(runDir, section.technical);
    const meta = await readJson(path.join(dir, "metadata.json"));
    const output = await fs.readFile(path.join(dir, "output.md"), "utf8");
    if (
      meta.status !== "PASS" ||
      meta.radarRunId !== run.radarRunId ||
      meta.section !== section.technical
    ) {
      throw new Error(
        run.radarRunId + "/" + section.technical + ": metadata inválida",
      );
    }
    sections[section.technical] = { meta, output };
  }

  return {
    run,
    request,
    result,
    sections,
    searchLog: await readJson(path.join(runDir, "search-log.json")),
    candidates: await readJson(path.join(runDir, "candidates.json")),
  };
}

async function collectHistory(runtimeRoot) {
  const entries = await fs.readdir(path.join(runtimeRoot, "runs"), {
    withFileTypes: true,
  });
  const history = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(runtimeRoot, "runs", entry.name);
    if (!(await exists(path.join(runDir, "publish-request.json")))) continue;
    try {
      history.push(await readReadyRun(runDir));
    } catch {
      // Fail-closed: corridas incompletas o inválidas no aparecen.
    }
  }
  history.sort((a, b) => {
    const byDate = String(b.run.editorialDate).localeCompare(
      String(a.run.editorialDate),
    );
    if (byDate) return byDate;
    return String(b.run.completedAt ?? "").localeCompare(
      String(a.run.completedAt ?? ""),
    );
  });
  return history;
}

function archiveItems(history, section) {
  if (!history.length) return '<p class="empty">Sin corridas READY.</p>';
  return (
    '<div class="archive">' +
    history
      .map((item) => {
        const meta = item.sections[section.technical].meta;
        return [
          '<article class="item"><p class="eyebrow">',
          esc(dateLabel(item.run.editorialDate)),
          " · ",
          esc(item.run.experimentMode),
          '</p><h3><a href="',
          PUBLIC_BASE,
          "archivo/",
          esc(item.run.radarRunId),
          "/",
          section.visible,
          '/">',
          esc(meta.title),
          "</a></h3><p><code>",
          esc(item.run.radarRunId),
          "</code></p></article>",
        ].join("");
      })
      .join("") +
    "</div>"
  );
}

function buildHome(current, history) {
  const cards = SECTIONS.map((section) => {
    const meta = current.sections[section.technical].meta;
    return [
      '<article class="card"><p class="eyebrow">',
      esc(section.label),
      "</p><h2>",
      esc(meta.title),
      "</h2><p>",
      esc(meta.summary),
      '</p><a class="cta" href="./',
      section.visible,
      '/">Abrir sección →</a></article>',
    ].join("");
  }).join("");

  return page(
    "ATLAS NEWS LAB — RADAR Editorial",
    "Superficie editorial navegable de ATLAS NEWS LAB.",
    [
      '<main class="shell">',
      labBar("RADAR EDITORIAL"),
      '<header class="masthead"><h1>ATLAS NEWS LAB</h1><p>Ventana de observación del experimento editorial RADAR. La superficie representa corridas LAB validadas y no participa en selección ni escritura editorial.</p></header>',
      identity(current.run),
      '<section class="grid" aria-label="Secciones vigentes">',
      cards,
      '</section><section class="block"><div class="blockhead"><div><p class="eyebrow">Archivo editorial</p><h2>Corridas READY</h2></div><a class="cta" href="./archivo/">Ver archivo completo →</a></div><p>',
      String(history.length),
      " corrida",
      history.length === 1 ? "" : "s",
      " READY disponible",
      history.length === 1 ? "" : "s",
      '.</p></section><div class="trace"><a href="./trazabilidad/',
      esc(current.run.radarRunId),
      '/">Trazabilidad de la corrida</a><a href="./latest.json">latest.json</a></div></main>',
    ].join(""),
  );
}

function buildSection(current, history, section) {
  const meta = current.sections[section.technical].meta;
  const articleUrl =
    PUBLIC_BASE +
    "archivo/" +
    current.run.radarRunId +
    "/" +
    section.visible +
    "/";
  return page(
    section.label + " — ATLAS NEWS LAB",
    "Sección " + section.label + " de ATLAS NEWS LAB.",
    [
      '<main class="shell">',
      labBar(section.label),
      '<header class="hero"><p class="eyebrow">',
      esc(section.label),
      " · pieza vigente</p><h1>",
      esc(meta.title),
      '</h1><p class="deck">',
      esc(meta.summary),
      '</p><a class="cta" href="',
      esc(articleUrl),
      '">Leer noticia completa →</a></header>',
      identity(current.run),
      '<section class="block"><div class="blockhead"><div><p class="eyebrow">Archivo de ',
      esc(section.label),
      '</p><h2>Corridas anteriores</h2></div><a class="cta" href="../">Volver a Portada LAB</a></div>',
      archiveItems(history, section),
      '</section><footer class="footer"><a href="../">← Portada LAB</a><a href="../trazabilidad/',
      esc(current.run.radarRunId),
      '/">Trazabilidad</a></footer></main>',
    ].join(""),
  );
}

function buildArchiveIndex(history) {
  const items = history
    .map((item) => {
      const links = SECTIONS.map(
        (section) =>
          '<a href="./' +
          esc(item.run.radarRunId) +
          "/" +
          section.visible +
          '/">' +
          esc(section.label) +
          "</a>",
      ).join(" · ");
      return [
        '<article class="item"><p class="eyebrow">',
        esc(dateLabel(item.run.editorialDate)),
        " · ",
        esc(item.run.experimentMode),
        "</p><h3>",
        esc(item.run.radarRunId),
        "</h3><p>",
        links,
        "</p></article>",
      ].join("");
    })
    .join("");

  return page(
    "Archivo — ATLAS NEWS LAB",
    "Archivo histórico de corridas READY de RADAR Editorial.",
    [
      '<main class="shell">',
      labBar("ARCHIVO EDITORIAL"),
      '<header class="masthead"><h1>Archivo LAB</h1><p>Histórico de corridas READY con radarRunId, fecha, modo experimental y sección preservados.</p></header>',
      '<section class="block"><div class="archive">',
      items || '<p class="empty">Sin corridas READY.</p>',
      '</div></section><footer class="footer"><a href="../">← Portada LAB</a><span>ATLAS NEWS LAB</span></footer></main>',
    ].join(""),
  );
}

function buildArticle(runData, section) {
  const meta = runData.sections[section.technical].meta;
  const output = runData.sections[section.technical].output;
  return page(
    meta.title + " — ATLAS NEWS LAB",
    meta.summary,
    [
      '<main class="shell">',
      labBar(section.label + " · ARCHIVO"),
      '<header class="hero"><p class="eyebrow">',
      esc(section.label),
      " · ",
      esc(dateLabel(runData.run.editorialDate)),
      "</p><h1>",
      esc(meta.title),
      '</h1><p class="deck">',
      esc(meta.summary),
      "</p></header>",
      identity(runData.run),
      '<div class="meta"><div><h2>Etiquetas</h2>',
      chips(meta),
      "</div><div><h2>Identidad</h2><p><code>",
      esc(runData.run.radarRunId),
      "</code><br><code>mode=",
      esc(runData.run.mode),
      "</code><br><code>experimentMode=",
      esc(runData.run.experimentMode),
      '</code></p></div></div><article class="article">',
      renderMarkdown(output),
      "</article>",
      sources(meta),
      '<div class="trace"><a href="../../../trazabilidad/',
      esc(runData.run.radarRunId),
      '/">Trazabilidad de la corrida</a><a href="../../../runs/',
      esc(runData.run.radarRunId),
      "/",
      section.technical,
      '/output.md">Markdown original</a></div><footer class="footer"><a href="../../../',
      section.visible,
      '/">← Volver a ',
      esc(section.label),
      '</a><a href="../../../">Portada LAB</a></footer></main>',
    ].join(""),
  );
}

function buildTrace(runData) {
  const queries = Array.isArray(runData.searchLog.entries)
    ? runData.searchLog.entries
    : [];
  const candidates = Array.isArray(runData.candidates.candidates)
    ? runData.candidates.candidates
    : [];
  const queryRows = queries
    .map(
      (entry) =>
        "<tr><td>" +
        esc(entry.section) +
        "</td><td>" +
        esc(entry.query) +
        "</td><td>" +
        esc(entry.executedAt) +
        "</td><td>" +
        esc(entry.resultCount) +
        "</td></tr>",
    )
    .join("");
  const candidateRows = candidates
    .map(
      (candidate) =>
        "<tr><td>" +
        esc(candidate.section) +
        "</td><td>" +
        esc(candidate.titleOriginal) +
        "</td><td>" +
        esc(candidate.sourceName) +
        "</td><td>" +
        (candidate.selected ? "sí" : "no") +
        "</td><td>" +
        esc(candidate.selectionStage) +
        "</td></tr>",
    )
    .join("");
  const base = PUBLIC_BASE + "runs/" + runData.run.radarRunId;

  return page(
    "Trazabilidad " + runData.run.radarRunId + " — ATLAS NEWS LAB",
    "Trazabilidad técnica de una corrida RADAR Editorial.",
    [
      '<main class="shell">',
      labBar("TRAZABILIDAD"),
      '<header class="masthead"><h1>Trazabilidad</h1><p>Zona técnica secundaria. La lectura editorial permanece separada de estos artefactos.</p></header>',
      identity(runData.run),
      '<section class="block"><h2 class="section-title">Búsquedas registradas</h2><table class="trace-table"><thead><tr><th>Sección</th><th>Query</th><th>Ejecutada</th><th>Resultados</th></tr></thead><tbody>',
      queryRows,
      '</tbody></table></section><section class="block"><h2 class="section-title">Candidatos</h2><table class="trace-table"><thead><tr><th>Sección</th><th>Título original</th><th>Fuente</th><th>Seleccionado</th><th>Etapa</th></tr></thead><tbody>',
      candidateRows,
      '</tbody></table></section><div class="trace"><a href="',
      base,
      '/search-log.json">search-log.json</a><a href="',
      base,
      '/candidates.json">candidates.json</a><a href="',
      base,
      '/result.json">result.json</a><a href="',
      base,
      '/publish-request.json">publish-request.json</a></div><footer class="footer"><a href="../../">← Portada LAB</a><span>Zona técnica</span></footer></main>',
    ].join(""),
  );
}

async function write(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
}

export async function buildEditorialSurface(runtimeRoot, outputRoot) {
  const latest = await readJson(path.join(runtimeRoot, "latest.json"));
  if (
    latest.status !== "READY" ||
    latest.mode !== "LAB_ONLY" ||
    latest.productionWritesAllowed !== false
  ) {
    throw new Error("latest.json no representa una corrida READY LAB_ONLY");
  }

  assertSafeRunId(latest.radarRunId);
  const current = await readReadyRun(
    path.join(runtimeRoot, "runs", latest.radarRunId),
  );
  if (
    current.run.radarRunId !== latest.radarRunId ||
    current.run.sourceMainCommit !== latest.sourceMainCommit
  ) {
    throw new Error("latest.json no coincide con identidad del run");
  }

  const history = await collectHistory(runtimeRoot);
  if (!history.some((item) => item.run.radarRunId === current.run.radarRunId)) {
    throw new Error("la corrida latest READY no aparece en history validado");
  }

  await fs.rm(outputRoot, { recursive: true, force: true });
  await write(
    path.join(outputRoot, "current", "index.html"),
    buildHome(current, history),
  );
  await write(
    path.join(outputRoot, "current", "archivo", "index.html"),
    buildArchiveIndex(history),
  );

  for (const section of SECTIONS) {
    await write(
      path.join(outputRoot, "current", section.visible, "index.html"),
      buildSection(current, history, section),
    );
  }

  for (const item of history) {
    for (const section of SECTIONS) {
      await write(
        path.join(
          outputRoot,
          "history",
          item.run.radarRunId,
          section.visible,
          "index.html",
        ),
        buildArticle(item, section),
      );
    }
    await write(
      path.join(outputRoot, "trace", item.run.radarRunId, "index.html"),
      buildTrace(item),
    );
  }

  const manifest = {
    schemaVersion: 1,
    radarRunId: current.run.radarRunId,
    editorialDate: current.run.editorialDate,
    experimentMode: current.run.experimentMode,
    mode: current.run.mode,
    sourceMainCommit: current.run.sourceMainCommit,
    historyRunIds: history.map((item) => item.run.radarRunId),
  };
  await write(
    path.join(outputRoot, "surface-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  console.log(
    "RADAR EDITORIAL SURFACE WRITTEN — " +
      current.run.radarRunId +
      " · " +
      history.length +
      " READY",
  );
  return manifest;
}

async function main() {
  const args = process.argv.slice(2);
  const runtimeIndex = args.indexOf("--runtime-root");
  const outputIndex = args.indexOf("--output");
  if (
    runtimeIndex < 0 ||
    outputIndex < 0 ||
    !args[runtimeIndex + 1] ||
    !args[outputIndex + 1]
  ) {
    throw new Error(
      "uso: build-editorial-surface.mjs --runtime-root DIR --output DIR",
    );
  }
  await buildEditorialSurface(args[runtimeIndex + 1], args[outputIndex + 1]);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error("RADAR EDITORIAL SURFACE FAIL: " + error.message);
    process.exit(1);
  });
}
