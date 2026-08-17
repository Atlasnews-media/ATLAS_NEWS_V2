import type { FundReturnKey, FundSeriesConfig } from "./types";

export const BUSCAFONDOS_BASE_URL = "https://api.buscafondos.com";
export const BUSCAFONDOS_HEALTH_PATH = "/health";

export const EXPECTED_FUND_COUNT = 8;

export const FUND_RETURN_WINDOWS: Readonly<
  Record<FundReturnKey, number>
> = Object.freeze({
  d7: 7,
  d30: 30,
  d60: 60,
  d90: 90,
  y1: 365,
});

/**
 * Whitelist canónica de fondos/series a publicar.
 *
 * Fase 1: se mantiene deliberadamente vacía hasta recibir el listado
 * definitivo de los ocho fondos y sus series. Producción no deberá hacer
 * descubrimiento dinámico de fondos.
 */
export const BEAGF_FUNDS: readonly FundSeriesConfig[] = Object.freeze([]);
