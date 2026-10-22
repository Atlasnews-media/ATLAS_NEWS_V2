import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assessMarketAsset } from "../public/js/market-data-policy.mjs";
import { parseFindicIpsa } from "./lib/parse-findic-ipsa.mjs";
import { computeEconomicVariation } from "./lib/economic-variation.mjs";
import { reconcileEconomicIndicators } from "./lib/reconcile-economic-indicators.mjs";

const quote = (id, effectiveAt, extra = {}) => ({
  id,
  value: 100,
  unit: "points",
  effectiveAt,
  status: "current",
  ...extra,
});

test("SP500: el cierre anterior se conserva como último dato, sin simular cotización intradía", () => {
  const now = new Date("2026-10-21T12:00:00Z"); // 08:00 NY, mercado cerrado
  const asset = assessMarketAsset(quote("sp500", "2026-10-20T20:00:00Z"), now);
  assert.equal(asset.displayEligible, true);
  assert.equal(asset.freshnessState, "closed");
});

test("SP500: cuando abre con precio antiguo se marca retrasado", () => {
  const asset = assessMarketAsset(
    quote("sp500", "2026-10-20T20:00:00Z"),
    new Date("2026-10-21T15:00:00Z"),
  );
  assert.equal(asset.freshnessState, "delayed");
  assert.equal(asset.displayEligible, true);
});

test("IPSA: no se acepta timestamp ficticio de scraping", () => {
  const asset = assessMarketAsset(
    quote("ipsa", null, { quoteBasis: "unverified" }),
    new Date("2026-10-21T14:00:00Z"),
  );
  assert.equal(asset.displayEligible, false);
});

test("La vigencia máxima también aplica fuera de horario bursátil", () => {
  const asset = assessMarketAsset(
    quote("sp500", "2026-09-01T20:00:00Z"),
    new Date("2026-10-21T12:00:00Z"),
  );
  assert.equal(asset.freshnessState, "stale");
  assert.equal(asset.displayEligible, false);
});

test("La cuota oficial diaria puede permanecer vigente hasta su ventana máxima", () => {
  const asset = assessMarketAsset(
    quote("uf", "2026-10-20T15:00:00Z"),
    new Date("2026-10-21T15:00:00Z"),
  );
  assert.equal(asset.freshnessState, "official");
  assert.equal(asset.displayEligible, true);
});

test("El último respaldo conserva su etiqueta", () => {
  const asset = assessMarketAsset(
    quote("brent", "2026-10-21T12:00:00Z", { status: "fallback" }),
    new Date("2026-10-21T13:00:00Z"),
  );
  assert.equal(asset.status, "fallback");
});

test("Las fechas futuras inverosímiles se excluyen", () => {
  const asset = assessMarketAsset(
    quote("ipsa", "2026-10-22T17:00:00Z"),
    new Date("2026-10-21T14:00:00Z"),
  );
  assert.equal(asset.displayEligible, false);
});

test("El dato oficial del día tolera la hora simbólica de mediodía", () => {
  const asset = assessMarketAsset(
    quote("usdclp", "2026-10-21T12:00:00-03:00"),
    new Date("2026-10-21T12:00:00Z"),
  );
  assert.equal(asset.displayEligible, true);
  assert.equal(asset.freshnessState, "official");
});

test("Los IPSA antiguos sin hora de cotización se identifican", () => {
  const asset = assessMarketAsset(
    quote("ipsa", "2026-10-21T12:00:00Z", {
      provider: "diario-financiero-public",
    }),
    new Date("2026-10-21T14:00:00Z"),
  );
  assert.equal(asset.displayEligible, false);
});

test("El IPSA diario se extrae con fecha bursátil verificable", () => {
  const payload = {
    codigo: "ipsa",
    serie: [
      { fecha: "2026-10-20", valor: 10926.5 },
      { fecha: "2026-10-19", valor: 10972.4 },
    ],
  };
  const quote = parseFindicIpsa(payload);
  assert.equal(quote.value, 10926.5);
  assert.equal(quote.effectiveAt, "2026-10-20T00:00:00Z");
  assert.equal(quote.quoteBasis, "daily-close");
  assert.ok(quote.changePercent < 0);
  const guarded = assessMarketAsset(
    { id: "ipsa", unit: "points", provider: "findic-public-close", ...quote },
    new Date("2026-10-21T15:00:00Z"),
  );
  assert.equal(guarded.displayEligible, true);
  assert.equal(guarded.freshnessState, "delayed");
});

test("Findic IPSA rechaza series sin fecha y código confiables", () => {
  assert.throws(() => parseFindicIpsa({ codigo: "usd", serie: [] }));
  assert.throws(() => parseFindicIpsa({ codigo: "ipsa", serie: [] }));
});

test("Referencia FX diaria no caduca por marca futura artificial", () => {
  const asset = assessMarketAsset(
    {
      id: "eurusd",
      value: 1.13,
      effectiveAt: "2026-10-21T00:00:00Z",
      quoteBasis: "daily-reference",
    },
    new Date("2026-10-21T14:00:00Z"),
  );
  assert.equal(asset.displayEligible, true);
  assert.equal(asset.freshnessState, "reference");
});

test("Findic valida la serie actual y excluye fechas futuras", () => {
  const series = {
    codigo: "ipsa",
    serie: [
      { fecha: "2026-10-21", valor: 10987.14 },
      { fecha: "2026-10-20", valor: 10926.5 },
    ],
  };
  const quote = parseFindicIpsa(series);
  assert.equal(quote.effectiveAt, "2026-10-21T00:00:00Z");
  assert.equal(quote.value, 10987.14);
  assert.ok(quote.changePercent > 0);
  assert.throws(() =>
    parseFindicIpsa({
      codigo: "ipsa",
      serie: [
        { fecha: "2099-10-21", valor: 10987.14 },
        { fecha: "2026-10-20", valor: 10926.5 },
      ],
    }),
  );
});

test("IPSA: cierre de ayer queda excluido después de la sesión del día actual", () => {
  const previousClose = quote("ipsa", "2026-10-21T00:00:00Z", {
    value: 10987.14,
    changePercent: 0.55,
    provider: "findic-public-close",
    quoteBasis: "daily-close",
  });
  const checked = assessMarketAsset(
    previousClose,
    new Date("2026-10-22T21:32:00Z"), // 18:32 Santiago
  );
  assert.equal(checked.displayEligible, false);
  assert.equal(checked.freshnessState, "stale");
  assert.match(checked.staleReason, /sin cierre de 2026-10-22/);
});

test("IPSA: ayer antes del cierre se identifica expresamente como cierre anterior", () => {
  const checked = assessMarketAsset(
    quote("ipsa", "2026-10-21T00:00:00Z", {
      provider: "findic-public-close",
      quoteBasis: "daily-close",
    }),
    new Date("2026-10-22T14:00:00Z"), // 11:00 Santiago
  );
  assert.equal(checked.displayEligible, true);
  assert.equal(checked.freshnessState, "delayed");
  assert.match(checked.freshnessNote, /Cierre anterior/);
});

test("IPSA: el cierre del mismo día sí puede presentarse al final de sesión", () => {
  const checked = assessMarketAsset(
    quote("ipsa", "2026-10-22T00:00:00Z", {
      value: 10780.31,
      changePercent: -1.88,
      provider: "findic-public-close",
      quoteBasis: "daily-close",
    }),
    new Date("2026-10-22T21:32:00Z"),
  );
  assert.equal(checked.displayEligible, true);
  assert.equal(checked.freshnessState, "closed");
});

test("Recuperación: un precio de una versión publicada anterior nunca se certifica", () => {
  const checked = assessMarketAsset(
    quote("ipsa", "2026-10-22T00:00:00Z", {
      provider: "findic-public-close",
      quoteBasis: "daily-close",
      recoverySource: "published-market-snapshot",
    }),
    new Date("2026-10-22T21:32:00Z"),
  );
  assert.equal(checked.displayEligible, false);
});

test("Las variaciones económicas deben tener un cierre previo válido", () => {
  assert.deepEqual(computeEconomicVariation(1097.55, 1099.26), {
    changePercent: -0.16,
    trend: "down",
  });
  assert.deepEqual(computeEconomicVariation(72151, 71900), {
    changePercent: 0.35,
    trend: "up",
  });
  assert.deepEqual(computeEconomicVariation(72151, 72151), {
    changePercent: 0,
    trend: "flat",
  });
  assert.equal(computeEconomicVariation(72151, null), null);
  assert.equal(computeEconomicVariation(72151, 0), null);
});

test("Las vistas consumen la misma fuente canónica sin volver a bifurcar UTM", async () => {
  const root = new URL("../", import.meta.url);
  const [hero, indices, runtime, pulser] = await Promise.all([
    readFile(new URL("src/components/EconomicIndicators.astro", root), "utf8"),
    readFile(new URL("src/pages/mercados/indices/index.astro", root), "utf8"),
    readFile(new URL("public/js/market-live.js", root), "utf8"),
    readFile(new URL("scripts/update-market-pulse.mjs", root), "utf8"),
  ]);
  assert.match(hero, /import marketPulse from/);
  assert.match(indices, /import marketPulse from/);
  assert.doesNotMatch(hero, /economicIndicatorsSnapshot|normalizeEconomic/);
  assert.doesNotMatch(runtime, /ECONOMIC_URL|fetchSnapshot\(ECONOMIC_URL\)/);
  assert.match(pulser, /code: "utm"/);
});

test("La vigencia del IPSA se aplica también a feeds intradía alternativos", () => {
  const assessed = assessMarketAsset(
    quote("ipsa", "2026-10-21T19:00:00Z", {
      value: 10987.14,
      provider: "yahoo-public-chart",
      quoteBasis: "exchange-quote",
    }),
    new Date("2026-10-22T21:32:00Z"),
  );
  assert.equal(assessed.displayEligible, false);
  assert.equal(assessed.freshnessState, "stale");
});

test("Un proveedor económico caído no revierte observaciones frescas de otros", () => {
  const definitions = [{ code: "dolar" }, { code: "cobre" }, { code: "utm" }];
  const outcomes = [
    {
      status: "fulfilled",
      value: { code: "dolar", value: 976.82, effectiveDate: "2026-10-22" },
    },
    { status: "rejected", reason: new Error("timeout") },
    {
      status: "fulfilled",
      value: { code: "utm", value: 72151, effectiveDate: "2026-10-01" },
    },
  ];
  const backup = [
    {
      code: "cobre",
      value: 6.61,
      effectiveDate: "2026-10-21",
      changePercent: 0.1,
    },
  ];
  const result = reconcileEconomicIndicators(definitions, outcomes, backup);
  assert.equal(result.status, "partial");
  assert.equal(result.freshCount, 2);
  assert.equal(result.fallbackCount, 1);
  assert.equal(result.missingCount, 0);
  assert.equal(
    result.indicators.find((x) => x.code === "dolar").status,
    "current",
  );
  assert.equal(
    result.indicators.find((x) => x.code === "cobre").status,
    "stale",
  );
  assert.equal(result.indicators.find((x) => x.code === "utm").value, 72151);
  assert.equal(result.errors.length, 1);
});

test("Sin respaldo de una serie, conservar todas las otras y registrar faltante", () => {
  const result = reconcileEconomicIndicators(
    [{ code: "uf" }, { code: "dolar" }],
    [
      {
        status: "fulfilled",
        value: { code: "uf", value: 41199.85, effectiveDate: "2026-10-22" },
      },
      { status: "rejected", reason: new Error("offline") },
    ],
  );
  assert.equal(result.indicators.length, 1);
  assert.equal(result.missingCount, 1);
  assert.equal(result.status, "partial");
});

test("El refresco bursátil no comparte cola con publicación editorial", async () => {
  const root = new URL("../", import.meta.url);
  const [refreshYaml, publishYaml, client] = await Promise.all([
    readFile(
      new URL(".github/workflows/market-data-refresh.yml", root),
      "utf8",
    ),
    readFile(new URL(".github/workflows/publish-site.yml", root), "utf8"),
    readFile(new URL("public/js/market-live.js", root), "utf8"),
  ]);
  assert.match(refreshYaml, /group: atlas-news-market-refresh/);
  assert.match(refreshYaml, /workflow_run:/);
  assert.match(refreshYaml, /7,22,37,52|3,18,33,48/);
  assert.match(publishYaml, /group: atlas-news-\$\{\{/);
  assert.match(client, /MARKET_SNAPSHOT_MAX_AGE_MS/);
  assert.match(client, /Último corte disponible/);
});
