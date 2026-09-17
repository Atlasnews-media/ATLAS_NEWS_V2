(() => {
  if (window.__atlasWorkspaceCalendarCompanion) return;
  window.__atlasWorkspaceCalendarCompanion = true;

  const DEFAULT_PANEL_PATH = "/mercados/indices/";
  const CALENDAR_PATH = "/calendario-economico/";
  const COMPANION_SELECTOR = "[data-atlas-calendar-companion]";

  let request = null;
  let requestToken = 0;
  let observer = null;
  let keyboardIntent = false;

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
        .desktop-workspace-panel {
          --atlas-panel-title-size: clamp(1.95rem, 2.5vw, 2.45rem);
          --atlas-panel-article-title-size: clamp(1.85rem, 2.35vw, 2.3rem);
        }

        .desktop-workspace-calendar-companion {
          margin-top: 1.1rem;
          padding-top: 0.45rem;
          border-top: 5px double var(--rule);
        }

        .desktop-workspace-panel .section-page > .page-title,
        .desktop-workspace-panel .market-indices-page .indices-heading h1,
        .desktop-workspace-panel .calendar-heading h1 {
          font-size: var(--atlas-panel-title-size) !important;
          line-height: 0.94 !important;
          letter-spacing: -0.04em !important;
          overflow-wrap: break-word;
          text-wrap: balance;
        }

        .desktop-workspace-panel .article-page .article-header h1 {
          font-size: var(--atlas-panel-article-title-size) !important;
          line-height: 0.95 !important;
          letter-spacing: -0.035em !important;
          overflow-wrap: break-word;
          text-wrap: balance;
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

        .desktop-workspace-panel a:focus-visible,
        .desktop-workspace-panel button:focus-visible,
        .front-page a:focus-visible,
        .front-page button:focus-visible,
        .site-header a:focus-visible,
        .site-footer a:focus-visible {
          outline: 2px solid var(--accent) !important;
          outline-offset: 3px !important;
        }
      }

      @media (min-width: 80rem) and (max-width: 85.375rem) {
        .desktop-workspace-panel {
          --atlas-panel-title-size: clamp(1.85rem, 2.3vw, 2.15rem);
          --atlas-panel-article-title-size: clamp(1.78rem, 2.2vw, 2.05rem);
        }

        .desktop-workspace-panel .page-shell,
        .desktop-workspace-panel .article-page,
        .desktop-workspace-panel .market-indices-page,
        .desktop-workspace-panel .calendar-lab {
          width: calc(100% - 1.25rem) !important;
        }

        html:has(.desktop-workspace-panel)
          body:has(.desktop-workspace-panel)
          .site-header,
        html:has(.desktop-workspace-panel)
          body:has(.desktop-workspace-panel)
          .site-footer,
        html:has(.desktop-workspace-panel)
          body:has(.desktop-workspace-panel)
          .front-page {
          width: calc(100% - 1.5rem) !important;
          margin-right: 0.75rem !important;
          margin-left: 0.75rem !important;
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

  function prepareAccessibility() {
    const panel = document.querySelector("[data-atlas-workspace-panel]");
    const content = panelContent();
    const status = document.querySelector("[data-atlas-workspace-status]");

    if (panel) panel.removeAttribute("aria-live");
    if (content) content.setAttribute("tabindex", "-1");
    if (status) {
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.setAttribute("aria-atomic", "true");
    }
  }

  function focusPanelHeadingAfterKeyboardNavigation() {
    if (!keyboardIntent) return;
    keyboardIntent = false;

    requestAnimationFrame(() => {
      const content = panelContent();
      if (!content) return;

      const heading = content.querySelector("h1, h2");
      if (!(heading instanceof HTMLElement)) return;

      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    });
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
    prepareAccessibility();
    inspectPanel();

    const content = panelContent();
    if (!content || observer) return;

    observer = new MutationObserver(inspectPanel);
    observer.observe(content, { childList: true, subtree: false });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("a[href]")) keyboardIntent = true;
  });

  document.addEventListener(
    "pointerdown",
    () => {
      keyboardIntent = false;
    },
    { passive: true },
  );

  document.addEventListener("atlas:desktop-panel-change", (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    const path = detail && typeof detail.path === "string" ? detail.path : "";
    syncCalendarCompanion(path);
    focusPanelHeadingAfterKeyboardNavigation();
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
