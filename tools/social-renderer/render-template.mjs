import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(process.cwd(), "../..");
const OUT = path.resolve(process.cwd(), "output-template");
const CONTRACT_INPUT = process.env.SOCIAL_CONTRACT || process.argv[2] || "";
const PUBLICATION_STATUS = process.env.SOCIAL_PUBLICATION_STATUS || "";
const REQUIRED_PUBLICATION_STATUS = "PUBLICACIÓN DISPONIBLE / VERIFICADA";
const W = 1080;
const H = 1350;
const INK = "#17130f";
const RED = "#9d3027";

const TEMPLATE_PATHS = [1, 2, 3, 4, 5].map((n) =>
  path.resolve(process.cwd(), `assets/CARRUSEL_${n}.png`),
);

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
    throw new Error(`Template carousel requires contract v1, got ${raw.version}`);
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
  if (!Array.isArray(contract.impactItems) || contract.impactItems.length !== 3) {
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
  if (!normalized.endsWith(".json") || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`Unsafe contract path: ${input}`);
  }
  const absolute = path.resolve(ROOT, normalized);
  const relative = path.relative(ROOT, absolute).replaceAll(path.sep, "/");
  if (relative !== normalized) throw new Error(`Unsafe contract path: ${input}`);
  return { absolute, relative };
}

function fit(text, normal, minimum, threshold) {
  const length = Array.from(String(text || "")).length;
  if (length <= threshold) return normal;
  return Math.max(minimum, Math.round((normal * threshold) / length));
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
      throw new Error(`${path.basename(file)} must be ${W}x${H}, got ${width}x${height}`);
    }
    result.push(`data:image/png;base64,${buffer.toString("base64")}`);
  }
  return result;
}

function pageHtml(template, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
    body{font-family:Georgia,'Times New Roman',serif;color:${INK};background:#f4f0e6}
    .page{position:relative;width:${W}px;height:${H}px;overflow:hidden}
    .template{position:absolute;inset:0;width:${W}px;height:${H}px;object-fit:fill}
    .copy{position:absolute;z-index:2}
    .headline{font-weight:700;letter-spacing:-2px;line-height:.96}
    .body{line-height:1.12}
    .rule{width:54px;border-top:2px solid ${RED};margin:26px 0}
    .point{padding:0 0 22px 0;margin:0 0 22px 0;border-bottom:1px solid rgba(23,19,15,.22)}
    .point:last-child{border-bottom:none;margin-bottom:0}
    .impact{padding:0 0 24px 0;margin:0 0 24px 0;border-bottom:1px solid rgba(23,19,15,.22)}
    .impact:last-child{border-bottom:none;margin-bottom:0}
    [data-fit]{overflow-wrap:anywhere}
  </style></head><body><div class="page" id="root"><img class="template" src="${template}">${inner}</div></body></html>`;
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
          rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
          bottomLimit,
        };
      })
      .filter((item) => !item.ok);
  });
  if (violations.length) {
    throw new Error(`Template carousel layout guard failed: ${JSON.stringify(violations)}`);
  }
  await page.screenshot({ path: file, type: "png" });
}

async function main() {
  if (PUBLICATION_STATUS !== REQUIRED_PUBLICATION_STATUS) {
    throw new Error(`Post-publication guard failed: expected "${REQUIRED_PUBLICATION_STATUS}"`);
  }

  const contractPath = resolveContract(CONTRACT_INPUT);
  const contract = validateContract(JSON.parse(await fs.readFile(contractPath.absolute, "utf8")));
  const templates = await loadTemplates();

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  const titleSize = fit(contract.title, 72, 46, 70);
  const dekSize = fit(contract.dek, 36, 28, 125);
  const ideaSize = fit(contract.ideaCentral, 58, 40, 125);
  const supportSize = fit(contract.ideaSupport, 34, 27, 190);
  const pointsSize = fit(contract.keyPoints.map((x) => x.text).join(" "), 36, 29, 210);
  const impactSize = fit(contract.impactItems.map((x) => `${x.label} ${x.text}`).join(" "), 34, 27, 250);

  const slide1 = `
    <div class="copy" data-fit data-bottom-limit="1110" style="left:82px;right:82px;top:300px">
      <div class="headline" style="font-size:${titleSize}px">${escapeHtml(contract.title)}</div>
      <div class="rule"></div>
      <div class="body" style="font-size:${dekSize}px;max-width:790px">${escapeHtml(contract.dek)}</div>
    </div>`;

  const slide2 = `
    <div class="copy" data-fit data-bottom-limit="1120" style="left:82px;right:82px;top:315px">
      <div class="headline" style="font-size:${ideaSize}px">${escapeHtml(contract.ideaCentral)}</div>
      <div class="rule"></div>
      <div class="body" style="font-size:${supportSize}px;max-width:820px">${escapeHtml(contract.ideaSupport)}</div>
    </div>`;

  const slide3 = `
    <div class="copy body" data-fit data-bottom-limit="1135" style="left:86px;right:86px;top:315px;font-size:${pointsSize}px">
      ${contract.keyPoints.map((item) => `<div class="point">${escapeHtml(item.text)}</div>`).join("")}
    </div>`;

  const slide4 = `
    <div class="copy body" data-fit data-bottom-limit="1135" style="left:86px;right:86px;top:315px;font-size:${impactSize}px">
      ${contract.impactItems.map((item) => `<div class="impact"><b>${escapeHtml(item.label)}.</b> ${escapeHtml(item.text)}</div>`).join("")}
    </div>`;

  const slide5 = ``;
  const slides = [slide1, slide2, slide3, slide4, slide5];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    for (let i = 0; i < slides.length; i += 1) {
      await screenshot(
        page,
        pageHtml(templates[i], slides[i]),
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
    if (width !== W || height !== H) throw new Error(`${file} dimensions ${width}x${height}`);
    outputs.push(file);
  }

  const report = {
    renderer: "template-v1-preview",
    contractVersion: contract.version,
    contractPath: contractPath.relative,
    sourceCommit: contract.sourceCommit || null,
    sourceId: contract.sourceId || null,
    canonicalUrl: contract.canonicalUrl,
    carouselSlides: 5,
    templates: TEMPLATE_PATHS.map((file) => path.relative(ROOT, file).replaceAll(path.sep, "/")),
    outputs,
    status: "PASS",
  };
  await fs.writeFile(path.join(OUT, "template-validation.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
