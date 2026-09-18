import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const signalsDir = new URL("data/senales-del-dia/", root);

const expectedSlots = {
  internacional: ["technology", "world"],
  nacional: ["ipsa_company", "policy_economy"],
  mercados: ["markets_chile", "markets_global"],
};

const expectedGroups = Object.keys(expectedSlots).sort();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function paragraphs(text) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim().length > 0);
}

function validateSignal(signal, expectedSlot, context) {
  assert(signal && typeof signal === "object", `${context}: señal inválida.`);
  assert(
    signal.slot === expectedSlot,
    `${context}: slot esperado ${expectedSlot}.`,
  );
  assert(
    typeof signal.headline === "string" &&
      signal.headline.trim().length > 0 &&
      signal.headline.length <= 72,
    `${context}: headline inválido.`,
  );
  assert(
    typeof signal.deck === "string" &&
      signal.deck.trim().length > 0 &&
      signal.deck.length <= 180,
    `${context}: deck inválido.`,
  );
  assert(
    typeof signal.development === "string" &&
      signal.development.trim().length > 0,
    `${context}: development inválido.`,
  );

  const developmentParagraphs = paragraphs(signal.development);
  assert(
    developmentParagraphs.length >= 2 && developmentParagraphs.length <= 4,
    `${context}: development debe tener entre 2 y 4 párrafos.`,
  );
  assert(
    wordCount(signal.development) >= 140,
    `${context}: development debe tener al menos 140 palabras.`,
  );

  assert(
    typeof signal.anchor === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(signal.anchor),
    `${context}: anchor debe ser ASCII, minúsculas y guiones.`,
  );
  assert(
    Array.isArray(signal.sources) && signal.sources.length > 0,
    `${context}: sources vacío o inválido.`,
  );

  for (const [index, source] of signal.sources.entries()) {
    assert(
      source &&
        typeof source.name === "string" &&
        source.name.trim().length > 0,
      `${context}: source ${index + 1} sin name válido.`,
    );
    assert(
      typeof source.url === "string" && /^https:\/\//.test(source.url),
      `${context}: source ${index + 1} debe usar URL HTTPS.`,
    );
  }
}

async function validateFile(path) {
  const raw = await readFile(new URL(path, root), "utf8");
  let artifact;
  try {
    artifact = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${path}: JSON inválido: ${error.message}`);
  }

  const expectedDate = path.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
  assert(expectedDate, `${path}: nombre de archivo sin fecha canónica.`);
  assert(artifact.status === "READY", `${path}: status debe ser READY.`);
  assert(
    artifact.contract === "atlas-senales-del-dia-v1",
    `${path}: contract inválido.`,
  );
  assert(
    artifact.date === expectedDate,
    `${path}: date no coincide con archivo.`,
  );
  assert(
    artifact.senalesDelDia && typeof artifact.senalesDelDia === "object",
    `${path}: falta senalesDelDia.`,
  );

  const groups = Object.keys(artifact.senalesDelDia).sort();
  assert(
    JSON.stringify(groups) === JSON.stringify(expectedGroups),
    `${path}: senalesDelDia debe contener exclusivamente internacional, nacional y mercados.`,
  );

  const anchors = [];
  for (const [group, slots] of Object.entries(expectedSlots)) {
    const items = artifact.senalesDelDia[group];
    assert(Array.isArray(items), `${path}: ${group} no es array.`);
    assert(
      items.length === 2,
      `${path}: ${group} debe tener exactamente 2 señales.`,
    );
    slots.forEach((slot, index) => {
      validateSignal(items[index], slot, `${path} · ${group}[${index}]`);
      anchors.push(items[index].anchor);
    });
  }

  assert(
    new Set(anchors).size === anchors.length,
    `${path}: los 6 anchors deben ser únicos.`,
  );

  console.log(`Señales válidas: ${path}`);
}

const requested = process.argv.slice(2);
const files =
  requested.length > 0
    ? requested
    : (await readdir(signalsDir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => `data/senales-del-dia/${entry.name}`)
        .sort();

assert(files.length > 0, "No hay artefactos de Señales para validar.");
for (const file of files) await validateFile(file);
