const BIQUOTE = "https://biquote.io/api/calendar";
const INE = "https://www.ine.gob.cl/inicio/agendaestadistica";
const BCCH = "https://www.bcentral.cl/es/calendario-estadistico";
const TIMEOUT_MS = 12_000;

async function fetchText(url) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "ATLAS-NEWS-LAB/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function cleanText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#225;|&aacute;/gi, "á")
    .replace(/&#233;|&eacute;/gi, "é")
    .replace(/&#237;|&iacute;/gi, "í")
    .replace(/&#243;|&oacute;/gi, "ó")
    .replace(/&#250;|&uacute;/gi, "ú")
    .replace(/&#241;|&ntilde;/gi, "ñ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text, needle, radius = 500) {
  const index = text
    .toLocaleLowerCase("es-CL")
    .indexOf(needle.toLocaleLowerCase("es-CL"));
  if (index === -1) return null;
  return text.slice(
    Math.max(0, index - radius),
    index + needle.length + radius,
  );
}

function interestingLinks(html) {
  return [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((href) => /agenda|estad|2026|\.pdf|\.xlsx|\.csv/i.test(href))
    .slice(0, 30);
}

const now = new Date();
const monthAhead = new Date(now);
monthAhead.setUTCDate(monthAhead.getUTCDate() + 31);

const countriesUrl = `${BIQUOTE}/countries`;
const chileUrl = new URL(BIQUOTE);
chileUrl.searchParams.set("from", now.toISOString());
chileUrl.searchParams.set("to", monthAhead.toISOString());
chileUrl.searchParams.set("countries", "CL");
chileUrl.searchParams.set("limit", "100");

const [countriesResult, chileResult, ineResult, bcchResult] = await Promise.all([
  fetchText(countriesUrl),
  fetchText(chileUrl.href),
  fetchText(INE),
  fetchText(BCCH),
]);

let countryCodes = [];
let chileEvents = [];

if (countriesResult.ok) {
  try {
    countryCodes = JSON.parse(countriesResult.body)
      .map((country) => country?.code)
      .filter(Boolean);
  } catch {
    countryCodes = [];
  }
}

if (chileResult.ok) {
  try {
    const parsed = JSON.parse(chileResult.body);
    chileEvents = Array.isArray(parsed) ? parsed : [];
  } catch {
    chileEvents = [];
  }
}

const ineText = cleanText(ineResult.body);
const bcchText = cleanText(bcchResult.body);

const payload = {
  checkedAt: now.toISOString(),
  biquote: {
    countriesStatus: countriesResult.status,
    countriesError: countriesResult.error,
    countryCount: countryCodes.length,
    chileSupported: countryCodes.includes("CL"),
    chileQueryStatus: chileResult.status,
    chileQueryError: chileResult.error,
    chileEventsNext31Days: chileEvents.length,
    chileSample: chileEvents.slice(0, 5),
  },
  officialChile: {
    ine: {
      status: ineResult.status,
      error: ineResult.error,
      bytes: ineResult.body.length,
      foundAgenda2026: ineText.includes("Agenda Estadística 2026"),
      agendaExcerpt: excerpt(ineText, "Agenda Estadística 2026", 1400),
      septemberExcerpt: excerpt(ineText, "septiembre", 1400),
      interestingLinks: interestingLinks(ineResult.body),
    },
    bancoCentral: {
      status: bcchResult.status,
      error: bcchResult.error,
      bytes: bcchResult.body.length,
      foundCalendar: bcchText.includes("Calendario Estadístico"),
      septemberExcerpt: excerpt(bcchText, "Septiembre", 2600),
      sample: excerpt(bcchText, "Encuesta de Expectativas Económicas"),
      interestingLinks: interestingLinks(bcchResult.body),
    },
  },
};

console.log("[ATLAS CALENDAR PROBE]");
console.log(JSON.stringify(payload, null, 2));
