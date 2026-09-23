import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildEditorialSurface } from "./build-editorial-surface.mjs";

const SECTIONS = ["general", "national", "markets"];
const TITLES = {
  general: "Internacional de prueba real",
  national: "Nacional de prueba real",
  markets: "Mercados de prueba real",
};

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

async function writeRun(runtimeRoot, id, date, completedAt, ready = true) {
  const runDir = path.join(runtimeRoot, "runs", id);
  const identity = {
    radarRunId: id,
    sourceMainCommit: "0123456789abcdef0123456789abcdef01234567",
    radarStateVersion: "radar-state-v1",
    editorialDate: date,
    mode: "LAB_ONLY",
    experimentMode: "BASELINE",
  };

  await writeJson(path.join(runDir, "run.json"), {
    ...identity,
    schemaVersion: 1,
    completedAt,
    productionWritesAllowed: false,
  });

  await writeJson(path.join(runDir, "result.json"), {
    ...identity,
    schemaVersion: 1,
    status: ready ? "PASS" : "FAIL",
  });

  if (ready) {
    await writeJson(path.join(runDir, "publish-request.json"), {
      ...identity,
      schemaVersion: 1,
      status: "READY",
      productionWritesAllowed: false,
    });
  }

  await writeJson(path.join(runDir, "search-log.json"), {
    ...identity,
    schemaVersion: 1,
    entries: [
      {
        section: "general",
        query: "consulta de prueba",
        executedAt: completedAt,
        resultCount: 1,
      },
    ],
  });

  await writeJson(path.join(runDir, "candidates.json"), {
    ...identity,
    schemaVersion: 1,
    candidates: [
      {
        section: "general",
        titleOriginal: "Candidato documentado",
        sourceName: "Fuente",
        selected: true,
        selectionStage: "selected-final",
      },
    ],
  });

  for (const section of SECTIONS) {
    await writeJson(path.join(runDir, section, "metadata.json"), {
      ...identity,
      schemaVersion: 1,
      section,
      status: "PASS",
      title: TITLES[section] + " " + id,
      summary:
        "Resumen editorial de prueba suficientemente descriptivo para validar la superficie.",
      tags: ["lab", section],
      sources: [
        {
          name: "Fuente documentada",
          url: "https://example.com/" + section,
        },
      ],
    });
    const heading = section === "general" ? "Hecho central" : "Desarrollo";
    await fs.writeFile(
      path.join(runDir, section, "output.md"),
      "# " +
        TITLES[section] +
        "\n\n## " +
        heading +
        "\n\nTexto editorial sin reescritura.\n\n## Qué observar\n\nSegundo bloque editorial.\n",
    );
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "radar-surface-"));
const runtimeRoot = path.join(root, "runtime");
const outputRoot = path.join(root, "surface");

const oldId = "RADAR-BASELINE-TEST-OLD";
const newId = "RADAR-BASELINE-TEST-NEW";
const incompleteId = "RADAR-BASELINE-TEST-INCOMPLETE";

await writeRun(
  runtimeRoot,
  oldId,
  "2026-09-22",
  "2026-09-22T09:20:00-03:00",
);
await writeRun(
  runtimeRoot,
  newId,
  "2026-09-23",
  "2026-09-23T09:20:00-03:00",
);
await writeRun(
  runtimeRoot,
  incompleteId,
  "2026-09-24",
  "2026-09-24T09:20:00-03:00",
  false,
);

await writeJson(path.join(runtimeRoot, "latest.json"), {
  schemaVersion: 2,
  radarRunId: newId,
  sourceMainCommit: "0123456789abcdef0123456789abcdef01234567",
  radarStateVersion: "radar-state-v1",
  editorialDate: "2026-09-23",
  mode: "LAB_ONLY",
  experimentMode: "BASELINE",
  status: "READY",
  productionWritesAllowed: false,
});

const manifest = await buildEditorialSurface(runtimeRoot, outputRoot);
assert(manifest.radarRunId === newId, "latest no resolvió el run vigente");
assert(
  manifest.historyRunIds.join(",") === [newId, oldId].join(","),
  "history debe ser READY-only y newest-first",
);

const home = await fs.readFile(
  path.join(outputRoot, "current", "index.html"),
  "utf8",
);
assert(home.includes("ATLAS NEWS LAB"), "Portada no identifica LAB");
assert(home.includes(TITLES.general + " " + newId), "falta Internacional");
assert(home.includes(TITLES.national + " " + newId), "falta Nacional");
assert(home.includes(TITLES.markets + " " + newId), "falta Mercados");
assert(!home.includes(incompleteId), "corrida incompleta filtró a Portada");

const section = await fs.readFile(
  path.join(outputRoot, "current", "internacional", "index.html"),
  "utf8",
);
assert(section.includes(oldId), "sección no conserva archivo histórico");
assert(
  section.includes("/archivo/" + newId + "/internacional/"),
  "sección no enlaza pieza estable por radarRunId",
);

const historical = await fs.readFile(
  path.join(
    outputRoot,
    "history",
    newId,
    "nacional",
    "index.html",
  ),
  "utf8",
);
assert(
  historical.includes("<h2>Desarrollo</h2>"),
  "Markdown perdió jerarquía",
);
assert(
  historical.includes("Texto editorial sin reescritura."),
  "Markdown fue alterado",
);
assert(historical.includes("Markdown original"), "falta artefacto original");
assert(
  !/Dora|Kokoro|audio-naturalness|audio-number-phonemes/i.test(historical),
  "la superficie introdujo dependencia de Audio",
);

const trace = await fs.readFile(
  path.join(outputRoot, "trace", newId, "index.html"),
  "utf8",
);
assert(trace.includes("search-log.json"), "falta search-log trazable");
assert(trace.includes("candidates.json"), "falta candidates trazable");

console.log("RADAR EDITORIAL SURFACE CONTRACT: PASS");
