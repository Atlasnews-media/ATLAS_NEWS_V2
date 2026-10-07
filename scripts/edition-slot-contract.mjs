export const MORNING_EDITION_SLOT = "morning";
export const MIDDAY_EDITION_SLOT = "midday";
export const EDITION_SLOTS = Object.freeze([
  MORNING_EDITION_SLOT,
  MIDDAY_EDITION_SLOT,
]);

export function normalizeEditionSlot(value) {
  const slot = String(value ?? "").trim() || MORNING_EDITION_SLOT;
  if (!EDITION_SLOTS.includes(slot)) {
    throw new Error(
      `editionSlot inválido: ${slot}. Valores válidos: ${EDITION_SLOTS.join(", ")}.`,
    );
  }
  return slot;
}

export function editionIdentityKey(date, type, value) {
  if (type !== "daily") return `${date}:${type}`;
  return `${date}:daily:${normalizeEditionSlot(value)}`;
}

export function briefingIdentityKey(date, section, value) {
  return `${date}:${section}:${normalizeEditionSlot(value)}`;
}

export function dailyIssueNumberFromRecords(target, records) {
  if (!target) return undefined;
  const date = target.id.slice(0, 10);
  const dates = [
    ...new Set(
      [...records]
        .sort(
          (a, b) =>
            Date.parse(a.publishedAt ?? "") - Date.parse(b.publishedAt ?? ""),
        )
        .map((record) => record.id.slice(0, 10)),
    ),
  ];
  const position = dates.indexOf(date);
  return position >= 0 ? position + 1 : undefined;
}

function latestForSlot(records, slot) {
  return [...records]
    .filter((record) => normalizeEditionSlot(record.editionSlot) === slot)
    .sort(
      (a, b) =>
        Date.parse(a.publishedAt ?? "") - Date.parse(b.publishedAt ?? ""),
    )
    .at(-1);
}

function latestBriefingForDate(records, date, section, slot) {
  return [...records]
    .filter(
      (record) =>
        record.section === section &&
        record.id.startsWith(`${date}-${section}-`) &&
        normalizeEditionSlot(record.editionSlot) === slot,
    )
    .sort(
      (a, b) =>
        Date.parse(a.publishedAt ?? "") - Date.parse(b.publishedAt ?? ""),
    )
    .at(-1);
}

export function packageForSlot({ dailies, briefings, slot }) {
  const normalizedSlot = normalizeEditionSlot(slot);
  const general = latestForSlot(dailies, normalizedSlot);
  if (!general) return null;

  const date = general.id.slice(0, 10);
  const national = latestBriefingForDate(
    briefings,
    date,
    "national",
    normalizedSlot,
  );
  const markets = latestBriefingForDate(
    briefings,
    date,
    "markets",
    normalizedSlot,
  );

  return {
    date,
    editionSlot: normalizedSlot,
    generalId: general.id,
    generalPublished: true,
    nationalId: national?.id ?? null,
    nationalPublished: Boolean(national),
    marketsId: markets?.id ?? null,
    marketsPublished: Boolean(markets),
    completeness: 1 + Number(Boolean(national)) + Number(Boolean(markets)),
  };
}
