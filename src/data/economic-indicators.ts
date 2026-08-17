import snapshot from "./economic-indicators.json";

export type EconomicIndicatorStatus = "current" | "stale";
export type EconomicIndicatorUnit =
  "clp" | "clp-integer" | "percent" | "usd-per-pound";
export type EconomicIndicatorTrend = "up" | "down" | "flat";

export interface EconomicIndicator {
  code: string;
  label: string;
  value: number;
  unit: EconomicIndicatorUnit;
  effectiveDate: string;
  previousValue?: number;
  previousEffectiveDate?: string;
  changePercent?: number;
  trend?: EconomicIndicatorTrend;
}

export interface EconomicIndicatorsSnapshot {
  schemaVersion: 1;
  status: EconomicIndicatorStatus;
  asOf: string;
  fetchedAt: string;
  lastAttemptAt: string;
  sourceName: string;
  sourceUrl: string;
  provider: string;
  indicators: EconomicIndicator[];
}

export const economicIndicatorsSnapshot =
  snapshot as EconomicIndicatorsSnapshot;
