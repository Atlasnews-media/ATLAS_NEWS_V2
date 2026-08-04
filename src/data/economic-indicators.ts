export type EconomicIndicatorStatus = "controlled" | "current" | "stale";

export interface EconomicIndicator {
  code: string;
  label: string;
  value: string;
  effectiveDate: string;
}

export interface EconomicIndicatorsSnapshot {
  status: EconomicIndicatorStatus;
  asOf: string;
  sourceName: string;
  sourceUrl: string;
  note: string;
  indicators: EconomicIndicator[];
}

export const economicIndicatorsSnapshot: EconomicIndicatorsSnapshot = {
  status: "controlled",
  asOf: "2026-07-27",
  sourceName: "Banco Central de Chile",
  sourceUrl: "https://si3.bcentral.cl/Bdemovil/BDE/IndicadoresDiarios",
  note: "Muestra controlada. La actualización automática aún no está habilitada.",
  indicators: [
    {
      code: "uf",
      label: "UF",
      value: "$40.844,79",
      effectiveDate: "2026-07-27",
    },
    {
      code: "dolar",
      label: "Dólar observado",
      value: "$946,14",
      effectiveDate: "2026-07-27",
    },
    {
      code: "euro",
      label: "Euro",
      value: "$1.075,65",
      effectiveDate: "2026-07-27",
    },
    {
      code: "utm",
      label: "UTM",
      value: "$71.649",
      effectiveDate: "2026-07-01",
    },
    {
      code: "tpm",
      label: "TPM",
      value: "4,50%",
      effectiveDate: "2026-07-27",
    },
    {
      code: "cobre",
      label: "Cobre",
      value: "US$6,17/lb",
      effectiveDate: "2026-07-27",
    },
  ],
};
