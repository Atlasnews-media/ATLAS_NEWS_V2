import snapshot from "./economic-indicators.json";

export type EconomicIndicatorStatus = "current" | "stale";
export type EconomicIndicatorUnit =
  "clp" | "clp-integer" | "percent" | "usd-per-pound";

export interface EconomicIndicator {
  code: string;
  label: string;
  value: number;
  unit: EconomicIndicatorUnit;
  effectiveDate: string;
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
