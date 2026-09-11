export interface EditorialVisual {
  src: string;
  alt: string;
  source: string;
  sourceUrl: string;
  author: string;
  license: string;
}

export type FrontPageSection = "international" | "national" | "markets";

interface CatalogVisual extends EditorialVisual {
  keywords: string[];
}

interface ResolveVisualInput {
  section: FrontPageSection;
  id: string;
  title: string;
  tags?: string[];
  editorialVisual?: EditorialVisual;
}

const FED_VISUAL: CatalogVisual = {
  src: "https://commons.wikimedia.org/wiki/Special:FilePath/Eccles_Building_%2826088200676%29.jpg?width=1280",
  alt: "Entrada principal del edificio Marriner S. Eccles de la Reserva Federal en Washington, D.C.",
  source: "Wikimedia Commons / Federal Reserve",
  sourceUrl:
    "https://commons.wikimedia.org/wiki/File:Eccles_Building_(26088200676).jpg",
  author: "Federalreserve",
  license: "Dominio público",
  keywords: [
    "fed",
    "reserva federal",
    "inflacion",
    "ipc",
    "ppi",
    "tasa",
    "tasas",
    "treasury",
    "bonos",
    "banco central",
  ],
};

const GULF_VISUAL: CatalogVisual = {
  src: "https://commons.wikimedia.org/wiki/Special:FilePath/USS_Hawes_%28FFG-53%29%2C_USS_William_H._Standley_%28CG-32%29_and_USS_Guadalcanal_%28LPH-7%29_escort_tanker_Gas_King_in_the_Persian_Gullf_on_21_October_1987_%286432283%29.jpg?width=1280",
  alt: "Convoy de buques escoltando al petrolero Gas King en el Golfo Pérsico en 1987.",
  source: "Wikimedia Commons / U.S. National Archives",
  sourceUrl:
    "https://commons.wikimedia.org/wiki/File:USS_Hawes_(FFG-53),_USS_William_H._Standley_(CG-32)_and_USS_Guadalcanal_(LPH-7)_escort_tanker_Gas_King_in_the_Persian_Gullf_on_21_October_1987_(6432283).jpg",
  author: "PH2 Elliott, U.S. Navy",
  license: "Public domain — U.S. federal government work",
  keywords: [
    "petroleo",
    "brent",
    "energia",
    "hormuz",
    "iran",
    "golfo",
    "buque",
    "tanquero",
    "opep",
    "transporte maritimo",
  ],
};

const PORT_VISUAL: CatalogVisual = {
  src: "https://commons.wikimedia.org/wiki/Special:FilePath/CL-san-antonio-hafen.jpg?width=1280",
  alt: "Vista del puerto de San Antonio en Chile, con infraestructura portuaria y movimiento de carga.",
  source: "Wikimedia Commons",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:CL-san-antonio-hafen.jpg",
  author: "Balou46",
  license: "CC BY-SA 4.0",
  keywords: [
    "transporte",
    "puerto",
    "comercio",
    "exportacion",
    "importacion",
    "logistica",
    "flete",
    "costos",
  ],
};

const SANTIAGO_VISUAL: CatalogVisual = {
  src: "https://commons.wikimedia.org/wiki/Special:FilePath/Skyline_of_Santiago%2C_Chile.jpg?width=1280",
  alt: "Vista del skyline de Santiago de Chile.",
  source: "Wikimedia Commons / Unsplash",
  sourceUrl:
    "https://commons.wikimedia.org/wiki/File:Skyline_of_Santiago,_Chile.jpg",
  author: "Pablo García Saldaña",
  license: "CC0 1.0",
  keywords: [
    "chile",
    "santiago",
    "economia",
    "actividad",
    "pib",
    "empleo",
    "vivienda",
    "hipotecario",
    "consumo",
    "presupuesto",
    "regulacion",
    "banco central",
  ],
};

const COPPER_VISUAL: CatalogVisual = {
  src: "https://commons.wikimedia.org/wiki/Special:FilePath/Chile_copper_mine.JPG?width=1280",
  alt: "Vista aérea de una mina de cobre en Chile.",
  source: "Wikimedia Commons",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Chile_copper_mine.JPG",
  author: "Sebastian Kawa, Tomasz Kawa",
  license: "CC BY-SA 3.0",
  keywords: ["cobre", "mineria", "minera", "commodities", "exportacion"],
};

const NYSE_VISUAL: CatalogVisual = {
  src: "https://commons.wikimedia.org/wiki/Special:FilePath/No_Known_Restrictions_Trading_Floor%2C_New_York_Stock_Exchange_%28Highsmith_LOC%29_%286718386525%29.jpg?width=1280",
  alt: "Piso de operaciones de la Bolsa de Nueva York fotografiado por Carol M. Highsmith.",
  source: "Library of Congress / Wikimedia Commons",
  sourceUrl:
    "https://commons.wikimedia.org/wiki/File:No_Known_Restrictions_Trading_Floor,_New_York_Stock_Exchange_(Highsmith_LOC)_(6718386525).jpg",
  author: "Carol M. Highsmith",
  license: "Dominio público",
  keywords: [
    "wall street",
    "acciones",
    "bolsa",
    "s&p",
    "nasdaq",
    "dow",
    "renta variable",
    "mercado",
  ],
};

const NYSE_EXTERIOR_VISUAL: CatalogVisual = {
  src: "https://commons.wikimedia.org/wiki/Special:FilePath/Stock_Exchange_NYC.jpg?width=1280",
  alt: "Fachada de la Bolsa de Nueva York en Wall Street.",
  source: "Wikimedia Commons",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Stock_Exchange_NYC.jpg",
  author: "Cody escadron delta",
  license: "Dominio público",
  keywords: ["wall street", "bolsa", "acciones", "mercado", "nueva york"],
};

const VISUAL_CATALOG: Record<FrontPageSection, CatalogVisual[]> = {
  international: [FED_VISUAL, GULF_VISUAL, NYSE_EXTERIOR_VISUAL],
  national: [PORT_VISUAL, SANTIAGO_VISUAL, COPPER_VISUAL],
  markets: [NYSE_VISUAL, FED_VISUAL, GULF_VISUAL, COPPER_VISUAL],
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stripKeywords(visual: CatalogVisual): EditorialVisual {
  const { keywords: _keywords, ...editorialVisual } = visual;
  return editorialVisual;
}

export function resolveFrontPageVisual({
  section,
  id,
  title,
  tags = [],
  editorialVisual,
}: ResolveVisualInput): EditorialVisual {
  if (editorialVisual) return editorialVisual;

  const pool = VISUAL_CATALOG[section];
  const haystack = normalize(`${title} ${tags.join(" ")}`);
  const scored = pool.map((visual) => ({
    visual,
    score: visual.keywords.reduce(
      (total, keyword) =>
        total + (haystack.includes(normalize(keyword)) ? 1 : 0),
      0,
    ),
  }));
  const bestScore = Math.max(...scored.map(({ score }) => score));
  const candidates = scored
    .filter(({ score }) => score === bestScore)
    .map(({ visual }) => visual);
  const selected = candidates[stableHash(id) % candidates.length] ?? pool[0];

  return stripKeywords(selected);
}
