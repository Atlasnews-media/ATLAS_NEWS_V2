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

function accountFromPage(page, expectedUsername) {
  const instagram = page?.instagram_business_account;
  if (
    String(instagram?.username || "").toLowerCase() !==
    expectedUsername.toLowerCase()
  ) {
    return null;
  }
  const pageToken = String(page?.access_token || "").trim();
  const userId = String(instagram?.id || "").trim();
  if (!pageToken || !userId) return null;
  return {
    mode: "facebook-login",
    graphBase: null,
    accessToken: pageToken,
    userId,
    username: instagram.username,
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
  const fields = "id,name,access_token,instagram_business_account{id,username}";
  const pageSelf = await requestJson(
    fetchImpl,
    `${facebookBase}/me?fields=${encodeURIComponent(fields)}`,
    token,
  );
  if (pageSelf.ok) {
    const account = accountFromPage(pageSelf.body, expected);
    if (account) return { ...account, graphBase: facebookBase };
  }

  const pages = await requestJson(
    fetchImpl,
    `${facebookBase}/me/accounts?fields=${encodeURIComponent(fields)}&limit=100`,
    token,
  );
  if (pages.ok && Array.isArray(pages.body?.data)) {
    for (const page of pages.body.data) {
      const account = accountFromPage(page, expected);
      if (account) return { ...account, graphBase: facebookBase };
    }
  }

  const directMessage = direct.body?.error?.message || `HTTP ${direct.status}`;
  const facebookMessage =
    pages.body?.error?.message ||
    pageSelf.body?.error?.message ||
    `HTTP ${pages.status}`;
  throw new Error(
    `Token rejected for Instagram Login (${directMessage}) and no Facebook Page connected to @${expected} was found (${facebookMessage}).`,
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
