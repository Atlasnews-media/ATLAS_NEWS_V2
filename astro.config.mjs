import { defineConfig } from "astro/config";

const analyticsWebsiteId =
  process.env.ATLAS_UMAMI_WEBSITE_ID?.trim() ||
  "e34fdb19-91b3-41d5-82ad-a577498b31ca";
const analyticsScriptUrl =
  process.env.ATLAS_UMAMI_SCRIPT_URL?.trim() ||
  "https://cloud.umami.is/script.js";

function atlasWebAnalytics() {
  return {
    name: "atlas-web-analytics",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        if (!analyticsWebsiteId) return;

        const websiteId = JSON.stringify(analyticsWebsiteId);
        const scriptUrl = JSON.stringify(analyticsScriptUrl);

        injectScript(
          "head-inline",
          `(() => {
  const productionHost = "eldesiempre100.github.io";
  const pathname = window.location.pathname.replace(/\\/+$/, "") || "/";
  const excludedPrefixes = ["/estado", "/lab"];

  if (window.location.hostname !== productionHost) return;
  if (
    excludedPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
    )
  ) {
    return;
  }

  const tracker = document.createElement("script");
  tracker.defer = true;
  tracker.src = ${scriptUrl};
  tracker.dataset.websiteId = ${websiteId};
  tracker.dataset.domains = productionHost;
  tracker.dataset.doNotTrack = "true";
  tracker.dataset.excludeSearch = "true";
  tracker.dataset.excludeHash = "true";
  document.head.appendChild(tracker);
})();`,
        );
      },
    },
  };
}

export default defineConfig({
  output: "static",
  site: "https://eldesiempre100.github.io",
  integrations: [atlasWebAnalytics()],
});
