import { assessMarketAsset } from "./market-data-policy.mjs";

const MARKET_URL = "/data/market-pulse.json";
const ECONOMIC_URL = "/data/economic-indicators.json";
const REFRESH_MS = 5 * 60_000;
const CL_TIME_ZONE = "America/Santiago";

const number2 = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const number4 = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const number0 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const signedChange = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always",
});
const absoluteChange = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function displayValue(asset) {
  if (
    !asset ||
    asset.displayEligible === false ||
    !Number.isFinite(asset.value)
  ) {
    return "—";
  }
  switch (asset.unit) {
    case "clp":
      return `$${number2.format(asset.value)}`;
    case "clp-integer":
      return `$${number0.format(asset.value)}`;
    case "percent":
      return `${number2.format(asset.value)}%`;
    case "usd-per-pound":
      return `US$${number2.format(asset.value)}/lb`;
    case "usd-per-barrel":
      return `US$${number2.format(asset.value)}`;
    case "usd-per-ounce":
      return `US$${number0.format(asset.value)}`;
    case "usd":
      return `US$${number0.format(asset.value)}`;
    case "ratio":
      return number4.format(asset.value);
    default:
      return number2.format(asset.value);
  }
}

function marketTrend(asset) {
  if (
    asset.displayEligible === false ||
    !Number.isFinite(asset.changePercent)
  ) {
    return null;
  }
  return asset.changePercent > 0
    ? "up"
    : asset.changePercent < 0
      ? "down"
      : "flat";
}

function setOptionalText(element, content) {
  if (!element) return;
  element.textContent = content ?? "";
  element.hidden = !content;
  element.style.display = content ? "" : "none";
}

function effectiveLabel(asset) {
  if (asset.displayEligible === false)
    return asset.staleReason ?? "sin dato vigente";
  if (
    asset.quoteBasis === "daily-close" ||
    asset.quoteBasis === "daily-reference"
  ) {
    const day = String(asset.effectiveAt).slice(0, 10);
    const parsed = new Date(`${day}T12:00:00Z`);
    const dateLabel = Number.isFinite(parsed.getTime())
      ? new Intl.DateTimeFormat("es-CL", {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(parsed)
      : day;
    const basis =
      asset.quoteBasis === "daily-close"
        ? "Último cierre diario"
        : "Referencia diaria";
    return `${basis}: ${dateLabel} · ${asset.provider ?? "fuente sin identificar"}`;
  }
  const date = new Date(asset.effectiveAt);
  const value = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: CL_TIME_ZONE,
      }).format(date)
    : "fecha no disponible";
  const prefix =
    asset.freshnessState === "closed"
      ? "Último cierre / referencia"
      : asset.freshnessState === "delayed"
        ? "Último dato disponible"
        : "Dato efectivo";
  return `${prefix}: ${value} · ${asset.provider ?? "fuente sin identificar"}`;
}

function updateRow(row, asset) {
  const price = row.querySelector("[data-atlas-market-value]");
  if (price) {
    price.textContent = displayValue(asset);
    price.title = effectiveLabel(asset);
  }
  const nameElement = row.querySelector(
    ".economic-panel__label, .market-label, .asset-name > span",
  );
  if (nameElement && asset.id === "ipsa") {
    nameElement.textContent =
      asset.quoteBasis === "daily-close" && asset.displayEligible !== false
        ? "IPSA · cierre"
        : "IPSA";
  }
  const trend = marketTrend(asset);
  const raw = trend == null ? null : asset.changePercent;
  const direction = trend ?? "flat";
  const change = row.querySelector("[data-atlas-market-change]");
  const arrow = row.querySelector("[data-atlas-market-arrow]");
  const warning = row.querySelector("[data-atlas-market-warning]");
  const isEconomic = row.classList.contains("economic-panel__item");
  const isPulse =
    row.hasAttribute("data-atlas-market-id") &&
    row.querySelector(".market-change") != null;

  row.dataset.state = asset.displayEligible === false ? "stale" : direction;
  row.dataset.freshness = asset.freshnessState;
  if (change) {
    if (isEconomic) {
      const symbol =
        direction === "up" ? "▲" : direction === "down" ? "▼" : "→";
      setOptionalText(
        change,
        raw == null
          ? "—"
          : `${symbol} ${absoluteChange.format(Math.abs(raw))}%`,
      );
      change.dataset.trend = direction;
      change.classList.toggle("economic-panel__trend--neutral", raw == null);
      change.setAttribute(
        "aria-label",
        raw == null ? "Sin variación" : `Variación ${change.textContent}`,
      );
    } else if (isPulse) {
      setOptionalText(
        change,
        raw == null ? null : `${signedChange.format(raw)}%`,
      );
      change.dataset.direction = direction;
    } else {
      change.textContent =
        asset.displayEligible === false
          ? "sin dato vigente"
          : raw == null
            ? asset.id === "uf"
              ? "dato diario"
              : "sin variación"
            : `${signedChange.format(raw)}%`;
    }
  }
  if (arrow) {
    arrow.textContent =
      asset.displayEligible === false
        ? "●"
        : direction === "up"
          ? "↑"
          : direction === "down"
            ? "↓"
            : "●";
  }
  if (warning) {
    setOptionalText(
      warning,
      asset.displayEligible === false
        ? (asset.staleReason ?? "dato fuera de vigencia")
        : asset.freshnessState === "delayed"
          ? "último dato disponible"
          : null,
    );
  }
}

function updateStamps(generatedAt) {
  const date = new Date(generatedAt);
  if (!Number.isFinite(date.getTime())) return;
  const dateLabel = new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: CL_TIME_ZONE,
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: CL_TIME_ZONE,
  }).format(date);
  const longLabel = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: CL_TIME_ZONE,
  }).format(date);
  for (const element of document.querySelectorAll(
    "[data-atlas-market-stamp]",
  )) {
    switch (element.dataset.atlasMarketStamp) {
      case "pulse":
        element.textContent = `Datos de mercado · Corte ${longLabel}`;
        break;
      case "short":
        element.textContent = `${dateLabel.toUpperCase()} · ${timeLabel}`;
        break;
      case "date":
        element.textContent = dateLabel;
        element.setAttribute("datetime", generatedAt);
        break;
    }
  }
}

function snapshotValid(snapshot) {
  if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.assets))
    return false;
  const created = Date.parse(snapshot.generatedAt ?? "");
  return Number.isFinite(created) && created <= Date.now() + 10 * 60_000;
}

async function fetchSnapshot(path) {
  const response = await fetch(`${path}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function refresh() {
  const marketRows = document.querySelectorAll("[data-atlas-market-id]");
  if (!marketRows.length) return;
  try {
    const market = await fetchSnapshot(MARKET_URL);
    if (!snapshotValid(market)) throw new Error("snapshot financiero inválido");
    const assets = new Map(market.assets.map((asset) => [asset.id, asset]));
    let economic = null;
    if (document.querySelector("[data-atlas-economic-code='utm']")) {
      try {
        economic = await fetchSnapshot(ECONOMIC_URL);
      } catch (error) {
        console.warn("ATLAS NEWS: UTM sin actualización dinámica", error);
      }
    }
    const now = new Date();
    for (const row of marketRows) {
      const id = row.dataset.atlasMarketId;
      let asset = assets.get(id);
      if (!asset && row.dataset.atlasEconomicCode === "utm" && economic) {
        const indicator = economic.indicators?.find(
          (item) => item.code === "utm",
        );
        if (indicator) {
          asset = {
            id: "utm",
            value: indicator.value,
            unit: indicator.unit,
            effectiveAt: `${indicator.effectiveDate}T12:00:00Z`,
            provider: economic.provider,
            changePercent: null,
            displayEligible: economic.status === "current",
          };
        }
      }
      if (!asset) {
        updateRow(row, {
          id,
          value: null,
          displayEligible: false,
          staleReason: "sin dato disponible",
        });
        continue;
      }
      updateRow(row, assessMarketAsset(asset, now));
    }
    updateStamps(market.generatedAt);
    const sourceLabel = document.querySelector(
      "[data-atlas-economic-freshness]",
    );
    if (sourceLabel && economic) {
      sourceLabel.textContent =
        economic.status === "current" ? "Datos al" : "Último dato disponible";
    }
    document.dispatchEvent(
      new CustomEvent("atlas:market-data-updated", {
        detail: { generatedAt: market.generatedAt },
      }),
    );
  } catch (error) {
    // HTML preconstruido permanece disponible; su corte original no se sustituye sin datos válidos.
    console.warn("ATLAS NEWS: el pulso financiero no pudo actualizarse", error);
  }
}

refresh();
setInterval(() => {
  if (document.visibilityState === "visible") refresh();
}, REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});
document.addEventListener("astro:page-load", refresh);
