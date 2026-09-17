import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const signalsDir = new URL("data/senales-del-dia/", root);

const expectedSlots = {
  internacional: ["technology", "world"],
  nacional: ["ipsa_company", "policy_economy"],
  mercados: ["markets_chile", "markets_global"],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateSignal(signal, expectedSlot, context) {
  assert(signal && typeof signal === "object", `${context}: señal inválida.`);
  assert(signal.slot === expectedSlot, `${context}: slot esperado ${expectedSlot}.`);
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
  assert(
    typeof signal.anchor === "string" && signal.anchor.trim().length > 0,
    `${context}: anchor inválido.`,
  );
  assert(
    Array.isArray(signal.sources) && signal.sources.length > 0,
    `${context}: sources vacío o inválido.`,
  );

  for (const [index, source] of signal.sources.entries()) {
    assert(
      source && typeof source.name === "string" && source.name.trim().length > 0,
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
  assert(artifact.date === expectedDate, `${path}: date no coincide con archivo.`);
  assert(
    artifact.senalesDelDia && typeof artifact.senalesDelDia === "object",
    `${path}: falta senalesDelDia.`,
  );

  for (const [group, slots] of Object.entries(expectedSlots)) {
    const items = artifact.senalesDelDia[group];
    assert(Array.isArray(items), `${path}: ${group} no es array.`);
    assert(items.length === 2, `${path}: ${group} debe tener exactamente 2 señales.`);
    slots.forEach((slot, index) =>
      validateSignal(items[index], slot, `${path} · ${group}[${index}]`),
    );
  }

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
