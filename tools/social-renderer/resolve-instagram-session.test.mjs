import assert from "node:assert/strict";
import test from "node:test";

import { resolveInstagramSession } from "./resolve-instagram-session.mjs";

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

test("accepts an Instagram Login token", async () => {
  const session = await resolveInstagramSession({
    accessToken: "instagram-token",
    expectedUsername: "_atlas_news",
    fetchImpl: async () =>
      response(200, { id: "ig-1", username: "_atlas_news" }),
  });

  assert.equal(session.mode, "instagram-login");
  assert.equal(session.graphBase, "https://graph.instagram.com/v23.0");
  assert.equal(session.accessToken, "instagram-token");
  assert.equal(session.userId, "ig-1");
});

test("resolves a Facebook User token through managed Page and IG id", async () => {
  const calls = [];
  const session = await resolveInstagramSession({
    accessToken: "facebook-user-token",
    expectedUsername: "_atlas_news",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.startsWith("https://graph.instagram.com/")) {
        return response(401, {
          error: { message: "Invalid OAuth access token" },
        });
      }
      if (url.includes("/me/accounts?")) {
        return response(200, {
          data: [
            {
              id: "page-1",
              name: "ATLAS NEWS",
              access_token: "facebook-page-token",
              tasks: ["CREATE_CONTENT", "MANAGE"],
              instagram_business_account: { id: "ig-2" },
            },
          ],
        });
      }
      if (url.includes("/ig-2?fields=id,username")) {
        assert.equal(
          options.headers.Authorization,
          "Bearer facebook-page-token",
        );
        return response(200, { id: "ig-2", username: "_atlas_news" });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  assert.equal(session.mode, "facebook-login");
  assert.equal(session.graphBase, "https://graph.facebook.com/v23.0");
  assert.equal(session.accessToken, "facebook-page-token");
  assert.equal(session.userId, "ig-2");
  assert.equal(calls.length, 3);
});

test("accepts a Facebook Page token directly", async () => {
  const calls = [];
  const session = await resolveInstagramSession({
    accessToken: "facebook-page-token",
    expectedUsername: "_atlas_news",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.startsWith("https://graph.instagram.com/")) {
        return response(401, {
          error: { message: "Invalid OAuth access token" },
        });
      }
      if (url.includes("/me/accounts?")) {
        return response(400, { error: { message: "Not a User token" } });
      }
      if (url.endsWith("/me?fields=id,name")) {
        return response(200, { id: "page-1", name: "ATLAS NEWS" });
      }
      if (url.includes("/page-1?fields=id,name,instagram_business_account")) {
        return response(200, {
          id: "page-1",
          name: "ATLAS NEWS",
          instagram_business_account: { id: "ig-2" },
        });
      }
      if (url.includes("/ig-2?fields=id,username")) {
        assert.equal(
          options.headers.Authorization,
          "Bearer facebook-page-token",
        );
        return response(200, { id: "ig-2", username: "_atlas_news" });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  assert.equal(session.mode, "facebook-login");
  assert.equal(session.graphBase, "https://graph.facebook.com/v23.0");
  assert.equal(session.accessToken, "facebook-page-token");
  assert.equal(session.userId, "ig-2");
  assert.equal(calls.length, 5);
});

test("fails closed with useful diagnostics when User token has no managed linked Page", async () => {
  await assert.rejects(
    resolveInstagramSession({
      accessToken: "facebook-user-token",
      expectedUsername: "_atlas_news",
      fetchImpl: async (url) => {
        if (url.startsWith("https://graph.instagram.com/")) {
          return response(401, { error: { message: "Invalid token" } });
        }
        if (url.includes("/me/accounts?")) {
          return response(200, { data: [] });
        }
        if (url.endsWith("/me?fields=id,name")) {
          return response(200, { id: "person-1", name: "Operator" });
        }
        if (
          url.includes("/person-1?fields=id,name,instagram_business_account")
        ) {
          return response(400, {
            error: {
              message: "instagram_business_account is not a User field",
            },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    }),
    /managed-pages=0/,
  );
});
