import { getCollection, type CollectionEntry } from "astro:content";

export type Edition = CollectionEntry<"editions">;
export type Briefing = CollectionEntry<"briefings">;
export type Reading = CollectionEntry<"readings">;

const newestFirst = <T extends { data: { publishedAt: Date } }>(a: T, b: T) =>
  b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf();

const oldestFirst = <T extends { data: { publishedAt: Date } }>(a: T, b: T) =>
  a.data.publishedAt.valueOf() - b.data.publishedAt.valueOf();

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

export async function getPublishedReadings(): Promise<Reading[]> {
  return (
    await getCollection("readings", ({ data }) => data.status === "published")
  ).sort(newestFirst);
}

export function getPublishedDailies(editions: Edition[]): Edition[] {
  return editions.filter(({ data }) => data.type === "daily");
}

export async function getLatestDaily(): Promise<Edition | undefined> {
  return getPublishedDailies(await getPublishedEditions())[0];
}

export function dailyIssueNumber(
  edition: Edition,
  editions: Edition[],
): number | undefined {
  if (edition.data.type !== "daily") return undefined;

  const chronologicalDailies = getPublishedDailies(editions).sort(oldestFirst);
  const position = chronologicalDailies.findIndex(
    ({ id }) => id === edition.id,
  );
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
  return type === "daily" ? "Edición diaria" : "Panorama semanal";
}

export function editionDisplayLabel(
  edition: Edition,
  issueNumber?: number,
): string {
  const typeLabel = editionTypeLabel(edition.data.type);
  return issueNumber
    ? `${typeLabel} · ${formatIssueNumber(issueNumber)}`
    : typeLabel;
}
