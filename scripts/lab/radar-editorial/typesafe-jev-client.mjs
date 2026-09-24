import { performance } from "node:perf_hooks";

const DEFAULT_BASE_URL = "https://api.typesafe.ai/v1";
const RETRIABLE_STATUSES = new Set([429, 529]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class TypeSafeJevClient {
  constructor({
    apiKey = process.env.TYPESAFE_API_KEY,
    model = "jev-latest",
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs = 30_000,
    maxRetries = 1,
    retryBaseMs = 250,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.retryBaseMs = retryBaseMs;
    this.fetchImpl = fetchImpl;
  }

  async runQuestions({ state, questions } = {}) {
    if (state === undefined || state === null)
      throw new TypeError("state is required");
    if (
      !questions ||
      typeof questions !== "object" ||
      Array.isArray(questions)
    ) {
      throw new TypeError("questions must be an object");
    }
    if (!this.apiKey) {
      const error = new Error("TYPESAFE_API_KEY is required");
      error.code = "jev_credential_missing";
      throw error;
    }

    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const started = performance.now();
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/systemone`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ state, model: this.model, questions }),
          signal: controller.signal,
        });
        const latencyMs =
          Math.round((performance.now() - started) * 100) / 100;
        const text = await response.text();
        let payload = null;
        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }
        clearTimeout(timeout);

        if (
          !response.ok &&
          RETRIABLE_STATUSES.has(response.status) &&
          attempt < this.maxRetries
        ) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const delay = Number.isFinite(retryAfter)
            ? Math.min(retryAfter * 1000, 2_000)
            : Math.min(this.retryBaseMs * 2 ** attempt, 2_000);
          attempt += 1;
          await sleep(delay);
          continue;
        }

        return {
          ok: response.ok,
          status: response.status,
          latencyMs,
          attempts: attempt + 1,
          payload,
          error: response.ok ? null : { type: "http", status: response.status },
        };
      } catch (error) {
        clearTimeout(timeout);
        return {
          ok: false,
          status: null,
          latencyMs: Math.round((performance.now() - started) * 100) / 100,
          attempts: attempt + 1,
          payload: null,
          error: {
            type: error?.name === "AbortError" ? "timeout" : "network",
          },
        };
      }
    }
  }
}

export function createTypeSafeJevClient(options) {
  return new TypeSafeJevClient(options);
}
