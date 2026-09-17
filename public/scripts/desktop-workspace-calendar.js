(() => {
  if (window.__atlasWorkspaceCalendarCompanion) return;
  window.__atlasWorkspaceCalendarCompanion = true;

  const DEFAULT_PANEL_PATH = "/mercados/indices/";
  const CALENDAR_PATH = "/calendario-economico/";
  const COMPANION_SELECTOR = "[data-atlas-calendar-companion]";

  let request = null;
  let requestToken = 0;
  let observer = null;

  const loadedStyles = new Set(
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
      (link) => link.href,
    ),
  );
  const loadedInlineStyles = new Set(
    Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent?.trim() ?? "")
      .filter(Boolean),
  );

  function installStyles() {
    if (document.getElementById("atlas-workspace-calendar-companion-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "atlas-workspace-calendar-companion-styles";
    style.textContent = `
      @media (min-width: 80rem) {
        .desktop-workspace-calendar-companion {
          margin-top: 1.1rem;
          padding-top: 0.45rem;
          border-top: 5px double var(--rule);
        }

        .desktop-workspace-panel .market-indices-page .indices-heading h1 {
          font-size: clamp(2rem, 2.55vw, 2.5rem) !important;
        }

        .desktop-workspace-panel .calendar-heading h1 {
          font-size: clamp(1.95rem, 2.5vw, 2.45rem) !important;
        }

        .front-page .headline-list .headline-item + .headline-item {
          border-top: 1px solid var(--rule) !important;
        }

        .desktop-workspace-calendar-companion .calendar-section .section-heading h2 {
          font-size: 0.83rem !important;
        }

        .desktop-workspace-calendar-companion .calendar-section .section-heading span {
          font-size: 0.47rem !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  async function ensureStyles(sourceDocument) {
    const pending = Array.from(
      sourceDocument.querySelectorAll('link[rel="stylesheet"][href]'),
    )
      .map((source) => {
        const href = new URL(
          source.getAttribute("href") || "",
          window.location.origin,
        ).href;
        if (!href || loadedStyles.has(href)) return null;

        loadedStyles.add(href);
        return new Promise((resolve) => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = href;
          link.dataset.atlasWorkspaceCalendarStyle = "true";
          link.addEventListener("load", resolve, { once: true });
          link.addEventListener("error", resolve, { once: true });
          document.head.appendChild(link);
        });
      })
      .filter(Boolean);

    sourceDocument.querySelectorAll("head style").forEach((source) => {
      const cssText = source.textContent?.trim() ?? "";
      if (!cssText || loadedInlineStyles.has(cssText)) return;

      loadedInlineStyles.add(cssText);
      const style = document.createElement("style");
      style.dataset.atlasWorkspaceCalendarStyle = "inline";
      style.textContent = cssText;
      document.head.appendChild(style);
    });

    await Promise.all(pending);
  }

  function activateScripts(root) {
    root.querySelectorAll("script").forEach((oldScript) => {
      const script = document.createElement("script");
      Array.from(oldScript.attributes).forEach(({ name, value }) => {
        script.setAttribute(name, value);
      });
      script.textContent = oldScript.textContent;
      oldScript.replaceWith(script);
    });
  }

  function panelContent() {
    return document.querySelector("[data-atlas-workspace-content]");
  }

  function cancelPending() {
    requestToken += 1;
    if (request) request.abort();
    request = null;
  }

  async function appendCalendar() {
    const content = panelContent();
    if (!content) return;
    if (!content.querySelector(".market-indices-page")) return;
    if (content.querySelector(COMPANION_SELECTOR)) return;

    cancelPending();
    const token = requestToken;
    request = new AbortController();
    const { signal } = request;

    try {
      const response = await fetch(CALENDAR_PATH, {
        signal,
        credentials: "same-origin",
        headers: { "X-Atlas-Workspace": "desktop-calendar-companion" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const sourceHtml = await response.text();
      const sourceDocument = new DOMParser().parseFromString(
        sourceHtml,
        "text/html",
      );
      const sourceContent = sourceDocument.querySelector("#contenido");
      if (!sourceContent) {
        throw new Error("Contenido de calendario no disponible");
      }

      await ensureStyles(sourceDocument);
      if (signal.aborted || token !== requestToken) return;

      const currentContent = panelContent();
      if (!currentContent) return;
      if (!currentContent.querySelector(".market-indices-page")) return;
      if (currentContent.querySelector(COMPANION_SELECTOR)) return;

      const wrapper = document.createElement("section");
      wrapper.className = "desktop-workspace-calendar-companion";
      wrapper.dataset.atlasCalendarCompanion = "true";
      wrapper.setAttribute("aria-label", "Calendario económico");
      wrapper.innerHTML = sourceContent.innerHTML;
      currentContent.appendChild(wrapper);
      activateScripts(wrapper);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.warn("ATLAS NEWS: no fue posible anexar el calendario", error);
    } finally {
      if (token === requestToken) request = null;
    }
  }

  function syncCalendarCompanion(path) {
    if (path === DEFAULT_PANEL_PATH) {
      void appendCalendar();
      return;
    }
    cancelPending();
  }

  function inspectPanel() {
    const content = panelContent();
    if (!content) return;
    if (content.querySelector(".market-indices-page")) {
      void appendCalendar();
    }
  }

  function start() {
    installStyles();
    inspectPanel();

    const content = panelContent();
    if (!content || observer) return;

    observer = new MutationObserver(inspectPanel);
    observer.observe(content, { childList: true, subtree: false });
  }

  document.addEventListener("atlas:desktop-panel-change", (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    const path = detail && typeof detail.path === "string" ? detail.path : "";
    syncCalendarCompanion(path);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.addEventListener(
    "pagehide",
    () => {
      cancelPending();
      if (observer) observer.disconnect();
    },
    { once: true },
  );
})();
