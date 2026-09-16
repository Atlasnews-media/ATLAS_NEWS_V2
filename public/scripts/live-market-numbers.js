(() => {
  if (window.__atlasLiveMarketNumbers) return;
  window.__atlasLiveMarketNumbers = true;

  const POLL_MS = 120_000;
  const labelToId = new Map([
    ["UF", "uf"],
    ["Dólar", "usdclp"],
    ["Euro", "eurclp"],
    ["Brent Oil", "brent"],
    ["Brent", "brent"],
    ["Cobre", "copper"],
    ["IPSA", "ipsa"],
    ["S&P 500", "sp500"],
    ["Treasury 10Y", "ust10y"],
    ["UST 10Y", "ust10y"],
    ["Nasdaq", "nasdaq"],
    ["Dow Jones", "dow"],
    ["Euro Stoxx 50", "stoxx50"],
    ["TPM Chile", "tpm"],
    ["USD/CLP", "usdclp"],
    ["EUR/USD", "eurusd"],
    ["USD/JPY", "usdjpy"],
    ["Oro", "gold"],
    ["Bitcoin", "bitcoin"],
    ["EUR/CLP", "eurclp"],
  ]);

  const decimal2 = new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const decimal4 = new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  const decimal0 = new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 0,
  });
  const signedVariation = new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "always",
  });
  const absoluteVariation = new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let lastGeneratedAt = null;
  let timer = null;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function installStyles() {
    if (document.getElementById("atlas-live-market-styles")) return;
    const style = document.createElement("style");
    style.id = "atlas-live-market-styles";
    style.textContent = `
      @keyframes atlas-market-tick-up {
        0% { color: inherit; text-shadow: none; }
        24% { color: #17623d; text-shadow: 0 0 .32rem rgba(23, 98, 61, .30); }
        100% { color: inherit; text-shadow: none; }
      }
      @keyframes atlas-market-tick-down {
        0% { color: inherit; text-shadow: none; }
        24% { color: #9b1f1f; text-shadow: 0 0 .32rem rgba(155, 31, 31, .28); }
        100% { color: inherit; text-shadow: none; }
      }
      .atlas-market-tick-up { animation: atlas-market-tick-up .82s ease-out; }
      .atlas-market-tick-down { animation: atlas-market-tick-down .82s ease-out; }
      @media (prefers-reduced-motion: reduce) {
        .atlas-market-tick-up,
        .atlas-market-tick-down { animation: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function isDisplayable(asset) {
    return Boolean(
      asset &&
      asset.displayEligible !== false &&
      typeof asset.value === "number" &&
      Number.isFinite(asset.value),
    );
  }

  function formatValue(asset) {
    if (!isDisplayable(asset)) return "—";
    switch (asset.unit) {
      case "points":
        return decimal2.format(asset.value);
      case "percent":
        return `${decimal2.format(asset.value)}%`;
      case "clp":
        return `$${decimal2.format(asset.value)}`;
      case "ratio":
        return decimal4.format(asset.value);
      case "usd-per-barrel":
        return `US$${decimal2.format(asset.value)}`;
      case "usd-per-ounce":
        return `US$${decimal0.format(asset.value)}`;
      case "usd-per-pound":
        return `US$${decimal2.format(asset.value)}/lb`;
      case "usd":
        return `US$${decimal0.format(asset.value)}`;
      default:
        return decimal2.format(asset.value);
    }
  }

  function signedChange(asset) {
    if (!Number.isFinite(asset?.changePercent)) return null;
    return `${signedVariation.format(asset.changePercent)}%`;
  }

  function economicChange(asset) {
    if (!Number.isFinite(asset?.changePercent)) return null;
    const arrow =
      asset.trend === "up" ? "▲" : asset.trend === "down" ? "▼" : "→";
    return `${arrow} ${absoluteVariation.format(Math.abs(asset.changePercent))}%`;
  }

  function indicesChange(asset) {
    if (!isDisplayable(asset)) return "sin dato";
    if (!Number.isFinite(asset.changePercent)) {
      if (asset.id === "uf") return "dato diario";
      if (asset.trend === "flat") return "sin cambio";
      return "sin variación";
    }
    return signedChange(asset);
  }

  function assetIdForRow(row) {
    let label = "";
    if (row.matches(".economic-strip__item")) {
      label = row.querySelector("dt")?.textContent?.trim() ?? "";
    } else if (row.matches(".data-row")) {
      label =
        row.querySelector(".asset-name > span")?.textContent?.trim() ?? "";
    } else {
      label = row.querySelector(".market-label")?.textContent?.trim() ?? "";
    }
    return labelToId.get(label) ?? null;
  }

  function valueElementForRow(row) {
    if (row.matches(".economic-strip__item")) {
      return row.querySelector(".economic-strip__value");
    }
    if (row.matches(".data-row")) return row.querySelector(".asset-value");
    return row.querySelector("strong");
  }

  function flash(valueElement, direction) {
    if (!valueElement || reducedMotion.matches) return;
    valueElement.classList.remove(
      "atlas-market-tick-up",
      "atlas-market-tick-down",
    );
    void valueElement.offsetWidth;
    valueElement.classList.add(
      direction === "up" ? "atlas-market-tick-up" : "atlas-market-tick-down",
    );
    window.setTimeout(() => {
      valueElement.classList.remove(
        "atlas-market-tick-up",
        "atlas-market-tick-down",
      );
    }, 900);
  }

  function updateRow(row, asset, animate) {
    if (!isDisplayable(asset)) return;

    const valueElement = valueElementForRow(row);
    if (!valueElement) return;

    const previous = Number(row.dataset.atlasLiveValue);
    const hadBaseline = Number.isFinite(previous);
    const next = asset.value;
    const changed = hadBaseline && next !== previous;

    valueElement.textContent = formatValue(asset);
    row.dataset.atlasLiveValue = String(next);

    if (row.matches(".economic-strip__item")) {
      const trend = row.querySelector(".economic-strip__trend");
      const change = economicChange(asset);
      if (trend && change) {
        trend.textContent = change;
        trend.dataset.trend = asset.trend ?? "flat";
      }
    } else if (row.matches(".data-row")) {
      row.dataset.state = asset.trend ?? "flat";
      const arrow = row.querySelector(".arrow");
      const change = row.querySelector(".asset-change span:last-child");
      if (arrow) {
        arrow.textContent =
          asset.trend === "up" ? "↑" : asset.trend === "down" ? "↓" : "●";
      }
      if (change) change.textContent = indicesChange(asset);
    } else {
      const change = row.querySelector(".market-change");
      const formatted = signedChange(asset);
      if (change && formatted) {
        change.textContent = formatted;
        change.dataset.direction = asset.trend ?? "flat";
      }
    }

    if (animate && changed) {
      flash(valueElement, next > previous ? "up" : "down");
    }
  }

  function formatCut(generatedAt) {
    const date = new Date(generatedAt);
    if (!Number.isFinite(date.valueOf())) return null;
    const day = new Intl.DateTimeFormat("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "America/Santiago",
    })
      .format(date)
      .replaceAll(".", "")
      .toUpperCase();
    const time = new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Santiago",
    }).format(date);
    return { day, time };
  }

  function updateCutLabels(generatedAt) {
    const cut = formatCut(generatedAt);
    if (!cut) return;

    document.querySelectorAll(".update-stamp > span").forEach((node) => {
      node.textContent = `${cut.day} · ${cut.time}`;
    });
    document
      .querySelectorAll(".indices-source p:last-child")
      .forEach((node) => {
        node.textContent = `Corte automático: ${cut.day} · ${cut.time} · Hora de Chile.`;
      });
    document.querySelectorAll(".market-meta").forEach((node) => {
      node.textContent = `Datos de mercado · Corte ${cut.day} · ${cut.time}`;
    });

    const economicTime = document.querySelector(".economic-strip__source time");
    if (economicTime) {
      economicTime.textContent = cut.day;
      economicTime.setAttribute("datetime", generatedAt.slice(0, 10));
    }
  }

  function marketRows() {
    return document.querySelectorAll(
      ".economic-strip__item, .market-pulse li, .market-indices-page .data-row",
    );
  }

  function applySnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.assets)) return;
    const byId = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
    const animate =
      lastGeneratedAt !== null && snapshot.generatedAt !== lastGeneratedAt;

    marketRows().forEach((row) => {
      const id = assetIdForRow(row);
      if (!id) return;
      const asset = byId.get(id);
      if (!asset) return;
      updateRow(row, asset, animate);
    });

    if (snapshot.generatedAt) updateCutLabels(snapshot.generatedAt);
    lastGeneratedAt = snapshot.generatedAt ?? lastGeneratedAt;
  }

  async function refresh() {
    if (document.hidden) return;
    try {
      const response = await fetch(
        `/data/market-pulse.json?live=${Date.now()}`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) return;
      const snapshot = await response.json();
      applySnapshot(snapshot);
    } catch {
      // Fail-open visual: si el JSON no responde, se conserva el último valor visible.
    }
  }

  function start() {
    installStyles();
    refresh();
    timer = window.setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.addEventListener(
    "pagehide",
    () => {
      if (timer) window.clearInterval(timer);
    },
    { once: true },
  );
})();
