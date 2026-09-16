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

// FASE 1 — recuperación controlada.
// Último histórico válido publicado antes de los timeouts de MiIndicador.
// Fuente canónica: producción V1 del 2026-09-15T03:12:26.447Z.
// Este bloque es temporal y debe ser sustituido en FASE 2 por persistencia
// automática del último histórico válido.
const RESTORED_HISTORY = {
  usdclp: [
    { date: "2026-08-17", value: 913.15 },
    { date: "2026-08-18", value: 914.19 },
    { date: "2026-08-19", value: 922.12 },
    { date: "2026-08-20", value: 920.26 },
    { date: "2026-08-21", value: 923.23 },
    { date: "2026-08-24", value: 918.17 },
    { date: "2026-08-25", value: 914.64 },
    { date: "2026-08-26", value: 911.43 },
    { date: "2026-08-27", value: 918.42 },
    { date: "2026-08-28", value: 925.25 },
    { date: "2026-08-31", value: 929.18 },
    { date: "2026-09-01", value: 933.4 },
    { date: "2026-09-02", value: 936.86 },
    { date: "2026-09-03", value: 936.32 },
    { date: "2026-09-04", value: 933.47 },
    { date: "2026-09-07", value: 934.35 },
    { date: "2026-09-08", value: 933.82 },
    { date: "2026-09-09", value: 926.94 },
    { date: "2026-09-10", value: 925.97 },
    { date: "2026-09-11", value: 937.17 },
    { date: "2026-09-14", value: 940.91 },
  ],
  copper: [
    { date: "2026-08-17", value: 6.53 },
    { date: "2026-08-18", value: 6.61 },
    { date: "2026-08-19", value: 6.62 },
    { date: "2026-08-20", value: 6.46 },
    { date: "2026-08-21", value: 6.52 },
    { date: "2026-08-24", value: 6.4 },
    { date: "2026-08-25", value: 6.48 },
    { date: "2026-08-26", value: 6.51 },
    { date: "2026-08-27", value: 6.58 },
    { date: "2026-08-28", value: 6.56 },
    { date: "2026-08-31", value: 6.56 },
    { date: "2026-09-01", value: 6.55 },
    { date: "2026-09-02", value: 6.55 },
    { date: "2026-09-03", value: 6.53 },
    { date: "2026-09-04", value: 6.49 },
    { date: "2026-09-07", value: 6.53 },
    { date: "2026-09-08", value: 6.57 },
    { date: "2026-09-09", value: 6.62 },
    { date: "2026-09-10", value: 6.69 },
    { date: "2026-09-11", value: 6.72 },
    { date: "2026-09-14", value: 6.45 },
  ],
};

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

const snapshot = JSON.parse(await readFile(marketSnapshotPath, "utf8"));
const results = await Promise.allSettled(
  definitions.map((definition) => definition.fetch()),
);
const history = [];
const historyDiagnostics = [];

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

  const restoredPoints = normalizePoints(RESTORED_HISTORY[definition.id] ?? []);
  if (restoredPoints.length >= 2) {
    history.push({
      id: definition.id,
      label: definition.label,
      unit: definition.unit,
      provider: "mindicador",
      sourceUrl: "https://mindicador.cl/",
      points: restoredPoints,
    });
    historyDiagnostics.push({
      id: definition.id,
      ok: true,
      provider: "mindicador",
      observations: restoredPoints.length,
      recovered: true,
      recoveredFrom: "2026-09-15T03:12:26.447Z",
      warning: result.reason?.message ?? String(result.reason),
    });
    return;
  }

  historyDiagnostics.push({
    id: definition.id,
    ok: false,
    error: result.reason?.message ?? String(result.reason),
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
    `Histórico ${item.id}: restaurado desde último snapshot válido tras fallo del proveedor (${item.warning}).`,
  );
}
