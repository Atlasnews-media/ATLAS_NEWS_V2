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

test("resolves a Facebook Login token to its Page token", async () => {
  const calls = [];
  const session = await resolveInstagramSession({
    accessToken: "facebook-user-token",
    expectedUsername: "_atlas_news",
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.startsWith("https://graph.instagram.com/")) {
        return response(401, {
          error: { message: "Invalid OAuth access token" },
        });
      }
      if (url.includes("/me?fields=")) {
        return response(200, { id: "person-1", name: "Operator" });
      }
      return response(200, {
        data: [
          {
            id: "page-1",
            access_token: "facebook-page-token",
            instagram_business_account: {
              id: "ig-2",
              username: "_atlas_news",
            },
          },
        ],
      });
    },
  });

  assert.equal(session.mode, "facebook-login");
  assert.equal(session.graphBase, "https://graph.facebook.com/v23.0");
  assert.equal(session.accessToken, "facebook-page-token");
  assert.equal(session.userId, "ig-2");
  assert.equal(calls.length, 3);
});

test("fails closed when neither login mode reaches the expected account", async () => {
  await assert.rejects(
    resolveInstagramSession({
      accessToken: "bad-token",
      expectedUsername: "_atlas_news",
      fetchImpl: async (url) => {
        if (url.startsWith("https://graph.instagram.com/")) {
          return response(401, { error: { message: "Invalid token" } });
        }
        return response(200, { data: [] });
      },
    }),
    /no Facebook Page connected/,
  );
});
