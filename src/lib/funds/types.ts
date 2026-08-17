export type FundTrend = "up" | "down" | "flat";

export type FundReturnKey = "d7" | "d30" | "d60" | "d90" | "y1";

export interface FundSeriesConfig {
  /** Identificador interno estable de ATLAS NEWS. */
  key: string;
  /** Nombre que se mostrará editorialmente en la tabla. */
  displayName: string;
  /** Identificador del fondo conceptual en BuscaFondos. */
  conceptualAssetId: string;
  /** Identificador de la serie real en BuscaFondos. */
  seriesId: string;
  /** Nombre o código de la serie seleccionado para publicación. */
  seriesName: string;
  /** RUN CMF del fondo, cuando esté disponible. */
  run?: string;
}

export interface FundReturns {
  d7: number;
  d30: number;
  d60: number;
  d90: number;
  y1: number;
}

export interface FundSnapshotRow {
  key: string;
  displayName: string;
  seriesId: string;
  seriesName: string;
  effectiveDate: string;
  trend: FundTrend;
  returns: FundReturns;
}

export interface FundSnapshotSource {
  name: string;
  provider: "buscafondos";
  baseUrl: string;
}

export interface FundSnapshot {
  schemaVersion: 1;
  status: "current" | "stale";
  asOf: string;
  fetchedAt: string;
  source: FundSnapshotSource;
  funds: FundSnapshotRow[];
}

export interface FundPriceObservation {
  date: string;
  price: number;
}
