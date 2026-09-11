const INE_URL = "https://www.ine.gob.cl/inicio/agendaestadistica";
const BCCH_URL = "https://www.bcentral.cl/es/calendario-estadistico";
const TIME_ZONE = "America/Santiago";
const MAX_ITEMS = 5;
const TIMEOUT_MS = 12_000;

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const MONTH_NUMBER = new Map(MONTHS.map((month, index) => [month, index + 1]));

export type ChileCalendarEvent = {
  id: string;
  date: string;
  time: string | null;
  name: string;
  sourceName: "INE" | "Banco Central";
  sourceUrl: string;
  exactTime: boolean;
  score: number;
};

export type ChileCalendarResult = {
  generatedAt: string;
  events: ChileCalendarEvent[];
  todayCount: number;
  usesFuture: boolean;
  sources: {
    ine: "ok" | "unavailable";
    bancoCentral: "ok" | "unavailable";
  };
};

type SourceResult = {
  ok: boolean;
  body: string;
};

type CalendarKind = "ine" | "bcch";

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    nbsp: " ",
    aacute: "á",
    eacute: "é",
    iacute: "í",
    oacute: "ó",
    uacute: "ú",
    ntilde: "ñ",
    Aacute: "Á",
    Eacute: "É",
    Iacute: "Í",
    Oacute: "Ó",
    Uacute: "Ú",
    Ntilde: "Ñ",
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-zA-Z]+);/g, (entity, name: string) => named[name] ?? entity);
}

function cleanText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSource(url: string): Promise<SourceResult> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "ATLAS-NEWS-LAB/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return { ok: false, body: "" };
    return { ok: true, body: await response.text() };
  } catch {
    return { ok: false, body: "" };
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function localDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function localYear(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, year: "numeric" }).format(
      date,
    ),
  );
}

function monthBlocks(
  text: string,
  startAt: number,
  kind: CalendarKind,
): Array<{ month: number; body: string }> {
  const source = text.slice(Math.max(0, startAt));
  const headingLookahead =
    kind === "ine"
      ? "(?=\\s+\\d{1,2}\\s+\\d{2}:\\d{2}\\b)"
      : "(?=\\s+(?:3[01]|[12]\\d|[1-9])\\s+[A-ZÁÉÍÓÚÑ])";
  const monthPattern = new RegExp(
    `\\b(${MONTHS.join("|")})\\b${headingLookahead}`,
    "gi",
  );
  const matches = [...source.matchAll(monthPattern)];
  const blocks: Array<{ month: number; body: string }> = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const monthName = match[1].toLocaleLowerCase("es-CL") as (typeof MONTHS)[number];
    const month = MONTH_NUMBER.get(monthName);
    if (!month || match.index === undefined) continue;

    const next = matches[index + 1];
    const bodyStart = match.index + match[0].length;
    const bodyEnd = next?.index ?? source.length;
    blocks.push({ month, body: source.slice(bodyStart, bodyEnd).trim() });
  }

  return blocks;
}

function relevance(name: string, source: "INE" | "Banco Central"): number {
  const text = name.toLocaleLowerCase("es-CL");
  const rules: Array<[RegExp, number]> = [
    [/ipc|precios al consumidor/, 100],
    [/imacec/, 100],
    [/empleo nacional|desocupaci[oó]n/, 95],
    [/reuni[oó]n de pol[ií]tica monetaria|rpm|operadores financieros/, 92],
    [/expectativas econ[oó]micas/, 88],
    [/producci[oó]n industrial|\bipi\b/, 85],
    [/actividad del comercio|\biac\b/, 82],
    [/precios de productor|\bipp\b/, 80],
    [/comercio exterior/, 78],
    [/cuentas nacionales|pib regional/, 77],
    [/remuneraciones|costos laborales/, 74],
    [/mercado de valores/, 70],
    [/derivados financieros/, 68],
    [/cr[eé]dito bancario/, 66],
    [/ventas por estrato|ventas diarias|ventas online/, 60],
    [/inventarios/, 55],
    [/posiciones y flujos de no residentes/, 55],
    [/alojamiento tur[ií]stico/, 50],
    [/transporte y comunicaciones|costos de transporte/, 48],
    [/coyuntura semanal/, 30],
    [/estad[ií]sticas vitales/, 25],
  ];

  for (const [pattern, score] of rules) {
    if (pattern.test(text)) return score;
  }

  return source === "Banco Central" ? 45 : 40;
}

function parseIne(html: string, year: number): ChileCalendarEvent[] {
  const text = cleanText(html);
  const marker = text.search(/Agenda Estadística 20\d{2}/i);
  if (marker === -1) return [];

  const detectedYear = Number(text.slice(marker, marker + 80).match(/20\d{2}/)?.[0] ?? year);
  const events: ChileCalendarEvent[] = [];

  for (const block of monthBlocks(text, marker, "ine")) {
    const pattern = /\b(\d{1,2})\s+(\d{2}:\d{2})\s+(.+?)(?=\s+\d{1,2}\s+\d{2}:\d{2}\s+|$)/g;
    for (const match of block.body.matchAll(pattern)) {
      const day = Number(match[1]);
      if (day < 1 || day > 31) continue;
      const name = match[3].trim();
      const date = dateKey(detectedYear, block.month, day);
      events.push({
        id: `ine-${date}-${match[2]}-${name}`,
        date,
        time: match[2],
        name,
        sourceName: "INE",
        sourceUrl: INE_URL,
        exactTime: true,
        score: relevance(name, "INE"),
      });
    }
  }

  return events;
}

function splitBcchGroups(body: string): Array<{ day: number; name: string }> {
  const boundary = /\b(3[01]|[12]\d|[1-9])\s+(?=[A-ZÁÉÍÓÚÑ])/g;
  const matches = [...body.matchAll(boundary)];
  const groups: Array<{ day: number; name: string }> = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match.index === undefined) continue;
    const next = matches[index + 1];
    const start = match.index + match[0].length;
    const end = next?.index ?? body.length;
    const name = body.slice(start, end).trim();
    if (!name || name.length > 420) continue;
    groups.push({ day: Number(match[1]), name });
  }

  return groups;
}

function parseBcch(html: string, year: number): ChileCalendarEvent[] {
  const text = cleanText(html);
  const marker = text.search(/Calendario Estadístico/i);
  if (marker === -1) return [];

  const events: ChileCalendarEvent[] = [];
  for (const block of monthBlocks(text, marker, "bcch")) {
    for (const group of splitBcchGroups(block.body)) {
      const date = dateKey(year, block.month, group.day);
      events.push({
        id: `bcch-${date}-${group.name}`,
        date,
        time: null,
        name: group.name,
        sourceName: "Banco Central",
        sourceUrl: BCCH_URL,
        exactTime: false,
        score: relevance(group.name, "Banco Central"),
      });
    }
  }

  return events;
}

function dedupe(events: ChileCalendarEvent[]): ChileCalendarEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.date}|${event.sourceName}|${event.name}`
      .toLocaleLowerCase("es-CL")
      .replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectEvents(events: ChileCalendarEvent[], now: Date): ChileCalendarEvent[] {
  const today = localDateKey(now);
  const future = dedupe(events).filter((event) => event.date >= today);
  const byDate = new Map<string, ChileCalendarEvent[]>();

  for (const event of future) {
    const list = byDate.get(event.date) ?? [];
    list.push(event);
    byDate.set(event.date, list);
  }

  const selected: ChileCalendarEvent[] = [];
  const dates = [...byDate.keys()].sort();
  for (const date of dates) {
    const dayEvents = (byDate.get(date) ?? []).sort(
      (a, b) => b.score - a.score || (a.time ?? "99:99").localeCompare(b.time ?? "99:99"),
    );

    for (const event of dayEvents) {
      selected.push(event);
      if (selected.length >= MAX_ITEMS) return selected;
    }
  }

  return selected;
}

export async function loadChileCalendar(now = new Date()): Promise<ChileCalendarResult> {
  const year = localYear(now);
  const [ine, bancoCentral] = await Promise.all([
    fetchSource(INE_URL),
    fetchSource(BCCH_URL),
  ]);

  const allEvents = [
    ...(ine.ok ? parseIne(ine.body, year) : []),
    ...(bancoCentral.ok ? parseBcch(bancoCentral.body, year) : []),
  ];
  const events = selectEvents(allEvents, now);
  const today = localDateKey(now);
  const todayCount = events.filter((event) => event.date === today).length;

  return {
    generatedAt: now.toISOString(),
    events,
    todayCount,
    usesFuture: events.some((event) => event.date > today),
    sources: {
      ine: ine.ok ? "ok" : "unavailable",
      bancoCentral: bancoCentral.ok ? "ok" : "unavailable",
    },
  };
}
