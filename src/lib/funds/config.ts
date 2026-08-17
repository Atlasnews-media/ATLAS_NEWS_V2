import type { FundReturnKey, FundSeriesConfig } from "./types";

export const BUSCAFONDOS_BASE_URL = "https://api.buscafondos.com";
export const BUSCAFONDOS_HEALTH_PATH = "/health";

export const EXPECTED_FUND_COUNT = 10;

export const FUND_RETURN_WINDOWS: Readonly<Record<FundReturnKey, number>> =
  Object.freeze({
    d7: 7,
    d30: 30,
    d60: 60,
    d90: 90,
    y1: 365,
  });

/**
 * Whitelist canónica de fondos/series a publicar.
 *
 * Los identificadores provienen del catálogo de BuscaFondos ya utilizado por
 * el comparador FFMM de referencia. En Fase 3 se contrastarán nuevamente
 * contra la API antes de habilitar cualquier actualización automática.
 *
 * Algunas series se codifican como CLASI en la fuente aunque editorialmente
 * correspondan a la serie Clásico. Se conservan ambas denominaciones para
 * poder validar la fuente sin trasladar ese código interno al lector.
 */
export const BEAGF_FUNDS: readonly FundSeriesConfig[] = Object.freeze([
  {
    key: "conveniencia-c",
    displayName: "Conveniencia",
    sourceFundName: "FONDO MUTUO CONVENIENCIA BANCOESTADO",
    conceptualAssetId: "2002574717",
    seriesId: "2923188229",
    seriesName: "C",
    sourceSeriesName: "C",
  },
  {
    key: "liquidez-asg-clasico",
    displayName: "Liquidez ASG",
    sourceFundName: "FONDO MUTUO BANCOESTADO LIQUIDEZ ASG",
    conceptualAssetId: "249081581",
    seriesId: "1364354814",
    seriesName: "Clásico",
    sourceSeriesName: "CLASI",
  },
  {
    key: "chile-sostenible-conservador-clasico",
    displayName: "Chile Sostenible Conservador",
    sourceFundName: "FONDO MUTUO BANCOESTADO CHILE SOSTENIBLE CONSERVADOR",
    conceptualAssetId: "579377459",
    seriesId: "619462196",
    seriesName: "Clásico",
    sourceSeriesName: "CLASICO",
  },
  {
    key: "mi-futuro-accesible-clasico",
    displayName: "Mi Futuro Accesible",
    sourceFundName: "FONDO MUTUO BANCOESTADO MI FUTURO ACCESIBLE",
    conceptualAssetId: "3073297714",
    seriesId: "240528668",
    seriesName: "Clásico",
    sourceSeriesName: "CLASICO",
  },
  {
    key: "mi-futuro-conservador-clasico",
    displayName: "Mi Futuro Conservador",
    sourceFundName: "FONDO MUTUO BANCOESTADO MI FUTURO CONSERVADOR",
    conceptualAssetId: "1389387372",
    seriesId: "1601605775",
    seriesName: "Clásico",
    sourceSeriesName: "CLASICO",
  },
  {
    key: "mi-futuro-moderado-clasico",
    displayName: "Mi Futuro Moderado",
    sourceFundName: "FONDO MUTUO BANCOESTADO MI FUTURO MODERADO",
    conceptualAssetId: "1596176255",
    seriesId: "1357703813",
    seriesName: "Clásico",
    sourceSeriesName: "CLASICO",
  },
  {
    key: "chile-ecologico-clasico",
    displayName: "Chile Ecológico",
    sourceFundName: "FONDO MUTUO BANCOESTADO CHILE ECOLOGICO",
    conceptualAssetId: "4237267305",
    seriesId: "395874242",
    seriesName: "Clásico",
    sourceSeriesName: "CLASI",
  },
  {
    key: "perfil-e-clasico",
    displayName: "Perfil E",
    sourceFundName: "FONDO MUTUO BANCOESTADO PERFIL  E",
    conceptualAssetId: "3065517706",
    seriesId: "1502993196",
    seriesName: "Clásico",
    sourceSeriesName: "CLASI",
  },
  {
    key: "perfil-c-clasico",
    displayName: "Perfil C",
    sourceFundName: "FONDO MUTUO BANCOESTADO PERFIL C",
    conceptualAssetId: "1570573798",
    seriesId: "63492819",
    seriesName: "Clásico",
    sourceSeriesName: "CLASI",
  },
  {
    key: "perfil-a-clasico",
    displayName: "Perfil A",
    sourceFundName: "FONDO MUTUO BANCOESTADO PERFIL  A",
    conceptualAssetId: "2991654653",
    seriesId: "2200754105",
    seriesName: "Clásico",
    sourceSeriesName: "CLASI",
  },
]);
