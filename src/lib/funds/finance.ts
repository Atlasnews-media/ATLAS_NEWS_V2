import type { FundPriceObservation, FundReturns, FundTrend } from "./types";

/**
 * Capa financiera del subsistema Fondos.
 *
 * Fase 1 define únicamente el contrato público de este módulo. La lógica
 * determinista de cálculo y sus pruebas se implementarán en Fase 2.
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
