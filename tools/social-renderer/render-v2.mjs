import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";

const ROOT = path.resolve(process.cwd(), "../..");
const OUT = path.resolve(process.cwd(), "output");
const CONTRACT_INPUT = process.env.SOCIAL_CONTRACT || process.argv[2] || "";
const PUBLICATION_STATUS = process.env.SOCIAL_PUBLICATION_STATUS || "";
const REQUIRED_PUBLICATION_STATUS = "PUBLICACIÓN DISPONIBLE / VERIFICADA";
const MARK_PATH = path.resolve(process.cwd(), "assets/atlas-mark.svg");

const PAPER = "#f4f0e6";
const INK = "#11100d";
const MUTED = "#5c584f";
const RED = "#9d3027";
const NAVY = "#0a3554";
const BRAND_LINE = "Economía · Mercados · Contexto";
const FOOT_LINE = "IDEAS PARA UN MUNDO EN MOVIMIENTO";

const VISUALS = Object.freeze({
  fed: {
    file: "Eccles Building (26088200676).jpg",
    credit: "Wikimedia Commons · Federalreserve · Dominio público",
  },
  energy: {
    file: "US Navy 051111-N-8163B-032 An oil tanker docked to the Al Basrah Oil Terminal (ABOT) takes on crude oil in the Persian Gulf.jpg",
    credit: "Wikimedia Commons · U.S. Navy · Dominio público",
  },
  oil: {
    file: "US Navy 041207-N-6932B-014 The oil tanker Omala is one of hundreds of oil tankers from around the world that receives its payload from Iraq's Al Basrah Oil Terminal (ABOT).jpg",
    credit: "Wikimedia Commons · U.S. Navy · Dominio público",
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
  if (relative !== normalized) throw new Error(`Unsafe contract path: ${input}`);
  return { absolute, relative };
}

function validateContract(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("contract must be an object");
  }
  if (String(raw.version) !== "2") {
    throw new Error(`Seven-slide renderer requires contract v2, got ${raw.version}`);
  }

  const contract = {
    version: "2",
    sourceCommit: String(raw.sourceCommit || "").trim(),
    sourceId: assertString(raw.sourceId, "sourceId"),
    canonicalUrl: assertString(raw.canonicalUrl, "canonicalUrl"),
    publishedDate: assertString(raw.publishedDate, "publishedDate"),
    productType: assertString(raw.productType, "productType"),
    sectionLabel: assertString(raw.sectionLabel, "sectionLabel"),
    title: assertString(raw.title, "title"),
    dek: assertString(raw.dek, "dek"),
    highlights: raw.highlights,
  };

  if (!Array.isArray(contract.highlights) || contract.highlights.length !== 5) {
    throw new Error("contract.highlights must contain exactly 5 items");
  }

  contract.highlights = contract.highlights.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`highlights[${index}] must be an object`);
    }
    const label = assertString(item.label, `highlights[${index}].label`);
    const text = assertString(item.text, `highlights[${index}].text`);
    if (label.length > 72) {
      throw new Error(`Social text guard: highlights[${index}].label exceeds 72 chars`);
    }
    if (text.length > 180) {
      throw new Error(`Social text guard: highlights[${index}].text exceeds 180 chars`);
    }
    return { label, text };
  });

  const canonical = new URL(contract.canonicalUrl);
  if (canonical.protocol !== "https:") throw new Error("canonicalUrl must use https");
  const published = new Date(contract.publishedDate);
  if (Number.isNaN(published.valueOf())) throw new Error("publishedDate must be valid");

  return contract;
}

function dateLabel(iso) {
  const d = new Date(iso);
  const m = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  return `${String(d.getDate()).padStart(2, "0")} ${m[d.getMonth()]} ${d.getFullYear()}`;
}

function adaptive(text, normal, minimum, threshold) {
  const length = Array.from(String(text || "")).length;
  if (length <= threshold) return normal;
  return Math.max(minimum, Math.round((normal * threshold) / length));
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function visualKey(item) {
  const hay = normalize(`${item.label} ${item.text}`);
  const has = (...words) => words.some((word) => hay.includes(normalize(word)));
  if (has("hormuz", "saudita", "oleoducto", "ruta alternativa", "mar rojo")) return "energy";
  if (has("brent", "wti", "petroleo", "crudo", "energia")) return "oil";
  if (has("wall street", "s&p", "nasdaq", "dow", "acciones", "bolsa")) return "equity";
  if (has("fed", "inflacion", "ipc", "fomc", "tasa", "tasas")) return "fed";
  if (has("treasury", "bonos", "renta fija", "rendimiento", "duracion")) return "treasury";
  if (has("chile", "ipom", "santiago", "tpm", "banco central")) return "chile";
  if (has("transporte", "puerto", "flete", "contenedor", "comercio")) return "port";
  return "treasury";
}

function commonsUrl(file) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1280`;
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
      headers: { "User-Agent": "ATLAS-NEWS-Social-Renderer/2.0" },
    });
    clearTimeout(timer);
    if (response.ok) {
      const type = response.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await response.arrayBuffer());
      dataUrl = `data:${type};base64,${buffer.toString("base64")}`;
    }
  } catch (error) {
    console.warn(`[social-v2] visual fallback for ${key}: ${error?.message || error}`);
  }
  const resolved = { ...visual, dataUrl };
  imageCache.set(key, resolved);
  return resolved;
}

function globalCss(w, h) {
  return `
    *{box-sizing:border-box}
    html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
    body{font-family:Georgia,'Times New Roman',serif;background:${PAPER};color:${INK}}
    .page{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:
      radial-gradient(circle at 16% 8%,rgba(255,255,255,.5),transparent 34%),
      repeating-linear-gradient(0deg,transparent 0 3px,rgba(17,16,13,.018) 3px 4px),${PAPER}}
    .page:after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.07;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.18'/%3E%3C/svg%3E")}
    .v2-header{position:absolute;left:48px;right:48px;top:30px;height:96px;border-bottom:2px solid ${INK};display:flex;justify-content:space-between;align-items:flex-start;z-index:5}
    .v2-brand{font-size:52px;line-height:.9;letter-spacing:-1px;font-weight:700}.v2-strap{font-size:14px;letter-spacing:4px;margin-top:8px}
    .v2-meta{display:flex;gap:34px;align-items:flex-start;font-size:18px;letter-spacing:4px}.v2-date{border-left:2px solid ${INK};padding-left:18px}.v2-counter{color:${RED};font-size:25px;letter-spacing:2px}
    .kicker{position:absolute;left:48px;right:48px;top:148px;color:${RED};font-size:22px;letter-spacing:5px;font-weight:700;text-transform:uppercase;z-index:5}
    .kicker:after{content:'';position:absolute;right:0;top:13px;width:58px;border-top:2px solid ${RED}}
    .footer{position:absolute;left:48px;right:48px;bottom:25px;height:58px;border-top:2px solid ${INK};padding-top:20px;display:flex;justify-content:space-between;z-index:6}
    .footer span:first-child{font-size:12px;letter-spacing:5px}.footer .dash{width:56px;border-top:2px solid ${RED};margin-top:7px}
    .photo-credit{position:absolute;right:18px;bottom:15px;max-width:70%;padding:5px 8px;background:rgba(244,240,230,.72);font:11px/1.1 Arial,sans-serif;color:#35322d;z-index:4}
    [data-fit]{overflow-wrap:anywhere}
  `;
}

function v2Header(date, counter) {
  return `<div class="v2-header" data-fit><div><div class="v2-brand">ATLAS NEWS</div><div class="v2-strap">${BRAND_LINE}</div></div><div class="v2-meta"><span class="v2-date">${date}</span><span class="v2-counter">${counter}/7</span></div></div>`;
}

function footer() {
  return `<div class="footer" data-fit><span>${FOOT_LINE}</span><span class="dash"></span></div>`;
}

function htmlPage(inner, w, h) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${globalCss(w, h)}</style></head><body><div class="page" id="root">${inner}</div></body></html>`;
}

async function screenshot(page, html, file, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const violations = await page.evaluate(() => {
    const root = document.getElementById("root").getBoundingClientRect();
    const bad = [];
    for (const el of document.querySelectorAll("[data-fit]")) {
      const r = el.getBoundingClientRect();
      const inside =
        r.left >= root.left - 1 &&
        r.top >= root.top - 1 &&
        r.right <= root.right + 1 &&
        r.bottom <= root.bottom + 1;
      if (!inside) bad.push({ type: "canvas", target: el.textContent?.trim().slice(0, 70) || el.className });
      const limit = Number(el.getAttribute("data-content-limit") || 0);
      if (limit && r.bottom > root.top + limit) {
        bad.push({ type: "content-zone", limit, bottom: Math.round(r.bottom - root.top), target: el.textContent?.trim().slice(0, 70) || el.className });
      }
    }
    return bad;
  });
  if (violations.length) throw new Error(`Social layout guard failed: ${JSON.stringify(violations)}`);
  await page.screenshot({ path: file, type: "png" });
}

function validatePng(fileName, buffer) {
  if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error(`${fileName} is not PNG`);
  const w = buffer.readUInt32BE(16);
  const h = buffer.readUInt32BE(20);
  const expected = fileName.includes("social-card") ? [1200, 630] : [1080, 1350];
  if (w !== expected[0] || h !== expected[1]) throw new Error(`${fileName} dimensions ${w}x${h}`);
}

function highlightSlide(item, index, date, visual) {
  const titleSize = adaptive(item.label, 78, 62, 48);
  const bodySize = adaptive(item.text, 39, 34, 135);
  const image = visual.dataUrl
    ? `<div style="position:absolute;left:0;right:0;top:830px;height:410px;overflow:hidden;z-index:2"><img data-fit src="${visual.dataUrl}" style="width:100%;height:100%;object-fit:cover;filter:grayscale(.88) sepia(.08) contrast(.9);opacity:.88"><div style="position:absolute;inset:0;background:linear-gradient(${PAPER} 0%,rgba(244,240,230,.12) 34%,rgba(244,240,230,.02) 100%)"></div><div class="photo-credit">${escapeHtml(visual.credit)}</div></div>`
    : `<div style="position:absolute;left:0;right:0;top:830px;height:410px;background:linear-gradient(180deg,${PAPER},#ddd7ca);z-index:2"></div>`;

  return `${v2Header(date, index + 2)}
    <div class="kicker">EN UNA MIRADA</div>
    <div data-fit data-content-limit="810" style="position:absolute;left:48px;right:48px;top:220px;z-index:5">
      <div style="color:${RED};font-size:70px;line-height:.9;margin-bottom:18px">${String(index + 1).padStart(2, "0")}</div>
      <div style="width:52px;border-top:3px solid ${RED};margin-bottom:28px"></div>
      <div style="font-size:${titleSize}px;line-height:.94;font-weight:700;letter-spacing:-2.5px;max-width:930px">${escapeHtml(item.label)}</div>
      <div style="font-size:${bodySize}px;line-height:1.12;color:${MUTED};margin-top:28px;max-width:865px">${escapeHtml(item.text)}</div>
    </div>
    ${image}
    ${footer()}`;
}

function imagePane(visual, style, credit = false) {
  if (!visual?.dataUrl) return `<div style="${style};background:#ddd7ca"></div>`;
  return `<div style="${style};overflow:hidden"><img data-fit src="${visual.dataUrl}" style="width:100%;height:100%;object-fit:cover;filter:grayscale(.82) sepia(.1) contrast(.9);opacity:.9">${credit ? `<div class="photo-credit">${escapeHtml(visual.credit)}</div>` : ""}</div>`;
}

async function main() {
  if (PUBLICATION_STATUS !== REQUIRED_PUBLICATION_STATUS) {
    throw new Error(`Post-publication guard failed: expected "${REQUIRED_PUBLICATION_STATUS}"`);
  }

  const contractPath = resolveContract(CONTRACT_INPUT);
  const contract = validateContract(JSON.parse(await fs.readFile(contractPath.absolute, "utf8")));
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  const mark = `data:image/svg+xml;base64,${Buffer.from(await fs.readFile(MARK_PATH, "utf8")).toString("base64")}`;
  const date = dateLabel(contract.publishedDate);
  const cardVisualKeys = contract.highlights.map(visualKey);
  const visuals = await Promise.all(cardVisualKeys.map(materializeVisual));
  const mainVisual = await materializeVisual(
    visualKey({ label: contract.title, text: contract.dek }),
  );
  const keyed = new Map(cardVisualKeys.map((key, i) => [key, visuals[i]]));
  const unique = [...new Set(cardVisualKeys)];
  const coverKeys = ["fed", "chile", "equity"].filter((key) => keyed.has(key));
  for (const key of unique) if (!coverKeys.includes(key) && coverKeys.length < 3) coverKeys.push(key);
  while (coverKeys.length < 3) coverKeys.push(["fed", "chile", "equity"][coverKeys.length]);
  const coverVisuals = await Promise.all(coverKeys.slice(0, 3).map(materializeVisual));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const started = performance.now();

  const ogTitleSize = adaptive(contract.title, 82, 58, 62);
  const ogHtml = `${v2Header(date, 1)}
    <div style="position:absolute;left:60px;top:190px;width:820px;z-index:5" data-fit>
      <div style="color:${RED};font:700 20px/1 Arial,sans-serif;letter-spacing:4px;text-transform:uppercase">${escapeHtml(contract.sectionLabel)}</div>
      <div style="font-size:${ogTitleSize}px;line-height:.92;font-weight:700;letter-spacing:-3px;margin-top:28px;color:${INK}">${escapeHtml(contract.title)}</div>
      <div style="font-size:34px;line-height:1.08;margin-top:22px;color:${MUTED};max-width:760px">${escapeHtml(contract.dek)}</div>
    </div>
    <img data-fit src="${mark}" style="position:absolute;right:55px;bottom:32px;width:235px;height:315px;object-fit:contain;opacity:.95;z-index:3">
    <div style="position:absolute;left:60px;right:60px;bottom:30px;border-top:2px solid ${INK};z-index:4"></div>`;
  await screenshot(page, htmlPage(ogHtml, 1200, 630), path.join(OUT, "atlas-news-social-card-1200x630.png"), 1200, 630);

  const coverDate = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  })
    .format(new Date(contract.publishedDate))
    .toUpperCase();
  const cover = `
    <div data-fit style="position:absolute;left:48px;right:48px;top:35px;height:73px;border-top:5px double ${INK};border-bottom:2px solid ${INK};display:flex;align-items:center;justify-content:space-between;font:700 21px/1 Arial,sans-serif;letter-spacing:1.8px;z-index:8">
      <span>EDICIÓN · 1/7</span><span>${escapeHtml(coverDate)}</span>
    </div>
    ${imagePane(mainVisual, "position:absolute;left:0;right:0;top:108px;height:427px;z-index:2", true)}
    <div style="position:absolute;left:0;right:0;top:108px;height:427px;background:linear-gradient(180deg,rgba(244,240,230,.18) 0%,transparent 22%,transparent 62%,${PAPER} 100%);z-index:3;pointer-events:none"></div>
    <div style="position:absolute;left:48px;right:48px;top:505px;height:268px;background:rgba(244,240,230,.97);border-top:5px double ${INK};border-bottom:5px double ${INK};z-index:6"></div>
    <div data-fit style="position:absolute;left:48px;right:48px;top:520px;height:230px;display:flex;align-items:center;justify-content:center;gap:28px;z-index:7">
      <img src="${mark}" style="width:102px;height:150px;object-fit:contain">
      <div><div style="font-size:116px;line-height:.82;font-weight:700;letter-spacing:-6px;color:${INK};white-space:nowrap">ATLAS NEWS</div><div style="font-size:31px;line-height:1;margin-top:18px;text-align:center;letter-spacing:2px">${BRAND_LINE}</div></div>
    </div>
    ${imagePane(coverVisuals[1], "position:absolute;left:0;width:57%;top:760px;bottom:0;z-index:2", true)}
    ${imagePane(coverVisuals[2], "position:absolute;right:0;width:60%;top:760px;bottom:0;z-index:3", true)}
    <div style="position:absolute;left:0;right:0;top:745px;height:180px;background:linear-gradient(${PAPER} 0%,rgba(244,240,230,.68) 30%,transparent 100%);z-index:4;pointer-events:none"></div>
    <div style="position:absolute;left:40%;width:23%;top:760px;bottom:0;background:linear-gradient(90deg,transparent 0%,rgba(244,240,230,.52) 48%,transparent 100%);z-index:4;pointer-events:none"></div>`;

  const slides = [cover];
  for (let i = 0; i < contract.highlights.length; i += 1) {
    slides.push(highlightSlide(contract.highlights[i], i, date, visuals[i]));
  }

  const closing = `${v2Header(date, 7)}
    <div class="kicker">CIERRE DE EDICIÓN</div>
    <div data-fit data-content-limit="820" style="position:absolute;left:48px;right:48px;top:225px;z-index:6">
      <div style="font-size:88px;line-height:.91;font-weight:700;letter-spacing:-4px;max-width:900px">Lee la edición completa en Atlas News</div>
      <div style="font-size:34px;line-height:1.12;color:${MUTED};margin-top:28px;max-width:720px">Portada, claves del día, análisis internacional, señales para Chile y movimientos de mercado en una sola lectura editorial.</div>
      <div style="display:inline-block;margin-top:28px;padding:16px 30px;border:3px solid ${RED};border-radius:28px;color:${RED};font-size:27px;font-weight:700">Disponible en Atlas News →</div>
      <div style="font-size:28px;margin-top:18px">atlasnews-media.github.io</div>
    </div>
    ${imagePane(coverVisuals[1], "position:absolute;left:0;width:58%;bottom:82px;height:405px;z-index:2", true)}
    ${imagePane(coverVisuals[2], "position:absolute;right:0;width:48%;bottom:82px;height:500px;z-index:3", true)}
    <div style="position:absolute;left:0;right:0;bottom:82px;height:510px;background:linear-gradient(${PAPER} 0%,rgba(244,240,230,.46) 22%,transparent 55%);z-index:4;pointer-events:none"></div>
    ${footer()}`;
  slides.push(closing);

  for (let i = 0; i < slides.length; i += 1) {
    await screenshot(
      page,
      htmlPage(slides[i], 1080, 1350),
      path.join(OUT, `atlas-news-instagram-carousel-0${i + 1}.png`),
      1080,
      1350,
    );
  }
  await browser.close();

  const pngs = (await fs.readdir(OUT)).filter((name) => name.endsWith(".png")).sort();
  if (pngs.length !== 8) throw new Error(`Expected 8 PNGs (1 OG + 7 carousel), got ${pngs.length}`);
  for (const file of pngs) validatePng(file, await fs.readFile(path.join(OUT, file)));

  const metrics = {
    contractVersion: contract.version,
    contractPath: contractPath.relative,
    sourceCommit: contract.sourceCommit || null,
    sourceId: contract.sourceId,
    canonicalUrl: contract.canonicalUrl,
    publicationStatus: PUBLICATION_STATUS,
    productType: contract.productType,
    carouselSlides: 7,
    highlightCards: contract.highlights.length,
    visualKeys: cardVisualKeys,
    rendererMs: Math.round(performance.now() - started),
    githubRunId: process.env.GITHUB_RUN_ID || null,
    outputs: pngs,
  };
  await fs.writeFile(path.join(OUT, "benchmark.json"), `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
