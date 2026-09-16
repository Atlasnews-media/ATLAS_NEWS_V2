import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

function normalizeVersion(value) {
  const version = String(value || "v23.0").trim();
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error("INSTAGRAM_API_VERSION must look like v23.0");
  }
  return version;
}

async function requestJson(fetchImpl, url, token) {
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "ATLAS-NEWS-Social-Distribution/3.0",
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  return { ok: response.ok, status: response.status, body };
}

async function resolvePageInstagramAccount({
  fetchImpl,
  facebookBase,
  page,
  expectedUsername,
  fallbackToken = "",
}) {
  const pageToken = String(page?.access_token || fallbackToken || "").trim();
  const instagramId = String(page?.instagram_business_account?.id || "").trim();
  if (!pageToken || !instagramId) return null;

  const instagram = await requestJson(
    fetchImpl,
    `${facebookBase}/${encodeURIComponent(instagramId)}?fields=id,username`,
    pageToken,
  );
  if (!instagram.ok) return null;

  const username = String(instagram.body?.username || "").trim();
  const userId = String(instagram.body?.id || instagramId).trim();
  if (!userId || username.toLowerCase() !== expectedUsername.toLowerCase()) {
    return null;
  }

  return {
    mode: "facebook-login",
    graphBase: facebookBase,
    accessToken: pageToken,
    userId,
    username,
  };
}

export async function resolveInstagramSession({
  accessToken,
  apiVersion = "v23.0",
  expectedUsername = "_atlas_news",
  fetchImpl = fetch,
}) {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN is missing");
  const version = normalizeVersion(apiVersion);
  const expected = String(expectedUsername || "").trim();
  if (!expected) throw new Error("INSTAGRAM_EXPECTED_USERNAME is missing");

  const instagramBase = `https://graph.instagram.com/${version}`;
  const direct = await requestJson(
    fetchImpl,
    `${instagramBase}/me?fields=id,username`,
    token,
  );
  if (
    direct.ok &&
    String(direct.body?.username || "").toLowerCase() ===
      expected.toLowerCase() &&
    String(direct.body?.id || "").trim()
  ) {
    return {
      mode: "instagram-login",
      graphBase: instagramBase,
      accessToken: token,
      userId: String(direct.body.id),
      username: String(direct.body.username),
    };
  }

  const facebookBase = `https://graph.facebook.com/${version}`;

  // Meta's documented Facebook Login flow is:
  // User token -> /me/accounts -> Page Access Token + instagram_business_account.id
  // -> query the IG user separately. Avoid requesting nested `username` from
  // /me/accounts because availability can vary by object/context.
  const pageListFields =
    "id,name,access_token,tasks,instagram_business_account";
  const pages = await requestJson(
    fetchImpl,
    `${facebookBase}/me/accounts?fields=${encodeURIComponent(pageListFields)}&limit=100`,
    token,
  );
  if (pages.ok && Array.isArray(pages.body?.data)) {
    for (const page of pages.body.data) {
      const account = await resolvePageInstagramAccount({
        fetchImpl,
        facebookBase,
        page,
        expectedUsername: expected,
      });
      if (account) return account;
    }
  }

  // A Graph API Explorer credential may already be a Page Access Token.
  // Identify /me safely first, then query that object as a Page. This avoids
  // asking a User object for Page-only fields and producing misleading #100s.
  const me = await requestJson(
    fetchImpl,
    `${facebookBase}/me?fields=id,name`,
    token,
  );
  let pageSelf = null;
  if (me.ok && String(me.body?.id || "").trim()) {
    const objectId = String(me.body.id).trim();
    pageSelf = await requestJson(
      fetchImpl,
      `${facebookBase}/${encodeURIComponent(objectId)}?fields=id,name,instagram_business_account`,
      token,
    );
    if (pageSelf.ok) {
      const account = await resolvePageInstagramAccount({
        fetchImpl,
        facebookBase,
        page: pageSelf.body,
        expectedUsername: expected,
        fallbackToken: token,
      });
      if (account) return account;
    }
  }

  const directMessage = direct.body?.error?.message || `HTTP ${direct.status}`;
  const pageCount =
    pages.ok && Array.isArray(pages.body?.data) ? pages.body.data.length : null;
  const pagesMessage = pages.ok
    ? `managed-pages=${pageCount}`
    : pages.body?.error?.message || `HTTP ${pages.status}`;
  const selfMessage = pageSelf
    ? pageSelf.ok
      ? "self-object-has-no-linked-instagram"
      : pageSelf.body?.error?.message || `HTTP ${pageSelf.status}`
    : me.body?.error?.message || `HTTP ${me.status}`;

  throw new Error(
    `Token rejected for Instagram Login (${directMessage}); Facebook resolution failed (${pagesMessage}; self=${selfMessage}). Expected linked professional account @${expected}.`,
  );
}

function safeEnvValue(value, label) {
  const text = String(value || "");
  if (!text || /[\r\n]/.test(text)) {
    throw new Error(`${label} is invalid`);
  }
  return text;
}

async function runCli() {
  const session = await resolveInstagramSession({
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    apiVersion: process.env.INSTAGRAM_API_VERSION,
    expectedUsername: process.env.INSTAGRAM_EXPECTED_USERNAME,
  });
  const envFile = process.env.GITHUB_ENV;
  if (!envFile) throw new Error("GITHUB_ENV is unavailable");

  const sessionToken = safeEnvValue(
    session.accessToken,
    "resolved Instagram access token",
  );
  process.stdout.write(`::add-mask::${sessionToken}\n`);
  await fs.appendFile(
    envFile,
    [
      `INSTAGRAM_GRAPH_BASE=${safeEnvValue(session.graphBase, "graph base")}`,
      `INSTAGRAM_SESSION_TOKEN=${sessionToken}`,
      `INSTAGRAM_USER_ID=${safeEnvValue(session.userId, "Instagram user id")}`,
      `INSTAGRAM_USERNAME=${safeEnvValue(session.username, "Instagram username")}`,
      `INSTAGRAM_AUTH_MODE=${safeEnvValue(session.mode, "Instagram auth mode")}`,
      "",
    ].join("\n"),
    "utf8",
  );
  process.stdout.write(
    `Instagram preflight OK: @${session.username} via ${session.mode}.\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    console.error(`BLOCKED_EXTERNAL: ${error.message}`);
    process.exitCode = 31;
  });
}
