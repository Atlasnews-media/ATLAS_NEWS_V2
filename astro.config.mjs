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
  const productionHost = "atlasnews-media.github.io";
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

  const sectionForPath = () => {
    const segments = window.location.pathname.split("/").filter(Boolean);
    return segments[0] || "portada";
  };

  const contentIdForAnchor = (anchor) => {
    const segments = anchor.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "portada";
  };

  const track = (name, data = {}) => {
    const umami = window.umami;
    if (!umami || typeof umami.track !== "function") return;
    umami.track(name, data);
  };

  const shareChannel = (element) => {
    if (element.matches("[data-share-native]")) return "native";
    if (element.matches("[data-share-copy]")) return "copy_link";

    const href = element.getAttribute("href") || "";
    if (href.includes("wa.me")) return "whatsapp";
    if (href.includes("facebook.com")) return "facebook";
    if (href.includes("linkedin.com")) return "linkedin";
    if (href.includes("twitter.com") || href.includes("x.com")) return "x";
    return "other";
  };

  const setupInteractionTracking = () => {
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;

      const target = event.target.closest("a, button");
      if (!target) return;

      const section = sectionForPath();

      if (target.matches(".share-tools .share-action")) {
        track("share_click", {
          section,
          channel: shareChannel(target),
        });
        return;
      }

      if (
        target instanceof HTMLAnchorElement &&
        (target.closest(".card") ||
          target.matches(".lead-link, .closing-link"))
      ) {
        track("article_click", {
          section,
          content_id: contentIdForAnchor(target),
        });
        return;
      }

      if (
        target instanceof HTMLAnchorElement &&
        target.pathname.replace(/\\/+$/, "") === "/archivo"
      ) {
        track("archive_open", { section });
      }
    });

    document.querySelectorAll("[data-audio-player]").forEach((player) => {
      if (!(player instanceof HTMLAudioElement)) return;

      player.addEventListener(
        "play",
        () => track("audio_play", { section: sectionForPath() }),
        { once: true },
      );
      player.addEventListener("ended", () => {
        track("audio_complete", { section: sectionForPath() });
      });
    });
  };

  tracker.addEventListener("load", setupInteractionTracking, { once: true });
  document.head.appendChild(tracker);
})();`,
        );
      },
    },
  };
}

export default defineConfig({
  output: "static",
  site: "https://atlasnews-media.github.io",
  integrations: [atlasWebAnalytics()],
});
