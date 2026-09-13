import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  COVER_BLOCK_BUDGETS,
  COVER_CONTRACT_VERSION,
  COVER_TOTAL_BUDGET,
  cleanSpeechText,
  countWords,
  selectBlockSentences,
  sentenceList,
  validateCoverContract,
} from "./cover-briefing-contract.mjs";

const root = new URL("../", import.meta.url);
const editionDir = new URL("src/content/editions/", root);
const briefingDir = new URL("src/content/briefings/", root);
const SCRIPT_VERSION = 12;
const SPEECH_NORMALIZER_VERSION = 5;
const TARGET_MIN_WORDS = COVER_TOTAL_BUDGET.targetMin;
const TARGET_MAX_WORDS = COVER_TOTAL_BUDGET.targetMax;

function frontmatter(text) {
  return text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

function markdownBody(text) {
  return text.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*/, "").trim();
}

function parseScalar(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.replace(/^["']|["']$/g, "");
  }
}

function field(text, name) {
  const value = frontmatter(text).match(
    new RegExp(`^${name}:\\s*(.+)$`, "m"),
  )?.[1];
  return parseScalar(value);
}

function highlights(text) {
  const lines = frontmatter(text).split(/\r?\n/);
  const items = [];
  let active = false;
  let current = null;

  for (const line of lines) {
    if (/^highlights:\s*$/.test(line)) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (/^[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(line)) break;

    const label = line.match(/^\s*-\s+label:\s*(.+)$/)?.[1];
    if (label) {
      current = { label: parseScalar(label), text: undefined };
      items.push(current);
      continue;
    }

    const itemText = line.match(/^\s+text:\s*(.+)$/)?.[1];
    if (itemText && current) current.text = parseScalar(itemText);
  }

  return items.filter((item) => item.text);
}

function normalizeHeading(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .trim();
}

function bodySections(text) {
  const sections = new Map();
  let heading = "inicio";
  let buffer = [];

  function flush() {
    const paragraph = buffer.join(" ").trim();
    if (paragraph) {
      const key = normalizeHeading(heading);
      const paragraphs = sections.get(key) ?? [];
      paragraphs.push(paragraph);
      sections.set(key, paragraphs);
    }
    buffer = [];
  }

  for (const rawLine of markdownBody(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    const nextHeading = line.match(/^##\s+(.+)$/)?.[1];
    if (nextHeading) {
      flush();
      heading = nextHeading;
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return sections;
}

async function records(directory) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
    .map((entry) => entry.name);

  return Promise.all(
    files.map(async (filename) => {
      const text = await readFile(new URL(filename, directory), "utf8");
      return {
        id: filename.replace(/\.mdx?$/, ""),
        title: field(text, "title"),
        summary: field(text, "summary"),
        publishedAt: field(text, "publishedAt"),
        type: field(text, "type"),
        section: field(text, "section"),
        status: field(text, "status"),
        highlights: highlights(text),
        bodySections: bodySections(text),
      };
    }),
  );
}

function newestFirst(a, b) {
  return Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "");
}

function formatSpanishDate(date) {
  const parsed = new Date(`${date}T12:00:00-04:00`);
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  })
    .format(parsed)
    .replace(",", "");
}

function sentencesFrom(record, headings, source, role) {
  if (!record) return [];
  return headings.flatMap((heading) =>
    (record.bodySections.get(normalizeHeading(heading)) ?? []).flatMap(
      (paragraph) =>
        sentenceList(paragraph).map((text) => ({ text, source, role })),
    ),
  );
}

function highlightCandidates(record, source, role) {
  return (record?.highlights ?? []).map(({ text }) => ({ text, source, role }));
}

function interleaveFirstThenRest(groups) {
  const first = groups.map((group) => group[0]).filter(Boolean);
  const rest = groups.flatMap((group) => group.slice(1));
  return [...first, ...rest];
}

function formatMarketNumber(value, maxDigits = 2) {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  }).format(Math.abs(Number(value)));
}

function formatPesos(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const whole = Math.trunc(numeric);
  const cents = Math.round((numeric - whole) * 100);
  const wholeText = new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 0,
  }).format(whole);
  if (!cents) return `${wholeText} pesos`;
  return `${wholeText} pesos con ${String(cents).padStart(2, "0")} centavos`;
}

function marketEffectiveDate(asset) {
  if (!asset?.effectiveAt) return null;
  const parsed = new Date(asset.effectiveAt);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function dateDistanceInDays(left, right) {
  const leftTime = Date.parse(`${left}T12:00:00Z`);
  const rightTime = Date.parse(`${right}T12:00:00Z`);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime))
    return Infinity;
  return Math.abs(Math.round((leftTime - rightTime) / 86_400_000));
}

function usableMarketAsset(asset, editionDate) {
  if (!asset) return false;
  if (asset.status === "current") return true;
  if (!["usdclp", "eurclp", "uf", "copper"].includes(asset.id)) return false;
  const effectiveDate = marketEffectiveDate(asset);
  return Boolean(
    effectiveDate && dateDistanceInDays(effectiveDate, editionDate) <= 3,
  );
}

function relativeToPreviousSession(asset) {
  const change = Number(asset?.changePercent);
  if (!Number.isFinite(change)) return null;
  if (Math.abs(change) < 0.01)
    return "sin cambios frente a la jornada hábil anterior";
  return change > 0
    ? `un ${formatMarketNumber(change)}% por encima de la jornada hábil anterior`
    : `un ${formatMarketNumber(change)}% por debajo de la jornada hábil anterior`;
}

function variationPhrase(asset) {
  const change = Number(asset?.changePercent);
  if (!Number.isFinite(change)) return null;
  if (Math.abs(change) < 0.01)
    return "sin cambios frente a la jornada hábil anterior";
  return change > 0
    ? `con un avance de ${formatMarketNumber(change)}%`
    : `con un retroceso de ${formatMarketNumber(change)}%`;
}

function marketMove(asset, { up, down }) {
  const change = Number(asset?.changePercent);
  if (!Number.isFinite(change)) return null;
  if (Math.abs(change) < 0.01) return "se mantiene sin cambios";
  return `${change > 0 ? up : down} ${formatMarketNumber(change)}%`;
}

function joinSpanish(items) {
  const values = items.filter(Boolean);
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} y ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} y ${values.at(-1)}`;
}

function standoutLabel(id) {
  return {
    nasdaq: "el Nasdaq",
    dow: "el Dow Jones",
    stoxx50: "el Euro Stoxx 50",
    gold: "el oro",
    eurusd: "el euro frente al dólar",
    usdjpy: "el dólar frente al yen",
    bitcoin: "Bitcoin",
  }[id];
}

function economicEffectiveAt(effectiveDate) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(effectiveDate ?? ""))
    ? `${effectiveDate}T12:00:00-03:00`
    : null;
}

function mergeEconomicIndicators(assets, economicSnapshot) {
  const byId = new Map((assets ?? []).map((asset) => [asset.id, { ...asset }]));
  const byCode = new Map(
    (economicSnapshot?.indicators ?? []).map((indicator) => [
      indicator.code,
      indicator,
    ]),
  );
  const mappings = [
    ["usdclp", "dolar"],
    ["eurclp", "euro"],
    ["uf", "uf"],
    ["copper", "cobre"],
  ];

  for (const [assetId, code] of mappings) {
    const economic = byCode.get(code);
    if (!economic) continue;
    const existing = byId.get(assetId) ?? { id: assetId, status: "stale" };
    const merged = {
      ...existing,
      value: Number.isFinite(Number(economic.value))
        ? Number(economic.value)
        : existing.value,
      effectiveAt:
        economicEffectiveAt(economic.effectiveDate) ?? existing.effectiveAt,
    };
    if (Number.isFinite(Number(economic.changePercent))) {
      merged.changePercent = Number(economic.changePercent);
      merged.trend = economic.trend ?? merged.trend;
    }
    byId.set(assetId, merged);
  }

  return [...byId.values()];
}

async function buildMarketSnapshot(publicDir, editionDate) {
  if (!publicDir) return null;

  try {
    const marketSnapshot = JSON.parse(
      await readFile(path.join(publicDir, "data", "market-pulse.json"), "utf8"),
    );
    let economicSnapshot = null;
    try {
      economicSnapshot = JSON.parse(
        await readFile(
          path.join(publicDir, "data", "economic-indicators.json"),
          "utf8",
        ),
      );
    } catch {
      economicSnapshot = null;
    }

    const assets = mergeEconomicIndicators(
      marketSnapshot.assets ?? [],
      economicSnapshot,
    ).filter((asset) => usableMarketAsset(asset, editionDate));
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const sentences = [];

    const dollar = byId.get("usdclp");
    if (Number.isFinite(Number(dollar?.value))) {
      const relative = relativeToPreviousSession(dollar);
      sentences.push(
        `En monedas, el dólar observado marcó ${formatPesos(dollar.value)}${relative ? `, ${relative}` : ""}.`,
      );
    }

    const euro = byId.get("eurclp");
    if (Number.isFinite(Number(euro?.value))) {
      const variation = variationPhrase(euro);
      sentences.push(
        `El euro se ubicó en ${formatPesos(euro.value)}${variation ? `, ${variation}` : ""}.`,
      );
    }

    const uf = byId.get("uf");
    if (Number.isFinite(Number(uf?.value))) {
      sentences.push(`La UF vigente alcanza los ${formatPesos(uf.value)}.`);
    }

    const ipsaMove = marketMove(byId.get("ipsa"), {
      up: "avanza",
      down: "retrocede",
    });
    const spMove = marketMove(byId.get("sp500"), {
      up: "sube",
      down: "cae",
    });
    const brentMove = marketMove(byId.get("brent"), {
      up: "avanza",
      down: "retrocede",
    });
    const equityEnergy = [
      ipsaMove ? `el IPSA ${ipsaMove}` : null,
      spMove ? `el S&P 500 ${spMove}` : null,
      brentMove ? `el Brent ${brentMove}` : null,
    ];
    if (equityEnergy.some(Boolean)) {
      const joined = joinSpanish(equityEnergy);
      sentences.push(`En renta variable y energía, ${joined}.`);
    }

    const copperMove = marketMove(byId.get("copper"), {
      up: "sube",
      down: "baja",
    });
    if (copperMove) sentences.push(`El cobre, en tanto, ${copperMove}.`);

    const treasury = byId.get("ust10y");
    if (Number.isFinite(Number(treasury?.value))) {
      sentences.push(
        `El Treasury a diez años se ubica en ${formatMarketNumber(treasury.value)}%.`,
      );
    }

    const standout = assets
      .filter((asset) =>
        [
          "nasdaq",
          "dow",
          "stoxx50",
          "gold",
          "eurusd",
          "usdjpy",
          "bitcoin",
        ].includes(asset.id),
      )
      .filter(
        (asset) =>
          Number.isFinite(Number(asset.changePercent)) &&
          Math.abs(Number(asset.changePercent)) >= 1,
      )
      .sort(
        (left, right) =>
          Math.abs(Number(right.changePercent)) -
          Math.abs(Number(left.changePercent)),
      )[0];

    if (standout) {
      const label = standoutLabel(standout.id);
      const move = marketMove(standout, {
        up: "avanza",
        down: "retrocede",
      });
      if (label && move) {
        sentences.push(`Entre los movimientos destacados, ${label} ${move}.`);
      }
    }

    const text = cleanSpeechText(sentences.join(" "));
    return text || null;
  } catch (error) {
    console.warn(
      `Pulso de mercados omitido: ${error?.message ?? String(error)}`,
    );
    return null;
  }
}

function composeEditorialBlock(candidates, blockName, accepted) {
  const budget = COVER_BLOCK_BUDGETS[blockName];
  return selectBlockSentences(candidates, {
    targetMin: budget.targetMin,
    targetMax: budget.hardMax,
    accepted,
  });
}

const editions = await records(editionDir);
const briefings = await records(briefingDir);
const international = editions
  .filter(({ status, type }) => status === "published" && type === "daily")
  .sort(newestFirst)[0];

const publicDir = process.env.ATLAS_PUBLIC_REPO_DIR;
const planPath =
  process.env.ATLAS_AUDIO_PLAN ??
  path.resolve(process.cwd(), ".atlas-audio-plan.json");
const voice = process.env.ATLAS_AUDIO_VOICE ?? "ef_dora";
const audioOwner = process.env.ATLAS_AUDIO_OWNER ?? null;
const ownerAllowsGeneration =
  audioOwner === "audio-v2" || audioOwner === "manual-legacy";

if (!international) {
  const plan = { needsGeneration: false, reason: "no_published_international" };
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, "needs_generation=false\n");
  }
  console.log(
    "Audio diario omitido: no existe una edición Internacional publicada.",
  );
  process.exit(0);
}

const date = international.id.slice(0, 10);
const national = briefings
  .filter(
    ({ id, status, section }) =>
      status === "published" &&
      section === "national" &&
      id.startsWith(`${date}-national-`),
  )
  .sort(newestFirst)[0];
const markets = briefings
  .filter(
    ({ id, status, section }) =>
      status === "published" &&
      section === "markets" &&
      id.startsWith(`${date}-markets-`),
  )
  .sort(newestFirst)[0];

const sourceIds = {
  international: international.id,
  general: international.id,
  national: national?.id ?? null,
  markets: markets?.id ?? null,
};
const completeness =
  Number(Boolean(international)) +
  Number(Boolean(national)) +
  Number(Boolean(markets));

let existing = null;
if (publicDir) {
  try {
    existing = JSON.parse(
      await readFile(path.join(publicDir, "audio", "latest.json"), "utf8"),
    );
  } catch {
    existing = null;
  }
}

const existingInternationalId =
  existing?.sourceIds?.international ?? existing?.sourceIds?.general ?? null;
const sameSources =
  existing?.scriptVersion === SCRIPT_VERSION &&
  existing?.speechNormalizerVersion === SPEECH_NORMALIZER_VERSION &&
  existing?.date === date &&
  existingInternationalId === sourceIds.international &&
  existing?.sourceIds?.national === sourceIds.national &&
  existing?.sourceIds?.markets === sourceIds.markets;

const snapshot = await buildMarketSnapshot(publicDir, date);

const centralCandidates = [
  ...sentencesFrom(
    international,
    ["Hecho central"],
    "international",
    "fact_context",
  ),
  ...sentencesFrom(
    international,
    ["Por qué importa"],
    "international",
    "mechanism_implication",
  ),
  ...sentencesFrom(
    international,
    ["En una mirada"],
    "international",
    "reserve",
  ),
  ...highlightCandidates(international, "international", "reserve"),
];

const chileCandidates = national
  ? [
      ...sentencesFrom(national, ["Desarrollo"], "national", "fact_change"),
      ...sentencesFrom(
        national,
        ["Implicancias y riesgos"],
        "national",
        "impact_risk",
      ),
      ...highlightCandidates(national, "national", "reserve"),
    ]
  : [];

const marketsCandidates = markets
  ? [
      ...sentencesFrom(
        markets,
        ["Implicancias y riesgos"],
        "markets",
        "interpretation",
      ),
      ...sentencesFrom(markets, ["Desarrollo"], "markets", "evidence"),
      ...highlightCandidates(markets, "markets", "reserve"),
    ]
  : [];

const internationalWatch = sentencesFrom(
  international,
  ["Qué observar"],
  "international",
  "watch",
);
const nationalWatch = sentencesFrom(
  national,
  ["Qué observar"],
  "national",
  "watch",
);
const marketsWatch = sentencesFrom(
  markets,
  ["Qué observar"],
  "markets",
  "watch",
);
const watchCandidates = interleaveFirstThenRest([
  internationalWatch,
  nationalWatch,
  marketsWatch,
]);

let acceptedEditorial = [];
const centralSelection = composeEditorialBlock(
  centralCandidates,
  "central",
  acceptedEditorial,
);
acceptedEditorial = centralSelection.accepted;
const chileSelection = national
  ? composeEditorialBlock(chileCandidates, "chile", acceptedEditorial)
  : { text: "", words: 0, accepted: acceptedEditorial, provenance: [] };
acceptedEditorial = chileSelection.accepted;
const marketsSelection = markets
  ? composeEditorialBlock(marketsCandidates, "markets", acceptedEditorial)
  : { text: "", words: 0, accepted: acceptedEditorial, provenance: [] };
acceptedEditorial = marketsSelection.accepted;
const watchSelection = composeEditorialBlock(
  watchCandidates,
  "watch",
  acceptedEditorial,
);

const opening = `ATLAS NEWS. Briefing de la mañana del ${formatSpanishDate(date)}. Estas son las señales que conviene tener presentes hoy.`;
const closing = cleanSpeechText(
  "La idea para comenzar el día es quedarse con esta señal central y seguir cómo evoluciona durante la jornada, a medida que entren nuevos datos y reaccione el mercado. Ese es el briefing de ATLAS NEWS para comenzar el día. Para profundizar, en Internacional, Nacional y Mercados están disponibles las cápsulas de audio de cada sección, junto con sus desarrollos completos, fuentes y riesgos.",
);

const scriptParts = [opening];
if (snapshot) scriptParts.push(snapshot);
scriptParts.push("La señal central.", centralSelection.text);
if (national) scriptParts.push("En Chile.", chileSelection.text);
if (markets) scriptParts.push("Ahora, mercados.", marketsSelection.text);
scriptParts.push(
  "Qué seguir durante la jornada.",
  watchSelection.text,
  closing,
);
const script = scriptParts.filter(Boolean).join("\n\n");

const blocks = {
  snapshot: snapshot ?? "",
  central: centralSelection.text,
  chile: chileSelection.text,
  markets: marketsSelection.text,
  watch: watchSelection.text,
  closing,
};
const contract = validateCoverContract({
  blocks,
  fullScript: script,
  hasNational: Boolean(national),
  hasMarkets: Boolean(markets),
});

const wordCount = countWords(script);
const estimatedDurationSeconds = Math.max(
  60,
  Math.round((wordCount / 125) * 60),
);
const needsGeneration = ownerAllowsGeneration && !sameSources && contract.valid;
const plan = {
  scriptVersion: SCRIPT_VERSION,
  speechNormalizerVersion: SPEECH_NORMALIZER_VERSION,
  coverContractVersion: COVER_CONTRACT_VERSION,
  needsGeneration,
  generationBlockedReason: contract.valid ? null : "cover_contract_failed",
  date,
  title: `ATLAS NEWS — Resumen diario — ${formatSpanishDate(date)}`,
  summary:
    "Briefing de Portada por funciones editoriales: snapshot, señal central, Chile, lectura de mercados y variables a seguir.",
  voice,
  engine: "Kokoro-82M",
  language: "es",
  completeness,
  sourceIds,
  targetWords: { min: TARGET_MIN_WORDS, max: TARGET_MAX_WORDS },
  wordCount,
  estimatedDurationSeconds,
  contract,
  blockProvenance: {
    central: centralSelection.provenance,
    chile: chileSelection.provenance,
    markets: marketsSelection.provenance,
    watch: watchSelection.provenance,
  },
  script,
};

await mkdir(path.dirname(planPath), { recursive: true });
await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `needs_generation=${plan.needsGeneration ? "true" : "false"}\n`,
  );
  await appendFile(process.env.GITHUB_OUTPUT, `audio_date=${date}\n`);
  await appendFile(process.env.GITHUB_OUTPUT, `completeness=${completeness}\n`);
}

if (!contract.valid) {
  console.warn(
    `Portada V12 bloqueada por contrato editorial V${COVER_CONTRACT_VERSION}: ${contract.errors.join(" | ")}`,
  );
}

console.log(
  !ownerAllowsGeneration && !sameSources
    ? `Audio ${date}: generación delegada al owner Audio V2; este proceso sólo planifica. Contrato=${contract.qualityScore}/100.`
    : plan.needsGeneration
      ? `Audio ${date}: generación requerida (${completeness}/3, ${wordCount} palabras, objetivo ${TARGET_MIN_WORDS}-${TARGET_MAX_WORDS}, contrato=${contract.qualityScore}/100).`
      : sameSources
        ? `Audio ${date}: ya coincide con Internacional, Nacional y Mercados y el guion v${SCRIPT_VERSION}; se conserva el archivo vigente.`
        : `Audio ${date}: generación omitida por contrato editorial (${contract.qualityScore}/100).`,
);
