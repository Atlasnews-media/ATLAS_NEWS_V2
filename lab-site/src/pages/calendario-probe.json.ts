export const prerender = true;

const BIQUOTE = "https://biquote.io/api/calendar";
const INE = "https://www.ine.gob.cl/inicio/agendaestadistica";
const BCCH = "https://www.bcentral.cl/es/calendario-estadistico";
const TIMEOUT_MS = 12_000;

type FetchResult = {
  ok: boolean;
  status: number | null;
  body: string;
  error: string | null;
};

async function fetchText(url: string): Promise<FetchResult> {
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

function cleanText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text: string, needle: string, radius = 180): string | null {
  const index = text
    .toLocaleLowerCase("es-CL")
    .indexOf(needle.toLocaleLowerCase("es-CL"));
  if (index === -1) return null;

  return text.slice(
    Math.max(0, index - radius),
    index + needle.length + radius,
  );
}

export async function GET() {
  const now = new Date();
  const monthAhead = new Date(now);
  monthAhead.setUTCDate(monthAhead.getUTCDate() + 31);

  const countriesUrl = `${BIQUOTE}/countries`;
  const chileUrl = new URL(BIQUOTE);
  chileUrl.searchParams.set("from", now.toISOString());
  chileUrl.searchParams.set("to", monthAhead.toISOString());
  chileUrl.searchParams.set("countries", "CL");
  chileUrl.searchParams.set("limit", "100");

  const [countriesResult, chileResult, ineResult, bcchResult] =
    await Promise.all([
      fetchText(countriesUrl),
      fetchText(chileUrl.href),
      fetchText(INE),
      fetchText(BCCH),
    ]);

  let countryCodes: string[] = [];
  let chileEvents: unknown[] = [];

  if (countriesResult.ok) {
    try {
      const parsed = JSON.parse(countriesResult.body) as Array<{
        code?: string;
      }>;
      countryCodes = parsed
        .map((country) => country.code)
        .filter((code): code is string => Boolean(code));
    } catch {
      countryCodes = [];
    }
  }

  if (chileResult.ok) {
    try {
      const parsed = JSON.parse(chileResult.body) as unknown;
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
        sample: excerpt(ineText, "Índices de Inventarios"),
      },
      bancoCentral: {
        status: bcchResult.status,
        error: bcchResult.error,
        bytes: bcchResult.body.length,
        foundCalendar: bcchText.includes("Calendario Estadístico"),
        sample: excerpt(bcchText, "Encuesta de Expectativas Económicas"),
      },
    },
  };

  console.log(`[ATLAS CALENDAR PROBE] ${JSON.stringify(payload)}`);

  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
