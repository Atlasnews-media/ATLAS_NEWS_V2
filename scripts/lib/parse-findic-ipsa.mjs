export function parseFindicIpsa(payload) {
  if (payload?.codigo !== "ipsa" || !Array.isArray(payload.serie)) {
    throw new Error("Findic: respuesta IPSA sin contrato válido.");
  }

  const rows = payload.serie
    .filter(
      (row) =>
        /^\d{4}-\d{2}-\d{2}$/.test(row?.fecha ?? "") &&
        Number.isFinite(row?.valor) &&
        row.valor > 0,
    )
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (rows.length < 2) {
    throw new Error("Findic: IPSA sin dos jornadas válidas.");
  }

  const [current, previous] = rows;
  const time = Date.parse(`${current.fecha}T00:00:00Z`);
  if (!Number.isFinite(time) || time > Date.now() + 86_400_000) {
    throw new Error("Findic: fecha de cierre no verificable.");
  }
  return {
    value: current.valor,
    changePercent: (current.valor / previous.valor - 1) * 100,
    effectiveAt: `${current.fecha}T00:00:00Z`,
    quoteBasis: "daily-close",
  };
}
