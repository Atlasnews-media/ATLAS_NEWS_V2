import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "../..");
const OUT = path.resolve(process.cwd(), "output");
const CONTRACT_INPUT = process.env.SOCIAL_CONTRACT || "";
const PUBLICATION_STATUS = process.env.SOCIAL_PUBLICATION_STATUS || "";
const REQUIRED_PUBLICATION_STATUS = "PUBLICACIÓN DISPONIBLE / VERIFICADA";
const PUBLISH_CONFIRMATION = process.env.INSTAGRAM_REEL_PUBLISH_CONFIRMATION || "";
const REQUIRED_PUBLISH_CONFIRMATION = "PUBLICAR REEL / AUTORIZADO";
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "";
const EXPECTED_USERNAME = process.env.INSTAGRAM_EXPECTED_USERNAME || "_atlas_news";
const API_VERSION = process.env.INSTAGRAM_API_VERSION || "v23.0";
const VIDEO_URL = String(process.env.REEL_VIDEO_URL || "").trim();
const STATE_ROOT = String(process.env.REEL_STATE_ROOT || "").trim();
const GRAPH_BASE = "https://graph.instagram.com";
const REEL_MARKER = "#AtlasNewsReel";

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function resolveContract(input) {
  const normalized = required(input, "SOCIAL_CONTRACT").replaceAll("\\", "/");
  if (!normalized.endsWith(".json") || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`Unsafe contract path: ${input}`);
  }
  const absolute = path.resolve(ROOT, normalized);
  const relative = path.relative(ROOT, absolute).replaceAll(path.sep, "/");
  if (relative !== normalized) throw new Error(`Unsafe contract path: ${input}`);
  return { absolute, relative };
}

async function api(pathname, { method = "GET", form } = {}) {
  const url = `${GRAPH_BASE}/${API_VERSION}${pathname}`;
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "User-Agent": "ATLAS-NEWS-Reel-Distribution/1.0",
    },
  };
  if (form) {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
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
    const message = body?.error?.message || body?.message || `HTTP ${response.status}`;
    throw new Error(`Instagram API ${method} ${pathname} failed: ${message}`);
  }
  return body;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForContainer(containerId) {
  const terminalErrors = new Set(["ERROR", "EXPIRED"]);
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const status = await api(`/${encodeURIComponent(containerId)}?fields=status_code,status`);
    if (status.status_code === "FINISHED" || !status.status_code) return status;
    if (terminalErrors.has(status.status_code)) {
      throw new Error(`Reel container ${containerId} failed: ${status.status || status.status_code}`);
    }
    await sleep(Math.min(2000 + attempt * 750, 6000));
  }
  throw new Error(`Reel container ${containerId} did not become ready in time`);
}

async function verifyPublishedMedia(mediaId) {
  let lastError = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const candidate = await api(`/${encodeURIComponent(mediaId)}?fields=id,permalink,media_type,timestamp,caption`);
      if (String(candidate.permalink || "").trim()) return { verified: candidate, error: null };
      lastError = new Error("permalink missing from publication metadata");
    } catch (error) {
      lastError = error;
    }
    await sleep(attempt * 1500);
  }
  return { verified: null, error: lastError?.message || "publication metadata unavailable" };
}

async function assertCanonicalPublished(canonicalUrl) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(canonicalUrl, { method: "GET", redirect: "follow" });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {}
    await sleep(attempt * 1000);
  }
  throw new Error(`Post-publication guard failed: canonicalUrl is not publicly reachable: ${canonicalUrl}`);
}

async function assertPublicVideo(videoUrl) {
  const parsed = new URL(videoUrl);
  if (parsed.protocol !== "https:") throw new Error("REEL_VIDEO_URL must use https");
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const response = await fetch(videoUrl, {
        method: "GET",
        redirect: "follow",
        headers: { Range: "bytes=0-4095" },
      });
      const type = response.headers.get("content-type") || "";
      await response.arrayBuffer();
      if ((response.ok || response.status === 206) && (type.includes("video") || type.includes("octet-stream"))) return;
    } catch {}
    await sleep(attempt * 1000);
  }
  throw new Error(`Public Reel video is not fetchable: ${videoUrl}`);
}

async function readJsonIfExists(file) {
  if (!file) return null;
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeEvidence(result) {
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, "instagram-reel-publish.json"), `${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  if (PUBLICATION_STATUS !== REQUIRED_PUBLICATION_STATUS) {
    throw new Error(`Post-publication guard failed: expected "${REQUIRED_PUBLICATION_STATUS}"`);
  }
  if (PUBLISH_CONFIRMATION !== REQUIRED_PUBLISH_CONFIRMATION) {
    throw new Error(`Instagram Reel publish guard failed: expected "${REQUIRED_PUBLISH_CONFIRMATION}"`);
  }
  required(ACCESS_TOKEN, "INSTAGRAM_ACCESS_TOKEN");

  const contractPath = resolveContract(CONTRACT_INPUT);
  const contract = JSON.parse(await fs.readFile(contractPath.absolute, "utf8"));
  if (String(contract.version) !== "2") throw new Error(`Reel publisher requires contract v2, got ${contract.version}`);
  const sourceCommit = required(contract.sourceCommit, "contract.sourceCommit");
  const title = required(contract.title, "contract.title");
  const dek = required(contract.dek, "contract.dek");
  const canonicalUrl = required(contract.canonicalUrl, "contract.canonicalUrl");
  const sourceId = required(contract.sourceId, "contract.sourceId");
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error("contract.sourceCommit must be a full SHA");

  await assertCanonicalPublished(canonicalUrl);

  const me = await api("/me?fields=id,username");
  const igUserId = required(me.id, "Instagram user id");
  const username = required(me.username, "Instagram username");
  if (username.toLowerCase() !== EXPECTED_USERNAME.toLowerCase()) {
    throw new Error(`Wrong Instagram account: expected ${EXPECTED_USERNAME}, got ${username}`);
  }

  const publishedPath = STATE_ROOT ? path.join(STATE_ROOT, "instagram-reel-published", `${sourceCommit}.json`) : "";
  const pendingPath = STATE_ROOT ? path.join(STATE_ROOT, "instagram-reel-pending", `${sourceCommit}.json`) : "";
  const knownPublished = await readJsonIfExists(publishedPath);
  if (knownPublished?.permalink && ["PUBLISHED_VERIFIED", "ALREADY_PUBLISHED_VERIFIED"].includes(knownPublished.status)) {
    const result = { ...knownPublished, status: "ALREADY_PUBLISHED_VERIFIED", verificationSource: "persisted-sourceCommit" };
    await writeEvidence(result);
    console.log(JSON.stringify({ status: result.status, permalink: result.permalink, sourceCommit }, null, 2));
    return;
  }

  const pending = await readJsonIfExists(pendingPath);
  if (pending?.mediaId) {
    const verification = await verifyPublishedMedia(String(pending.mediaId));
    if (verification.verified?.permalink) {
      const result = {
        status: "ALREADY_PUBLISHED_VERIFIED",
        apiVersion: API_VERSION,
        igUserId,
        username,
        sourceCommit,
        sourceId,
        canonicalUrl,
        mediaId: String(pending.mediaId),
        permalink: verification.verified.permalink,
        mediaType: verification.verified.media_type || "REELS",
        publishedAt: verification.verified.timestamp || null,
        verificationSource: "pending-media-id",
      };
      await writeEvidence(result);
      console.log(JSON.stringify({ status: result.status, permalink: result.permalink, sourceCommit }, null, 2));
      return;
    }
    throw new Error(`Previous Reel publish remains ambiguous for mediaId=${pending.mediaId}; refusing duplicate publication`);
  }

  const recent = await api(`/${encodeURIComponent(igUserId)}/media?fields=id,caption,permalink,timestamp,media_type&limit=40`);
  const duplicate = Array.isArray(recent.data)
    ? recent.data.find((item) => String(item.caption || "").includes(canonicalUrl) && String(item.caption || "").includes(REEL_MARKER) && String(item.permalink || "").trim())
    : null;
  if (duplicate) {
    const result = {
      status: "ALREADY_PUBLISHED_VERIFIED",
      apiVersion: API_VERSION,
      igUserId,
      username,
      sourceCommit,
      sourceId,
      canonicalUrl,
      mediaId: String(duplicate.id),
      permalink: duplicate.permalink,
      mediaType: duplicate.media_type || "REELS",
      publishedAt: duplicate.timestamp || null,
      verificationSource: "recent-media-marker",
    };
    await writeEvidence(result);
    console.log(JSON.stringify({ status: result.status, permalink: result.permalink, sourceCommit }, null, 2));
    return;
  }

  required(VIDEO_URL, "REEL_VIDEO_URL");
  await assertPublicVideo(VIDEO_URL);

  const caption = `${title}\n\n${dek}\n\nLee la edición completa en Atlas News:\n${canonicalUrl}\n\n#AtlasNews ${REEL_MARKER}`;
  const created = await api(`/${encodeURIComponent(igUserId)}/media`, {
    method: "POST",
    form: {
      media_type: "REELS",
      video_url: VIDEO_URL,
      caption,
      share_to_feed: "true",
    },
  });
  const containerId = required(created.id, "Reel container id");
  await waitForContainer(containerId);

  const published = await api(`/${encodeURIComponent(igUserId)}/media_publish`, {
    method: "POST",
    form: { creation_id: containerId },
  });
  const mediaId = required(published.id, "published Reel media id");
  const verification = await verifyPublishedMedia(mediaId);
  const verified = verification.verified || null;
  const isVerified = Boolean(verified?.permalink);

  const result = {
    status: isVerified ? "PUBLISHED_VERIFIED" : "PUBLISHED_UNVERIFIED",
    verificationError: isVerified ? null : verification.error,
    apiVersion: API_VERSION,
    igUserId,
    username,
    expectedUsername: EXPECTED_USERNAME,
    sourceCommit,
    sourceId,
    contractPath: contractPath.relative,
    canonicalUrl,
    reelContainerId: containerId,
    mediaId,
    permalink: verified?.permalink || null,
    mediaType: verified?.media_type || "REELS",
    publishedAt: verified?.timestamp || new Date().toISOString(),
    videoUrl: VIDEO_URL,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  };
  await writeEvidence(result);
  console.log(JSON.stringify({ status: result.status, username, mediaId, permalink: result.permalink, canonicalUrl }, null, 2));

  if (!isVerified) {
    throw new Error(`Instagram Reel ${mediaId} was published but could not be verified with a permalink. Evidence status: PUBLISHED_UNVERIFIED.`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
