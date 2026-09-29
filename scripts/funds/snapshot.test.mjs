import assert from "node:assert/strict";
import test from "node:test";

import { cleanupFundsRuntime, loadFundsRuntime } from "./load-runtime.mjs";
import { buildFundsSnapshot } from "./snapshot.mjs";

function createFixtureClient(configs, { mismatchSeriesKey } = {}) {
  const asOf = "2026-08-17";
  const calls = [];

  return {
    calls,
    async health() {
      return { status: "ok", last_scraped_date: asOf };
    },
    async assetProviders() {
      return [
        {
          id: "beagf-provider",
          attributes: {
            name: "BANCOESTADO ADMINISTRADORA GENERAL DE FONDOS S.A.",
          },
        },
      ];
    },
    async conceptualAssets(providerId) {
      assert.equal(providerId, "beagf-provider");
      return configs.map((config) => ({
        id: config.conceptualAssetId,
        attributes: { name: config.sourceFundName },
      }));
    },
    async realAssets(conceptualAssetId) {
      const config = configs.find(
        (item) => item.conceptualAssetId === conceptualAssetId,
      );
      assert.ok(config);
      return [
        {
          id: config.seriesId,
          attributes: {
            serie:
              config.key === mismatchSeriesKey
                ? "SERIE-INCORRECTA"
                : config.sourceSeriesName,
          },
        },
      ];
    },
    async days(seriesId, fromDate) {
      calls.push({ seriesId, fromDate });
      return [
        ["2025-08-01", 99],
        ["2025-08-18", 100],
        ["2026-05-19", 105],
        ["2026-06-18", 106],
        ["2026-07-20", 107],
        ["2026-08-10", 108],
        ["2026-08-14", 109],
        ["2026-08-17", 110],
      ].map(([date, price]) => ({ attributes: { date, price } }));
    },
  };
}

test("construye snapshot de las diez series configuradas", async () => {
  const runtime = loadFundsRuntime();
  try {
    const configs = runtime.config.BEAGF_FUNDS;
    const client = createFixtureClient(configs);
    const snapshot = await buildFundsSnapshot({
      client,
      configs,
      finance: runtime.finance,
      expectedCount: runtime.config.EXPECTED_FUND_COUNT,
      baseUrl: runtime.config.BUSCAFONDOS_BASE_URL,
      now: () => new Date("2026-08-17T20:00:00.000Z"),
    });

    assert.equal(snapshot.asOf, "2026-08-17");
    assert.equal(snapshot.fetchedAt, "2026-08-17T20:00:00.000Z");
    assert.equal(snapshot.funds.length, 10);
    assert.equal(snapshot.funds[0].displayName, "Conveniencia");
    assert.equal(snapshot.funds[0].trend, "up");
    assert.deepEqual(snapshot.funds[0].returns, {
      d7: 1.85,
      d30: 2.8,
      d60: 3.77,
      d90: 4.76,
      y1: 10,
    });

    assert.equal(client.calls.length, 10);
    assert.ok(client.calls.every((call) => call.fromDate === "2025-08-02"));
  } finally {
    cleanupFundsRuntime();
  }
});

test("rechaza una serie cuyo código fuente no coincide", async () => {
  const runtime = loadFundsRuntime();
  try {
    const configs = runtime.config.BEAGF_FUNDS;
    const client = createFixtureClient(configs, {
      mismatchSeriesKey: "liquidez-asg-clasico",
    });

    await assert.rejects(
      buildFundsSnapshot({
        client,
        configs,
        finance: runtime.finance,
        expectedCount: runtime.config.EXPECTED_FUND_COUNT,
        baseUrl: runtime.config.BUSCAFONDOS_BASE_URL,
      }),
      /serie configurada no coincide/,
    );
  } finally {
    cleanupFundsRuntime();
  }
});
