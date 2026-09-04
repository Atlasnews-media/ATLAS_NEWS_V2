import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { generateOpenGraphImage } from 'astro-og-canvas';

const ROOT = path.resolve(process.cwd(), '../..');
const OUT = path.resolve(process.cwd(), 'output');
const TMP = path.resolve(process.cwd(), '.tmp');
const CONTRACT_INPUT = process.env.SOCIAL_CONTRACT || process.argv[2] || '';
const PUBLICATION_STATUS = process.env.SOCIAL_PUBLICATION_STATUS || '';
const REQUIRED_PUBLICATION_STATUS = 'PUBLICACIÓN DISPONIBLE / VERIFICADA';
const MARK_PATH = path.resolve(process.cwd(), 'assets/atlas-mark.svg');
const PAPER = '#f2efe5';
const NAVY = '#0a3554';
const BLUE = '#1b5d93';
const BRAND_LINE = 'MERCADOS · ECONOMÍA · CONTEXTO';

const ICONS = Object.freeze({
  'trend-up': '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 46 27 29l11 11 16-22"/><path d="M40 18h14v14"/></svg>',
  'cash-card': '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="16" width="46" height="32" rx="3"/><path d="M9 26h46M18 39h13"/></svg>',
  'risk-triangle': '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 10 56 52H8Z"/><path d="M32 25v13M32 45h.01"/></svg>',
  'portfolio-grid': '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="13" width="44" height="38" rx="2"/><path d="M25 13v38M39 13v38M10 31h44"/></svg>',
  'decision-check': '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="11" width="44" height="42" rx="4"/><path d="m19 33 9 9 18-21"/></svg>',
  'context-target': '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="11"/><circle cx="32" cy="32" r="2"/></svg>',
});

function escapeHtml(value = '') {
  return String(value).replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${label} contains unsupported field: ${key}`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function validateContract(raw) {
  assertPlainObject(raw, 'contract');
  const allowed = [
    'version', 'sourceCommit', 'sourceId', 'canonicalUrl', 'publishedDate', 'productType',
    'sectionLabel', 'title', 'dek', 'ideaCentral', 'ideaSupport', 'keyPoints', 'impactItems',
  ];
  assertExactKeys(raw, allowed, 'contract');

  const contract = {
    version: String(raw.version ?? '').trim(),
    sourceCommit: raw.sourceCommit ? assertString(raw.sourceCommit, 'sourceCommit') : '',
    sourceId: raw.sourceId ? assertString(raw.sourceId, 'sourceId') : '',
    canonicalUrl: assertString(raw.canonicalUrl, 'canonicalUrl'),
    publishedDate: assertString(raw.publishedDate, 'publishedDate'),
    productType: assertString(raw.productType, 'productType'),
    sectionLabel: assertString(raw.sectionLabel, 'sectionLabel'),
    title: assertString(raw.title, 'title'),
    dek: assertString(raw.dek, 'dek'),
    ideaCentral: assertString(raw.ideaCentral, 'ideaCentral'),
    ideaSupport: assertString(raw.ideaSupport, 'ideaSupport'),
    keyPoints: raw.keyPoints,
    impactItems: raw.impactItems,
  };

  if (contract.version !== '1') throw new Error(`Unsupported Social Content Contract version: ${contract.version || '<missing>'}`);
  if (!contract.sourceCommit && !contract.sourceId) throw new Error('sourceCommit or sourceId is required');
  if (contract.sourceCommit && !/^[0-9a-f]{7,40}$/i.test(contract.sourceCommit)) throw new Error('sourceCommit must be a Git commit SHA');

  let canonical;
  try { canonical = new URL(contract.canonicalUrl); } catch { throw new Error('canonicalUrl must be a valid URL'); }
  if (canonical.protocol !== 'https:') throw new Error('canonicalUrl must use https');

  const published = new Date(contract.publishedDate);
  if (Number.isNaN(published.valueOf())) throw new Error('publishedDate must be a valid date');
  if (published.valueOf() > Date.now()) throw new Error('publishedDate cannot be in the future');

  if (!Array.isArray(contract.keyPoints) || contract.keyPoints.length !== 3) throw new Error('keyPoints must contain exactly 3 items');
  contract.keyPoints = contract.keyPoints.map((item, index) => {
    assertPlainObject(item, `keyPoints[${index}]`);
    assertExactKeys(item, ['iconKey', 'text'], `keyPoints[${index}]`);
    const iconKey = assertString(item.iconKey, `keyPoints[${index}].iconKey`);
    if (!ICONS[iconKey]) throw new Error(`Unsupported iconKey: ${iconKey}`);
    return { iconKey, text: assertString(item.text, `keyPoints[${index}].text`) };
  });

  if (!Array.isArray(contract.impactItems) || contract.impactItems.length !== 3) throw new Error('impactItems must contain exactly 3 items');
  contract.impactItems = contract.impactItems.map((item, index) => {
    assertPlainObject(item, `impactItems[${index}]`);
    assertExactKeys(item, ['iconKey', 'label', 'text'], `impactItems[${index}]`);
    const iconKey = assertString(item.iconKey, `impactItems[${index}].iconKey`);
    if (!ICONS[iconKey]) throw new Error(`Unsupported iconKey: ${iconKey}`);
    return {
      iconKey,
      label: assertString(item.label, `impactItems[${index}].label`),
      text: assertString(item.text, `impactItems[${index}].text`),
    };
  });

  return contract;
}

function resolveContract(input) {
  if (!input) throw new Error('SOCIAL_CONTRACT is required');
  const normalized = input.replaceAll('\\', '/');
  if (!normalized.endsWith('.json') || normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error(`Unsafe contract path: ${input}`);
  }
  const absolute = path.resolve(ROOT, normalized);
  const relative = path.relative(ROOT, absolute).replaceAll(path.sep, '/');
  if (relative !== normalized) throw new Error(`Unsafe contract path: ${input}`);
  return { absolute, relative };
}

function dateLabel(iso) {
  const d = new Date(iso);
  const m = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  return `${String(d.getDate()).padStart(2,'0')} ${m[d.getMonth()]} ${d.getFullYear()}`;
}

async function localCanvasFont() {
  const candidates = [
    { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', family: 'DejaVu Sans' },
    { path: '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', family: 'Liberation Sans' },
  ];
  for (const candidate of candidates) {
    try { await fs.access(candidate.path); return candidate; } catch { /* next local font */ }
  }
  throw new Error('No approved runner-local font found for astro-og-canvas');
}

function baseCss(w, h) {
  return `
  *{box-sizing:border-box} html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
  body{font-family:Georgia,'Times New Roman',serif;background:${PAPER};color:${NAVY}}
  .page{position:relative;width:${w}px;height:${h}px;padding:44px 60px 36px;background:
    radial-gradient(circle at 17% 10%,rgba(255,255,255,.5),transparent 34%),
    repeating-linear-gradient(0deg,transparent 0 3px,rgba(10,53,84,.018) 3px 4px),${PAPER};overflow:hidden}
  .page:after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.08;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.18'/%3E%3C/svg%3E")}
  .header{height:150px;display:grid;grid-template-columns:1fr auto;gap:26px;align-items:start;position:relative;z-index:2}
  .brand{display:flex;align-items:flex-start;gap:18px}.mini{width:84px;height:114px;object-fit:contain;object-position:top}
  .word{font-size:82px;font-weight:700;line-height:.9;letter-spacing:-3px;border-bottom:4px double ${NAVY};padding-bottom:8px}
  .strap{margin-top:9px;font-size:16px;letter-spacing:6px;font-weight:700;white-space:nowrap}
  .date{font-size:18px;letter-spacing:6px;padding:15px 20px 18px;border-left:2px solid ${NAVY};border-bottom:2px solid ${NAVY};white-space:nowrap}
  .kicker{display:flex;align-items:center;gap:20px;margin-top:24px;font-size:24px;letter-spacing:3px;font-weight:700;color:${BLUE};text-transform:uppercase;position:relative;z-index:2}
  .kicker:after{content:'';height:2px;background:${BLUE};flex:1}
  .mark{position:absolute;object-fit:contain;z-index:1}
  .icon{width:76px;height:76px;color:${NAVY}}
  .icon svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round}
  .social-footer{position:absolute;left:60px;right:60px;bottom:30px;height:76px;border-top:5px double ${NAVY};padding-top:22px;display:flex;justify-content:space-between;align-items:flex-start;z-index:3}
  .social-footer .brandline{font-size:14px;letter-spacing:5px;font-weight:700;white-space:nowrap}
  .social-footer .counter{height:40px;min-width:96px;border-left:2px solid ${NAVY};padding-left:28px;text-align:right;font-size:21px;letter-spacing:3px;line-height:40px}
  [data-fit]{overflow-wrap:anywhere}
  `;
}

function header(mark, date) {
  return `<div class="header" data-fit><div class="brand"><img class="mini" data-fit src="${mark}"><div><div class="word">ATLAS NEWS</div><div class="strap">${BRAND_LINE}</div></div></div><div class="date">${date}</div></div>`;
}

function footer(n) {
  return `<div class="social-footer" data-fit><span class="brandline">${BRAND_LINE}</span><span class="counter">${n}/5</span></div>`;
}

function iconSvg(iconKey) {
  return `<div class="icon" data-fit>${ICONS[iconKey]}</div>`;
}

function documentHtml(inner, w, h, date, mark) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss(w,h)}</style></head><body><div class="page" id="root">${header(mark,date)}${inner}</div></body></html>`;
}

async function screenshot(page, html, file, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => {
    const root = document.getElementById('root').getBoundingClientRect();
    return [...document.querySelectorAll('[data-fit]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        target: el.textContent?.trim().slice(0,70) || el.getAttribute('class') || el.tagName,
        ok: r.left >= root.left - 1 && r.top >= root.top - 1 && r.right <= root.right + 1 && r.bottom <= root.bottom + 1,
      };
    }).filter((x) => !x.ok);
  });
  if (overflow.length) throw new Error(`Clipping/overflow: ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: file, type: 'png' });
}

function validatePng(fileName, buffer) {
  if (buffer.toString('hex',0,8) !== '89504e470d0a1a0a') throw new Error(`${fileName} is not PNG`);
  const w = buffer.readUInt32BE(16);
  const h = buffer.readUInt32BE(20);
  const expected = fileName.includes('social-card') ? [1200,630] : [1080,1350];
  if (w !== expected[0] || h !== expected[1]) throw new Error(`${fileName} dimensions ${w}x${h}`);
}

async function main() {
  if (PUBLICATION_STATUS !== REQUIRED_PUBLICATION_STATUS) {
    throw new Error(`Post-publication guard failed: expected "${REQUIRED_PUBLICATION_STATUS}"`);
  }

  const contractPath = resolveContract(CONTRACT_INPUT);
  const raw = JSON.parse(await fs.readFile(contractPath.absolute, 'utf8'));
  const contract = validateContract(raw);

  await fs.rm(OUT, { recursive:true, force:true });
  await fs.rm(TMP, { recursive:true, force:true });
  await fs.mkdir(OUT, { recursive:true });
  await fs.mkdir(TMP, { recursive:true });

  const mark = 'data:image/svg+xml;base64,' + Buffer.from(await fs.readFile(MARK_PATH, 'utf8')).toString('base64');
  const date = dateLabel(contract.publishedDate);
  const canvasFont = await localCanvasFont();
  const t0 = performance.now();
  const browser = await chromium.launch({ headless:true });
  const page = await browser.newPage();

  const cardInner = `
    <div class="kicker">${escapeHtml(contract.sectionLabel)}</div>
    <div data-fit style="position:absolute;left:60px;top:255px;width:810px;z-index:2">
      <div style="font-size:82px;line-height:.9;font-weight:700;letter-spacing:-4px">${escapeHtml(contract.title)}</div>
      <div style="font-size:42px;line-height:1.06;margin-top:18px">${escapeHtml(contract.dek)}</div>
    </div>
    <img class="mark" data-fit src="${mark}" style="right:55px;top:180px;width:320px;height:420px">
    <div style="position:absolute;left:60px;right:60px;bottom:34px;border-top:5px double ${NAVY};height:1px;z-index:2"></div>`;

  const cardPre = path.join(TMP, 'social-background.png');
  const cardStart = performance.now();
  await screenshot(page, documentHtml(cardInner,1200,630,date,mark), cardPre,1200,630);
  const cardHtmlMs = performance.now() - cardStart;

  const ogOptions = {
    title:' ', description:'', bgImage:{ path:cardPre, fit:'fill' }, padding:1,
    fonts:[canvasFont.path],
    font:{
      title:{ size:1, color:[242,239,229], families:[canvasFont.family] },
      description:{ size:1, color:[242,239,229], families:[canvasFont.family] },
    },
    cacheDir:path.join(TMP,'og-cache'),
  };
  const ogStart = performance.now();
  const og = await generateOpenGraphImage(ogOptions);
  await fs.writeFile(path.join(OUT,'atlas-news-social-card-1200x630.png'), Buffer.from(await new Response(og).arrayBuffer()));
  const ogMaterializeMs = performance.now() - ogStart;
  const ogWarmStart = performance.now();
  await generateOpenGraphImage(ogOptions);
  const ogCacheHitMs = performance.now() - ogWarmStart;

  const slide1 = `
    <div class="kicker">${escapeHtml(contract.sectionLabel)}</div>
    <div data-fit style="position:absolute;left:60px;top:340px;width:900px;z-index:2">
      <div style="font-size:132px;line-height:.86;font-weight:700;letter-spacing:-6px;width:850px">${escapeHtml(contract.title)}</div>
      <div style="font-size:60px;line-height:1.02;margin-top:34px;width:600px">${escapeHtml(contract.dek)}</div>
    </div>
    <img class="mark" data-fit src="${mark}" style="right:55px;bottom:138px;width:425px;height:600px">
    ${footer(1)}`;

  const slide2 = `
    <div class="kicker">IDEA CENTRAL</div>
    <div data-fit style="position:absolute;left:60px;top:340px;width:890px;z-index:2">
      <div style="font-size:84px;line-height:.9;font-weight:700;letter-spacing:-3px">${escapeHtml(contract.ideaCentral)}</div>
      <div style="font-size:43px;line-height:1.12;margin-top:50px;width:770px">${escapeHtml(contract.ideaSupport)}</div>
    </div>
    <img class="mark" data-fit src="${mark}" style="right:55px;bottom:145px;width:275px;height:405px">
    ${footer(2)}`;

  const point = (item) => `
    <div style="display:grid;grid-template-columns:105px 1fr;gap:34px;align-items:center;margin:46px 0">
      ${iconSvg(item.iconKey)}
      <div style="font-size:46px;line-height:1.04">${escapeHtml(item.text)}</div>
    </div>`;
  const slide3 = `
    <div class="kicker">QUÉ CAMBIÓ</div>
    <div data-fit style="position:absolute;left:60px;right:60px;top:335px;z-index:2">
      <div style="font-size:112px;line-height:.88;font-weight:700;letter-spacing:-5px">Qué cambió</div>
      ${contract.keyPoints.map(point).join('')}
    </div>
    ${footer(3)}`;

  const impact = (item) => `
    <div style="display:grid;grid-template-columns:100px 1fr;gap:30px;align-items:start;margin:40px 0">
      ${iconSvg(item.iconKey)}
      <div style="font-size:41px;line-height:1.05"><b>${escapeHtml(item.label)}:</b><br>${escapeHtml(item.text)}</div>
    </div>`;
  const slide4 = `
    <div class="kicker">POR QUÉ IMPORTA</div>
    <div data-fit style="position:absolute;left:60px;right:60px;top:335px;z-index:2">
      <div style="font-size:108px;line-height:.88;font-weight:700;letter-spacing:-5px">Por qué importa</div>
      ${contract.impactItems.map(impact).join('')}
    </div>
    ${footer(4)}`;

  const slide5 = `
    <div class="kicker">${escapeHtml(contract.sectionLabel)}</div>
    <div data-fit style="position:absolute;left:60px;top:350px;width:680px;z-index:2">
      <div style="font-size:108px;line-height:.89;font-weight:700;letter-spacing:-5px">Lee la nota completa</div>
      <div style="font-size:44px;line-height:1.08;margin-top:42px">Profundiza en la nota completa en Atlas News.</div>
      <div style="width:52px;border-top:2px solid ${NAVY};margin:36px 0"></div>
      <div style="font-size:28px;line-height:1.1;width:560px">${escapeHtml(contract.title)}</div>
      <div style="display:inline-block;margin-top:38px;padding:19px 28px;border-radius:35px;background:${NAVY};color:white;font-size:23px">Disponible en Atlas News →</div>
    </div>
    <img class="mark" data-fit src="${mark}" style="right:45px;bottom:145px;width:390px;height:570px">
    ${footer(5)}`;

  const slides = [slide1,slide2,slide3,slide4,slide5];
  const carouselStart = performance.now();
  for (let i=0; i<slides.length; i++) {
    await screenshot(page, documentHtml(slides[i],1080,1350,date,mark), path.join(OUT,`atlas-news-instagram-carousel-0${i+1}.png`),1080,1350);
  }
  const carouselRenderMs = performance.now() - carouselStart;
  await browser.close();

  const files = (await fs.readdir(OUT)).sort();
  if (files.length !== 6) throw new Error(`Expected 6 PNGs before benchmark, got ${files.length}`);
  for (const file of files) validatePng(file, await fs.readFile(path.join(OUT,file)));

  const metrics = {
    contractVersion:contract.version,
    contractPath:contractPath.relative,
    sourceCommit:contract.sourceCommit || null,
    sourceId:contract.sourceId || null,
    canonicalUrl:contract.canonicalUrl,
    publicationStatus:PUBLICATION_STATUS,
    productType:contract.productType,
    title:contract.title,
    cardHtmlMs:Math.round(cardHtmlMs),
    ogMaterializeMs:Math.round(ogMaterializeMs),
    ogCacheHitMs:Math.round(ogCacheHitMs),
    carouselRenderMs:Math.round(carouselRenderMs),
    totalRendererMs:Math.round(performance.now()-t0),
    githubRunId:process.env.GITHUB_RUN_ID || null,
    outputs:files,
  };
  await fs.writeFile(path.join(OUT,'benchmark.json'), JSON.stringify(metrics,null,2));
  console.log(JSON.stringify(metrics,null,2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
