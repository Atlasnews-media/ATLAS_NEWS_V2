import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const snapshotPath = new URL("src/data/economic-indicators.json", root);
const fallbackPath = new URL(
  "src/data/economic-indicators.fallback.json",
  root,
);
const publicDataDirectory = new URL("public/data/", root);
const publicSnapshotPath = new URL(
  "public/data/economic-indicators.json",
  root,
);

const providerBaseUrl =
  process.env.ATLAS_INDICATORS_API_BASE ?? "https://mindicador.cl/api";
const publishedSnapshotUrl =
  process.env.ATLAS_PUBLIC_SNAPSHOT_URL ??
  "https://atlasnews-media.github.io/data/economic-indicators.json";

const dayInMilliseconds = 24 * 60 * 60 * 1000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const indicatorDefinitions = [
  {
    code: "uf",
    providerCode: "uf",
    label: "UF",
    unit: "clp",
    maxAgeDays: 3,
    min: 1_000,
    max: 1_000_000,
  },
  {
    code: "dolar",
    providerCode: "dolar",
    label: "Dólar observado",
    unit: "clp",
    maxAgeDays: 7,
    min: 100,
    max: 10_000,
  },
  {
    code: "euro",
    providerCode: "euro",
    label: "Euro",
    unit: "clp",
    maxAgeDays: 7,
    min: 100,
    max: 10_000,
  },
  {
    code: "utm",
    providerCode: "utm",
    label: "UTM",
    unit: "clp-integer",
    maxAgeDays: 40,
    min: 1_000,
    max: 1_000_000,
  },
  {
    code: "tpm",
    providerCode: "tpm",
    label: "TPM",
    unit: "percent",
    maxAgeDays: 45,
    min: 0,
    max: 100,
  },
  {
    code: "cobre",
    providerCode: "libra_cobre",
    label: "Cobre",
    unit: "usd-per-pound",
    maxAgeDays: 7,
    min: 0.1,
    max: 100,
  },
];

function dateInSantiago(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function ageInDays(effectiveDate, today) {
  const effectiveTime = Date.parse(`${effectiveDate}T12:00:00Z`);
  const todayTime = Date.parse(`${today}T12:00:00Z`);
  return Math.round((todayTime - effectiveTime) / dayInMilliseconds);
}

function assertDate(value, label, today) {
  if (typeof value !== "string" || !datePattern.test(value)) {
    throw new Error(`${label} no contiene una fecha válida.`);
  }

  const parsed = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} no contiene una fecha interpretable.`);
  }

  if (ageInDays(value, today) < 0) {
    throw new Error(`${label} contiene una fecha futura: ${value}.`);
  }
}

function assertValue(value, definition) {
  if (!Number.isFinite(value)) {
    throw new Error(`${definition.label} no contiene un valor numérico.`);
  }

  if (value < definition.min || value > definition.max) {
    throw new Error(
      `${definition.label} está fuera del rango de control: ${value}.`,
    );
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "user-agent": "ATLAS-NEWS/1.0",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`${url} respondió con estado ${response.status}.`);
  }

  return response.json();
}

async function fetchIndicator(definition, today) {
  const payload = await fetchJson(
    `${providerBaseUrl}/${definition.providerCode}`,
  );

  if (!Array.isArray(payload?.serie) || payload.serie.length === 0) {
    throw new Error(`${definition.label} no contiene observaciones.`);
  }

  const candidates = payload.serie
    .filter(
      (observation) =>
        Number.isFinite(observation?.valor) &&
        typeof observation?.fecha === "string",
    )
    .sort((left, right) => Date.parse(right.fecha) - Date.parse(left.fecha));

  const latest = candidates[0];
  if (!latest) {
    throw new Error(`${definition.label} no contiene observaciones válidas.`);
  }

  const effectiveDate = dateInSantiago(latest.fecha);
  assertDate(effectiveDate, definition.label, today);
  assertValue(latest.valor, definition);

  const age = ageInDays(effectiveDate, today);
  if (age > definition.maxAgeDays) {
    throw new Error(
      `${definition.label} está desactualizado por ${age} días ` +
        `(máximo: ${definition.maxAgeDays}).`,
    );
  }

  return {
    code: definition.code,
    label: definition.label,
    value: latest.valor,
    unit: definition.unit,
    effectiveDate,
  };
}

async function fetchCurrentSnapshot(now) {
  const today = dateInSantiago(now);
  const indicators = await Promise.all(
    indicatorDefinitions.map((definition) => fetchIndicator(definition, today)),
  );
  const attemptTime = now.toISOString();
  const asOf = indicators
    .map(({ effectiveDate }) => effectiveDate)
    .sort()
    .at(-1);

  return {
    schemaVersion: 1,
    status: "current",
    asOf,
    fetchedAt: attemptTime,
    lastAttemptAt: attemptTime,
    sourceName: "Mi Indicador (datos públicos de Chile)",
    sourceUrl: "https://mindicador.cl/",
    provider: "mindicador",
    indicators,
  };
}

function validateStoredSnapshot(snapshot, today) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("El snapshot guardado no es un objeto válido.");
  }

  if (snapshot.schemaVersion !== 1) {
    throw new Error("El snapshot guardado usa una versión desconocida.");
  }

  if (!Array.isArray(snapshot.indicators)) {
    throw new Error("El snapshot guardado no contiene indicadores.");
  }

  const storedIndicators = new Map(
    snapshot.indicators.map((indicator) => [indicator.code, indicator]),
  );

  const indicators = indicatorDefinitions.map((definition) => {
    const indicator = storedIndicators.get(definition.code);
    if (!indicator) {
      throw new Error(`Falta el indicador ${definition.label}.`);
    }

    if (indicator.unit !== definition.unit) {
      throw new Error(`${definition.label} tiene una unidad incompatible.`);
    }

    assertDate(indicator.effectiveDate, definition.label, today);
    assertValue(indicator.value, definition);

    return {
      code: definition.code,
      label: definition.label,
      value: indicator.value,
      unit: definition.unit,
      effectiveDate: indicator.effectiveDate,
    };
  });

  const asOf = indicators
    .map(({ effectiveDate }) => effectiveDate)
    .sort()
    .at(-1);

  if (typeof snapshot.sourceName !== "string" || !snapshot.sourceName.trim()) {
    throw new Error("El snapshot guardado no identifica su fuente.");
  }

  if (typeof snapshot.sourceUrl !== "string" || !snapshot.sourceUrl.trim()) {
    throw new Error("El snapshot guardado no identifica la URL de su fuente.");
  }

  if (typeof snapshot.fetchedAt !== "string") {
    throw new Error("El snapshot guardado no identifica su fecha de captura.");
  }

  if (!Number.isFinite(Date.parse(snapshot.fetchedAt))) {
    throw new Error("El snapshot guardado tiene una captura inválida.");
  }

  return {
    schemaVersion: 1,
    status: "stale",
    asOf,
    fetchedAt: snapshot.fetchedAt,
    lastAttemptAt: new Date().toISOString(),
    sourceName: snapshot.sourceName,
    sourceUrl: snapshot.sourceUrl,
    provider:
      typeof snapshot.provider === "string" && snapshot.provider.trim()
        ? snapshot.provider
        : "fallback",
    indicators,
  };
}

async function loadFallbackSnapshot(now) {
  const today = dateInSantiago(now);
  const errors = [];

  try {
    const separator = publishedSnapshotUrl.includes("?") ? "&" : "?";
    const remoteSnapshot = await fetchJson(
      `${publishedSnapshotUrl}${separator}attempt=${Date.now()}`,
    );
    return validateStoredSnapshot(remoteSnapshot, today);
  } catch (error) {
    errors.push(`snapshot público: ${error.message}`);
  }

  try {
    const localSnapshot = JSON.parse(await readFile(fallbackPath, "utf8"));
    return validateStoredSnapshot(localSnapshot, today);
  } catch (error) {
    errors.push(`respaldo local: ${error.message}`);
  }

  throw new Error(`No existe un respaldo válido (${errors.join("; ")}).`);
}

async function writeSnapshot(snapshot) {
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  await mkdir(publicDataDirectory, { recursive: true });
  await Promise.all([
    writeFile(snapshotPath, serialized),
    writeFile(publicSnapshotPath, serialized),
  ]);
}

const now = new Date();
let snapshot;

try {
  snapshot = await fetchCurrentSnapshot(now);
  console.log(
    `Indicadores actualizados desde ${snapshot.sourceName}: ${snapshot.asOf}.`,
  );
} catch (error) {
  console.warn(`La actualización económica falló: ${error.message}`);
  snapshot = await loadFallbackSnapshot(now);
  console.warn(
    `Se conservará el último snapshot válido disponible al ${snapshot.asOf}.`,
  );
}

await writeSnapshot(snapshot);
