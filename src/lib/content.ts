import { getCollection, type CollectionEntry } from "astro:content";

export type Edition = CollectionEntry<"editions">;
export type Briefing = CollectionEntry<"briefings">;
export type Reading = CollectionEntry<"readings">;
export type EditionSlot = "morning" | "midday";

export const MORNING_EDITION_SLOT: EditionSlot = "morning";
export const MIDDAY_EDITION_SLOT: EditionSlot = "midday";

const newestFirst = <T extends { data: { publishedAt: Date } }>(a: T, b: T) =>
  b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf();

const oldestFirst = <T extends { data: { publishedAt: Date } }>(a: T, b: T) =>
  a.data.publishedAt.valueOf() - b.data.publishedAt.valueOf();

export function resolveEditionSlot(data: {
  editionSlot?: EditionSlot;
}): EditionSlot {
  return data.editionSlot ?? MORNING_EDITION_SLOT;
}

export function editionNavigationLabel(slot: EditionSlot): string {
  return slot === MIDDAY_EDITION_SLOT ? "Edición mediodía" : "Edición matutina";
}

export async function getPublishedEditions(): Promise<Edition[]> {
  return (
    await getCollection("editions", ({ data }) => data.status === "published")
  ).sort(newestFirst);
}

export async function getPublishedBriefings(): Promise<Briefing[]> {
  return (
    await getCollection("briefings", ({ data }) => data.status === "published")
  ).sort(newestFirst);
}

export async function getPublishedNational(): Promise<Briefing[]> {
  return (await getPublishedBriefings()).filter(
    ({ data }) => data.section === "national",
  );
}

export async function getPublishedMarkets(): Promise<Briefing[]> {
  return (await getPublishedBriefings()).filter(
    ({ data }) => data.section === "markets",
  );
}

export async function getLatestNational(): Promise<Briefing | undefined> {
  return (await getPublishedNational())[0];
}

export async function getLatestMarkets(): Promise<Briefing | undefined> {
  return (await getPublishedMarkets())[0];
}

export async function getPublishedNationalForSlot(
  slot: EditionSlot,
): Promise<Briefing[]> {
  return (await getPublishedNational()).filter(
    ({ data }) => resolveEditionSlot(data) === slot,
  );
}

export async function getPublishedMarketsForSlot(
  slot: EditionSlot,
): Promise<Briefing[]> {
  return (await getPublishedMarkets()).filter(
    ({ data }) => resolveEditionSlot(data) === slot,
  );
}

export async function getPublishedReadings(): Promise<Reading[]> {
  return (
    await getCollection("readings", ({ data }) => data.status === "published")
  ).sort(newestFirst);
}

export function getPublishedDailies(editions: Edition[]): Edition[] {
  return editions.filter(({ data }) => data.type === "daily");
}

export function getPublishedDailiesForSlot(
  editions: Edition[],
  slot: EditionSlot,
): Edition[] {
  return getPublishedDailies(editions).filter(
    ({ data }) => resolveEditionSlot(data) === slot,
  );
}

export async function getPublishedInternational(): Promise<Edition[]> {
  return getPublishedDailies(await getPublishedEditions());
}

export async function getLatestDaily(): Promise<Edition | undefined> {
  return getPublishedDailies(await getPublishedEditions())[0];
}

function dailyEditionDate(edition: Edition): string {
  return edition.id.slice(0, 10);
}

export function dailyIssueNumber(
  edition: Edition,
  editions: Edition[],
): number | undefined {
  if (edition.data.type !== "daily") return undefined;

  const chronologicalDates = [
    ...new Set(
      getPublishedDailies(editions)
        .sort(oldestFirst)
        .map((daily) => dailyEditionDate(daily)),
    ),
  ];
  const position = chronologicalDates.indexOf(dailyEditionDate(edition));
  return position >= 0 ? position + 1 : undefined;
}

export function formatIssueNumber(issueNumber: number): string {
  return `N.º ${String(issueNumber).padStart(3, "0")}`;
}

export function formatEditorialDate(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeZone: "America/Santiago",
  }).format(date);
}

export function formatEditorialDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}

export function editionTypeLabel(type: Edition["data"]["type"]): string {
  return type === "daily" ? "Internacional" : "Panorama semanal";
}

export function editionDisplayLabel(
  edition: Edition,
  issueNumber?: number,
): string {
  const typeLabel = editionTypeLabel(edition.data.type);
  const slotLabel =
    edition.data.type === "daily" &&
    resolveEditionSlot(edition.data) === MIDDAY_EDITION_SLOT
      ? " · Mediodía"
      : "";
  return issueNumber
    ? `${typeLabel}${slotLabel} · ${formatIssueNumber(issueNumber)}`
    : `${typeLabel}${slotLabel}`;
}
