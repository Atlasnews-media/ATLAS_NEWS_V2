from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

SOURCE_RE = re.compile(r"^[0-9a-f]{40}$")
SOURCE_ID_RE = re.compile(r"^src/content/editions/\d{4}-\d{2}-\d{2}-daily-[^/]+\.mdx?$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(*args: str, check: bool = True) -> str:
    completed = subprocess.run(
        list(args),
        check=check,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return completed.stdout.strip()


def write_output(name: str, value: str) -> None:
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"{name}={value}\n")


def get_json(url: str) -> tuple[int, Any]:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "Cache-Control": "no-cache"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return 404, None
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-dir", required=True)
    parser.add_argument("--artifact-name", required=True)
    parser.add_argument(
        "--status-url",
        default="https://atlasnews-media.github.io/status.json",
    )
    args = parser.parse_args()

    artifact_dir = Path(args.artifact_dir).resolve()
    manifests = list(artifact_dir.rglob("reel-manifest.json"))
    if len(manifests) != 1:
        raise RuntimeError(
            f"Fail-closed: expected exactly one reel-manifest.json; found {len(manifests)}"
        )

    manifest_path = manifests[0]
    reel_dir = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    if manifest.get("schema") != "atlas-news-reel-artifact/v1":
        raise RuntimeError("Fail-closed: unsupported Reel artifact schema")
    if manifest.get("status") != "READY_FOR_PUBLICATION":
        raise RuntimeError("Fail-closed: Reel artifact is not READY_FOR_PUBLICATION")

    source_commit = str(manifest.get("sourceCommit") or "")
    source_id = str(manifest.get("sourceId") or "")
    canonical_url = str(manifest.get("canonicalUrl") or "")
    edition_number = manifest.get("editionNumber")
    mp4 = manifest.get("mp4") or {}

    if not SOURCE_RE.fullmatch(source_commit):
        raise RuntimeError("Fail-closed: invalid sourceCommit in manifest")
    if not SOURCE_ID_RE.fullmatch(source_id):
        raise RuntimeError("Fail-closed: invalid sourceId in manifest")
    if not isinstance(edition_number, int) or edition_number < 1:
        raise RuntimeError("Fail-closed: invalid editionNumber in manifest")
    if mp4.get("codec") != "h264" or mp4.get("audioCodec") != "aac":
        raise RuntimeError("Fail-closed: manifest codec contract mismatch")
    if mp4.get("width") != 1080 or mp4.get("height") != 1920:
        raise RuntimeError("Fail-closed: manifest dimensions mismatch")

    mp4_file = str(mp4.get("file") or "")
    expected_sha = str(mp4.get("sha256") or "")
    if not re.fullmatch(r"^[0-9a-f]{64}$", expected_sha):
        raise RuntimeError("Fail-closed: invalid MP4 SHA256 in manifest")
    if not mp4_file.endswith(".mp4"):
        raise RuntimeError("Fail-closed: invalid MP4 filename in manifest")

    expected_artifact = f"atlas-news-reel-canonical-{source_commit}"
    if args.artifact_name != expected_artifact:
        raise RuntimeError("Fail-closed: artifact name/sourceCommit mismatch")

    mp4_path = reel_dir / mp4_file
    checksum_path = reel_dir / "reel.sha256"
    contract_path = reel_dir / "reel-contract.json"
    for required in (mp4_path, checksum_path, contract_path):
        if not required.is_file():
            raise RuntimeError(f"Fail-closed: canonical artifact file missing: {required.name}")

    actual_sha = sha256_file(mp4_path)
    if actual_sha != expected_sha:
        raise RuntimeError("Fail-closed: downloaded MP4 SHA256 mismatch")
    expected_checksum_line = f"{expected_sha}  {mp4_file}"
    if checksum_path.read_text(encoding="utf-8").strip() != expected_checksum_line:
        raise RuntimeError("Fail-closed: reel.sha256 mismatch")

    edition_id = Path(source_id).stem
    expected_url = f"https://atlasnews-media.github.io/ediciones/{edition_id}/"
    if canonical_url != expected_url:
        raise RuntimeError("Fail-closed: canonicalUrl/sourceId mismatch")

    try:
        run("git", "cat-file", "-e", f"{source_commit}^{{commit}}")
    except subprocess.CalledProcessError:
        run("git", "fetch", "--no-tags", "--depth=128", "origin", source_commit)
    source_path = Path(source_id)
    if not source_path.is_file():
        raise RuntimeError("Fail-closed: sourceId missing from runtime main")
    source_blob = run("git", "rev-parse", f"{source_commit}:{source_id}")
    runtime_blob = run("git", "hash-object", source_id)
    if source_blob != runtime_blob:
        raise RuntimeError("Fail-closed: runtime edition bytes differ from sourceCommit")

    status_code, status = get_json(
        f"{args.status_url}?reel-handoff={os.environ.get('GITHUB_RUN_ID', 'local')}"
    )
    if status_code != 200 or not isinstance(status, dict):
        raise RuntimeError("Fail-closed: public status unavailable")
    observed_commit = str(status.get("sourceCommit") or "")
    latest = status.get("latestDaily") or {}
    if latest.get("id") != edition_id:
        raise RuntimeError("Fail-closed: public latestDaily does not match artifact edition")
    if latest.get("issueNumber") != edition_number:
        raise RuntimeError("Fail-closed: public issueNumber does not match artifact manifest")

    if observed_commit != source_commit:
        try:
            run("git", "cat-file", "-e", f"{observed_commit}^{{commit}}")
        except subprocess.CalledProcessError:
            run("git", "fetch", "--no-tags", "--depth=128", "origin", observed_commit)
        ancestor = subprocess.run(
            ["git", "merge-base", "--is-ancestor", source_commit, observed_commit],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if ancestor.returncode != 0:
            raise RuntimeError(
                "Fail-closed: public sourceCommit is not artifact commit or verified descendant"
            )

    evidence_url = (
        "https://raw.githubusercontent.com/Atlasnews-media/"
        "Atlasnews-media.github.io/social-assets/instagram-reels-published/"
        f"{source_commit}.json?run={os.environ.get('GITHUB_RUN_ID', 'local')}"
    )
    evidence_code, evidence = get_json(evidence_url)
    already_published = False
    if evidence_code == 200:
        if not isinstance(evidence, dict):
            raise RuntimeError("Fail-closed: durable Reel evidence is invalid")
        if (
            evidence.get("sourceCommit") != source_commit
            or not str(evidence.get("mediaId") or "")
            or not str(evidence.get("permalink") or "")
        ):
            raise RuntimeError("Fail-closed: durable Reel evidence is invalid")
        already_published = True
    elif evidence_code != 404:
        raise RuntimeError(
            f"Fail-closed: cannot determine Reel idempotency (HTTP {evidence_code})"
        )

    write_output("source_commit", source_commit)
    write_output("source_id", source_id)
    write_output("canonical_url", canonical_url)
    write_output("edition_number", str(edition_number))
    write_output("reel_dir", str(reel_dir))
    write_output("mp4_file", mp4_file)
    write_output("mp4_sha256", expected_sha)
    write_output("already_published", "true" if already_published else "false")

    print(
        json.dumps(
            {
                "status": "ALREADY_PUBLISHED_VERIFIED"
                if already_published
                else "READY_FOR_F4E",
                "sourceCommit": source_commit,
                "artifactName": args.artifact_name,
                "mp4Sha256": expected_sha,
                "editionNumber": edition_number,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
