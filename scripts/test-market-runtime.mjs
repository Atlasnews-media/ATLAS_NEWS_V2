import assert from "node:assert/strict";
import test from "node:test";
import { assessMarketAsset } from "../public/js/market-data-policy.mjs";
import { parseFindicIpsa } from "./lib/parse-findic-ipsa.mjs";

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
