import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(process.cwd(), "../..");
const OUT = path.resolve(process.cwd(), "output-template");
const CONTRACT_INPUT = process.env.SOCIAL_CONTRACT || process.argv[2] || "";
const PUBLICATION_STATUS = process.env.SOCIAL_PUBLICATION_STATUS || "";
const EDITION_INPUT = String(process.env.SOCIAL_EDITION_NUMBER || "").trim();
const REQUIRED_PUBLICATION_STATUS = "PUBLICACIÓN DISPONIBLE / VERIFICADA";
const W = 1254;
const H = 1254;
const PAPER = "#f4f0e6";
const INK = "#17130f";
const RED = "#9d3027";

const TEMPLATE_PATHS = [1, 2, 3, 4, 5].map((n) =>
  path.resolve(process.cwd(), `assets/CARRUSEL_${n}.png`),
);

const VISUALS = Object.freeze({
  energy: {
    file: "US Navy 051111-N-8163B-032 An oil tanker docked to the Al Basrah Oil Terminal (ABOT) takes on crude oil in the Persian Gulf.jpg",
    credit: "Wikimedia Commons · U.S. Navy · Dominio público",
  },
  oil: {
    file: "US Navy 041207-N-6932B-014 The oil tanker Omala is one of hundreds of oil tankers from around the world that receives its payload from Iraq's Al Basrah Oil Terminal (ABOT).jpg",
    credit: "Wikimedia Commons · U.S. Navy · Dominio público",
  },
  fed: {
    file: "Eccles Building (26088200676).jpg",
    credit: "Wikimedia Commons · Federalreserve · Dominio público",
  },
  equity: {
    file: "Stock Exchange NYC.jpg",
    credit: "Wikimedia Commons · Cody escadron delta · Dominio público",
  },
  treasury: {
    file: "US Treasury Building.jpg",
    credit: "Wikimedia Commons · Loren · Dominio público",
  },
  chile: {
    file: "Vista del Costanera Center.jpg",
    credit: "Wikimedia Commons · Rjcastillo · CC BY-SA 4.0",
  },
  port: {
    file: "CL-san-antonio-hafen.jpg",
    credit: "Wikimedia Commons · Balou46 · CC BY-SA 4.0",
  },
});

const VISUAL_ORDER = [
  "energy",
  "fed",
  "equity",
  "treasury",
  "oil",
  "chile",
  "port",
];
const KEYWORDS = Object.freeze({
  energy: [
    "hormuz",
    "saudita",
    "oleoducto",
    "energia",
    "ataque",
    "ruta alternativa",
    "mar rojo",
  ],
  oil: ["petroleo", "brent", "wti", "crudo", "barriles", "prima energetica"],
  fed: ["fed", "inflacion", "ipc", "fomc", "tasa", "tasas", "subida"],
  equity: [
    "wall street",
    "s&p",
    "nasdaq",
    "dow",
    "acciones",
    "bolsa",
    "renta variable",
  ],
  treasury: [
    "treasury",
    "bonos",
    "renta fija",
    "duracion",
    "carry",
    "rendimiento",
    "curva",
  ],
  chile: ["chile", "ipom", "santiago", "tpm", "banco central"],
  port: ["puerto", "flete", "transporte", "contenedor", "logistica"],
});

function esc(value = "") {
  return String(value).replace(
    /[&<>\"]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      })[c],
  );
}

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function validate(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("contract must be an object");
  if (String(raw.version) !== "1")
    throw new Error(
      `Five-slide carousel requires contract v1, got ${raw.version}`,
    );
  const contract = {
    version: "1",
    sourceCommit: String(raw.sourceCommit || "").trim(),
    sourceId: String(raw.sourceId || "").trim(),
    canonicalUrl: required(raw.canonicalUrl, "canonicalUrl"),
    publishedDate: required(raw.publishedDate, "publishedDate"),
    productType: required(raw.productType, "productType"),
    sectionLabel: required(raw.sectionLabel, "sectionLabel"),
    title: required(raw.title, "title"),
    dek: required(raw.dek, "dek"),
    ideaCentral: required(raw.ideaCentral, "ideaCentral"),
    ideaSupport: required(raw.ideaSupport, "ideaSupport"),
    keyPoints: raw.keyPoints,
    impactItems: raw.impactItems,
  };
  if (!Array.isArray(contract.keyPoints) || contract.keyPoints.length !== 3)
    throw new Error("keyPoints must contain exactly 3 items");
  if (!Array.isArray(contract.impactItems) || contract.impactItems.length !== 3)
    throw new Error("impactItems must contain exactly 3 items");
  contract.keyPoints = contract.keyPoints.map((item, i) => ({
    text: required(item?.text, `keyPoints[${i}].text`),
  }));
  contract.impactItems = contract.impactItems.map((item, i) => ({
    label: required(item?.label, `impactItems[${i}].label`),
    text: required(item?.text, `impactItems[${i}].text`),
  }));
  return contract;
}

function resolveContract(input) {
  const normalized = required(input, "SOCIAL_CONTRACT").replaceAll("\\", "/");
  if (
    !normalized.endsWith(".json") ||
    normalized.startsWith("/") ||
    normalized.includes("..")
  )
    throw new Error(`Unsafe contract path: ${input}`);
  const absolute = path.resolve(ROOT, normalized);
  const relative = path.relative(ROOT, absolute).replaceAll(path.sep, "/");
  if (relative !== normalized)
    throw new Error(`Unsafe contract path: ${input}`);
  return { absolute, relative };
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function rankedVisualKeys(text) {
  const hay = normalize(text);
  const scored = VISUAL_ORDER.map((key, order) => {
    const score = KEYWORDS[key].reduce(
      (total, word) => total + (hay.includes(normalize(word)) ? 1 : 0),
      0,
    );
    return { key, score, order };
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((item) => item.key);
}

function chooseUniqueKeys(texts) {
  const used = new Set();
  const selected = [];
  for (const text of texts) {
    const ranked = rankedVisualKeys(text);
    const key =
      ranked.find((candidate) => !used.has(candidate)) ||
      VISUAL_ORDER.find((candidate) => !used.has(candidate));
    if (!key) throw new Error("Not enough unique carousel visual categories");
    used.add(key);
    selected.push(key);
  }
  return selected;
}

function commonsUrl(file) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1400`;
}

const visualCache = new Map();
async function loadVisual(key) {
  if (visualCache.has(key)) return visualCache.get(key);
  const visual = VISUALS[key] || VISUALS.treasury;
  let dataUrl = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(commonsUrl(visual.file), {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "ATLAS-NEWS-Carousel/3.1" },
    });
    clearTimeout(timer);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      dataUrl = `data:${response.headers.get("content-type") || "image/jpeg"};base64,${buffer.toString("base64")}`;
    }
  } catch (error) {
    console.warn(
      `[carousel-five] visual fallback ${key}: ${error?.message || error}`,
    );
  }
  const out = { ...visual, dataUrl };
  visualCache.set(key, out);
  return out;
}

function fit(text, normal, minimum, threshold) {
  const n = Array.from(String(text || "")).length;
  if (n <= threshold) return normal;
  return Math.max(minimum, Math.round((normal * threshold) / n));
}

function dateLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) throw new Error("publishedDate must be valid");
  const months = [
    "ENE",
    "FEB",
    "MAR",
    "ABR",
    "MAY",
    "JUN",
    "JUL",
    "AGO",
    "SEPT",
    "OCT",
    "NOV",
    "DIC",
  ];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function editionLabel(value) {
  const normalized = String(value || "").replace(/^0+/, "") || "0";
  if (!/^[1-9][0-9]*$/.test(normalized))
    throw new Error("SOCIAL_EDITION_NUMBER must be a positive integer");
  return normalized.padStart(3, "0");
}

function pngDimensions(buffer) {
  if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a")
    throw new Error("PNG expected");
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

async function templates() {
  const result = [];
  for (const file of TEMPLATE_PATHS) {
    const buffer = await fs.readFile(file);
    const [w, h] = pngDimensions(buffer);
    if (w !== W || h !== H)
      throw new Error(
        `${path.basename(file)} must be ${W}x${H}, got ${w}x${h}`,
      );
    result.push(`data:image/png;base64,${buffer.toString("base64")}`);
  }
  return result;
}

function imageLayer(
  visual,
  top = 195,
  bottom = 70,
  width = 625,
  opacity = 0.9,
) {
  if (!visual?.dataUrl) return "";
  return `<div class="visual" style="top:${top}px;bottom:${bottom}px;width:${width}px;opacity:${opacity}"><img src="${visual.dataUrl}"><div class="wash"></div><div class="credit">${esc(visual.credit)}</div></div>`;
}

function html(template, inner, edition, date) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}body{font-family:Georgia,'Times New Roman',serif;color:${INK};background:${PAPER}}
  .page{position:relative;width:${W}px;height:${H}px;overflow:hidden}.template{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;z-index:1}
  .visual{position:absolute;right:0;z-index:2;overflow:hidden;-webkit-mask-image:linear-gradient(to right,transparent 0%,rgba(0,0,0,.12) 15%,rgba(0,0,0,.72) 42%,#000 68%,#000 100%);mask-image:linear-gradient(to right,transparent 0%,rgba(0,0,0,.12) 15%,rgba(0,0,0,.72) 42%,#000 68%,#000 100%)}
  .visual img{width:100%;height:100%;object-fit:cover;filter:grayscale(.36) sepia(.08) contrast(.94) saturate(.78)}.wash{position:absolute;inset:0;background:linear-gradient(180deg,rgba(244,240,230,.10),transparent 52%,rgba(244,240,230,.17))}.credit{position:absolute;right:10px;bottom:7px;max-width:72%;font:9px/1.1 Arial,sans-serif;color:rgba(35,31,27,.48);text-align:right}
  .copy{position:absolute;z-index:4;text-align:left;display:flex;flex-direction:column;justify-content:center}.headline{font-weight:700;letter-spacing:-2.6px;line-height:.94}.body{line-height:1.10}.rule{width:58px;border-top:3px solid ${RED};margin:24px 0 26px}
  .point,.impact{padding-bottom:22px;margin-bottom:22px;border-bottom:1px solid rgba(23,19,15,.22)}.point:last-child,.impact:last-child{border-bottom:none;margin-bottom:0}
  .edition{position:absolute;z-index:5;left:946px;top:42px;color:${RED};font-size:18px;font-weight:700;letter-spacing:1px}.date{position:absolute;z-index:5;left:1033px;top:42px;color:${INK};font-size:16px;font-weight:600;letter-spacing:2.1px;white-space:nowrap}
  [data-fit]{overflow-wrap:anywhere}
  </style></head><body><div class="page" id="root"><img class="template" src="${template}"><div class="edition">${edition}</div><div class="date">${date}</div>${inner}</div></body></html>`;
}

async function shot(page, markup, file) {
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(markup, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const bad = await page.evaluate(() => {
    const root = document.getElementById("root").getBoundingClientRect();
    return [...document.querySelectorAll("[data-fit]")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          ok:
            r.left >= root.left - 1 &&
            r.top >= root.top - 1 &&
            r.right <= root.right + 1 &&
            r.bottom <= root.bottom + 1,
          text: el.textContent?.trim().slice(0, 90) || el.className,
        };
      })
      .filter((x) => !x.ok);
  });
  if (bad.length)
    throw new Error(`Carousel layout guard failed: ${JSON.stringify(bad)}`);
  await page.screenshot({ path: file, type: "png" });
}

async function main() {
  if (PUBLICATION_STATUS !== REQUIRED_PUBLICATION_STATUS)
    throw new Error(
      `Post-publication guard failed: expected "${REQUIRED_PUBLICATION_STATUS}"`,
    );
  const contractPath = resolveContract(CONTRACT_INPUT);
  const contract = validate(
    JSON.parse(await fs.readFile(contractPath.absolute, "utf8")),
  );
  const base = await templates();
  const edition = editionLabel(EDITION_INPUT);
  const date = dateLabel(contract.publishedDate);
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  const visualTexts = [
    `${contract.title} ${contract.dek}`,
    `${contract.ideaCentral} ${contract.ideaSupport}`,
    contract.keyPoints.map((x) => x.text).join(" "),
    contract.impactItems.map((x) => `${x.label} ${x.text}`).join(" "),
    `${contract.title} ${contract.ideaCentral} ${contract.keyPoints.map((x) => x.text).join(" ")}`,
  ];
  const keys = chooseUniqueKeys(visualTexts);
  if (new Set(keys).size !== 5)
    throw new Error(
      `Carousel visual uniqueness guard failed: ${keys.join(", ")}`,
    );
  const [coverVisual, ideaVisual, changedVisual, impactVisual, closingVisual] =
    await Promise.all(keys.map(loadVisual));

  const titleSize = fit(contract.title, 79, 55, 80);
  const dekSize = fit(contract.dek, 36, 28, 150);
  const ideaSize = fit(contract.ideaCentral, 66, 46, 150);
  const supportSize = fit(contract.ideaSupport, 34, 27, 225);
  const pointsSize = fit(
    contract.keyPoints.map((x) => x.text).join(" "),
    46,
    35,
    270,
  );
  const impactSize = fit(
    contract.impactItems.map((x) => `${x.label} ${x.text}`).join(" "),
    43,
    32,
    320,
  );

  const slides = [
    `${imageLayer(coverVisual, 190, 70, 640, 0.92)}<div class="copy" data-fit style="left:72px;top:250px;bottom:90px;width:805px"><div class="headline" style="font-size:${titleSize}px">${esc(contract.title)}</div><div class="rule"></div><div class="body" style="font-size:${dekSize}px;max-width:755px">${esc(contract.dek)}</div></div>`,
    `${imageLayer(ideaVisual, 190, 70, 650, 0.91)}<div class="copy" data-fit style="left:72px;top:245px;bottom:88px;width:815px"><div class="headline" style="font-size:${ideaSize}px">${esc(contract.ideaCentral)}</div><div class="rule"></div><div class="body" style="font-size:${supportSize}px;max-width:760px">${esc(contract.ideaSupport)}</div></div>`,
    `${imageLayer(changedVisual, 195, 70, 610, 0.88)}<div class="copy body" data-fit style="left:72px;top:245px;bottom:88px;width:800px;font-size:${pointsSize}px;font-weight:600;line-height:1.04">${contract.keyPoints.map((item) => `<div class="point">${esc(item.text)}</div>`).join("")}</div>`,
    `${imageLayer(impactVisual, 190, 70, 625, 0.88)}<div class="copy body" data-fit style="left:72px;top:245px;bottom:88px;width:805px;font-size:${impactSize}px;line-height:1.05">${contract.impactItems.map((item) => `<div class="impact"><b>${esc(item.label)}.</b> ${esc(item.text)}</div>`).join("")}</div>`,
    `${imageLayer(closingVisual, 135, 70, 620, 0.84)}`,
  ];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    for (let i = 0; i < 5; i += 1) {
      await shot(
        page,
        html(base[i], slides[i], edition, date),
        path.join(OUT, `atlas-news-instagram-carousel-0${i + 1}.png`),
      );
    }
  } finally {
    await browser.close();
  }

  const outputs = [];
  for (let i = 1; i <= 5; i += 1) {
    const file = `atlas-news-instagram-carousel-0${i}.png`;
    const buffer = await fs.readFile(path.join(OUT, file));
    const [w, h] = pngDimensions(buffer);
    if (w !== W || h !== H) throw new Error(`${file} dimensions ${w}x${h}`);
    outputs.push(file);
  }

  const report = {
    renderer: "atlas-carousel-five-v2",
    status: "PASS",
    contractVersion: contract.version,
    contractPath: contractPath.relative,
    sourceCommit: contract.sourceCommit || null,
    sourceId: contract.sourceId || null,
    canonicalUrl: contract.canonicalUrl,
    carouselSlides: 5,
    width: W,
    height: H,
    editionNumber: edition,
    publishedDate: date,
    visualKeys: keys,
    uniqueVisuals: new Set(keys).size,
    outputs,
    templates: TEMPLATE_PATHS.map((file) =>
      path.relative(ROOT, file).replaceAll(path.sep, "/"),
    ),
  };
  await fs.writeFile(
    path.join(OUT, "template-validation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
