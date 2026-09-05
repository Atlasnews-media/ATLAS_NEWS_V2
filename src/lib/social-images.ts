const SOCIAL_MANIFEST_URL =
  "https://raw.githubusercontent.com/EldeSiempre100/EldeSiempre100.github.io/social-assets/share/manifest.json";
const SOCIAL_IMAGE_PREFIX =
  "https://raw.githubusercontent.com/EldeSiempre100/EldeSiempre100.github.io/social-assets/share/";

type SocialImageManifest = Record<string, string>;

let manifestPromise: Promise<SocialImageManifest> | undefined;

function normalizePathname(pathname: string) {
  const clean = pathname.split("?")[0]?.split("#")[0] || "/";
  return clean.endsWith("/") ? clean : `${clean}/`;
}

async function loadManifest(): Promise<SocialImageManifest> {
  try {
    const response = await fetch(SOCIAL_MANIFEST_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return {};

    const raw: unknown = await response.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    return Object.fromEntries(
      Object.entries(raw).filter(([pathname, imageUrl]) => {
        if (
          !/^\/(ediciones|nacional|mercados|lecturas)\/[^/]+\/$/.test(pathname)
        )
          return false;
        return (
          typeof imageUrl === "string" &&
          imageUrl.startsWith(SOCIAL_IMAGE_PREFIX)
        );
      }),
    );
  } catch {
    return {};
  }
}

export async function socialImageFor(pathname: string) {
  manifestPromise ??= loadManifest();
  const manifest = await manifestPromise;
  return manifest[normalizePathname(pathname)] ?? null;
}
