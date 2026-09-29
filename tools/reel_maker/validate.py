from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from model import CREAM_RGB, CONTENT_BOTTOM, FPS, H, SAFE_L, SAFE_R, SAFE_TOP, W


def run(cmd: list[str], quiet: bool = False) -> None:
    subprocess.run(
        cmd,
        check=True,
        text=True,
        stdout=subprocess.DEVNULL if quiet else None,
        stderr=subprocess.PIPE if quiet else None,
    )


def require_tools() -> None:
    for name in ("ffmpeg", "ffprobe"):
        if shutil.which(name) is None:
            raise RuntimeError(f"No se encontró {name} en PATH")


def raw_svg(svg: Path) -> bytes:
    return subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(svg),
        "-frames:v", "1", "-vf", f"scale={W}:{H}", "-f", "rawvideo",
        "-pix_fmt", "rgb24", "pipe:1",
    ])


def bbox(
    rgb: bytes,
    base: tuple[int, int, int] = CREAM_RGB,
    threshold: int = 18,
    y0: int = 0,
    y1: int = H,
) -> tuple[int, int, int, int] | None:
    if len(rgb) != W * H * 3:
        raise RuntimeError("Validación visual: rawvideo inesperado")
    br, bg, bb = base
    min_x, min_y, max_x, max_y = W, H, -1, -1
    stride = W * 3
    for y in range(max(0, y0), min(H, y1)):
        row = y * stride
        for x in range(W):
            offset = row + x * 3
            r, g, b = rgb[offset], rgb[offset + 1], rgb[offset + 2]
            if abs(r - br) + abs(g - bg) + abs(b - bb) >= threshold:
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)
    if max_x < 0:
        return None
    return min_x, min_y, max_x, max_y


def validate_static(svg: Path, meta: dict[str, Any]) -> dict[str, Any]:
    rgb = raw_svg(svg)
    result: dict[str, Any] = {}
    for key in ("title", "body"):
        band = meta[key]
        box = bbox(
            rgb,
            y0=max(SAFE_TOP + 180, int(band["top"] - 20)),
            y1=min(CONTENT_BOTTOM + 20, int(band["bottom"] + 24)),
        )
        if box is None:
            raise ValueError(f"Escena {meta['scene']} {key}: sin píxeles visibles")
        if box[0] < SAFE_L - 2 or box[2] > W - SAFE_R + 2 or box[3] > CONTENT_BOTTOM + 4:
            raise ValueError(f"Escena {meta['scene']} {key}: fuera del área segura; bbox={box}")
        result[f"{key}BBox"] = box
    result.update({
        "scene": meta["scene"],
        "titleSize": meta["title"]["size"],
        "bodySize": meta["body"]["size"],
        "titleLines": len(meta["title"]["lines"]),
        "bodyLines": len(meta["body"]["lines"]),
        "status": "PASS",
    })
    return result


def render_svg(svg: Path, png: Path) -> None:
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(svg),
        "-frames:v", "1", "-vf", f"scale={W}:{H}", "-pix_fmt", "rgba", str(png),
    ], True)


def animate(png: Path, clip: Path, duration: float) -> None:
    frames = round(duration * FPS)
    fade = min(0.20, duration / 4)
    vf = (
        f"zoompan=z='min(zoom+0.00045,1.035)':x='iw/2-(iw/zoom/2)':"
        f"y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},"
        f"fade=t=in:st=0:d={fade:.3f},"
        f"fade=t=out:st={max(0, duration - fade):.3f}:d={fade:.3f},format=yuv420p"
    )
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-loop", "1", "-i", str(png),
        "-t", f"{duration:.3f}", "-vf", vf, "-an", "-c:v", "libx264", "-preset", "medium",
        "-crf", "19", "-pix_fmt", "yuv420p", str(clip),
    ], True)


def validate_clip(clip: Path, duration: float) -> dict[str, Any]:
    timestamp = max(0.2, min(duration - 0.30, duration * 0.78))
    rgb = subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{timestamp:.3f}",
        "-i", str(clip), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ])
    base = tuple(rgb[:3])
    box = bbox(rgb, base=base, threshold=42)
    if box is None or box[0] < 88 or box[2] > W - 88:
        raise ValueError(f"{clip.name}: contenido animado fuera del área segura; bbox={box}")
    return {"timestamp": round(timestamp, 3), "bbox": box, "status": "PASS"}


def validate_mp4(path: Path, expected_duration: float) -> dict[str, str]:
    data = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error",
        "-show_entries", "stream=codec_name,width,height,pix_fmt,r_frame_rate,codec_type",
        "-show_entries", "format=duration", "-of", "json", str(path),
    ], text=True))
    stream = next((item for item in data.get("streams", []) if item.get("codec_type") == "video"), None)
    if stream is None:
        raise RuntimeError("MP4 sin stream de video")
    duration = float(data["format"]["duration"])
    result = {
        "codec": str(stream.get("codec_name")),
        "width": str(stream.get("width")),
        "height": str(stream.get("height")),
        "pix_fmt": str(stream.get("pix_fmt")),
        "r_frame_rate": str(stream.get("r_frame_rate")),
        "duration": f"{duration:.3f}",
    }
    failures: list[str] = []
    if result["codec"] != "h264":
        failures.append("codec")
    if (result["width"], result["height"]) != (str(W), str(H)):
        failures.append("resolución")
    if result["pix_fmt"] != "yuv420p":
        failures.append("pix_fmt")
    if result["r_frame_rate"] not in ("30/1", "30000/1001"):
        failures.append("fps")
    if abs(duration - expected_duration) > 0.40:
        failures.append("duración")
    if failures:
        raise RuntimeError("Validación MP4 fallida: " + ", ".join(failures))
    return result
