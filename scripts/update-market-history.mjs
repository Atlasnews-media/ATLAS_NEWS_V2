import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const marketSnapshotPath = new URL("src/data/market-pulse.json", root);
const publicDataDirectory = new URL("public/data/", root);
const publicSnapshotPath = new URL("public/data/market-pulse.json", root);

const TIME_ZONE = "America/Santiago";
const REQUEST_TIMEOUT_MS = 10_000;
const HISTORY_DAYS = 30;
const DAY_MS = 86_400_000;
const INDICATORS_API_BASE =
  process.env.ATLAS_INDICATORS_API_BASE ?? "https://mindicador.cl/api";
const PUBLISHED_MARKET_SNAPSHOT_URL =
  process.env.ATLAS_PUBLIC_MARKET_SNAPSHOT_URL ??
  "https://atlasnews-media.github.io/data/market-pulse.json";

function dateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function compactDate(value) {
  return dateKey(value).replaceAll("-", "");
}

function historyCutoff(now = new Date()) {
  return dateKey(new Date(now.getTime() - HISTORY_DAYS * DAY_MS));
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "text/plain,text/csv,application/json,*/*",
      "user-agent": "ATLAS-NEWS/1.0",
      ...headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${url} respondió ${response.status}.`);
  }

  return response.text();
}

async function fetchJson(url, headers = {}) {
  const text = await fetchText(url, {
    accept: "application/json,*/*",
    ...headers,
  });
  return JSON.parse(text);
}

function normalizePoints(points, now = new Date()) {
  const cutoff = historyCutoff(now);
  const byDate = new Map();

  for (const point of points) {
    if (
      typeof point?.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(point.date) ||
      point.date < cutoff ||
      !Number.isFinite(point?.value)
    ) {
      continue;
    }
    byDate.set(point.date, { date: point.date, value: point.value });
  }

  return Array.from(byDate.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

function assertHistory(points, label) {
  if (points.length < 2) {
    throw new Error(`${label}: serie histórica insuficiente.`);
  }
  return points;
}

async function mindicadorHistory(providerCode, label) {
  const payload = await fetchJson(`${INDICATORS_API_BASE}/${providerCode}`);
  const raw = Array.isArray(payload?.serie) ? payload.serie : [];
  const points = normalizePoints(
    raw.map((observation) => ({
      date:
        typeof observation?.fecha === "string"
          ? dateKey(new Date(observation.fecha))
          : null,
      value: Number(observation?.valor),
    })),
  );

  return {
    points: assertHistory(points, label),
    provider: "mindicador",
    sourceUrl: "https://mindicador.cl/",
  };
}

function parseStooqHistory(csv, symbol) {
  const rows = csv.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 3 || !/^date,/i.test(rows[0])) {
    throw new Error(`${symbol}: respuesta Stooq sin serie válida.`);
  }

  const headers = rows[0].split(",").map((value) => value.trim().toLowerCase());
  const dateIndex = headers.indexOf("date");
  const closeIndex = headers.indexOf("close");
  if (dateIndex < 0 || closeIndex < 0) {
    throw new Error(`${symbol}: CSV Stooq sin columnas esperadas.`);
  }

  return normalizePoints(
    rows
      .slice(1)
      .map((row) => row.split(","))
      .map((columns) => ({
        date: columns[dateIndex],
        value: Number(columns[closeIndex]),
      })),
  );
}

async function stooqHistory(symbol, label) {
  const now = new Date();
  const from = new Date(now.getTime() - HISTORY_DAYS * DAY_MS);
  const url =
    `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}` +
    `&d1=${compactDate(from)}&d2=${compactDate(now)}&i=d`;
  const csv = await fetchText(url, { accept: "text/csv,text/plain,*/*" });
  const points = assertHistory(parseStooqHistory(csv, symbol), label);

  return {
    points,
    provider: "stooq",
    sourceUrl: `https://stooq.com/q/?s=${encodeURIComponent(symbol)}`,
  };
}

async function yahooHistory(symbol, label) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    "?interval=1d&range=1mo";
  const payload = await fetchJson(url, { accept: "application/json" });
  const result = payload?.chart?.result?.[0];
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];

  const points = normalizePoints(
    timestamps.map((timestamp, index) => ({
      date: Number.isFinite(timestamp)
        ? dateKey(new Date(timestamp * 1000))
        : null,
      value: Number(closes[index]),
    })),
  );

  return {
    points: assertHistory(points, label),
    provider: "yahoo-public-chart",
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
  };
}

async function withFallback(primary, fallback) {
  try {
    return await primary();
  } catch (primaryError) {
    if (!fallback) throw primaryError;
    try {
      return await fallback();
    } catch (fallbackError) {
      throw new Error(
        `${primaryError.message} Respaldo: ${fallbackError.message}`,
      );
    }
  }
}

const definitions = [
  {
    id: "usdclp",
    label: "USD/CLP",
    unit: "clp",
    fetch: () => mindicadorHistory("dolar", "USD/CLP"),
  },
  {
    id: "copper",
    label: "Cobre",
    unit: "usd-per-pound",
    fetch: () => mindicadorHistory("libra_cobre", "Cobre"),
  },
  {
    id: "sp500",
    label: "S&P 500",
    unit: "points",
    fetch: () =>
      withFallback(
        () => stooqHistory("^spx", "S&P 500"),
        () => yahooHistory("^GSPC", "S&P 500"),
      ),
  },
  {
    id: "brent",
    label: "Brent",
    unit: "usd-per-barrel",
    fetch: () => yahooHistory("BZ=F", "Brent"),
  },
];

function recoveredAt(snapshot) {
  for (const value of [
    snapshot?.historyGeneratedAt,
    snapshot?.generatedAt,
    snapshot?.freshnessCheckedAt,
  ]) {
    if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
      return value;
    }
  }
  return null;
}

function validatePersistedHistory(snapshot, now = new Date()) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("El snapshot público no es un objeto válido.");
  }
  if (!Array.isArray(snapshot.history)) {
    throw new Error("El snapshot público no contiene históricos.");
  }

  const storedById = new Map(snapshot.history.map((entry) => [entry?.id, entry]));
  const validById = new Map();

  for (const definition of definitions) {
    const stored = storedById.get(definition.id);
    if (!stored || stored.unit !== definition.unit) continue;

    const points = normalizePoints(stored.points ?? [], now);
    if (points.length < 2) continue;

    validById.set(definition.id, {
      id: definition.id,
      label: definition.label,
      unit: definition.unit,
      provider:
        typeof stored.provider === "string" && stored.provider.trim()
          ? stored.provider
          : "published-snapshot",
      sourceUrl:
        typeof stored.sourceUrl === "string" && stored.sourceUrl.trim()
          ? stored.sourceUrl
          : PUBLISHED_MARKET_SNAPSHOT_URL,
      points,
      recoveredFrom: recoveredAt(snapshot),
    });
  }

  if (validById.size === 0) {
    throw new Error("El snapshot público no contiene series históricas válidas.");
  }

  return validById;
}

async function loadPublishedHistory(now = new Date()) {
  const separator = PUBLISHED_MARKET_SNAPSHOT_URL.includes("?") ? "&" : "?";
  const snapshot = await fetchJson(
    `${PUBLISHED_MARKET_SNAPSHOT_URL}${separator}historyFallback=${Date.now()}`,
  );
  return validatePersistedHistory(snapshot, now);
}

const snapshot = JSON.parse(await readFile(marketSnapshotPath, "utf8"));
const results = await Promise.allSettled(
  definitions.map((definition) => definition.fetch()),
);
const history = [];
const historyDiagnostics = [];

let persistedHistory = new Map();
let persistedHistoryError = null;
if (results.some((result) => result.status === "rejected")) {
  try {
    persistedHistory = await loadPublishedHistory();
  } catch (error) {
    persistedHistoryError = error.message;
  }
}

results.forEach((result, index) => {
  const definition = definitions[index];
  if (result.status === "fulfilled") {
    history.push({
      id: definition.id,
      label: definition.label,
      unit: definition.unit,
      provider: result.value.provider,
      sourceUrl: result.value.sourceUrl,
      points: result.value.points,
    });
    historyDiagnostics.push({
      id: definition.id,
      ok: true,
      provider: result.value.provider,
      observations: result.value.points.length,
    });
    return;
  }

  const persisted = persistedHistory.get(definition.id);
  if (persisted) {
    history.push({
      id: persisted.id,
      label: persisted.label,
      unit: persisted.unit,
      provider: persisted.provider,
      sourceUrl: persisted.sourceUrl,
      points: persisted.points,
    });
    historyDiagnostics.push({
      id: definition.id,
      ok: true,
      provider: persisted.provider,
      observations: persisted.points.length,
      recovered: true,
      recoverySource: "published-market-snapshot",
      recoveredFrom: persisted.recoveredFrom,
      warning: result.reason?.message ?? String(result.reason),
    });
    return;
  }

  const providerError = result.reason?.message ?? String(result.reason);
  historyDiagnostics.push({
    id: definition.id,
    ok: false,
    error: persistedHistoryError
      ? `${providerError} Persistencia: ${persistedHistoryError}`
      : providerError,
  });
});

const enrichedSnapshot = {
  ...snapshot,
  historyWindowDays: HISTORY_DAYS,
  historyGeneratedAt: new Date().toISOString(),
  history,
  historyDiagnostics,
};

const serialized = `${JSON.stringify(enrichedSnapshot, null, 2)}\n`;
await mkdir(publicDataDirectory, { recursive: true });
await Promise.all([
  writeFile(marketSnapshotPath, serialized),
  writeFile(publicSnapshotPath, serialized),
]);

const okCount = historyDiagnostics.filter((item) => item.ok).length;
console.log(
  `Histórico de mercado: ${okCount}/${definitions.length} series cargadas para ${HISTORY_DAYS} días.`,
);
for (const item of historyDiagnostics.filter((entry) => !entry.ok)) {
  console.warn(`Histórico ${item.id}: ${item.error}`);
}
for (const item of historyDiagnostics.filter((entry) => entry.recovered)) {
  console.warn(
    `Histórico ${item.id}: conservado desde el último snapshot público válido tras fallo del proveedor (${item.warning}).`,
  );
}
