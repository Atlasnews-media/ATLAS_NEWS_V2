import { FUND_RETURN_WINDOWS } from "./config";
import type { FundPriceObservation, FundReturns, FundTrend } from "./types";

/**
 * Capa financiera del subsistema Fondos.
 *
 * Reglas permanentes:
 * - no realizar fetch;
 * - no leer ni escribir archivos;
 * - no depender de Astro ni del DOM;
 * - no formatear HTML;
 * - operar únicamente sobre datos recibidos como argumentos.
 */
export interface FundFinanceEngine {
  trend(observations: readonly FundPriceObservation[]): FundTrend;
  returns(observations: readonly FundPriceObservation[]): FundReturns;
}

interface NormalizedObservation extends FundPriceObservation {
  timestamp: number;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parseIsoDate(date: string): number {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) {
    throw new Error(`Fecha de valor cuota inválida: ${date}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Fecha de valor cuota inválida: ${date}`);
  }

  return timestamp;
}

function normalizeObservations(
  observations: readonly FundPriceObservation[],
): NormalizedObservation[] {
  if (observations.length === 0) {
    throw new Error("No hay observaciones de valor cuota.");
  }

  const normalized = observations.map((observation) => {
    if (!Number.isFinite(observation.price) || observation.price <= 0) {
      throw new Error(
        `Valor cuota inválido para ${observation.date}: ${observation.price}`,
      );
    }

    return {
      date: observation.date,
      price: observation.price,
      timestamp: parseIsoDate(observation.date),
    };
  });

  normalized.sort((left, right) => left.timestamp - right.timestamp);

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].timestamp === normalized[index].timestamp) {
      throw new Error(
        `Fecha de valor cuota duplicada: ${normalized[index].date}`,
      );
    }
  }

  return normalized;
}

function roundPercent(value: number): number {
  const rounded = Number(value.toFixed(2));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function calculateReturn(
  observations: readonly NormalizedObservation[],
  days: number,
): number {
  const last = observations.at(-1);
  const first = observations[0];

  if (!last || !first) {
    throw new Error("No hay observaciones suficientes para calcular retorno.");
  }

  const targetTimestamp = last.timestamp - days * DAY_MS;

  if (first.timestamp > targetTimestamp) {
    throw new Error(
      `Historial insuficiente para calcular rentabilidad de ${days} días.`,
    );
  }

  const start = observations.find(
    (observation) => observation.timestamp >= targetTimestamp,
  );

  if (!start || start.timestamp >= last.timestamp) {
    throw new Error(
      `No existe valor cuota inicial válido para rentabilidad de ${days} días.`,
    );
  }

  return roundPercent(((last.price - start.price) / start.price) * 100);
}

export function calculateFundTrend(
  observations: readonly FundPriceObservation[],
): FundTrend {
  const normalized = normalizeObservations(observations);

  if (normalized.length < 2) {
    throw new Error(
      "Se requieren al menos dos valores cuota para la tendencia.",
    );
  }

  const previous = normalized.at(-2);
  const current = normalized.at(-1);

  if (!previous || !current) {
    throw new Error("No fue posible resolver los últimos valores cuota.");
  }

  if (current.price > previous.price) return "up";
  if (current.price < previous.price) return "down";
  return "flat";
}

export function calculateFundReturns(
  observations: readonly FundPriceObservation[],
): FundReturns {
  const normalized = normalizeObservations(observations);

  return {
    d7: calculateReturn(normalized, FUND_RETURN_WINDOWS.d7),
    d30: calculateReturn(normalized, FUND_RETURN_WINDOWS.d30),
    d60: calculateReturn(normalized, FUND_RETURN_WINDOWS.d60),
    d90: calculateReturn(normalized, FUND_RETURN_WINDOWS.d90),
    y1: calculateReturn(normalized, FUND_RETURN_WINDOWS.y1),
  };
}

export const fundFinance: FundFinanceEngine = Object.freeze({
  trend: calculateFundTrend,
  returns: calculateFundReturns,
});
