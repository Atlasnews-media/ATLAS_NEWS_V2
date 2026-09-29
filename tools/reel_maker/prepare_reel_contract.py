#!/usr/bin/env python3
"""Build the Reel-only contract from the verified published daily edition.

This adapter is intentionally isolated from tools/social-renderer: Reel Maker consumes
only the published daily frontmatter plus the verified issue number supplied by the
workflow.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

ROOT = Path.cwd().resolve()
DEFAULT_OUTPUT = ROOT / "tools/reel_maker/.generated/reel-contract.json"


def required_env(name: str) -> str:
    value = str(os.environ.get(name, "")).strip()
    if not value:
        raise ValueError(f"{name} es requerido")
    return value


def yaml_scalar(raw: str) -> str:
    value = raw.strip()
    if value.startswith('"') and value.endswith('"'):
        return str(json.loads(value))
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    return value


def scalar(lines: list[str], key: str) -> str:
    prefix = f"{key}:"
    for line in lines:
        if line.startswith(prefix):
            return yaml_scalar(line[len(prefix) :])
    return ""


def highlights(lines: list[str]) -> list[dict[str, str]]:
    try:
        start = lines.index("highlights:")
    except ValueError:
        return []
    items: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for line in lines[start + 1 :]:
        if line and not line.startswith(" "):
            break
        stripped = line.strip()
        if stripped.startswith("- label:"):
            if current:
                items.append(current)
            current = {
                "label": yaml_scalar(stripped.split(":", 1)[1]),
                "text": "",
            }
        elif stripped.startswith("text:") and current is not None:
            current["text"] = yaml_scalar(stripped.split(":", 1)[1])
    if current:
        items.append(current)
    return [item for item in items if item.get("label") and item.get("text")]


def main() -> int:
    source_commit = required_env("ATLAS_SOURCE_COMMIT")
    source_id = required_env("ATLAS_SOURCE_ID")
    edition_id = required_env("ATLAS_EDITION_ID")
    issue_number_raw = required_env("ATLAS_EDITION_NUMBER")
    output_raw = str(os.environ.get("ATLAS_REEL_CONTRACT_OUTPUT", "")).strip()

    if not re.fullmatch(r"[0-9a-fA-F]{40}", source_commit):
        raise ValueError("ATLAS_SOURCE_COMMIT debe ser SHA completo de 40 caracteres")
    try:
        issue_number = int(issue_number_raw)
    except ValueError as exc:
        raise ValueError("ATLAS_EDITION_NUMBER debe ser entero positivo") from exc
    if issue_number <= 0:
        raise ValueError("ATLAS_EDITION_NUMBER debe ser entero positivo")

    source = (ROOT / source_id).resolve()
    if ROOT not in source.parents or not source.is_file():
        raise ValueError(f"ATLAS_SOURCE_ID inválido o inexistente: {source_id}")
    if source.stem != edition_id:
        raise ValueError(
            f"ATLAS_EDITION_ID no coincide con sourceId: {edition_id} != {source.stem}"
        )

    text = source.read_text(encoding="utf-8")
    parts = re.split(r"^---\s*$", text, maxsplit=2, flags=re.M)
    if len(parts) < 3:
        raise ValueError(f"Frontmatter inválido: {source_id}")
    lines = parts[1].splitlines()

    title = scalar(lines, "title").strip()
    summary = scalar(lines, "summary").strip()
    published_at = scalar(lines, "publishedAt").strip()
    status = scalar(lines, "status").strip()
    product_type = scalar(lines, "type").strip()
    source_highlights = highlights(lines)

    if not title or not summary or not published_at:
        raise ValueError("La edición diaria no contiene title, summary o publishedAt")
    if status != "published" or product_type != "daily":
        raise ValueError("Reel Maker solo consume una edición daily publicada")
    if len(source_highlights) != 5:
        raise ValueError(
            f"Reel Maker requiere exactamente 5 highlights publicados; encontrados {len(source_highlights)}"
        )

    for index, item in enumerate(source_highlights):
        if len(item["label"]) > 96:
            raise ValueError(f"highlight[{index}].label excede 96 caracteres")
        if len(item["text"]) > 220:
            raise ValueError(f"highlight[{index}].text excede 220 caracteres")

    contract: dict[str, Any] = {
        "version": "2",
        "sourceCommit": source_commit.lower(),
        "sourceId": source_id,
        "canonicalUrl": f"https://atlasnews-media.github.io/ediciones/{edition_id}/",
        "publishedDate": published_at,
        "editionNumber": issue_number,
        "productType": "daily",
        "sectionLabel": "General",
        "title": title,
        "dek": summary,
        "highlights": source_highlights,
    }

    output = (ROOT / output_raw).resolve() if output_raw else DEFAULT_OUTPUT
    if ROOT not in output.parents:
        raise ValueError("ATLAS_REEL_CONTRACT_OUTPUT debe quedar dentro del repositorio")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
