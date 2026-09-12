#!/usr/bin/env python3
"""ATLAS NEWS Reel Maker V2 — independent final consumer of Phase 4."""
from __future__ import annotations

import argparse
import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable

from model import Contract, DURATION, plate, scene_specs
from validate import animate, render_svg, require_tools, run, validate_clip, validate_mp4, validate_static

LOG = logging.getLogger("atlas-news-reel-maker")


def output_path(directory: Path, source_commit: str) -> Path:
    safe = "".join(ch for ch in source_commit if ch.isalnum() or ch in "-_.")[:80] or "unknown-commit"
    return directory / f"atlas-news-reel-{safe}.mp4"


def build_from_contract(
    contract_path: str | Path,
    *,
    output_dir: str | Path = "output",
    images: Iterable[str | Path | None] | None = None,
    music: str | Path | None = None,
    duration: float = DURATION,
    music_volume: float = 0.20,
    keep_plates: bool = False,
) -> Path:
    require_tools()
    if not 0.5 <= duration <= 15:
        raise ValueError("duration por escena debe estar entre 0.5 y 15 segundos")
    if not 0 <= music_volume <= 1:
        raise ValueError("music_volume debe estar entre 0 y 1")

    contract = Contract.load(contract_path)
    out = Path(output_dir).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    final = output_path(out, contract.source_commit)
    image_values = list(images or [None] * 7)
    if len(image_values) != 7:
        raise ValueError("images debe contener exactamente 7 rutas o null")
    image_paths = [Path(value).expanduser().resolve() if value else None for value in image_values]
    music_path = Path(music).expanduser().resolve() if music else None
    if music_path and not music_path.is_file():
        raise FileNotFoundError(f"Audio no encontrado: {music_path}")

    visual: list[dict] = []
    total_duration = duration * 7
    with tempfile.TemporaryDirectory(prefix="atlas-news-reel-") as temp_name:
        temp = Path(temp_name)
        plates, pngs, clips = temp / "plates", temp / "pngs", temp / "clips"
        for directory in (plates, pngs, clips):
            directory.mkdir()

        for index, spec in enumerate(scene_specs(contract), 1):
            last_error: Exception | None = None
            for guard in range(0, 145, 12):
                try:
                    svg_text, meta = plate(index, spec, contract, image_paths[index - 1], guard)
                    svg = plates / f"scene-{index:02d}.svg"
                    png = pngs / f"scene-{index:02d}.png"
                    clip = clips / f"scene-{index:02d}.mp4"
                    svg.write_text(svg_text, encoding="utf-8")
                    check = validate_static(svg, meta)
                    render_svg(svg, png)
                    animate(png, clip, duration)
                    check["animated"] = validate_clip(clip, duration)
                    check["widthGuard"] = guard
                    visual.append(check)
                    break
                except ValueError as exc:
                    last_error = exc
            else:
                raise ValueError(f"Escena {index} no supera validación visual tras reflow: {last_error}")

        concat = temp / "concat.txt"
        concat.write_text(
            "\n".join(f"file '{path.as_posix()}'" for path in sorted(clips.iterdir())) + "\n",
            encoding="utf-8",
        )
        silent = temp / "silent.mp4"
        run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
            "-i", str(concat), "-c", "copy", "-movflags", "+faststart", str(silent),
        ], True)
        if music_path:
            run([
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(silent),
                "-stream_loop", "-1", "-i", str(music_path), "-filter_complex",
                f"[1:a]volume={music_volume:.3f}[a]", "-map", "0:v:0", "-map", "[a]", "-shortest",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final),
            ], True)
        else:
            shutil.copy2(silent, final)

        tech = validate_mp4(final, total_duration)
        report = {
            "sourceCommit": contract.source_commit,
            "canonicalUrl": contract.canonical_url,
            "scenes": visual,
            "video": tech,
            "expectedDuration": round(total_duration, 3),
            "status": "PASS",
        }
        (out / "visual-validation.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        if keep_plates:
            target = out / f"atlas-news-plates-{contract.source_commit}"
            target.mkdir(parents=True, exist_ok=True)
            for path in list(plates.glob("*.svg")) + list(pngs.glob("*.png")):
                shutil.copy2(path, target / path.name)
    return final


def main() -> int:
    parser = argparse.ArgumentParser(description="ATLAS NEWS Reel Maker V2: contrato social -> 7 escenas -> MP4")
    parser.add_argument("contract", nargs="?", default="tools/social-renderer/.generated/daily-contract.json")
    parser.add_argument("--output-dir", default="output")
    parser.add_argument("--images", nargs=7, metavar="IMG")
    parser.add_argument("--music")
    parser.add_argument("--music-volume", type=float, default=0.20)
    parser.add_argument("--duration", type=float, default=DURATION)
    parser.add_argument("--keep-plates", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
    try:
        result = build_from_contract(
            args.contract,
            output_dir=args.output_dir,
            images=args.images,
            music=args.music,
            duration=args.duration,
            music_volume=args.music_volume,
            keep_plates=args.keep_plates,
        )
        print(result)
        return 0
    except (ValueError, FileNotFoundError, RuntimeError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        LOG.error("%s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
