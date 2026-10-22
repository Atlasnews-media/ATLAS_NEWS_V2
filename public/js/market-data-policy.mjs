// Contrato de vigencia compartido entre el runner y el lector (sin dependencias).
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const sessions = {
  sp500: { zone: "America/New_York", start: 570, end: 960 },
  nasdaq: { zone: "America/New_York", start: 570, end: 960 },
  dow: { zone: "America/New_York", start: 570, end: 960 },
  ust10y: { zone: "America/New_York", start: 480, end: 1020 },
  ipsa: { zone: "America/Santiago", start: 570, end: 960 },
  stoxx50: { zone: "Europe/Berlin", start: 540, end: 1050 },
  brent: { zone: "Europe/London", start: 120, end: 1320 },
  gold: { zone: "America/New_York", start: 360, end: 1020 },
};
const officialMaxDays = {
  usdclp: 7,
  eurclp: 7,
  uf: 3,
  utm: 40,
  copper: 7,
  tpm: 45,
};
const referenceMaxHours = { eurusd: 120, usdjpy: 120 };
const HARD_MARKET_HOURS = 144;

function clockInZone(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const fields = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return {
    weekday: fields.weekday,
    minuteOfDay: Number(fields.hour) * 60 + Number(fields.minute),
  };
}

function sessionOpen(id, now) {
  if (id === "bitcoin") return true;
  const session = sessions[id];
  if (!session) return false;
  const local = clockInZone(now, session.zone);
  return (
    !["Sat", "Sun"].includes(local.weekday) &&
    local.minuteOfDay >= session.start &&
    local.minuteOfDay < session.end
  );
}

function dateInZone(now, zone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const fields = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function isBusinessDay(weekday) {
  return !["Sat", "Sun"].includes(weekday);
}

function unavailable(asset, reason) {
  return {
    ...asset,
    status: "stale",
    displayEligible: false,
    freshnessState: "stale",
    staleReason: reason,
  };
}

export function assessMarketAsset(asset, now = new Date()) {
  if (!asset || typeof asset.id !== "string") {
    return unavailable(asset ?? {}, "activo sin identificador");
  }
  if (!Number.isFinite(asset.value)) {
    return unavailable(asset, "cotización no disponible");
  }
  if (asset.recoverySource === "published-market-snapshot") {
    return unavailable(
      asset,
      "precio recuperado de una publicación anterior; sin validación nueva",
    );
  }
  if (
    asset.quoteBasis === "unverified" ||
    (asset.provider === "diario-financiero-public" &&
      asset.quoteBasis !== "verified")
  ) {
    return unavailable(asset, "proveedor sin fecha verificable de cotización");
  }
  const effective = Date.parse(asset.effectiveAt ?? "");
  if (!Number.isFinite(effective)) {
    return unavailable(asset, "cotización sin fecha efectiva válida");
  }
  const delta = now.getTime() - effective;
  const futureTolerance = officialMaxDays[asset.id] != null ? DAY : 10 * 60_000;
  if (delta < -futureTolerance) {
    return unavailable(asset, "cotización con fecha futura no verificable");
  }
  const hours = Math.max(0, delta / HOUR);
  const maxAge =
    officialMaxDays[asset.id] != null
      ? (officialMaxDays[asset.id] * DAY) / HOUR
      : (referenceMaxHours[asset.id] ??
        (asset.id === "bitcoin" ? 48 : HARD_MARKET_HOURS));
  if (hours > maxAge) {
    return unavailable(asset, `cotización vencida: ${Math.round(hours)} horas`);
  }
  // El cierre del IPSA corresponde a una sesión determinada. Al terminar
  // la sesión actual, un cierre anterior nunca puede mostrarse como el de hoy.
  if (asset.id === "ipsa") {
    const local = clockInZone(now, "America/Santiago");
    const today = dateInZone(now, "America/Santiago");
    const quoteDate =
      asset.quoteBasis === "daily-close"
        ? asset.effectiveAt.slice(0, 10)
        : dateInZone(new Date(asset.effectiveAt), "America/Santiago");
    if (
      isBusinessDay(local.weekday) &&
      quoteDate < today &&
      local.minuteOfDay >= 17 * 60
    ) {
      return unavailable(
        asset,
        `IPSA sin cierre de ${today}; último cierre disponible: ${quoteDate}`,
      );
    }
    if (isBusinessDay(local.weekday) && quoteDate < today) {
      return {
        ...asset,
        status: "delayed",
        displayEligible: true,
        freshnessState: "delayed",
        freshnessNote: `Cierre anterior (${quoteDate}); no representa la sesión actual`,
        staleReason: undefined,
      };
    }
  }
  if (officialMaxDays[asset.id] != null) {
    return {
      ...asset,
      displayEligible: true,
      freshnessState: "official",
      staleReason: undefined,
    };
  }
  if (referenceMaxHours[asset.id] != null) {
    return {
      ...asset,
      displayEligible: true,
      freshnessState: "reference",
      staleReason: undefined,
    };
  }
  if (!sessionOpen(asset.id, now)) {
    return {
      ...asset,
      displayEligible: true,
      freshnessState: "closed",
      staleReason: undefined,
    };
  }
  const current = asset.quoteBasis !== "daily-close" && hours <= 0.75;
  return {
    ...asset,
    status:
      asset.status === "fallback"
        ? "fallback"
        : current
          ? "current"
          : "delayed",
    displayEligible: true,
    freshnessState: current ? "current" : "delayed",
    freshnessNote: current
      ? undefined
      : "último dato disponible; no es una cotización en tiempo real",
    staleReason: undefined,
  };
}
