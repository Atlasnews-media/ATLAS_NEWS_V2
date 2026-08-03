import { getCollection, type CollectionEntry } from "astro:content";

export type Edition = CollectionEntry<"editions">;
export type Reading = CollectionEntry<"readings">;

const newestFirst = <T extends { data: { publishedAt: Date } }>(a: T, b: T) =>
  b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf();

export async function getPublishedEditions(): Promise<Edition[]> {
  return (
    await getCollection("editions", ({ data }) => data.status === "published")
  ).sort(newestFirst);
}

export async function getPublishedReadings(): Promise<Reading[]> {
  return (
    await getCollection("readings", ({ data }) => data.status === "published")
  ).sort(newestFirst);
}

export async function getLatestDaily(): Promise<Edition | undefined> {
  return (await getPublishedEditions()).find(
    ({ data }) => data.type === "daily",
  );
}

export function formatEditorialDate(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeZone: "America/Santiago",
  }).format(date);
}

export function editionTypeLabel(type: Edition["data"]["type"]): string {
  return type === "daily" ? "Briefing diario" : "Panorama semanal";
}
