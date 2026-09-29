import {
  resolveFrontPageVisual,
  type EditorialVisual,
  type FrontPageSection,
} from "./front-page-visuals";

export const SIGNAL_SECTIONS = [
  "internacional",
  "nacional",
  "mercados",
] as const;

export type SignalSection = (typeof SIGNAL_SECTIONS)[number];

export interface CanonicalSignal {
  slot: string;
  headline: string;
  deck: string;
  development: string;
  anchor: string;
  sources: Array<{
    name: string;
    url: string;
  }>;
}

interface SignalsArtifact {
  status: "READY";
  date: string;
  contract: "atlas-senales-del-dia-v1";
  senalesDelDia: Record<SignalSection, CanonicalSignal[]>;
}

export interface SignalPageProps {
  date: string;
  section: SignalSection;
  signal: CanonicalSignal;
  visual: EditorialVisual;
}

export const signalSectionConfig: Record<
  SignalSection,
  {
    label: string;
    href: string;
    visualSection: FrontPageSection;
  }
> = {
  internacional: {
    label: "Internacional",
    href: "/internacional/",
    visualSection: "international",
  },
  nacional: {
    label: "Nacional",
    href: "/nacional/",
    visualSection: "national",
  },
  mercados: {
    label: "Mercados",
    href: "/mercados/",
    visualSection: "markets",
  },
};

const signalFiles = import.meta.glob("../../data/senales-del-dia/*.json", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function parseSignalsArtifact(raw: string | undefined): unknown {
  if (!raw) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isCanonicalSignal(value: unknown): value is CanonicalSignal {
  if (!value || typeof value !== "object") return false;

  const signal = value as CanonicalSignal;

  return (
    typeof signal.slot === "string" &&
    typeof signal.headline === "string" &&
    signal.headline.trim().length > 0 &&
    signal.headline.length <= 72 &&
    typeof signal.deck === "string" &&
    signal.deck.trim().length > 0 &&
    signal.deck.length <= 180 &&
    typeof signal.development === "string" &&
    signal.development.trim().length > 0 &&
    typeof signal.anchor === "string" &&
    signal.anchor.trim().length > 0 &&
    Array.isArray(signal.sources)
  );
}

function isReadySignalsArtifact(value: unknown): value is SignalsArtifact {
  if (!value || typeof value !== "object") return false;

  const artifact = value as SignalsArtifact;
  const internacional = artifact.senalesDelDia?.internacional;
  const nacional = artifact.senalesDelDia?.nacional;
  const mercados = artifact.senalesDelDia?.mercados;

  if (
    artifact.status !== "READY" ||
    artifact.contract !== "atlas-senales-del-dia-v1" ||
    typeof artifact.date !== "string" ||
    !Array.isArray(internacional) ||
    !Array.isArray(nacional) ||
    !Array.isArray(mercados) ||
    internacional.length !== 2 ||
    nacional.length !== 2 ||
    mercados.length !== 2
  ) {
    return false;
  }

  return [...internacional, ...nacional, ...mercados].every(isCanonicalSignal);
}

function resolveSignalVisuals(artifact: SignalsArtifact) {
  const usedSources = new Set<string>();
  const visuals = new Map<string, EditorialVisual>();

  for (const section of SIGNAL_SECTIONS) {
    const config = signalSectionConfig[section];

    for (const signal of artifact.senalesDelDia[section]) {
      const visual = resolveFrontPageVisual({
        section: config.visualSection,
        id: `${artifact.date}:${signal.slot}:${signal.anchor}`,
        title: `${signal.headline} ${signal.deck}`,
        slot: signal.slot,
        usedSources,
      });

      usedSources.add(visual.src);
      visuals.set(`${section}:${signal.anchor}`, visual);
    }
  }

  return visuals;
}

export function getSignalStaticPaths() {
  const paths = [];

  for (const raw of Object.values(signalFiles)) {
    const parsed = parseSignalsArtifact(raw);
    if (!isReadySignalsArtifact(parsed)) continue;

    const visuals = resolveSignalVisuals(parsed);

    for (const section of SIGNAL_SECTIONS) {
      for (const signal of parsed.senalesDelDia[section]) {
        const visual = visuals.get(`${section}:${signal.anchor}`);
        if (!visual) continue;

        paths.push({
          params: {
            date: parsed.date,
            section,
            anchor: signal.anchor,
          },
          props: {
            date: parsed.date,
            section,
            signal,
            visual,
          },
        });
      }
    }
  }

  return paths;
}
