import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { generateOpenGraphImage } from 'astro-og-canvas';

const ROOT = path.resolve(process.cwd(), '../..');
const OUT = path.resolve(process.cwd(), 'output');
const TMP = path.resolve(process.cwd(), '.tmp');
const SOURCE = path.join(ROOT, 'src/content/readings/2026-09-04-reading-activo-seguro-riesgo.md');
const MARK = 'data:image/svg+xml;base64,' + Buffer.from(await fs.readFile(path.resolve(process.cwd(), 'assets/atlas-mark.svg'), 'utf8')).toString('base64');
const PAPER = '#f2efe5';
const NAVY = '#0a3554';
const BLUE = '#1b5d93';

function escapeHtml(value='') { return value.replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c])); }
function frontmatter(md) {
  const head = md.match(/^---\n([\s\S]*?)\n---/m)?.[1] || '';
  const read = (key) => head.match(new RegExp('^'+key+':\\s*[\"\\\']?(.+?)[\"\\\']?\\s*$','m'))?.[1]?.replace(/^['\"]|['\"]$/g,'') || '';
  return { title: read('title'), summary: read('summary'), publishedAt: read('publishedAt') };
}
function splitTitle(title) {
  const [main, ...rest] = title.split(':');
  return { main: main.trim(), sub: rest.join(':').trim() };
}
function dateLabel(iso) {
  const d = new Date(iso);
  const m = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  return `${String(d.getDate()).padStart(2,'0')} ${m[d.getMonth()]} ${d.getFullYear()}`;
}
function baseCss(w,h) { return `
  *{box-sizing:border-box} html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden} body{font-family:Georgia,'Times New Roman',serif;background:${PAPER};color:${NAVY}}
  .page{position:relative;width:${w}px;height:${h}px;padding:44px 60px 36px;background:
    radial-gradient(circle at 17% 10%,rgba(255,255,255,.5),transparent 34%),
    repeating-linear-gradient(0deg,transparent 0 3px,rgba(10,53,84,.018) 3px 4px),${PAPER};overflow:hidden}
  .page:after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.08;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.18'/%3E%3C/svg%3E")}
  .header{height:150px;display:grid;grid-template-columns:1fr auto;gap:26px;align-items:start;position:relative;z-index:1}
  .brand{display:flex;align-items:flex-start;gap:18px}.mini{width:84px;height:114px;object-fit:contain;object-position:top}.word{font-size:82px;font-weight:700;line-height:.9;letter-spacing:-3px;border-bottom:4px double ${NAVY};padding-bottom:8px}.strap{margin-top:9px;font-size:16px;letter-spacing:6px;font-weight:700;white-space:nowrap}
  .date{font-size:18px;letter-spacing:6px;padding:15px 20px 18px;border-left:2px solid ${NAVY};border-bottom:2px solid ${NAVY};white-space:nowrap}
  .kicker{display:flex;align-items:center;gap:20px;margin-top:24px;font-size:24px;letter-spacing:3px;font-weight:700;color:${BLUE};text-transform:uppercase}.kicker:after{content:'';height:2px;background:${BLUE};flex:1}
  .mark{position:absolute;object-fit:contain;z-index:1}.rule{position:absolute;left:60px;right:60px;bottom:34px;border-top:5px double ${NAVY};height:1px;z-index:1}
  .footer{position:absolute;left:60px;right:60px;bottom:22px;display:flex;justify-content:space-between;align-items:center;font-size:13px;letter-spacing:4px;z-index:2}.counter{font-size:21px;letter-spacing:2px;border-left:2px solid ${NAVY};padding-left:28px}
  `; }
function header() { return `<div class="header"><div class="brand"><img class="mini" src="${MARK}"><div><div class="word">ATLAS NEWS</div><div class="strap">MERCADOS · ECONOMÍA · CONTEXTO</div></div></div><div class="date">__DATE__</div></div>`; }
function documentHtml(inner,w,h,date){ return `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss(w,h)}</style></head><body><div class="page" id="root">${header().replace('__DATE__',date)}${inner}</div></body></html>`; }

async function screenshot(page, html, file, w,h) {
  await page.setViewportSize({ width:w, height:h });
  await page.setContent(html, { waitUntil:'load' });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => {
    const root=document.getElementById('root').getBoundingClientRect();
    return [...document.querySelectorAll('[data-fit]')].map(el=>{const r=el.getBoundingClientRect();return {t:el.textContent?.trim().slice(0,70),ok:r.left>=root.left-1&&r.top>=root.top-1&&r.right<=root.right+1&&r.bottom<=root.bottom+1};}).filter(x=>!x.ok);
  });
  if (overflow.length) throw new Error('Clipping/overflow: '+JSON.stringify(overflow));
  await page.screenshot({path:file,type:'png'});
}

async function main(){
  await fs.rm(OUT,{recursive:true,force:true}); await fs.rm(TMP,{recursive:true,force:true}); await fs.mkdir(OUT,{recursive:true}); await fs.mkdir(TMP,{recursive:true});
  const t0=performance.now(); const md=await fs.readFile(SOURCE,'utf8'); const meta=frontmatter(md); const {main,sub}=splitTitle(meta.title); const date=dateLabel(meta.publishedAt);
  if(!main||!sub) throw new Error('Real reading metadata was not parsed');
  const browser=await chromium.launch({headless:true}); const page=await browser.newPage();

  const cardInner=`<div class="kicker">LECTURA DEL DÍA</div><div data-fit style="position:absolute;left:60px;top:255px;width:820px;z-index:2"><div style="font-size:82px;line-height:.9;font-weight:700;letter-spacing:-4px">${escapeHtml(main)}</div><div style="font-size:42px;line-height:1.06;margin-top:18px">${escapeHtml(sub)}</div></div><img class="mark" src="${MARK}" style="right:55px;top:175px;width:350px;height:470px"><div class="rule"></div>`;
  const cardPre=path.join(TMP,'social-background.png'); const tc=performance.now(); await screenshot(page,documentHtml(cardInner,1200,630,date),cardPre,1200,630); const cardHtmlMs=performance.now()-tc;
  const to=performance.now();
  const og=await generateOpenGraphImage({title:' ',description:'',bgImage:{path:cardPre,fit:'fill'},padding:1,font:{title:{size:1,color:[242,239,229]},description:{size:1,color:[242,239,229]}},cacheDir:path.join(TMP,'og-cache')});
  await fs.writeFile(path.join(OUT,'atlas-news-social-card-1200x630.png'),Buffer.from(await new Response(og).arrayBuffer())); const ogMs=performance.now()-to;
  const tow=performance.now(); await generateOpenGraphImage({title:' ',description:'',bgImage:{path:cardPre,fit:'fill'},padding:1,font:{title:{size:1,color:[242,239,229]},description:{size:1,color:[242,239,229]}},cacheDir:path.join(TMP,'og-cache')}); const ogCacheHitMs=performance.now()-tow;

  const slide1=`<div class="kicker">LECTURA DEL DÍA</div><div data-fit style="position:absolute;left:60px;top:340px;width:900px;z-index:2"><div style="font-size:132px;line-height:.86;font-weight:700;letter-spacing:-6px;width:850px">${escapeHtml(main)}</div><div style="font-size:60px;line-height:1.02;margin-top:34px;width:570px">${escapeHtml(sub)}</div></div><img class="mark" src="${MARK}" style="right:55px;bottom:125px;width:425px;height:620px"><div class="rule"></div><div class="footer"><span>MERCADOS · ECONOMÍA · CONTEXTO</span><span class="counter">1/5</span></div>`;
  const slide2=`<div class="kicker">IDEA CENTRAL</div><div data-fit style="position:absolute;left:60px;top:340px;width:890px;z-index:2"><div style="font-size:84px;line-height:.9;font-weight:700;letter-spacing:-3px">Si el activo seguro vuelve a pagar, el riesgo ya no puede justificarse solo por falta de alternativas.</div><div style="font-size:43px;line-height:1.12;margin-top:50px;width:770px">Cuando los retornos libres de riesgo mejoran, la exigencia para invertir en activos más volátiles también sube.</div></div><img class="mark" src="${MARK}" style="right:55px;bottom:110px;width:275px;height:405px"><div class="rule"></div><div class="footer"><span>LECTURA DEL DÍA</span><span class="counter">2/5</span></div>`;
  const item=(icon,text)=>`<div style="display:grid;grid-template-columns:105px 1fr;gap:34px;align-items:center;margin:50px 0"><div style="font:700 64px/1 Arial;color:${NAVY};text-align:center">${icon}</div><div style="font-size:46px;line-height:1.04">${text}</div></div>`;
  const slide3=`<div class="kicker">LECTURA DEL DÍA</div><div data-fit style="position:absolute;left:60px;right:60px;top:325px;z-index:2"><div style="font-size:112px;line-height:.88;font-weight:700;letter-spacing:-5px">Qué cambió</div>${item('↗','Tasas más altas elevan el piso de retorno.')}${item('◫','El cash y la renta fija vuelven a competir.')}${item('△','La prima exigida para asumir riesgo aumenta.')}</div><div class="rule"></div><div class="footer"><span></span><span class="counter">3/5</span></div>`;
  const imp=(icon,lead,text)=>`<div style="display:grid;grid-template-columns:100px 1fr;gap:30px;align-items:start;margin:42px 0"><div style="font:700 62px/1 Arial;text-align:center">${icon}</div><div style="font-size:41px;line-height:1.05"><b>${lead}</b><br>${text}</div></div>`;
  const slide4=`<div class="kicker">LECTURA DEL DÍA</div><div data-fit style="position:absolute;left:60px;right:60px;top:325px;z-index:2"><div style="font-size:108px;line-height:.88;font-weight:700;letter-spacing:-5px">Por qué importa</div>${imp('▥','Carteras:','obliga a revisar el balance entre seguridad y riesgo.')}${imp('☑','Decisiones:','subir el estándar para entrar a activos más inciertos.')}${imp('◎','Contexto:','entender mejor cuándo el premio compensa el riesgo.')}</div><div class="rule"></div><div class="footer"><span>Atlas News · contexto para mejores decisiones</span><span class="counter">4/5</span></div>`;
  const slide5=`<div class="kicker">LECTURA DEL DÍA</div><div data-fit style="position:absolute;left:60px;top:350px;width:680px;z-index:2"><div style="font-size:108px;line-height:.89;font-weight:700;letter-spacing:-5px">Lee la lectura completa</div><div style="font-size:44px;line-height:1.08;margin-top:42px">Profundiza en la nota completa en Atlas News.</div><div style="width:52px;border-top:2px solid ${NAVY};margin:36px 0"></div><div style="font-size:28px;line-height:1.1;width:540px">${escapeHtml(meta.title)}</div><div style="display:inline-block;margin-top:38px;padding:19px 28px;border-radius:35px;background:${NAVY};color:white;font-size:23px">Disponible en Atlas News →</div></div><img class="mark" src="${MARK}" style="right:45px;bottom:130px;width:390px;height:570px"><div class="rule"></div><div class="footer"><span>MERCADOS · ECONOMÍA · CONTEXTO</span><span class="counter">5/5</span></div>`;
  const slides=[slide1,slide2,slide3,slide4,slide5]; const ts=performance.now(); for(let i=0;i<slides.length;i++) await screenshot(page,documentHtml(slides[i],1080,1350,date),path.join(OUT,`atlas-news-instagram-carousel-0${i+1}.png`),1080,1350); const carouselMs=performance.now()-ts;
  await browser.close();
  const files=await fs.readdir(OUT); if(files.length!==6) throw new Error(`Expected 6 PNGs, got ${files.length}`);
  for(const f of files){const b=await fs.readFile(path.join(OUT,f)); if(b.toString('hex',0,8)!=='89504e470d0a1a0a') throw new Error(`${f} is not PNG`); const w=b.readUInt32BE(16),h=b.readUInt32BE(20); const expected=f.includes('social-card')?[1200,630]:[1080,1350]; if(w!==expected[0]||h!==expected[1]) throw new Error(`${f} dimensions ${w}x${h}`);}
  const metrics={source:path.relative(ROOT,SOURCE),title:meta.title,cardHtmlMs:Math.round(cardHtmlMs),ogMaterializeMs:Math.round(ogMs),ogCacheHitMs:Math.round(ogCacheHitMs),carouselRenderMs:Math.round(carouselMs),totalRendererMs:Math.round(performance.now()-t0),outputs:files.sort()};
  await fs.writeFile(path.join(OUT,'benchmark.json'),JSON.stringify(metrics,null,2)); console.log(JSON.stringify(metrics,null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
