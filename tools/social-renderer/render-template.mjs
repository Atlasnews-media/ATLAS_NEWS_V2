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
const INK = "#17130f";
const RED = "#9d3027";
const PAPER = "#f4f0e6";

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

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>\"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function validateContract(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("contract must be an object");
  }
  if (String(raw.version) !== "1") {
    throw new Error(
      `Template carousel requires contract v1, got ${raw.version}`,
    );
  }
  const contract = {
    version: "1",
    sourceCommit: String(raw.sourceCommit || "").trim(),
    sourceId: String(raw.sourceId || "").trim(),
    canonicalUrl: assertString(raw.canonicalUrl, "canonicalUrl"),
    publishedDate: assertString(raw.publishedDate, "publishedDate"),
    productType: assertString(raw.productType, "productType"),
    sectionLabel: assertString(raw.sectionLabel, "sectionLabel"),
    title: assertString(raw.title, "title"),
    dek: assertString(raw.dek, "dek"),
    ideaCentral: assertString(raw.ideaCentral, "ideaCentral"),
    ideaSupport: assertString(raw.ideaSupport, "ideaSupport"),
    keyPoints: raw.keyPoints,
    impactItems: raw.impactItems,
  };
  if (!Array.isArray(contract.keyPoints) || contract.keyPoints.length !== 3) {
    throw new Error("keyPoints must contain exactly 3 items");
  }
  if (
    !Array.isArray(contract.impactItems) ||
    contract.impactItems.length !== 3
  ) {
    throw new Error("impactItems must contain exactly 3 items");
  }
  contract.keyPoints = contract.keyPoints.map((item, i) => ({
    text: assertString(item?.text, `keyPoints[${i}].text`),
  }));
  contract.impactItems = contract.impactItems.map((item, i) => ({
    label: assertString(item?.label, `impactItems[${i}].label`),
    text: assertString(item?.text, `impactItems[${i}].text`),
  }));
  return contract;
}

function resolveContract(input) {
  if (!input) throw new Error("SOCIAL_CONTRACT is required");
  const normalized = input.replaceAll("\\", "/");
  if (
    !normalized.endsWith(".json") ||
    normalized.startsWith("/") ||
    normalized.includes("..")
  ) {
    throw new Error(`Unsafe contract path: ${input}`);
  }
  const absolute = path.resolve(ROOT, normalized);
  const relative = path.relative(ROOT, absolute).replaceAll(path.sep, "/");
  if (relative !== normalized)
    throw new Error(`Unsafe contract path: ${input}`);
  return { absolute, relative };
}

function fit(text, normal, minimum, threshold) {
  const length = Array.from(String(text || "")).length;
  if (length <= threshold) return normal;
  return Math.max(minimum, Math.round((normal * threshold) / length));
}

function dateLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) throw new Error("publishedDate must be valid");
  const m = [
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
  return `${String(d.getDate()).padStart(2, "0")} ${m[d.getMonth()]} ${d.getFullYear()}`;
}

function editionLabel(value) {
  const normalized = String(value || "").replace(/^0+/, "") || "0";
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Error("SOCIAL_EDITION_NUMBER must be a positive integer");
  }
  return normalized.padStart(3, "0");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function visualKey(text) {
  const hay = normalize(text);
  const has = (...words) => words.some((word) => hay.includes(normalize(word)));
  if (
    has(
      "hormuz",
      "saudita",
      "oleoducto",
      "petroleo",
      "brent",
      "crudo",
      "energia",
    )
  )
    return "energy";
  if (has("fed", "inflacion", "ipc", "fomc", "tasa", "tasas")) return "fed";
  if (has("wall street", "s&p", "nasdaq", "dow", "acciones", "bolsa"))
    return "equity";
  if (has("treasury", "bonos", "renta fija", "duracion", "carry"))
    return "treasury";
  if (has("chile", "ipom", "santiago", "tpm", "banco central")) return "chile";
  if (has("puerto", "flete", "transporte", "contenedor")) return "port";
  return "treasury";
}

function commonsUrl(file) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1400`;
}

const imageCache = new Map();
async function materializeVisual(key) {
  if (imageCache.has(key)) return imageCache.get(key);
  const visual = VISUALS[key] || VISUALS.treasury;
  let dataUrl = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(commonsUrl(visual.file), {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "ATLAS-NEWS-Carousel/3.0" },
    });
    clearTimeout(timer);
    if (response.ok) {
      const type = response.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await response.arrayBuffer());
      dataUrl = `data:${type};base64,${buffer.toString("base64")}`;
    }
  } catch (error) {
    console.warn(
      `[carousel-template] visual fallback for ${key}: ${error?.message || error}`,
    );
  }
  const resolved = { ...visual, dataUrl };
  imageCache.set(key, resolved);
  return resolved;
}

function pngDimensions(buffer) {
  if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    throw new Error("Template is not PNG");
  }
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

async function loadTemplates() {
  const result = [];
  for (const file of TEMPLATE_PATHS) {
    const buffer = await fs.readFile(file);
    const [width, height] = pngDimensions(buffer);
    if (width !== W || height !== H) {
      throw new Error(
        `${path.basename(file)} must be ${W}x${H}, got ${width}x${height}`,
      );
    }
    result.push(`data:image/png;base64,${buffer.toString("base64")}`);
  }
  return result;
}

function visualLayer(
  visual,
  { top = 210, bottom = 72, width = 610, opacity = 0.9 } = {},
) {
  if (!visual?.dataUrl) return "";
  return `
    <div class="visual-layer" style="top:${top}px;bottom:${bottom}px;width:${width}px;opacity:${opacity}">
      <img src="${visual.dataUrl}" alt="">
      <div class="visual-wash"></div>
      <div class="visual-credit">${escapeHtml(visual.credit)}</div>
    </div>`;
}

function pageHtml(template, inner, edition, date) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
    body{font-family:Georgia,'Times New Roman',serif;color:${INK};background:${PAPER}}
    .page{position:relative;width:${W}px;height:${H}px;overflow:hidden}
    .template{position:absolute;inset:0;width:${W}px;height:${H}px;object-fit:fill;z-index:1}
    .visual-layer{position:absolute;right:0;z-index:2;overflow:hidden;
      -webkit-mask-image:linear-gradient(to right,transparent 0%,rgba(0,0,0,.18) 18%,rgba(0,0,0,.82) 44%,#000 66%,#000 100%);
      mask-image:linear-gradient(to right,transparent 0%,rgba(0,0,0,.18) 18%,rgba(0,0,0,.82) 44%,#000 66%,#000 100%)}
    .visual-layer img{width:100%;height:100%;object-fit:cover;filter:grayscale(.45) sepia(.08) contrast(.92) saturate(.72)}
    .visual-wash{position:absolute;inset:0;background:linear-gradient(180deg,rgba(244,240,230,.10),rgba(244,240,230,.02) 54%,rgba(244,240,230,.20));pointer-events:none}
    .visual-credit{position:absolute;right:12px;bottom:8px;max-width:70%;font:9px/1.1 Arial,sans-serif;color:rgba(35,31,27,.55);text-align:right}
    .copy{position:absolute;z-index:4;text-align:left}
    .center-zone{display:flex;flex-direction:column;justify-content:center}
    .headline{font-weight:700;letter-spacing:-2.6px;line-height:.94}
    .body{line-height:1.12}
    .rule{width:58px;border-top:3px solid ${RED};margin:25px 0 26px}
    .point{padding:0 0 24px 0;margin:0 0 24px 0;border-bottom:1px solid rgba(23,19,15,.22)}
    .point:last-child{border-bottom:none;margin-bottom:0}
    .impact{padding:0 0 25px 0;margin:0 0 25px 0;border-bottom:1px solid rgba(23,19,15,.22)}
    .impact:last-child{border-bottom:none;margin-bottom:0}
    .edition-value{position:absolute;z-index:5;left:946px;top:42px;color:${RED};font-size:18px;font-weight:700;letter-spacing:1px}
    .date-value{position:absolute;z-index:5;left:1033px;top:42px;color:${INK};font-size:16px;font-weight:600;letter-spacing:2.1px;white-space:nowrap}
    [data-fit]{overflow-wrap:anywhere}
  </style></head><body><div class="page" id="root"><img class="template" src="${template}"><div class="edition-value">${edition}</div><div class="date-value">${date}</div>${inner}</div></body></html>`;
}

async function screenshot(page, html, file) {
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const violations = await page.evaluate(() => {
    const root = document.getElementById("root").getBoundingClientRect();
    return [...document.querySelectorAll("[data-fit]")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const bottomLimit = Number(el.getAttribute("data-bottom-limit") || 0);
        return {
          ok:
            r.left >= root.left - 1 &&
            r.top >= root.top - 1 &&
            r.right <= root.right + 1 &&
            r.bottom <= root.bottom + 1 &&
            (!bottomLimit || r.bottom <= root.top + bottomLimit),
          target: el.textContent?.trim().slice(0, 80) || el.className,
          rect: [
            Math.round(r.left),
            Math.round(r.top),
            Math.round(r.right),
            Math.round(r.bottom),
          ],
          bottomLimit,
        };
      })
      .filter((item) => !item.ok);
  });
  if (violations.length) {
    throw new Error(
      `Template carousel layout guard failed: ${JSON.stringify(violations)}`,
    );
  }
  await page.screenshot({ path: file, type: "png" });
}

async function main() {
  if (PUBLICATION_STATUS !== REQUIRED_PUBLICATION_STATUS) {
    throw new Error(
      `Post-publication guard failed: expected "${REQUIRED_PUBLICATION_STATUS}"`,
    );
  }

  const contractPath = resolveContract(CONTRACT_INPUT);
  const contract = validateContract(
    JSON.parse(await fs.readFile(contractPath.absolute, "utf8")),
  );
  const templates = await loadTemplates();
  const edition = editionLabel(EDITION_INPUT);
  const date = dateLabel(contract.publishedDate);

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  const coverVisual = await materializeVisual(
    visualKey(`${contract.title} ${contract.dek}`),
  );
  const ideaVisual = await materializeVisual(
    visualKey(`${contract.ideaCentral} ${contract.ideaSupport}`),
  );
  const changedVisual = await materializeVisual(
    visualKey(contract.keyPoints.map((x) => x.text).join(" ")),
  );
  const impactVisual = await materializeVisual(
    visualKey(
      contract.impactItems.map((x) => `${x.label} ${x.text}`).join(" "),
    ),
  );
  const closeVisual = coverVisual;

  const titleSize = fit(contract.title, 79, 56, 78);
  const dekSize = fit(contract.dek, 37, 28, 150);
  const ideaSize = fit(contract.ideaCentral, 67, 47, 145);
  const supportSize = fit(contract.ideaSupport, 35, 27, 220);
  const pointsSize = fit(
    contract.keyPoints.map((x) => x.text).join(" "),
    47,
    36,
    260,
  );
  const impactSize = fit(
    contract.impactItems.map((x) => `${x.label} ${x.text}`).join(" "),
    44,
    33,
    310,
  );

  const slide1 = `
    ${visualLayer(coverVisual, { top: 205, bottom: 72, width: 630, opacity: 0.92 })}
    <div class="copy center-zone" data-fit data-bottom-limit="1120" style="left:72px;top:245px;bottom:115px;width:790px">
      <div class="headline" style="font-size:${titleSize}px">${escapeHtml(contract.title)}</div>
      <div class="rule"></div>
      <div class="body" style="font-size:${dekSize}px;max-width:745px">${escapeHtml(contract.dek)}</div>
    </div>`;

  const slide2 = `
    ${visualLayer(ideaVisual, { top: 205, bottom: 72, width: 650, opacity: 0.91 })}
    <div class="copy center-zone" data-fit data-bottom-limit="1120" style="left:72px;top:245px;bottom:110px;width:805px">
      <div class="headline" style="font-size:${ideaSize}px">${escapeHtml(contract.ideaCentral)}</div>
      <div class="rule"></div>
      <div class="body" style="font-size:${supportSize}px;max-width:760px">${escapeHtml(contract.ideaSupport)}</div>
    </div>`;

  const slide3 = `
    ${visualLayer(changedVisual, { top: 210, bottom: 72, width: 600, opacity: 0.88 })}
    <div class="copy body center-zone" data-fit data-bottom-limit="1120" style="left:72px;top:245px;bottom:110px;width:780px;font-size:${pointsSize}px;font-weight:600;line-height:1.04">
      ${contract.keyPoints.map((item) => `<div class="point">${escapeHtml(item.text)}</div>`).join("")}
    </div>`;

  const slide4 = `
    ${visualLayer(impactVisual, { top: 205, bottom: 72, width: 625, opacity: 0.88 })}
    <div class="copy body center-zone" data-fit data-bottom-limit="1120" style="left:72px;top:245px;bottom:110px;width:790px;font-size:${impactSize}px;line-height:1.06">
      ${contract.impactItems.map((item) => `<div class="impact"><b>${escapeHtml(item.label)}.</b> ${escapeHtml(item.text)}</div>`).join("")}
    </div>`;

  const slide5 = `${visualLayer(closeVisual, { top: 145, bottom: 72, width: 620, opacity: 0.84 })}`;
  const slides = [slide1, slide2, slide3, slide4, slide5];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    for (let i = 0; i < slides.length; i += 1) {
      await screenshot(
        page,
        pageHtml(templates[i], slides[i], edition, date),
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
    const [width, height] = pngDimensions(buffer);
    if (width !== W || height !== H)
      throw new Error(`${file} dimensions ${width}x${height}`);
    outputs.push(file);
  }

  const report = {
    renderer: "template-v2-five-slide-preview",
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
    visualKeys: [
      visualKey(`${contract.title} ${contract.dek}`),
      visualKey(`${contract.ideaCentral} ${contract.ideaSupport}`),
      visualKey(contract.keyPoints.map((x) => x.text).join(" ")),
      visualKey(
        contract.impactItems.map((x) => `${x.label} ${x.text}`).join(" "),
      ),
      visualKey(`${contract.title} ${contract.dek}`),
    ],
    templates: TEMPLATE_PATHS.map((file) =>
      path.relative(ROOT, file).replaceAll(path.sep, "/"),
    ),
    outputs,
    status: "PASS",
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
