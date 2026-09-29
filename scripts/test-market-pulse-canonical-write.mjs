import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { serializeCanonicalJson } from "./lib/serialize-canonical-json.mjs";

const validatorSource = await readFile(
  new URL("./validate-market-pulse-freshness.mjs", import.meta.url),
  "utf8",
);

assert.match(
  validatorSource,
  /import \{ serializeCanonicalJson \} from "\.\/lib\/serialize-canonical-json\.mjs";/,
);
assert.match(
  validatorSource,
  /const serialized = await serializeCanonicalJson\(guardedSnapshot\);/,
);
assert.doesNotMatch(
  validatorSource,
  /JSON\.stringify\(guardedSnapshot/,
  "El freshness guard no debe reescribir market-pulse fuera del serializador canónico.",
);

const fallbackFixture = {
  status: "partial",
  freshnessPolicy: "intraday-v2",
  assets: [
    {
      id: "bitcoin",
      status: "fallback",
      displayEligible: true,
      freshnessState: "delayed",
      freshnessNote: "último dato disponible",
    },
  ],
  diagnostics: [
    {
      id: "bitcoin-freshness",
      ok: true,
      delayed: true,
      warning: "último dato disponible",
    },
  ],
};

const canonical = await serializeCanonicalJson(fallbackFixture);
const canonicalAgain = await serializeCanonicalJson(JSON.parse(canonical));

assert.equal(
  canonicalAgain,
  canonical,
  "La serialización canónica debe ser idempotente también en snapshots con fallback.",
);

console.log(
  "Market pulse canonical write OK · freshness guard y fallback usan serialización canónica.",
);
