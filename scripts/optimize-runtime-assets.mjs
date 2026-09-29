import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const DIST_DIR = new URL("../dist/", import.meta.url);
const HOME_PATH = new URL("index.html", DIST_DIR);
const CALENDAR_PATH = new URL("calendario-economico/index.html", DIST_DIR);
const IMAGE_DIR = new URL("images/editorial/", DIST_DIR);
const TIME_ZONE = "America/Santiago";
const MAX_ITEMS = 5;
const FETCH_TIMEOUT_MS = 8_000;
const API = "https://biquote.io/api/calendar";
const MAJOR_COUNTRIES = [
  "US",
  "EU",
  "GB",
  "JP",
  "CN",
  "DE",
  "FR",
  "CA",
  "AU",
  "BR",
  "MX",
  "KR",
  "CH",
];

const impactScores = {
  high: 30,
  medium: 20,
  med: 20,
  low: 10,
};

const marketSectors = new Set([
  "rates",
  "bonds",
  "energy",
  "money",
  "centralbank",
  "central-bank",
  "commodities",
  "credit",
  "banking",
  "finance",
  "stocks",
  "equities",
]);

const countryLabels = {
  US: "EE.UU.",
  EU: "Eurozona",
  GB: "Reino Unido",
  JP: "Japón",
  CN: "China",
  DE: "Alemania",
  FR: "Francia",
  CA: "Canadá",
  AU: "Australia",
  BR: "Brasil",
  MX: "México",
  KR: "Corea del Sur",
  CH: "Suiza",
};

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isEditorialRemoteImage(value) {
  try {
    const hostname = new URL(decodeHtml(value)).hostname;
    return ["commons.wikimedia.org", "upload.wikimedia.org"].includes(hostname);
  } catch {
    return false;
  }
}

function imageExtension(contentType, finalUrl) {
  const normalized = String(contentType ?? "").toLowerCase();
  if (normalized.includes("image/webp")) return ".webp";
  if (normalized.includes("image/png")) return ".png";
  if (normalized.includes("image/gif")) return ".gif";
  if (normalized.includes("image/svg")) return ".svg";
  if (normalized.includes("image/jpeg")) return ".jpg";

  const suffix = extname(new URL(finalUrl).pathname).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(suffix)) {
    return suffix === ".jpeg" ? ".jpg" : suffix;
  }
  return ".img";
}

async function fetchWithTimeout(url) {
  return fetch(url, {
    headers: {
      Accept: "*/*",
      "User-Agent": "ATLAS-NEWS/1.0 (+https://atlasnews-media.github.io/)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

async function listHtmlFiles(directoryUrl) {
  const files = [];

  async function walk(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const next = join(path, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile() && entry.name.endsWith(".html")) files.push(next);
    }
  }

  await walk(directoryUrl.pathname);
  return files;
}

async function vendorCurrentEditorialImages() {
  let home;
  try {
    home = await readFile(HOME_PATH, "utf8");
  } catch {
    console.warn("[runtime-opt] Portada no disponible; se omite vendorización visual.");
    return;
  }

  const srcPattern = /<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
  const remoteUrls = new Set();
  for (const match of home.matchAll(srcPattern)) {
    const src = match[1] ?? match[2] ?? "";
    if (isEditorialRemoteImage(src)) remoteUrls.add(decodeHtml(src));
  }

  if (remoteUrls.size === 0) {
    console.log("[runtime-opt] Sin imágenes editoriales remotas en portada.");
    return;
  }

  await mkdir(IMAGE_DIR, { recursive: true });
  const replacements = new Map();

  for (const remoteUrl of remoteUrls) {
    try {
      const response = await fetchWithTimeout(remoteUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("image/")) {
        throw new Error(`content-type inesperado: ${contentType || "desconocido"}`);
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      const hash = createHash("sha256").update(remoteUrl).digest("hex").slice(0, 16);
      const extension = imageExtension(contentType, response.url);
      const fileName = `${hash}${extension}`;
      const localPath = `/images/editorial/${fileName}`;

      await writeFile(new URL(fileName, IMAGE_DIR), bytes);
      replacements.set(remoteUrl, localPath);
      console.log(`[runtime-opt] Imagen local: ${localPath}`);
    } catch (error) {
      console.warn(`[runtime-opt] Imagen remota conservada: ${remoteUrl} (${error.message})`);
    }
  }

  if (replacements.size === 0) return;

  const htmlFiles = await listHtmlFiles(DIST_DIR);
  for (const file of htmlFiles) {
    let html = await readFile(file, "utf8");
    const original = html;
    for (const [remoteUrl, localPath] of replacements) {
      html = html
        .replaceAll(remoteUrl, localPath)
        .replaceAll(remoteUrl.replaceAll("&", "&amp;"), localPath);
    }

    if (html !== original) await writeFile(file, html);
  }
}

function localDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function eventKey(event) {
  if (event.eventId) return event.eventId;
  const period = event.period?.slice(0, 10) ?? localDateKey(new Date(event.time));
  return `${event.countryCode ?? ""}|${normalizeName(event.name)}|${period}`;
}

function score(event) {
  const impact = impactScores[String(event.importance ?? "").toLowerCase()] ?? 0;
  const exact = event.timeMode === "exact" ? 2 : 0;
  const major = event.countryCode && MAJOR_COUNTRIES.includes(event.countryCode) ? 3 : 0;
  return impact + exact + major;
}

function dedupe(events) {
  const unique = new Map();
  [...events]
    .sort((a, b) => score(b) - score(a))
    .forEach((event) => {
      const key = eventKey(event);
      if (!unique.has(key)) unique.set(key, event);
    });
  return [...unique.values()];
}

function regionFor(code = "") {
  if (["US", "CA", "BR", "MX"].includes(code)) return "americas";
  if (["EU", "GB", "DE", "FR", "CH"].includes(code)) return "europe";
  if (["JP", "CN", "KR", "AU"].includes(code)) return "asia-pacific";
  return "other";
}

function byPriority(events) {
  return [...events].sort(
    (a, b) => score(b) - score(a) || new Date(a.time).getTime() - new Date(b.time).getTime(),
  );
}

function chooseInternational(events) {
  const candidates = byPriority(dedupe(events).filter((event) => event.type !== "holiday"));
  const selected = [];
  const selectedKeys = new Set();
  const countryCounts = new Map();

  for (const region of ["americas", "europe", "asia-pacific"]) {
    const event = candidates.find(
      (candidate) =>
        regionFor(candidate.countryCode) === region && !selectedKeys.has(eventKey(candidate)),
    );
    if (!event) continue;
    selected.push(event);
    selectedKeys.add(eventKey(event));
    const code = event.countryCode ?? "";
    countryCounts.set(code, (countryCounts.get(code) ?? 0) + 1);
  }

  for (const event of candidates) {
    if (selected.length >= MAX_ITEMS) break;
    const key = eventKey(event);
    if (selectedKeys.has(key)) continue;
    const code = event.countryCode ?? "";
    const cap = code === "US" ? 3 : 2;
    if ((countryCounts.get(code) ?? 0) >= cap) continue;
    selected.push(event);
    selectedKeys.add(key);
    countryCounts.set(code, (countryCounts.get(code) ?? 0) + 1);
  }

  return selected.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function chooseMarkets(events, blockedKeys) {
  const marketOnly = dedupe(events).filter((event) => {
    if (blockedKeys.has(eventKey(event))) return false;
    const type = String(event.type ?? "").toLowerCase();
    const sector = String(event.sector ?? "").toLowerCase();
    return type === "event" || type === "holiday" || marketSectors.has(sector);
  });

  return byPriority(marketOnly)
    .slice(0, MAX_ITEMS)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function localTime(value, timeMode = "exact") {
  if (timeMode !== "exact") return "—";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function displayName(event) {
  const raw = event.name ?? "Evento económico";
  const exact = {
    "gdp m/m": "PIB mensual",
    "gdp y/y": "PIB anual",
    "cpi m/m": "IPC mensual",
    "cpi y/y": "IPC anual",
    "core cpi m/m": "IPC subyacente mensual",
    "core cpi y/y": "IPC subyacente anual",
    "ecb president lagarde speech": "Discurso de Christine Lagarde — BCE",
  };
  const normalized = normalizeName(raw);
  const direct = exact[raw.toLowerCase()];
  if (direct) return direct;
  if (normalized === "gdp m m") return "PIB mensual";
  if (normalized === "gdp y y") return "PIB anual";
  if (normalized === "cpi m m") return "IPC mensual";
  if (normalized === "cpi y y") return "IPC anual";
  if (normalized === "core cpi m m") return "IPC subyacente mensual";
  if (normalized === "core cpi y y") return "IPC subyacente anual";
  return raw;
}

function eventRow(event, scopeAttr = "") {
  const country = countryLabels[event.countryCode ?? ""] ?? event.countryCode ?? "—";
  const source = event.sourceUrl
    ? `<a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(country)}</a>`
    : escapeHtml(country);

  const scoped = scopeAttr ? ` ${scopeAttr}` : "";
  return `<article class="event-row"${scoped}><time datetime="${escapeHtml(event.time)}"${scoped}>${escapeHtml(
    localTime(event.time, event.timeMode),
  )}</time><div class="event-copy"${scoped}><h3${scoped}>${escapeHtml(displayName(event))}</h3><p${scoped}>${source}</p></div></article>`;
}

function emptyRow(message, scopeAttr = "") {
  const scoped = scopeAttr ? ` ${scopeAttr}` : "";
  return `<div class="event-empty"${scoped}><strong${scoped}>—</strong><p${scoped}>${escapeHtml(message)}</p></div>`;
}

async function fetchCalendar(params) {
  const url = new URL(API);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`API ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Respuesta API inesperada");
  return data;
}

function replaceCalendarList(html, id, events, emptyMessage) {
  const pattern = new RegExp(
    `<div([^>]*\\bid="${id}"[^>]*)>\\s*<\\/div>`,
  );
  const match = html.match(pattern);
  if (!match) return html;

  const attributes = match[1];
  const scopeAttr = attributes.match(/data-astro-cid-[\w-]+(?:="[^"]*")?/)?.[0] ?? "";
  const openingAttributes = attributes
    .replace(/\saria-busy="true"/, ' aria-busy="false"')
    .replace(/\sdata-calendar-snapshot="true"/, "");
  const rows =
    events.length > 0
      ? events.map((event) => eventRow(event, scopeAttr)).join("")
      : emptyRow(emptyMessage, scopeAttr);

  return html.replace(
    pattern,
    `<div${openingAttributes} data-calendar-snapshot="true">${rows}</div>`,
  );
}

async function hydrateCalendarSnapshot() {
  let html;
  try {
    html = await readFile(CALENDAR_PATH, "utf8");
  } catch {
    console.warn("[runtime-opt] Calendario construido no disponible; se omite snapshot.");
    return;
  }

  const now = new Date();
  const todayKey = localDateKey(now);
  const from = addDays(now, -1).toISOString();
  const tomorrow = addDays(now, 2).toISOString();

  try {
    const [internationalRaw, marketRaw] = await Promise.all([
      fetchCalendar({
        from,
        to: tomorrow,
        countries: MAJOR_COUNTRIES.join(","),
        importance: "medium",
        limit: 500,
      }),
      fetchCalendar({
        from,
        to: tomorrow,
        countries: "US,EU,GB,JP,CN,CA,AU",
        importance: "medium",
        limit: 500,
      }),
    ]);

    const internationalToday = internationalRaw.filter(
      (event) => localDateKey(new Date(event.time)) === todayKey,
    );
    const marketToday = marketRaw.filter((event) => localDateKey(new Date(event.time)) === todayKey);
    const international = chooseInternational(internationalToday);
    const internationalKeys = new Set(international.map((event) => eventKey(event)));
    const markets = chooseMarkets(marketToday, internationalKeys);

    html = replaceCalendarList(
      html,
      "international-list",
      international,
      "Sin publicaciones internacionales relevantes recuperadas para hoy.",
    );
    html = replaceCalendarList(
      html,
      "markets-list",
      markets,
      "Sin hitos específicamente financieros recuperados para hoy. No se rellena con datos macro repetidos.",
    );

    const updated = new Intl.DateTimeFormat("es-CL", {
      timeZone: TIME_ZONE,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(now);
    html = html.replace(
      '<p id="updated-at">Última consulta: —</p>',
      `<p id="updated-at">Última consulta: ${escapeHtml(updated)}</p>`,
    );

    await writeFile(CALENDAR_PATH, html);
    console.log(
      `[runtime-opt] Calendario precargado: ${international.length} internacional / ${markets.length} mercados.`,
    );
  } catch (error) {
    console.warn(`[runtime-opt] Snapshot calendario omitido: ${error.message}`);
  }
}

await vendorCurrentEditorialImages();
await hydrateCalendarSnapshot();
