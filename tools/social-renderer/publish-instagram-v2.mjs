import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "../..");
const OUT = path.resolve(process.cwd(), "output");
const CONTRACT_INPUT = process.env.SOCIAL_CONTRACT || "";
const PUBLICATION_STATUS = process.env.SOCIAL_PUBLICATION_STATUS || "";
const REQUIRED_PUBLICATION_STATUS = "PUBLICACIÓN DISPONIBLE / VERIFICADA";
const PUBLISH_CONFIRMATION = process.env.INSTAGRAM_PUBLISH_CONFIRMATION || "";
const REQUIRED_PUBLISH_CONFIRMATION = "PUBLICAR CARRUSEL / AUTORIZADO";
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "";
const EXPECTED_USERNAME =
  process.env.INSTAGRAM_EXPECTED_USERNAME || "_atlas_news";
const API_VERSION = process.env.INSTAGRAM_API_VERSION || "v23.0";
const IMAGE_BASE_URL = (process.env.SOCIAL_IMAGE_BASE_URL || "").replace(
  /\/$/,
  "",
);
const GRAPH_BASE = "https://graph.instagram.com";
const CAROUSEL_FILES = Array.from(
  { length: 7 },
  (_, i) => `atlas-news-instagram-carousel-0${i + 1}.png`,
);

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function resolveContract(input) {
  const normalized = required(input, "SOCIAL_CONTRACT").replaceAll("\\", "/");
  if (
    !normalized.endsWith(".json") ||
    normalized.startsWith("/") ||
    normalized.includes("..")
  ) {
    throw new Error(`Unsafe contract path: ${input}`);
  }
  const absolute = path.resolve(ROOT, normalized);
  const relative = path.relative(ROOT, absolute).replaceAll(path.sep, "/");
  if (relative !== normalized)
    throw new Error(`Unsafe contract path: ${input}`);
  return { absolute, relative };
}

async function api(pathname, { method = "GET", form } = {}) {
  const url = `${GRAPH_BASE}/${API_VERSION}${pathname}`;
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "User-Agent": "ATLAS-NEWS-Social-Distribution/2.0",
    },
  };
  if (form) {
    init.headers["Content-Type"] =
      "application/x-www-form-urlencoded;charset=UTF-8";
    init.body = new URLSearchParams(form);
  }
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    const message =
      body?.error?.message || body?.message || `HTTP ${response.status}`;
    throw new Error(`Instagram API ${method} ${pathname} failed: ${message}`);
  }
  return body;
}

async function waitForContainer(containerId, label) {
  const terminalErrors = new Set(["ERROR", "EXPIRED"]);
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const status = await api(
      `/${encodeURIComponent(containerId)}?fields=status_code,status`,
    );
    if (status.status_code === "FINISHED" || !status.status_code) return status;
    if (terminalErrors.has(status.status_code)) {
      throw new Error(
        `${label} container ${containerId} failed: ${status.status || status.status_code}`,
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000 * attempt, 5000)),
    );
  }
  throw new Error(
    `${label} container ${containerId} did not become ready in time`,
  );
}

async function assertPublicImages(imageUrls) {
  for (const url of imageUrls) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:")
      throw new Error(`Image URL must use https: ${url}`);
    let ok = false;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await fetch(url, { method: "GET", redirect: "follow" });
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && contentType.startsWith("image/")) {
        ok = true;
        await response.arrayBuffer();
        break;
      }
      await response.arrayBuffer().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
    if (!ok)
      throw new Error(`Public image is not fetchable as an image: ${url}`);
  }
}

async function assertCanonicalPublished(canonicalUrl) {
  let lastStatus = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(canonicalUrl, {
        method: "GET",
        redirect: "follow",
      });
      lastStatus = response.status;
      await response.arrayBuffer();
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  const detail = lastError?.message || `HTTP ${lastStatus || "unknown"}`;
  throw new Error(
    `Post-publication guard failed: canonicalUrl is not publicly reachable: ${detail}`,
  );
}

async function verifyPublishedMedia(mediaId) {
  let lastError = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const candidate = await api(
        `/${encodeURIComponent(mediaId)}?fields=id,permalink,media_type,timestamp,caption`,
      );
      if (String(candidate.permalink || "").trim()) {
        return { verified: candidate, error: null };
      }
      lastError = new Error("permalink missing from publication metadata");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  return {
    verified: null,
    error: lastError?.message || "publication metadata unavailable",
  };
}

async function main() {
  if (PUBLICATION_STATUS !== REQUIRED_PUBLICATION_STATUS) {
    throw new Error(
      `Post-publication guard failed: expected "${REQUIRED_PUBLICATION_STATUS}"`,
    );
  }
  if (PUBLISH_CONFIRMATION !== REQUIRED_PUBLISH_CONFIRMATION) {
    throw new Error(
      `Instagram publish guard failed: expected "${REQUIRED_PUBLISH_CONFIRMATION}"`,
    );
  }
  required(ACCESS_TOKEN, "INSTAGRAM_ACCESS_TOKEN");
  required(IMAGE_BASE_URL, "SOCIAL_IMAGE_BASE_URL");

  const contractPath = resolveContract(CONTRACT_INPUT);
  const contract = JSON.parse(await fs.readFile(contractPath.absolute, "utf8"));
  if (String(contract.version) !== "2") {
    throw new Error(`Seven-slide publisher requires contract v2, got ${contract.version}`);
  }
  const title = required(contract.title, "contract.title");
  const dek = required(contract.dek, "contract.dek");
  const canonicalUrl = required(contract.canonicalUrl, "contract.canonicalUrl");
  const sourceId = String(
    contract.sourceId || contract.sourceCommit || "",
  ).trim();
  if (!sourceId)
    throw new Error("contract.sourceId or contract.sourceCommit is required");
  const canonical = new URL(canonicalUrl);
  if (canonical.protocol !== "https:")
    throw new Error("contract.canonicalUrl must use https");

  await assertCanonicalPublished(canonicalUrl);

  const me = await api("/me?fields=id,username");
  const igUserId = required(me.id, "Instagram user id");
  const username = required(me.username, "Instagram username");
  if (username.toLowerCase() !== EXPECTED_USERNAME.toLowerCase()) {
    throw new Error(
      `Wrong Instagram account: expected ${EXPECTED_USERNAME}, got ${username}`,
    );
  }

  const recent = await api(
    `/${encodeURIComponent(igUserId)}/media?fields=id,caption,permalink,timestamp&limit=25`,
  );
  const duplicate = Array.isArray(recent.data)
    ? recent.data.find((item) =>
        String(item.caption || "").includes(canonicalUrl),
      )
    : null;
  if (duplicate) {
    throw new Error(
      `Anti-duplicate guard: this canonical URL is already present in Instagram media ${duplicate.id}`,
    );
  }

  const imageUrls = CAROUSEL_FILES.map((file) => `${IMAGE_BASE_URL}/${file}`);
  await assertPublicImages(imageUrls);

  const childIds = [];
  for (let i = 0; i < imageUrls.length; i += 1) {
    const created = await api(`/${encodeURIComponent(igUserId)}/media`, {
      method: "POST",
      form: {
        image_url: imageUrls[i],
        is_carousel_item: "true",
      },
    });
    const childId = required(created.id, `carousel child ${i + 1} id`);
    childIds.push(childId);
    await waitForContainer(childId, `Carousel child ${i + 1}`);
  }

  const caption = `${title}\n\n${dek}\n\nLee la edición completa en Atlas News:\n${canonicalUrl}\n\n#AtlasNews`;
  const carousel = await api(`/${encodeURIComponent(igUserId)}/media`, {
    method: "POST",
    form: {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption,
    },
  });
  const carouselId = required(carousel.id, "carousel container id");
  await waitForContainer(carouselId, "Carousel");

  const published = await api(
    `/${encodeURIComponent(igUserId)}/media_publish`,
    {
      method: "POST",
      form: { creation_id: carouselId },
    },
  );
  const mediaId = required(published.id, "published media id");

  const verification = await verifyPublishedMedia(mediaId);
  const verified = verification.verified || null;
  const isVerified = Boolean(verified?.permalink);

  await fs.mkdir(OUT, { recursive: true });
  const result = {
    status: isVerified ? "PUBLISHED_VERIFIED" : "PUBLISHED_UNVERIFIED",
    verificationError: isVerified ? null : verification.error,
    apiVersion: API_VERSION,
    igUserId,
    username,
    expectedUsername: EXPECTED_USERNAME,
    sourceId,
    contractPath: contractPath.relative,
    canonicalUrl,
    childContainerIds: childIds,
    carouselContainerId: carouselId,
    mediaId,
    permalink: verified?.permalink || null,
    mediaType: verified?.media_type || "CAROUSEL",
    publishedAt: verified?.timestamp || new Date().toISOString(),
    imageUrls,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  };
  await fs.writeFile(
    path.join(OUT, "instagram-publish.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        status: result.status,
        username: result.username,
        mediaId: result.mediaId,
        permalink: result.permalink,
        canonicalUrl: result.canonicalUrl,
        carouselItems: imageUrls.length,
      },
      null,
      2,
    ),
  );

  if (!isVerified) {
    throw new Error(
      `Instagram media ${mediaId} was published but could not be verified with a permalink. Evidence status: PUBLISHED_UNVERIFIED.`,
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
