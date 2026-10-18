import assert from "node:assert/strict";

import {
  briefingIdentityKey,
  dailyIssueNumberFromRecords,
  editionIdentityKey,
  normalizeEditionSlot,
  packageForSlot,
} from "./edition-slot-contract.mjs";

const previousDaily = {
  id: "2026-10-06-daily-previous-fixture",
  publishedAt: "2026-10-06T06:45:00-03:00",
  type: "daily",
};
const morningDaily = {
  id: "2026-10-07-daily-morning-fixture",
  publishedAt: "2026-10-07T06:45:00-03:00",
  type: "daily",
};
const middayDaily = {
  id: "2026-10-07-daily-midday-fixture",
  publishedAt: "2026-10-07T12:15:00-03:00",
  type: "daily",
  editionSlot: "midday",
};
const eveningDaily = {
  id: "2026-10-07-daily-evening-fixture",
  publishedAt: "2026-10-07T13:30:00-03:00",
  type: "daily",
  editionSlot: "evening",
};

const briefings = [
  {
    id: "2026-10-07-national-morning-fixture",
    publishedAt: "2026-10-07T06:45:00-03:00",
    section: "national",
  },
  {
    id: "2026-10-07-markets-morning-fixture",
    publishedAt: "2026-10-07T06:45:00-03:00",
    section: "markets",
  },
  {
    id: "2026-10-07-national-midday-fixture",
    publishedAt: "2026-10-07T12:15:00-03:00",
    section: "national",
    editionSlot: "midday",
  },
  {
    id: "2026-10-07-markets-midday-fixture",
    publishedAt: "2026-10-07T12:15:00-03:00",
    section: "markets",
    editionSlot: "midday",
  },
  {
    id: "2026-10-07-national-evening-fixture",
    publishedAt: "2026-10-07T13:30:00-03:00",
    section: "national",
    editionSlot: "evening",
  },
  {
    id: "2026-10-07-markets-evening-fixture",
    publishedAt: "2026-10-07T13:30:00-03:00",
    section: "markets",
    editionSlot: "evening",
  },
];

assert.equal(normalizeEditionSlot(undefined), "morning");
assert.equal(normalizeEditionSlot("midday"), "midday");
assert.equal(normalizeEditionSlot("evening"), "evening");
assert.notEqual(
  editionIdentityKey("2026-10-07", "daily", undefined),
  editionIdentityKey("2026-10-07", "daily", "midday"),
);
assert.notEqual(
  briefingIdentityKey("2026-10-07", "national", undefined),
  briefingIdentityKey("2026-10-07", "national", "midday"),
);

const dailies = [previousDaily, morningDaily, middayDaily, eveningDaily];
assert.equal(dailyIssueNumberFromRecords(morningDaily, dailies), 2);
assert.equal(dailyIssueNumberFromRecords(middayDaily, dailies), 2);
assert.equal(dailyIssueNumberFromRecords(eveningDaily, dailies), 2);

const morningPackage = packageForSlot({
  dailies,
  briefings,
  slot: "morning",
});
const middayPackage = packageForSlot({
  dailies,
  briefings,
  slot: "midday",
});
const eveningPackage = packageForSlot({
  dailies,
  briefings,
  slot: "evening",
});

assert.equal(morningPackage?.generalId, morningDaily.id);
assert.equal(middayPackage?.generalId, middayDaily.id);
assert.equal(morningPackage?.nationalId, "2026-10-07-national-morning-fixture");
assert.equal(middayPackage?.nationalId, "2026-10-07-national-midday-fixture");
assert.equal(morningPackage?.completeness, 3);
assert.equal(middayPackage?.completeness, 3);
assert.equal(eveningPackage?.generalId, eveningDaily.id);
assert.equal(eveningPackage?.nationalId, "2026-10-07-national-evening-fixture");
assert.equal(eveningPackage?.marketsId, "2026-10-07-markets-evening-fixture");
assert.equal(eveningPackage?.completeness, 3);

console.log(
  "PASS multiedición: Matutina, Mediodía y Vespertina conservan identidades distintas, comparten número diario y preservan paquetes separados.",
);
