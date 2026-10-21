import assert from "node:assert/strict";
import test from "node:test";
import { assessMarketAsset } from "../public/js/market-data-policy.mjs";

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
  const asset = assessMarketAsset(quote("sp500", "2026-10-20T20:00:00Z"), new Date("2026-10-21T15:00:00Z"));
  assert.equal(asset.freshnessState, "delayed");
  assert.equal(asset.displayEligible, true);
});

test("IPSA: no se acepta timestamp ficticio de scraping", () => {
  const asset = assessMarketAsset(quote("ipsa", null, { quoteBasis: "unverified" }), new Date("2026-10-21T14:00:00Z"));
  assert.equal(asset.displayEligible, false);
});

test("La vigencia máxima también aplica fuera de horario bursátil", () => {
  const asset = assessMarketAsset(quote("sp500", "2026-09-01T20:00:00Z"), new Date("2026-10-21T12:00:00Z"));
  assert.equal(asset.freshnessState, "stale");
  assert.equal(asset.displayEligible, false);
});

test("La cuota oficial diaria puede permanecer vigente hasta su ventana máxima", () => {
  const asset = assessMarketAsset(quote("uf", "2026-10-20T15:00:00Z"), new Date("2026-10-21T15:00:00Z"));
  assert.equal(asset.freshnessState, "official");
  assert.equal(asset.displayEligible, true);
});

test("El último respaldo conserva su etiqueta", () => {
  const asset = assessMarketAsset(quote("brent", "2026-10-21T12:00:00Z", { status: "fallback" }), new Date("2026-10-21T13:00:00Z"));
  assert.equal(asset.status, "fallback");
});

test("Las fechas futuras inverosímiles se excluyen", () => {
  const asset = assessMarketAsset(quote("ipsa", "2026-10-22T17:00:00Z"), new Date("2026-10-21T14:00:00Z"));
  assert.equal(asset.displayEligible, false);
});
