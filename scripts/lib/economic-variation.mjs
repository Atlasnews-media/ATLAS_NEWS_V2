export function computeEconomicVariation(currentValue, previousValue) {
  if (
    !Number.isFinite(currentValue) ||
    !Number.isFinite(previousValue) ||
    currentValue <= 0 ||
    previousValue <= 0
  ) {
    return null;
  }
  const changePercent =
    Math.round((currentValue / previousValue - 1) * 10_000) / 100;
  const trend =
    Math.abs(changePercent) < 0.01
      ? "flat"
      : changePercent > 0
        ? "up"
        : "down";
  return { changePercent, trend };
}
