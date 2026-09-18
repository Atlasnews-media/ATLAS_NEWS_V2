from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
from pathlib import Path
from typing import Any


SCHEMA = "atlas-news-reel-artifact/v1"
READY_STATUS = "READY_FOR_PUBLICATION"
SOURCE_RE = re.compile(r"^[0-9a-f]{40}$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def required_text(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{label} is required")
    return text


def load_json(path: Path, label: str) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"{label} not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{label} must be a JSON object")
    return data


def validate_contract(contract: dict[str, Any]) -> tuple[str, str, str, int]:
    source_commit = required_text(contract.get("sourceCommit"), "contract.sourceCommit")
    if not SOURCE_RE.fullmatch(source_commit):
        raise ValueError("contract.sourceCommit must be a full lowercase SHA")

    source_id = required_text(contract.get("sourceId"), "contract.sourceId")
    canonical_url = required_text(contract.get("canonicalUrl"), "contract.canonicalUrl")
    edition_number = contract.get("editionNumber")
    if not isinstance(edition_number, int) or edition_number < 1:
        raise ValueError("contract.editionNumber must be a positive integer")

    highlights = contract.get("highlights")
    if not isinstance(highlights, list) or len(highlights) != 5:
        raise ValueError("contract.highlights must contain exactly 5 items")

    return source_commit, source_id, canonical_url, edition_number


def validate_report(
    report: dict[str, Any], source_commit: str, edition_number: int
) -> dict[str, Any]:
    if report.get("status") != "PASS":
        raise ValueError("visual-validation.status must be PASS")
    if report.get("sourceCommit") != source_commit:
        raise ValueError("visual-validation.sourceCommit mismatch")
    if report.get("editionNumber") != edition_number:
        raise ValueError("visual-validation.editionNumber mismatch")

    scenes = report.get("scenes")
    if not isinstance(scenes, list) or len(scenes) != 7:
        raise ValueError("visual-validation must contain exactly 7 scenes")
    if any(scene.get("status") != "PASS" for scene in scenes if isinstance(scene, dict)):
        raise ValueError("all scenes must be PASS")

    video = report.get("video")
    if not isinstance(video, dict):
        raise ValueError("visual-validation.video must be an object")

    required_video = {
        "codec": "h264",
        "width": "1080",
        "height": "1920",
        "pix_fmt": "yuv420p",
        "audio_codec": "aac",
    }
    for key, expected in required_video.items():
        if str(video.get(key)) != expected:
            raise ValueError(f"visual-validation.video.{key} must be {expected}")

    if str(video.get("r_frame_rate")) not in {"30/1", "30000/1001"}:
        raise ValueError("visual-validation.video.r_frame_rate must be 30 fps")

    return video


def copy_verified(src: Path, dst: Path) -> dict[str, Any]:
    shutil.copy2(src, dst)
    return {
        "file": dst.name,
        "sha256": sha256_file(dst),
        "sizeBytes": dst.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the canonical immutable Reel artifact handoff for F4E."
    )
    parser.add_argument("--contract", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    contract_path = Path(args.contract).resolve()
    output_dir = Path(args.output_dir).resolve()

    contract = load_json(contract_path, "Reel contract")
    source_commit, source_id, canonical_url, edition_number = validate_contract(contract)

    validation_path = output_dir / "visual-validation.json"
    visual_sources_path = output_dir / "visual-sources.json"
    mp4_path = output_dir / f"atlas-news-reel-{source_commit}.mp4"

    report = load_json(validation_path, "visual validation")
    load_json(visual_sources_path, "visual sources")
    video = validate_report(report, source_commit, edition_number)

    if not mp4_path.is_file():
        raise FileNotFoundError(f"Canonical MP4 not found: {mp4_path}")

    canonical_dir = output_dir / "canonical" / source_commit
    if canonical_dir.exists():
        shutil.rmtree(canonical_dir)
    canonical_dir.mkdir(parents=True)

    mp4_meta = copy_verified(mp4_path, canonical_dir / mp4_path.name)
    contract_meta = copy_verified(contract_path, canonical_dir / "reel-contract.json")
    validation_meta = copy_verified(
        validation_path, canonical_dir / "visual-validation.json"
    )
    visual_sources_meta = copy_verified(
        visual_sources_path, canonical_dir / "visual-sources.json"
    )

    checksum_path = canonical_dir / "reel.sha256"
    checksum_path.write_text(
        f"{mp4_meta['sha256']}  {mp4_meta['file']}\n", encoding="utf-8"
    )

    manifest = {
        "schema": SCHEMA,
        "status": READY_STATUS,
        "sourceCommit": source_commit,
        "sourceId": source_id,
        "canonicalUrl": canonical_url,
        "editionNumber": edition_number,
        "mp4": {
            **mp4_meta,
            "codec": str(video.get("codec")),
            "width": int(video.get("width")),
            "height": int(video.get("height")),
            "pixFmt": str(video.get("pix_fmt")),
            "frameRate": str(video.get("r_frame_rate")),
            "audioCodec": str(video.get("audio_codec")),
            "duration": str(video.get("duration")),
        },
        "contract": contract_meta,
        "validation": validation_meta,
        "visualSources": visual_sources_meta,
        "checksumFile": checksum_path.name,
        "producer": {
            "workflow": "Reel Maker V2 — post-publication artifact",
            "githubRunId": os.environ.get("GITHUB_RUN_ID") or None,
            "githubRunAttempt": os.environ.get("GITHUB_RUN_ATTEMPT") or None,
            "githubSha": os.environ.get("GITHUB_SHA") or None,
        },
    }

    manifest_path = canonical_dir / "reel-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    roundtrip = load_json(manifest_path, "Reel manifest")
    if roundtrip.get("status") != READY_STATUS:
        raise RuntimeError("Canonical Reel manifest failed roundtrip validation")
    if roundtrip.get("mp4", {}).get("sha256") != sha256_file(
        canonical_dir / mp4_path.name
    ):
        raise RuntimeError("Canonical MP4 SHA256 mismatch after packaging")

    print(
        json.dumps(
            {
                "status": READY_STATUS,
                "sourceCommit": source_commit,
                "artifactDir": str(canonical_dir),
                "manifest": str(manifest_path),
                "mp4": mp4_path.name,
                "mp4Sha256": mp4_meta["sha256"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
