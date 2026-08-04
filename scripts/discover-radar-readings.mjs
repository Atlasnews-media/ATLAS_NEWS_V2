import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const configPath = resolve(root, "src/data/radar-companies.json");
const readingsPath = resolve(root, "src/content/readings");
const outputPath = resolve(
  root,
  process.env.ATLAS_RADAR_OUTPUT_DIR ?? "src/content/readings",
);
const fixturePath = process.env.ATLAS_RADAR_FIXTURE
  ? resolve(root, process.env.ATLAS_RADAR_FIXTURE)
  : undefined;
const reportPath = process.env.ATLAS_RADAR_REPORT_PATH
  ? resolve(root, process.env.ATLAS_RADAR_REPORT_PATH)
  : undefined;
const dryRun = process.env.ATLAS_RADAR_DRY_RUN === "1";
const allowEmpty = process.env.ATLAS_RADAR_ALLOW_EMPTY === "1";

const blockedDomains = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
]);
const trackingParameters = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

function integerFromEnvironment(name, fallback, minimum, maximum) {
  const rawValue = process.env[name];
  if (!rawValue) return fallback;

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} debe ser un entero entre ${minimum} y ${maximum}.`,
    );
  }

  return value;
}

function dateInSantiago(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.map(({ type, value: partValue }) => [type, partValue]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDetectionDate(value) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(value);
}

function parseSeenDate(value) {
  if (typeof value !== "string") return undefined;

  const compactMatch = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
  );
  const normalized = compactMatch
    ? `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}T${compactMatch[4]}:${compactMatch[5]}:${compactMatch[6]}Z`
    : value;
  const date = new Date(normalized);

  return Number.isFinite(date.valueOf()) ? date : undefined;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTitle(value) {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeTitle(value).replace(/\s+/g, "-").slice(0, 70);
}

function markdownText(value) {
  return normalizeWhitespace(value).replace(/([\\`*_{}[\]<>])/g, "\\$1");
}

function truncateAtWord(value, maximumLength) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maximumLength) return normalized;

  const shortened = normalized.slice(0, Math.max(1, maximumLength - 1));
  const lastSpace = shortened.lastIndexOf(" ");
  const boundary =
    lastSpace > maximumLength * 0.6 ? lastSpace : shortened.length;
  return `${shortened.slice(0, boundary).trim()}…`;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return undefined;

    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const parameter of [...url.searchParams.keys()]) {
      const normalizedParameter = parameter.toLowerCase();
      if (
        normalizedParameter.startsWith("utm_") ||
        trackingParameters.has(normalizedParameter)
      ) {
        url.searchParams.delete(parameter);
      }
    }
    url.searchParams.sort();
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, "");

    return url.toString();
  } catch {
    return undefined;
  }
}

function sourceDomain(article, normalizedUrl) {
  const statedDomain =
    typeof article.domain === "string" ? article.domain.trim() : "";
  const domain = statedDomain || new URL(normalizedUrl).hostname;
  return domain.toLowerCase().replace(/^www\./, "");
}

function domainMatches(domain, expectedDomain) {
  const normalizedExpected = expectedDomain.toLowerCase().replace(/^www\./, "");
  return (
    domain === normalizedExpected || domain.endsWith(`.${normalizedExpected}`)
  );
}

function isBlockedDomain(domain) {
  return [...blockedDomains].some((blockedDomain) =>
    domainMatches(domain, blockedDomain),
  );
}

function parseYamlScalar(value) {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.replace(/^['"]|['"]$/g, "");
  }
}

async function existingContentSignals() {
  const urls = new Set();
  const titles = new Set();
  const filenames = new Set();

  for (const directory of new Set([readingsPath, outputPath])) {
    let entries = [];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) continue;

      filenames.add(entry.name);
      const text = await readFile(resolve(directory, entry.name), "utf8");
      for (const match of text.matchAll(/^\s*url:\s*(.+)$/gm)) {
        const url = normalizeUrl(parseYamlScalar(match[1]));
        if (url) urls.add(url);
      }
      const titleMatch = text.match(/^title:\s*(.+)$/m);
      if (titleMatch)
        titles.add(normalizeTitle(parseYamlScalar(titleMatch[1])));
    }
  }

  return { urls, titles, filenames };
}

async function fetchJson(url, attempts, timeoutMs) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "ATLAS-NEWS-RADAR/1.1",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`${url} respondió con estado ${response.status}.`);
      }

      const text = (await response.text()).replace(/^\uFEFF/, "");
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, attempt * 1_000),
        );
      }
    }
  }

  throw lastError;
}

function gdeltUrl(config, company, maxRecords, timespan) {
  const url = new URL(config.providerUrl);
  url.searchParams.set("query", company.query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(maxRecords));
  url.searchParams.set("timespan", timespan);
  url.searchParams.set("sort", "datedesc");
  return url;
}

async function providerPayload(
  config,
  company,
  fixture,
  maxRecords,
  timespan,
  attempts,
  timeoutMs,
) {
  if (fixture) return fixture[company.ticker] ?? { articles: [] };
  return fetchJson(
    gdeltUrl(config, company, maxRecords, timespan),
    attempts,
    timeoutMs,
  );
}

function sourceAssessment(config, company, candidate) {
  const preferredDomains = [
    ...(Array.isArray(config.preferredDomains) ? config.preferredDomains : []),
    ...(Array.isArray(company.officialDomains) ? company.officialDomains : []),
  ];
  const primary = preferredDomains.some((domain) =>
    domainMatches(candidate.domain, domain),
  );
  const normalizedLanguage = candidate.language.toLowerCase();
  const normalizedCountry = candidate.sourceCountry.toLowerCase();
  const keywordMatches = (config.relevanceKeywords ?? []).filter((keyword) =>
    candidate.titleKey.includes(normalizeTitle(keyword)),
  );

  let score = primary ? 100 : 0;
  if (normalizedCountry === "chile") score += 10;
  if (["spanish", "español", "espanol"].includes(normalizedLanguage))
    score += 5;
  score += Math.min(keywordMatches.length, 5) * 3;

  return {
    keywordMatches,
    sourceKind: primary ? "primary" : "secondary",
    sourceScore: score,
  };
}

function candidateFromArticle(article, company, config, now) {
  if (!article || typeof article !== "object") return undefined;
  if (typeof article.title !== "string" || typeof article.url !== "string") {
    return undefined;
  }

  const title = normalizeWhitespace(article.title);
  const titleKey = normalizeTitle(title);
  const url = normalizeUrl(article.url);
  const seenAt = parseSeenDate(article.seendate);
  if (!url || !seenAt || title.length < 12 || titleKey.length < 8) {
    return undefined;
  }

  if (seenAt.valueOf() > now.valueOf() + 5 * 60 * 1_000) return undefined;

  const domain = sourceDomain(article, url);
  if (isBlockedDomain(domain)) return undefined;

  const candidate = {
    company,
    domain,
    language:
      typeof article.language === "string" ? article.language : "No informado",
    seenAt,
    sourceCountry:
      typeof article.sourcecountry === "string"
        ? article.sourcecountry
        : "No informado",
    title,
    titleKey,
    url,
  };

  return {
    ...candidate,
    ...sourceAssessment(config, company, candidate),
  };
}

function readingTitle(candidate) {
  const prefix = `Radar IPSA · ${candidate.company.ticker} · `;
  return `${prefix}${truncateAtWord(candidate.title, 160 - prefix.length)}`;
}

function inlineJsonArray(values) {
  const items = values.map((value) => JSON.stringify(value));
  return `[${items.join(", ")}]`;
}

function readingMarkdown(candidate, detectedAt) {
  const title = readingTitle(candidate);
  const companyLabel = `${candidate.company.name} (${candidate.company.ticker})`;
  const summary =
    `Candidato detectado para ${companyLabel}. Requiere confirmar el hecho, ` +
    "la fecha y la fuente original antes de cualquier publicación editorial.";
  const sourceDate = candidate.seenAt.toISOString();
  const detectedLabel = formatDetectionDate(candidate.seenAt);
  const sourceTag =
    candidate.sourceKind === "primary"
      ? "fuente-primaria"
      : "fuente-secundaria";
  const sourceLabel =
    candidate.sourceKind === "primary" ? "primaria" : "secundaria";
  const tags = inlineJsonArray([
    "radar-ipsa",
    candidate.company.ticker,
    "gdelt",
    sourceTag,
    "pendiente-verificacion",
  ]);

  return `---\ntitle: ${JSON.stringify(title)}\nsummary: ${JSON.stringify(summary)}\npublishedAt: ${JSON.stringify(sourceDate)}\nstatus: draft\ntags: ${tags}\nsource:\n  name: ${JSON.stringify(candidate.domain)}\n  url: ${JSON.stringify(candidate.url)}\n  publishedAt: ${JSON.stringify(sourceDate)}\nauthor: ${JSON.stringify("ATLAS Radar")}\ndemo: false\n---\n\n## Tesis principal\n\nGDELT detectó una publicación que menciona **${markdownText(companyLabel)}**. El título informado por la fuente es «${markdownText(candidate.title)}». Esta ficha registra una señal de descubrimiento y no confirma el hecho descrito.\n\n## Por qué fue seleccionada\n\nLa empresa forma parte del piloto Radar IPSA. La señal fue observada el ${detectedLabel}, con origen declarado en ${markdownText(candidate.domain)}, idioma ${markdownText(candidate.language)} y país de la fuente ${markdownText(candidate.sourceCountry)}. La clasificación técnica del dominio es **fuente ${sourceLabel}**.\n\n## Contexto y límites\n\nGDELT se utiliza únicamente para descubrir candidatos. ATLAS NEWS no copió el cuerpo del artículo ni verificó todavía su contenido. La clasificación de dominio solo ordena la revisión y no confirma la exactitud de la publicación. Antes de retirar la etiqueta \`pendiente-verificacion\` o cambiar el estado, se debe abrir la fuente, confirmar fecha, autoría y hecho central, y contrastar con una fuente primaria cuando corresponda.\n\nDetección técnica registrada: ${detectedAt.toISOString()}.\n`;
}

async function writeReport(report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) {
    await mkdir(resolve(reportPath, ".."), { recursive: true });
    await writeFile(reportPath, serialized);
  }

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `created_count=${report.created}\nselected_count=${report.selected}\ncreated_files=${report.files.join(",")}\nprovider_available=${report.providerAvailable ? "1" : "0"}\n`,
    );
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const companyRows = report.companies
      .map(
        ({ ticker, selected, primary = 0, error }) =>
          `| ${ticker} | ${selected} | ${primary} | ${error ? error.replace(/\|/g, "\\|") : "—"} |`,
      )
      .join("\n");
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Radar IPSA\n\n- Proveedor disponible: ${report.providerAvailable ? "sí" : "no"}\n- Candidatos seleccionados: ${report.selected}\n- Borradores creados: ${report.created}\n- Duplicados o descartes: ${report.skipped}\n\n| Emisor | Seleccionados | Fuentes primarias | Observación |\n| --- | ---: | ---: | --- |\n${companyRows}\n`,
    );
  }
}

const config = JSON.parse(await readFile(configPath, "utf8"));
if (config.schemaVersion !== 1 || !Array.isArray(config.companies)) {
  throw new Error("La configuración de Radar IPSA no es válida.");
}

const fixture = fixturePath
  ? JSON.parse(await readFile(fixturePath, "utf8"))
  : undefined;
const maxPerCompany = integerFromEnvironment(
  "ATLAS_RADAR_MAX_PER_COMPANY",
  config.maxPerCompany,
  1,
  10,
);
const maxTotal = integerFromEnvironment(
  "ATLAS_RADAR_MAX_TOTAL",
  config.maxTotal,
  1,
  20,
);
const maxRecords = integerFromEnvironment(
  "ATLAS_RADAR_MAX_RECORDS",
  Math.max(20, maxPerCompany * 10),
  1,
  250,
);
const requestAttempts = integerFromEnvironment(
  "ATLAS_RADAR_REQUEST_ATTEMPTS",
  config.requestAttempts ?? 2,
  1,
  3,
);
const requestTimeoutMs = integerFromEnvironment(
  "ATLAS_RADAR_REQUEST_TIMEOUT_MS",
  config.requestTimeoutMs ?? 12_000,
  2_000,
  30_000,
);
const timespan = process.env.ATLAS_RADAR_TIMESPAN ?? config.timespan;
const now = new Date();
const existing = await existingContentSignals();
const candidates = [];
const companyResults = [];
let discarded = 0;
let successfulQueries = 0;

for (const company of config.companies) {
  try {
    const payload = await providerPayload(
      config,
      company,
      fixture,
      maxRecords,
      timespan,
      requestAttempts,
      requestTimeoutMs,
    );
    if (!Array.isArray(payload?.articles)) {
      throw new Error("GDELT no devolvió una lista de artículos.");
    }

    successfulQueries += 1;
    const companyCandidates = [];
    for (const article of payload.articles) {
      const candidate = candidateFromArticle(article, company, config, now);
      if (!candidate) {
        discarded += 1;
        continue;
      }
      if (
        existing.urls.has(candidate.url) ||
        existing.titles.has(candidate.titleKey)
      ) {
        discarded += 1;
        continue;
      }

      existing.urls.add(candidate.url);
      existing.titles.add(candidate.titleKey);
      companyCandidates.push(candidate);
    }

    companyCandidates.sort(
      (left, right) =>
        right.sourceScore - left.sourceScore ||
        right.seenAt.valueOf() - left.seenAt.valueOf(),
    );
    const selected = companyCandidates.slice(0, maxPerCompany);
    discarded += Math.max(0, companyCandidates.length - selected.length);
    candidates.push(...selected);
    companyResults.push({
      ticker: company.ticker,
      selected: selected.length,
      primary: selected.filter(({ sourceKind }) => sourceKind === "primary")
        .length,
    });
  } catch (error) {
    companyResults.push({
      ticker: company.ticker,
      selected: 0,
      primary: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

if (successfulQueries === 0) {
  const report = {
    schemaVersion: 1,
    provider: config.provider,
    providerAvailable: false,
    fixture: Boolean(fixture),
    dryRun,
    detectedAt: now.toISOString(),
    timespan,
    selected: 0,
    created: 0,
    skipped: discarded,
    files: [],
    proposedFiles: [],
    candidates: [],
    companies: companyResults,
  };

  await writeReport(report);
  const message = "No fue posible consultar ningún emisor del Radar IPSA.";
  if (allowEmpty) {
    console.warn(`${message} No se creará ninguna propuesta.`);
    process.exit(0);
  }
  throw new Error(message);
}

candidates.sort(
  (left, right) =>
    right.sourceScore - left.sourceScore ||
    right.seenAt.valueOf() - left.seenAt.valueOf(),
);
const selectedCandidates = candidates.slice(0, maxTotal);
discarded += Math.max(0, candidates.length - selectedCandidates.length);
const files = [];
const proposedFiles = [];

if (!dryRun) await mkdir(outputPath, { recursive: true });
for (const candidate of selectedCandidates) {
  const digest = createHash("sha256")
    .update(candidate.url)
    .digest("hex")
    .slice(0, 12);
  const filename = `${dateInSantiago(candidate.seenAt)}-reading-radar-${slugify(candidate.company.ticker)}-${digest}.md`;
  if (existing.filenames.has(filename)) {
    discarded += 1;
    continue;
  }

  proposedFiles.push(filename);
  if (!dryRun) {
    await writeFile(
      resolve(outputPath, filename),
      readingMarkdown(candidate, now),
      { flag: "wx" },
    );
    files.push(filename);
  }
  existing.filenames.add(filename);
}

const report = {
  schemaVersion: 1,
  provider: config.provider,
  providerAvailable: true,
  fixture: Boolean(fixture),
  dryRun,
  detectedAt: now.toISOString(),
  timespan,
  selected: selectedCandidates.length,
  created: files.length,
  skipped: discarded,
  files,
  proposedFiles,
  candidates: selectedCandidates.map((candidate) => ({
    ticker: candidate.company.ticker,
    title: candidate.title,
    url: candidate.url,
    domain: candidate.domain,
    sourceKind: candidate.sourceKind,
    sourceScore: candidate.sourceScore,
    keywordMatches: candidate.keywordMatches,
    seenAt: candidate.seenAt.toISOString(),
  })),
  companies: companyResults,
};

await writeReport(report);
console.log(
  dryRun
    ? `Radar IPSA: ${report.selected} candidatos válidos en ejecución seca.`
    : `Radar IPSA: ${report.created} borradores creados, ${report.skipped} candidatos descartados.`,
);
