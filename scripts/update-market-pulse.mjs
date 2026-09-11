import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const economicSnapshotPath = new URL("src/data/economic-indicators.json", root);
const marketSnapshotPath = new URL("src/data/market-pulse.json", root);
const publicDataDirectory = new URL("public/data/", root);
const publicSnapshotPath = new URL("public/data/market-pulse.json", root);

const TIME_ZONE = "America/Santiago";
const REQUEST_TIMEOUT_MS = 10_000;
const STOOQ_DAYS = 14;

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

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function trendFor(changePercent) {
  if (!Number.isFinite(changePercent) || Math.abs(changePercent) < 0.01) {
    return "flat";
  }
  return changePercent > 0 ? "up" : "down";
}

function makeAsset({
  id,
  label,
  group,
  value,
  unit,
  changePercent = null,
  effectiveAt = null,
  provider,
  sourceUrl,
  status = "current",
}) {
  return {
    id,
    label,
    group,
    value: Number.isFinite(value) ? value : null,
    unit,
    changePercent: Number.isFinite(changePercent)
      ? round(changePercent)
      : null,
    trend: trendFor(changePercent),
    effectiveAt,
    provider,
    sourceUrl,
    status,
  };
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

function parseStooqCsv(csv, symbol) {
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

  const observations = rows
    .slice(1)
    .map((row) => row.split(","))
    .map((columns) => ({
      date: columns[dateIndex],
      value: Number(columns[closeIndex]),
    }))
    .filter(
      (observation) =>
        /^\d{4}-\d{2}-\d{2}$/.test(observation.date) &&
        Number.isFinite(observation.value) &&
        observation.value > 0,
    );

  if (observations.length < 2) {
    throw new Error(`${symbol}: Stooq no entregó dos cierres utilizables.`);
  }

  const current = observations.at(-1);
  const previous = observations.at(-2);
  return {
    value: current.value,
    changePercent: (current.value / previous.value - 1) * 100,
    effectiveAt: `${current.date}T23:59:00Z`,
  };
}

async function stooqQuote(symbol) {
  const now = new Date();
  const from = new Date(now.getTime() - STOOQ_DAYS * 86_400_000);
  const url =
    `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}` +
    `&d1=${compactDate(from)}&d2=${compactDate(now)}&i=d`;
  const csv = await fetchText(url, { accept: "text/csv,text/plain,*/*" });
  return {
    ...parseStooqCsv(csv, symbol),
    provider: "stooq",
    sourceUrl: `https://stooq.com/q/?s=${encodeURIComponent(symbol)}`,
  };
}

async function yahooQuote(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    "?interval=1d&range=10d";
  const payload = await fetchJson(url, { accept: "application/json" });
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) {
    throw new Error(`${symbol}: Yahoo no entregó metadata.`);
  }

  const closes = (result?.indicators?.quote?.[0]?.close ?? []).filter((value) =>
    Number.isFinite(value),
  );
  const value = Number.isFinite(meta.regularMarketPrice)
    ? meta.regularMarketPrice
    : closes.at(-1);
  const previous = Number.isFinite(meta.previousClose)
    ? meta.previousClose
    : Number.isFinite(meta.chartPreviousClose)
      ? meta.chartPreviousClose
      : closes.at(-2);

  if (!Number.isFinite(value)) {
    throw new Error(`${symbol}: Yahoo no entregó precio utilizable.`);
  }

  const changePercent =
    Number.isFinite(previous) && previous !== 0
      ? (value / previous - 1) * 100
      : null;

  return {
    value,
    changePercent,
    effectiveAt: Number.isFinite(meta.regularMarketTime)
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
    provider: "yahoo-public-chart",
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
  };
}

async function frankfurterFx() {
  const end = new Date();
  const start = new Date(end.getTime() - 10 * 86_400_000);
  const url =
    `https://api.frankfurter.app/${dateKey(start)}..${dateKey(end)}` +
    "?from=USD&to=EUR,JPY";
  const payload = await fetchJson(url);
  const dates = Object.keys(payload?.rates ?? {}).sort();
  if (dates.length < 2) {
    throw new Error("Frankfurter no entregó dos jornadas de FX.");
  }

  const currentDate = dates.at(-1);
  const previousDate = dates.at(-2);
  const current = payload.rates[currentDate];
  const previous = payload.rates[previousDate];

  const eurUsd = 1 / Number(current?.EUR);
  const previousEurUsd = 1 / Number(previous?.EUR);
  const usdJpy = Number(current?.JPY);
  const previousUsdJpy = Number(previous?.JPY);

  if (![eurUsd, previousEurUsd, usdJpy, previousUsdJpy].every(Number.isFinite)) {
    throw new Error("Frankfurter entregó tasas incompletas.");
  }

  const sourceUrl = "https://frankfurter.app/";
  return [
    makeAsset({
      id: "eurusd",
      label: "EUR/USD",
      group: "fx",
      value: round(eurUsd, 4),
      unit: "ratio",
      changePercent: (eurUsd / previousEurUsd - 1) * 100,
      effectiveAt: `${currentDate}T16:00:00Z`,
      provider: "frankfurter-ecb",
      sourceUrl,
    }),
    makeAsset({
      id: "usdjpy",
      label: "USD/JPY",
      group: "fx",
      value: round(usdJpy, 3),
      unit: "ratio",
      changePercent: (usdJpy / previousUsdJpy - 1) * 100,
      effectiveAt: `${currentDate}T16:00:00Z`,
      provider: "frankfurter-ecb",
      sourceUrl,
    }),
  ];
}

async function bitcoinQuote() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price" +
    "?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";
  const payload = await fetchJson(url);
  const value = Number(payload?.bitcoin?.usd);
  const changePercent = Number(payload?.bitcoin?.usd_24h_change);
  if (!Number.isFinite(value)) {
    throw new Error("CoinGecko no entregó Bitcoin utilizable.");
  }
  return {
    value,
    changePercent,
    effectiveAt: new Date().toISOString(),
    provider: "coingecko-public",
    sourceUrl: "https://www.coingecko.com/en/coins/bitcoin",
  };
}

async function quoteWithFallback(primary, fallback) {
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

async function externalAsset(definition) {
  const quote = await quoteWithFallback(
    definition.stooq
      ? () => stooqQuote(definition.stooq)
      : () => yahooQuote(definition.yahoo),
    definition.stooq && definition.yahoo
      ? () => yahooQuote(definition.yahoo)
      : null,
  );

  return makeAsset({
    id: definition.id,
    label: definition.label,
    group: definition.group,
    value: quote.value,
    unit: definition.unit,
    changePercent: quote.changePercent,
    effectiveAt: quote.effectiveAt,
    provider: quote.provider,
    sourceUrl: quote.sourceUrl,
  });
}

function economicAsset(snapshot, code, definition) {
  const indicator = snapshot.indicators?.find((item) => item.code === code);
  if (!indicator || !Number.isFinite(indicator.value)) return null;
  return makeAsset({
    id: definition.id,
    label: definition.label,
    group: definition.group,
    value: indicator.value,
    unit: definition.unit ?? indicator.unit,
    changePercent: indicator.changePercent,
    effectiveAt: indicator.effectiveDate
      ? `${indicator.effectiveDate}T12:00:00-03:00`
      : null,
    provider: snapshot.provider ?? "economic-indicators",
    sourceUrl: snapshot.sourceUrl,
    status: snapshot.status === "current" ? "current" : "stale",
  });
}

const externalDefinitions = [
  {
    id: "sp500",
    label: "S&P 500",
    group: "indices",
    unit: "points",
    stooq: "^spx",
    yahoo: "^GSPC",
  },
  {
    id: "nasdaq",
    label: "Nasdaq Composite",
    group: "indices",
    unit: "points",
    stooq: "^ndq",
    yahoo: "^IXIC",
  },
  {
    id: "dow",
    label: "Dow Jones",
    group: "indices",
    unit: "points",
    stooq: "^dji",
    yahoo: "^DJI",
  },
  {
    id: "stoxx50",
    label: "Euro Stoxx 50",
    group: "indices",
    unit: "points",
    stooq: "^sx5e",
    yahoo: "^STOXX50E",
  },
  {
    id: "ipsa",
    label: "IPSA",
    group: "chile",
    unit: "points",
    stooq: "^ipsa",
    yahoo: "^IPSA",
  },
  {
    id: "ust10y",
    label: "Treasury EE.UU. 10Y",
    group: "rates",
    unit: "percent",
    yahoo: "^TNX",
  },
  {
    id: "brent",
    label: "Brent",
    group: "commodities",
    unit: "usd-per-barrel",
    yahoo: "BZ=F",
  },
  {
    id: "gold",
    label: "Oro",
    group: "commodities",
    unit: "usd-per-ounce",
    yahoo: "GC=F",
  },
];

const economicDefinitions = [
  ["dolar", { id: "usdclp", label: "USD/CLP", group: "fx", unit: "clp" }],
  ["euro", { id: "eurclp", label: "EUR/CLP", group: "fx", unit: "clp" }],
  ["tpm", { id: "tpm", label: "TPM Chile", group: "rates", unit: "percent" }],
  ["uf", { id: "uf", label: "UF", group: "chile", unit: "clp" }],
  ["cobre", { id: "copper", label: "Cobre", group: "commodities", unit: "usd-per-pound" }],
];

const economicSnapshot = JSON.parse(
  await readFile(economicSnapshotPath, "utf8"),
);
const assets = economicDefinitions
  .map(([code, definition]) => economicAsset(economicSnapshot, code, definition))
  .filter(Boolean);
const diagnostics = [];

const externalResults = await Promise.allSettled(
  externalDefinitions.map((definition) => externalAsset(definition)),
);

externalResults.forEach((result, index) => {
  const definition = externalDefinitions[index];
  if (result.status === "fulfilled") {
    assets.push(result.value);
    diagnostics.push({ id: definition.id, ok: true, provider: result.value.provider });
  } else {
    diagnostics.push({
      id: definition.id,
      ok: false,
      error: result.reason?.message ?? String(result.reason),
    });
  }
});

try {
  const fx = await frankfurterFx();
  assets.push(...fx);
  diagnostics.push({ id: "fx-global", ok: true, provider: "frankfurter-ecb" });
} catch (error) {
  diagnostics.push({ id: "fx-global", ok: false, error: error.message });
}

try {
  const bitcoin = await bitcoinQuote();
  assets.push(
    makeAsset({
      id: "bitcoin",
      label: "Bitcoin",
      group: "crypto",
      value: bitcoin.value,
      unit: "usd",
      changePercent: bitcoin.changePercent,
      effectiveAt: bitcoin.effectiveAt,
      provider: bitcoin.provider,
      sourceUrl: bitcoin.sourceUrl,
    }),
  );
  diagnostics.push({ id: "bitcoin", ok: true, provider: bitcoin.provider });
} catch (error) {
  diagnostics.push({ id: "bitcoin", ok: false, error: error.message });
}

const generatedAt = new Date().toISOString();
const snapshot = {
  schemaVersion: 1,
  status: diagnostics.some((item) => item.ok === false) ? "partial" : "current",
  usage: "lab-evaluation",
  generatedAt,
  timeZone: TIME_ZONE,
  assets,
  diagnostics,
};

const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
await mkdir(publicDataDirectory, { recursive: true });
await Promise.all([
  writeFile(marketSnapshotPath, serialized),
  writeFile(publicSnapshotPath, serialized),
]);

const okCount = diagnostics.filter((item) => item.ok).length;
const failedCount = diagnostics.length - okCount;
console.log(
  `Pulso de mercado: ${assets.length} activos, ${okCount} fuentes OK, ${failedCount} fallos.`,
);
for (const item of diagnostics.filter((entry) => !entry.ok)) {
  console.warn(`Pulso ${item.id}: ${item.error}`);
}
