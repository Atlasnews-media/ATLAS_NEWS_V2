// Reconcile independent provider reads: an outage for one series must never
// replace successfully refreshed observations for other series.
export function reconcileEconomicIndicators(
  definitions,
  outcomes,
  fallback = [],
) {
  const backup = new Map(fallback.map((item) => [item.code, item]));
  const errors = [];
  let freshCount = 0;
  let fallbackCount = 0;
  const indicators = definitions.flatMap((definition, index) => {
    const result = outcomes[index];
    if (result?.status === "fulfilled") {
      freshCount += 1;
      return [{ ...result.value, status: "current" }];
    }
    const previous = backup.get(definition.code);
    errors.push({
      code: definition.code,
      reason: String(
        result?.reason?.message ?? result?.reason ?? "sin respuesta",
      ),
    });
    if (
      previous &&
      Number.isFinite(previous.value) &&
      typeof previous.effectiveDate === "string"
    ) {
      fallbackCount += 1;
      return [{ ...previous, status: "stale" }];
    }
    return [];
  });
  return {
    indicators,
    errors,
    freshCount,
    fallbackCount,
    missingCount: definitions.length - indicators.length,
    status:
      freshCount === definitions.length
        ? "current"
        : freshCount === 0
          ? "stale"
          : "partial",
  };
}
