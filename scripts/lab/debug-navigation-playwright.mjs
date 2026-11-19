import fs from "node:fs/promises";
import path from "node:path";
import { chromium, devices, webkit } from "playwright";

const targetUrl =
  process.env.ATLAS_DEBUG_URL?.trim() || "https://atlasnews-media.github.io/";
const outputRoot =
  process.env.ATLAS_DEBUG_OUT?.trim() || "debug-artifacts/navigation";

const scenarios = [
  {
    name: "mobile-webkit",
    browserType: webkit,
    contextOptions:
      devices["iPhone 13 Pro Max"] || {
        viewport: { width: 428, height: 926 },
        isMobile: true,
        hasTouch: true,
      },
  },
  {
    name: "tablet-webkit",
    browserType: webkit,
    contextOptions:
      devices["iPad Pro 11"] || {
        viewport: { width: 834, height: 1194 },
        isMobile: true,
        hasTouch: true,
      },
  },
  {
    name: "desktop-chromium",
    browserType: chromium,
    contextOptions: {
      viewport: { width: 1440, height: 900 },
      hasTouch: false,
    },
  },
];

const instrumentation = () => {
  const EVENT_KEY = "atlas-nav-debug-events-v1";
  const MAX_EVENTS = 1500;

  const readEvents = () => {
    try {
      return JSON.parse(sessionStorage.getItem(EVENT_KEY) || "[]");
    } catch {
      return [];
    }
  };

  const writeEvent = (event, detail = {}) => {
    try {
      const events = readEvents();
      events.push({
        ts: Date.now(),
        perf: Math.round(performance.now() * 10) / 10,
        event,
        url: window.location.href,
        pathname: window.location.pathname,
        readyState: document.readyState,
        detail,
      });
      if (events.length > MAX_EVENTS) {
        events.splice(0, events.length - MAX_EVENTS);
      }
      sessionStorage.setItem(EVENT_KEY, JSON.stringify(events));
    } catch {
      // Diagnóstico fail-open: nunca interferir con la página.
    }
  };

  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      !element.hidden &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  };

  const textOf = (selector) => {
    const element = document.querySelector(selector);
    return element?.textContent?.replace(/\s+/g, " ").trim().slice(0, 180) || null;
  };

  const snapshot = (label) => {
    const dailyRoots = [
      ...document.querySelectorAll("[data-daily-audio]"),
    ];
    const analysisRoots = [
      ...document.querySelectorAll("[data-section-analysis-audio]"),
    ];
    const panel = document.querySelector("[data-atlas-workspace-panel]");
    const panelContent = document.querySelector(
      "[data-atlas-workspace-content]",
    );

    return {
      label,
      ts: Date.now(),
      perf: Math.round(performance.now() * 10) / 10,
      url: window.location.href,
      pathname: window.location.pathname,
      title: document.title,
      activeNav:
        document
          .querySelector(".site-header nav a.is-active")
          ?.getAttribute("href") || null,
      contentLead: textOf("#contenido h1, #contenido h2, #contenido .page-title"),
      bodyClass: document.body?.className || "",
      dailyAudio: {
        count: dailyRoots.length,
        visible: dailyRoots.filter(isVisible).length,
        hidden: dailyRoots.filter((root) => root.hidden).length,
        playing: dailyRoots.filter((root) => {
          const audio = root.querySelector("[data-atlas-audio-engine]");
          return audio instanceof HTMLAudioElement && !audio.paused;
        }).length,
      },
      analysisAudio: {
        count: analysisRoots.length,
        visible: analysisRoots.filter(isVisible).length,
        hidden: analysisRoots.filter((root) => root.hidden).length,
        sections: analysisRoots.map((root) => ({
          section: root.dataset.section || null,
          hidden: root.hidden,
          visible: isVisible(root),
          source:
            root
              .querySelector("[data-atlas-audio-source]")
              ?.getAttribute("src") || null,
        })),
      },
      workspace: {
        present: panel instanceof HTMLElement,
        visible: isVisible(panel),
        busy: panel?.getAttribute("aria-busy") || null,
        lead:
          panelContent?.textContent?.replace(/\s+/g, " ").trim().slice(0, 180) ||
          null,
      },
    };
  };

  window.__atlasNavigationDebug = {
    readEvents,
    writeEvent,
    snapshot,
  };

  const eventNames = [
    "astro:before-preparation",
    "astro:after-preparation",
    "astro:before-swap",
    "astro:after-swap",
    "astro:page-load",
    "atlas:desktop-panel-change",
  ];

  eventNames.forEach((name) => {
    document.addEventListener(
      name,
      (event) => {
        writeEvent(name, {
          to: event?.to ? String(event.to) : null,
          from: event?.from ? String(event.from) : null,
          newDocument: Boolean(event?.newDocument),
          detail: event instanceof CustomEvent ? event.detail ?? null : null,
          snapshot: snapshot(name),
        });
      },
      true,
    );
  });

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      const anchor =
        target instanceof Element ? target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;

      writeEvent("click:capture", {
        text: anchor.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || "",
        href: anchor.href,
        pathname: anchor.pathname,
        astroReload: anchor.hasAttribute("data-astro-reload"),
        workspaceBypass:
          anchor.dataset.atlasWorkspaceRouterBypass || null,
        defaultPrevented: event.defaultPrevented,
      });

      queueMicrotask(() => {
        writeEvent("click:microtask", {
          href: anchor.href,
          defaultPrevented: event.defaultPrevented,
          snapshot: snapshot("click:microtask"),
        });
      });
    },
    true,
  );

  window.addEventListener("popstate", () => {
    writeEvent("popstate", { snapshot: snapshot("popstate") });
  });

  window.addEventListener("pageshow", (event) => {
    writeEvent("pageshow", {
      persisted: event.persisted,
      snapshot: snapshot("pageshow"),
    });
  });

  window.addEventListener("pagehide", (event) => {
    writeEvent("pagehide", {
      persisted: event.persisted,
      snapshot: snapshot("pagehide"),
    });
  });

  document.addEventListener("visibilitychange", () => {
    writeEvent("visibilitychange", {
      visibilityState: document.visibilityState,
      snapshot: snapshot("visibilitychange"),
    });
  });

  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      writeEvent(`history:${method}`, {
        urlArg: args[2] == null ? null : String(args[2]),
        snapshot: snapshot(`history:${method}`),
      });
      return result;
    };
  });

  let mutationQueued = false;
  const queueMutationSnapshot = (records) => {
    if (mutationQueued) return;
    mutationQueued = true;
    requestAnimationFrame(() => {
      mutationQueued = false;
      const relevant = records.some((record) => {
        const target = record.target;
        return (
          target instanceof Element &&
          (target.matches(
            "#contenido, [data-atlas-workspace-content], [data-daily-audio], [data-section-analysis-audio]",
          ) ||
            Boolean(
              target.closest(
                "#contenido, [data-atlas-workspace-content], [data-daily-audio], [data-section-analysis-audio]",
              ),
            ))
        );
      });
      if (!relevant) return;
      writeEvent("mutation:relevant", {
        count: records.length,
        snapshot: snapshot("mutation:relevant"),
      });
    });
  };

  const attachObserver = () => {
    if (!document.documentElement || window.__atlasDebugObserverAttached) return;
    window.__atlasDebugObserverAttached = true;
    const observer = new MutationObserver(queueMutationSnapshot);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "class", "style", "aria-busy"],
    });
    writeEvent("observer:attached", { snapshot: snapshot("observer:attached") });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachObserver, { once: true });
  } else {
    attachObserver();
  }
};

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function snapshotPage(page, label, outputDir, steps) {
  const data = await page.evaluate((snapshotLabel) => {
    return window.__atlasNavigationDebug?.snapshot(snapshotLabel) ?? {
      label: snapshotLabel,
      url: window.location.href,
      missingInstrumentation: true,
    };
  }, label);

  steps.push(data);
  await page.screenshot({
    path: path.join(outputDir, `${String(steps.length).padStart(2, "0")}-${slug(
      label,
    )}.png`),
    fullPage: false,
  });
  return data;
}

async function sampleTransition(page, label, steps, durationMs = 1400) {
  const started = Date.now();
  let index = 0;
  while (Date.now() - started < durationMs) {
    await page.waitForTimeout(index === 0 ? 40 : 80);
    index += 1;
    try {
      const sample = await page.evaluate(
        ({ transitionLabel, sampleIndex }) =>
          window.__atlasNavigationDebug?.snapshot(
            `${transitionLabel}:${sampleIndex}`,
          ) ?? null,
        { transitionLabel: label, sampleIndex: index },
      );
      if (sample) steps.push(sample);
    } catch {
      // Una recarga completa puede invalidar una evaluación puntual.
    }
  }
}

async function runScenario(scenario) {
  const outputDir = path.join(outputRoot, scenario.name);
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await scenario.browserType.launch({ headless: true });
  const context = await browser.newContext({
    ...scenario.contextOptions,
    locale: "es-CL",
    timezoneId: "America/Santiago",
  });
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });

  const page = await context.newPage();
  await page.addInitScript(instrumentation);

  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  const steps = [];

  page.on("console", (message) => {
    consoleMessages.push({
      ts: Date.now(),
      type: message.type(),
      text: message.text(),
    });
  });

  page.on("pageerror", (error) => {
    pageErrors.push({
      ts: Date.now(),
      message: error.message,
      stack: error.stack || null,
    });
  });

  page.on("requestfailed", (request) => {
    failedRequests.push({
      ts: Date.now(),
      url: request.url(),
      method: request.method(),
      failure: request.failure(),
    });
  });

  try {
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(1200);
    await snapshotPage(page, "portada-estable", outputDir, steps);

    const destinations = [
      { label: "internacional", href: "/internacional/" },
      { label: "nacional", href: "/nacional/" },
      { label: "mercados", href: "/mercados/" },
    ];

    for (const destination of destinations) {
      const selector = `.site-header nav a[href="${destination.href}"]`;
      const link = page.locator(selector).first();

      await link.waitFor({ state: "visible", timeout: 15_000 });
      await snapshotPage(
        page,
        `antes-click-${destination.label}`,
        outputDir,
        steps,
      );

      await link.click({ timeout: 15_000 });
      await sampleTransition(
        page,
        `despues-click-${destination.label}`,
        steps,
      );
      await page.waitForTimeout(1000);
      await snapshotPage(
        page,
        `estable-${destination.label}`,
        outputDir,
        steps,
      );
    }

    const events = await page.evaluate(
      () => window.__atlasNavigationDebug?.readEvents() ?? [],
    );

    await fs.writeFile(
      path.join(outputDir, "report.json"),
      JSON.stringify(
        {
          scenario: scenario.name,
          targetUrl,
          generatedAt: new Date().toISOString(),
          finalUrl: page.url(),
          steps,
          events,
          consoleMessages,
          pageErrors,
          failedRequests,
        },
        null,
        2,
      ),
      "utf8",
    );
  } finally {
    await context.tracing.stop({
      path: path.join(outputDir, "trace.zip"),
    });
    await context.close();
    await browser.close();
  }
}

await fs.mkdir(outputRoot, { recursive: true });

const summary = [];
for (const scenario of scenarios) {
  try {
    await runScenario(scenario);
    summary.push({ scenario: scenario.name, status: "success" });
  } catch (error) {
    summary.push({
      scenario: scenario.name,
      status: "failure",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
  }
}

await fs.writeFile(
  path.join(outputRoot, "summary.json"),
  JSON.stringify(
    {
      targetUrl,
      generatedAt: new Date().toISOString(),
      summary,
    },
    null,
    2,
  ),
  "utf8",
);

if (summary.some((entry) => entry.status === "failure")) {
  process.exitCode = 1;
}
