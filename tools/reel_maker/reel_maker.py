#!/usr/bin/env python3
"""ATLAS NEWS Reel Maker V2 — official templates, 5 highlights, MP4 + deterministic theme."""
from __future__ import annotations

import argparse, hashlib, json, re, shutil, subprocess, tempfile, unicodedata, urllib.parse, urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont, ImageOps

ROOT = Path.cwd().resolve()
W, H, FPS = 1080, 1920, 30
SAFE_AREA_SCALE = 0.92
SAFE_AREA_W, SAFE_AREA_H = 994, 1766
SAFE_AREA_BG = "0xF4F0E8"
DURATIONS = (5.0, 6.0, 6.0, 6.0, 6.0, 6.0, 5.0)
TEMPLATES = ROOT / "reference-assets"
COVER = TEMPLATES / "01_portada_base.png"
NEWS = TEMPLATES / "02_noticia_base.png"
CLOSE = TEMPLATES / "03_cierre_base.png"
CATALOG = ROOT / "src/lib/front-page-visuals.ts"
AUDIO_ROTATION_VERSION = "audio-rotation-v1"
MUSIC_TRACKS = (
    "primary_assessment.mp3",
    "architect_of_momentum.mp3",
    "market_intelligence.mp3",
    "midnight_exchange.mp3",
    "the_morning_brief.mp3",
)
FALLBACK_MUSIC = TEMPLATES / MUSIC_TRACKS[0]
INK, RED = (17,17,17,255), (198,26,35,255)
MONTHS = ["", "ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEPT","OCT","NOV","DIC"]


def run(cmd:list[str]) -> None:
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def ffprobe(path:Path) -> dict:
    return json.loads(subprocess.check_output([
        "ffprobe","-v","error","-show_entries",
        "stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,bit_rate:format=duration",
        "-of","json",str(path)], text=True))


def audio_duration(path:Path) -> float:
    value=subprocess.check_output([
        "ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=nw=1:nk=1",str(path)],text=True).strip()
    duration=float(value)
    if duration<=0: raise ValueError(f"Duración de audio inválida: {path}")
    return duration


def sha256_file(path:Path) -> str:
    digest=hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024*1024), b""): digest.update(chunk)
    return digest.hexdigest()


def rotation_track_name(edition:int) -> str:
    return MUSIC_TRACKS[(edition-41)%len(MUSIC_TRACKS)]


def resolve_music(edition:int, override:str|None=None) -> tuple[Path,dict]:
    selected=Path(override).expanduser().resolve() if override else TEMPLATES/rotation_track_name(edition)
    selector="manual-override" if override else AUDIO_ROTATION_VERSION
    resolved=selected; fallback=False
    try:
        if not selected.is_file(): raise FileNotFoundError(selected)
        duration=audio_duration(selected)
    except Exception as exc:
        if selected==FALLBACK_MUSIC:
            raise RuntimeError(f"Audio fallback inválido: {selected}") from exc
        resolved=FALLBACK_MUSIC; fallback=True
        if not resolved.is_file(): raise FileNotFoundError(f"Audio fallback faltante: {resolved}") from exc
        try: duration=audio_duration(resolved)
        except Exception as fallback_exc: raise RuntimeError(f"Audio fallback inválido: {resolved}") from fallback_exc
    return resolved,{
        "selectorVersion":selector,
        "selectedTrack":selected.name,
        "resolvedTrack":resolved.name,
        "trackSha256":sha256_file(resolved),
        "selectionEdition":edition,
        "fallbackUsed":fallback,
        "sourceDuration":round(duration,3),
        "crossfadeSeconds":0.9,
        "outputCodec":"aac",
    }


def font(size:int, bold:bool=False):
    pattern = "Liberation Serif:style=Bold" if bold else "Liberation Serif:style=Regular"
    try:
        p = subprocess.check_output(["fc-match","-f","%{file}",pattern], text=True).strip()
    except Exception:
        p = ""
    if not p or not Path(p).is_file():
        p = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
    return ImageFont.truetype(p, size=size)


def open_template(path:Path):
    if not path.is_file(): raise FileNotFoundError(f"Plantilla faltante: {path}")
    with Image.open(path) as im: rgba = im.convert("RGBA")
    return ImageOps.fit(rgba, (W,H), method=Image.Resampling.LANCZOS)


def spaced(draw, xy, text, fnt, fill, gap:int):
    x,y = xy
    for ch in text:
        draw.text((x,y), ch, font=fnt, fill=fill)
        b = draw.textbbox((0,0), ch, font=fnt); x += b[2]-b[0]+gap


def width(draw, text, fnt):
    b=draw.textbbox((0,0), text, font=fnt); return b[2]-b[0]


def wrap(draw, text, fnt, maxw):
    lines=[]; cur=""
    for word in " ".join(str(text).split()).split():
        cand = word if not cur else f"{cur} {word}"
        if width(draw,cand,fnt) <= maxw: cur=cand
        else:
            if cur: lines.append(cur)
            cur=word
    if cur: lines.append(cur)
    return lines


def fit(draw, text, maxw, maxlines, base, minimum, bold):
    for size in range(base, minimum-1, -2):
        fnt=font(size,bold); lines=wrap(draw,text,fnt,maxw)
        if 0 < len(lines) <= maxlines: return fnt,lines
    raise ValueError(f"Texto no cabe: {text}")


def draw_lines(draw, lines, xy, fnt, fill, gap=1.05):
    x,y=xy; asc,des=fnt.getmetrics(); lh=int((asc+des)*gap); maxw=0
    for i,line in enumerate(lines):
        draw.text((x,y+i*lh), line, font=fnt, fill=fill)
        maxw=max(maxw,width(draw,line,fnt))
    return (x,y,x+maxw,y+(len(lines)-1)*lh+asc+des)


def date_label(iso):
    d=date.fromisoformat(iso[:10]); return f"{d.day:02d} {MONTHS[d.month]} {d.year}"


def photo_overlay(canvas, path:Path|None):
    if not path or not path.is_file(): return
    with Image.open(path) as im: pic=im.convert("RGB")
    pic=ImageOps.fit(pic,(780,1240),method=Image.Resampling.LANCZOS)
    pic=ImageEnhance.Color(pic).enhance(.30); pic=ImageEnhance.Contrast(pic).enhance(.90)
    pic=pic.convert("RGBA"); w,h=pic.size
    xmask=Image.new("L",(w,1)); xmask.putdata([int(205*max(0,min(1,(x/(w-1)-.08)/.52))) for x in range(w)]); xmask=xmask.resize((w,h))
    ymask=Image.new("L",(1,h)); ymask.putdata([int(255*min(1,(y/(h-1))/.10,(1-y/(h-1))/.14)) for y in range(h)]); ymask=ymask.resize((w,h))
    canvas.paste(pic,(300,410),ImageChops.multiply(xmask,ymask))


@dataclass
class Contract:
    source_commit:str; source_id:str; canonical_url:str; published_date:str; edition:int; highlights:list[dict]


def load_contract(path:Path) -> Contract:
    r=json.loads(path.read_text(encoding="utf-8")); hs=r.get("highlights")
    if str(r.get("version"))!="2" or not isinstance(hs,list) or len(hs)!=5: raise ValueError("Contrato Reel requiere version 2 y 5 highlights")
    ed=int(r.get("editionNumber",0));
    if ed<1: raise ValueError("editionNumber inválido")
    for i,x in enumerate(hs):
        if not str(x.get("label","")).strip() or not str(x.get("text","")).strip(): raise ValueError(f"highlight {i+1} vacío")
    return Contract(str(r["sourceCommit"]),str(r.get("sourceId","")),str(r["canonicalUrl"]),str(r["publishedDate"]),ed,hs)


def render_scene(index:int, c:Contract, out:Path, image:Path|None=None):
    ed=f"{c.edition:03d}"; d=date_label(c.published_date)
    if index==1:
        canvas=open_template(COVER); draw=ImageDraw.Draw(canvas)
        draw.text((188,55),ed,font=font(29,True),fill=RED); draw.text((286,56),"•",font=font(25,True),fill=INK); spaced(draw,(326,55),d,font(25,True),INK,4)
    elif index==7:
        canvas=open_template(CLOSE); draw=ImageDraw.Draw(canvas)
        draw.text((388,1094),ed,font=font(38,True),fill=RED); spaced(draw,(584,1096),d,font(34,True),INK,5)
    else:
        item=c.highlights[index-2]; canvas=open_template(NEWS); photo_overlay(canvas,image); draw=ImageDraw.Draw(canvas)
        draw.text((132,598),f"{index-1:02d}",font=font(172),fill=RED)
        tf,tl=fit(draw,item["label"],920,3,78,52,True); tb=draw_lines(draw,tl,(70,830),tf,INK,1.02)
        by=tb[3]+62; bf,bl=fit(draw,item["text"],920,6,56,38,False); bb=draw_lines(draw,bl,(70,by),bf,INK,1.10)
        if bb[3]>1695: raise ValueError(f"Escena {index}: texto fuera de área")
        draw.text((399,1768),ed,font=font(38,True),fill=RED); spaced(draw,(586,1771),d,font(34,True),INK,5)
    canvas.convert("RGB").save(out,"PNG",optimize=True)


def norm(s): return unicodedata.normalize("NFD",s).encode("ascii","ignore").decode().lower()

def qstrings(s): return re.findall(r'"((?:\\.|[^"\\])*)"',s)

def visual_catalog():
    if not CATALOG.is_file(): return []
    s=CATALOG.read_text(encoding="utf-8"); keys={}
    for m in re.finditer(r"const\s+([A-Z0-9_]+_KEYWORDS)\s*=\s*\[(.*?)\];",s,re.S): keys[m.group(1)]=qstrings(m.group(2))
    out=[]
    for m in re.finditer(r"const\s+\w+\s*=\s*commonsVisual\(\{(.*?)\}\);",s,re.S):
        b=m.group(1); fm=re.search(r'file:\s*"((?:\\.|[^"\\])*)"',b); km=re.search(r"keywords:\s*([A-Z0-9_]+_KEYWORDS)",b)
        if fm and km: out.append((fm.group(1),keys.get(km.group(1),[]),bool(re.search(r"fallback:\s*true",b))))
    for m in re.finditer(r"const\s+\w+\s*=\s*catalogBatch\(\s*\[(.*?)\]\s*,\s*\"(?:\\.|[^\"\\])*\"\s*,\s*([A-Z0-9_]+_KEYWORDS)",s,re.S):
        for f in qstrings(m.group(1)): out.append((f,keys.get(m.group(2),[]),False))
    seen=set(); return [x for x in out if not (x[0] in seen or seen.add(x[0]))]


def download_visuals(c:Contract, folder:Path):
    cat=visual_catalog(); paths=[None]; manifest=[]; used=set(); folder.mkdir(parents=True,exist_ok=True)
    for n,item in enumerate(c.highlights,1):
        hay=norm(item["label"]+" "+item["text"]); avail=[x for x in cat if x[0] not in used] or cat
        scored=sorted(avail,key=lambda x:(-sum(norm(k) in hay for k in x[1]),x[0])); candidates=scored[:4]
        path=None; chosen=None
        for file,_,_ in candidates:
            url="https://commons.wikimedia.org/wiki/Special:FilePath/"+urllib.parse.quote(file,safe="")+"?width=1280"
            try:
                req=urllib.request.Request(url,headers={"User-Agent":"ATLAS-NEWS-Reel-Maker/2.0","Accept":"image/*"})
                with urllib.request.urlopen(req,timeout=5) as res: data=res.read(); ct=res.headers.get("Content-Type","")
                if len(data)<4096 or "image" not in ct.lower(): continue
                path=folder/f"scene-{n+1:02d}.img"; path.write_bytes(data); chosen=(file,url); used.add(file); break
            except Exception: pass
        paths.append(path); manifest.append({"scene":n+1,"highlight":item["label"],"file":chosen[0] if chosen else "","src":chosen[1] if chosen else "","status":"downloaded" if path else "fallback-template-only"})
    paths.append(None); return paths,manifest


def animate(png:Path, clip:Path, seconds:float, fade_in:bool=True):
    fade=min(.20,seconds/4)
    vf=(f"fade=t=in:st=0:d={fade:.3f}," if fade_in else "") + f"fade=t=out:st={seconds-fade:.3f}:d={fade:.3f},format=yuv420p"
    run(["ffmpeg","-y","-hide_banner","-loglevel","error","-loop","1","-i",str(png),"-t",f"{seconds:.3f}","-vf",vf,"-r",str(FPS),"-an","-c:v","libx264","-preset","ultrafast","-crf","18",str(clip)])


def music_bed(src:Path, dst:Path, total:float):
    dur=audio_duration(src); cross=.9
    repeats=1; effective=dur
    while effective<total+.25: repeats+=1; effective+=dur-cross
    cmd=["ffmpeg","-y","-hide_banner","-loglevel","error"]; [cmd.extend(["-i",str(src)]) for _ in range(repeats)]
    filters=[f"[{i}:a]aresample=48000,volume=0.84,asetpts=N/SR/TB[a{i}]" for i in range(repeats)]; cur="a0"
    for i in range(1,repeats): filters.append(f"[{cur}][a{i}]acrossfade=d={cross}:c1=tri:c2=tri[x{i}]"); cur=f"x{i}"
    filters.append(f"[{cur}]atrim=0:{total},afade=t=in:st=0:d=0.35,afade=t=out:st={max(0,total-1.4)}:d=1.4[aout]")
    run(cmd+["-filter_complex",";".join(filters),"-map","[aout]","-c:a","aac","-b:a","192k",str(dst)])


def main():
    ap=argparse.ArgumentParser(); ap.add_argument("contract"); ap.add_argument("--output-dir",default="tools/reel_maker/output"); ap.add_argument("--keep-plates",action="store_true"); ap.add_argument("--duration",type=float,default=None); ap.add_argument("--music",default=None); args=ap.parse_args()
    for tool in ("ffmpeg","ffprobe","fc-match"):
        if not shutil.which(tool): raise RuntimeError(f"Falta {tool}")
    c=load_contract(Path(args.contract)); music,audio_meta=resolve_music(c.edition,args.music); out=Path(args.output_dir); out.mkdir(parents=True,exist_ok=True); durations=[args.duration]*7 if args.duration else list(DURATIONS); total=sum(durations)
    with tempfile.TemporaryDirectory(prefix="atlas-reel-") as td:
        t=Path(td); pngdir=t/"png"; clipdir=t/"clips"; pngdir.mkdir(); clipdir.mkdir(); images,manifest=download_visuals(c,t/"images")
        metas=[]
        for i in range(1,8):
            png=pngdir/f"scene-{i:02d}.png"; clip=clipdir/f"scene-{i:02d}.mp4"; render_scene(i,c,png,images[i-1]); animate(png,clip,durations[i-1],fade_in=(i != 1)); metas.append({"scene":i,"status":"PASS","animated":{"status":"PASS","fadeIn":i != 1},"duration":durations[i-1]})
        concat=t/"concat.txt"; concat.write_text("".join(f"file '{p.as_posix()}'\n" for p in sorted(clipdir.glob("*.mp4"))),encoding="utf-8"); silent=t/"silent.mp4"
        run(["ffmpeg","-y","-hide_banner","-loglevel","error","-f","concat","-safe","0","-i",str(concat),"-c","copy",str(silent)])
        bed=t/"bed.m4a"; music_bed(music,bed,total); composed=t/"composed.mp4"; final=out/f"atlas-news-reel-{c.source_commit}.mp4"
        run(["ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(silent),"-i",str(bed),"-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","192k","-shortest","-movflags","+faststart",str(composed)])
        run(["ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(composed),"-vf",f"scale={SAFE_AREA_W}:{SAFE_AREA_H}:flags=lanczos,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color={SAFE_AREA_BG}","-map","0:v:0","-map","0:a:0","-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p","-r",str(FPS),"-c:a","copy","-movflags","+faststart",str(final)])
        probe=ffprobe(final); v=next(x for x in probe["streams"] if x["codec_type"]=="video"); a=next((x for x in probe["streams"] if x["codec_type"]=="audio"),None); actual=float(probe["format"]["duration"])
        ok=v.get("codec_name")=="h264" and v.get("width")==W and v.get("height")==H and v.get("pix_fmt")=="yuv420p" and v.get("r_frame_rate")=="30/1" and a and a.get("codec_name")=="aac" and abs(actual-total)<.6
        if not ok: raise RuntimeError("Validación técnica MP4 fallida")
        report={"sourceCommit":c.source_commit,"editionNumber":c.edition,"publishedDate":c.published_date,"scenes":metas,"sceneDurations":durations,"expectedDuration":total,"video":{"codec":"h264","width":str(W),"height":str(H),"pix_fmt":"yuv420p","r_frame_rate":"30/1","audio_codec":"aac","duration":f"{actual:.3f}"},"layout":{"safeAreaScale":SAFE_AREA_SCALE,"safeAreaWidth":SAFE_AREA_W,"safeAreaHeight":SAFE_AREA_H,"safeAreaBackground":"#F4F0E8","highlightNumberFormat":"02d","firstSceneFadeIn":False},"audio":audio_meta,"visualSources":manifest,"status":"PASS"}
        (out/"visual-validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8"); (out/"visual-sources.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        if args.keep_plates:
            plates=out/f"atlas-news-plates-{c.source_commit}"; plates.mkdir(parents=True,exist_ok=True)
            for p in pngdir.glob("*.png"): shutil.copy2(p,plates/p.name)
        print(final)

if __name__=="__main__": main()