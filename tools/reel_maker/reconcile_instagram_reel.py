#!/usr/bin/env python3
import argparse
import json
import sys

REEL_CAPTION_PREFIX = "ATLAS NEWS · EDICIÓN"


def find_reel_candidate(payload, canonical_url):
    data = payload.get("data", []) if isinstance(payload, dict) else []
    candidates = []

    for item in data:
        if not isinstance(item, dict):
            continue
        caption = str(item.get("caption") or "")
        if canonical_url not in caption:
            continue
        if not caption.lstrip().startswith(REEL_CAPTION_PREFIX):
            continue

        media_product_type = str(item.get("media_product_type") or "").upper()
        if media_product_type and media_product_type != "REELS":
            continue
        candidates.append(item)

    if len(candidates) > 1:
        ids = ", ".join(str(item.get("id") or "<missing>") for item in candidates)
        raise ValueError(
            f"Fail-closed: multiple Reel candidates match canonical URL {canonical_url}: {ids}"
        )

    return candidates[0] if candidates else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--canonical", required=True)
    parser.add_argument("--input", default="-")
    args = parser.parse_args()

    if args.input == "-":
        payload = json.load(sys.stdin)
    else:
        with open(args.input, "r", encoding="utf-8") as handle:
            payload = json.load(handle)

    candidate = find_reel_candidate(payload, args.canonical)
    if candidate is not None:
        json.dump(candidate, sys.stdout, ensure_ascii=False, separators=(",", ":"))
        sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2)
