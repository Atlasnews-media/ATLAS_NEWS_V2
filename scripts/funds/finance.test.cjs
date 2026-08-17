const assert = require("node:assert/strict");
const test = require("node:test");

const {
  calculateFundReturns,
  calculateFundTrend,
} = require("../../.tmp/funds-test/finance.js");

const observation = (date, price) => ({ date, price });

test("tendencia compara los dos últimos valores cuota disponibles", () => {
  assert.equal(
    calculateFundTrend([
      observation("2026-08-17", 101),
      observation("2026-08-14", 100),
    ]),
    "up",
  );

  assert.equal(
    calculateFundTrend([
      observation("2026-08-14", 100),
      observation("2026-08-17", 99),
    ]),
    "down",
  );

  assert.equal(
    calculateFundTrend([
      observation("2026-08-14", 100),
      observation("2026-08-17", 100),
    ]),
    "flat",
  );
});

test("rentabilidades usan días calendario y primera cuota desde la fecha objetivo", () => {
  const observations = [
    observation("2025-08-15", 90),
    observation("2025-08-18", 91),
    observation("2026-05-19", 105),
    observation("2026-06-18", 110),
    observation("2026-07-17", 115),
    observation("2026-07-20", 116),
    observation("2026-08-10", 119),
    observation("2026-08-16", 119.5),
    observation("2026-08-17", 120),
  ];

  assert.deepEqual(calculateFundReturns(observations), {
    d7: 0.84,
    d30: 3.45,
    d60: 9.09,
    d90: 14.29,
    y1: 31.87,
  });
});

test("el motor rechaza historial insuficiente para un año", () => {
  assert.throws(
    () =>
      calculateFundReturns([
        observation("2026-01-01", 100),
        observation("2026-08-17", 110),
      ]),
    /Historial insuficiente/,
  );
});

test("el motor rechaza valores cuota no positivos", () => {
  assert.throws(
    () =>
      calculateFundTrend([
        observation("2026-08-14", 100),
        observation("2026-08-17", 0),
      ]),
    /Valor cuota inválido/,
  );
});

test("el motor rechaza fechas duplicadas", () => {
  assert.throws(
    () =>
      calculateFundTrend([
        observation("2026-08-17", 100),
        observation("2026-08-17", 101),
      ]),
    /Fecha de valor cuota duplicada/,
  );
});
