import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

from scripts.audio_speech import normalize_for_speech

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "lab" / "audio-lexicon-v4" / "candidates.json"
OUT_DIR = ROOT / "lab" / "audio-lexicon-v4" / "out"
SAMPLE_RATE = 24_000
PAUSE_SECONDS = 0.35
VOICES = {
    "dora": "ef_dora",
    "alex": "em_alex",
}


def replace_candidate(text: str, term: str, variants: list[str], speech: str) -> str:
    forms = [term, *variants]
    normalized = text
    for form in sorted(forms, key=len, reverse=True):
        pattern = rf"(?<!\w){re.escape(form)}(?!\w)"
        normalized = re.sub(pattern, speech, normalized, flags=re.IGNORECASE)
    return normalized


def synthesize(pipeline: KPipeline, text: str, voice: str) -> np.ndarray:
    chunks = []
    for _, _, audio in pipeline(text, voice=voice, speed=1.0, split_pattern=r"\n+"):
        if audio is None:
            continue
        array = np.asarray(audio, dtype=np.float32).reshape(-1)
        if array.size:
            chunks.append(array)
    if not chunks:
        raise RuntimeError(f"Kokoro no devolvió audio para {voice}")
    return np.concatenate(chunks)


def write_mp3(path: Path, samples: np.ndarray) -> None:
    wav_path = path.with_suffix(".wav")
    sf.write(wav_path, samples, SAMPLE_RATE)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "96k",
            str(path),
        ],
        check=True,
    )
    wav_path.unlink(missing_ok=True)


def main() -> None:
    payload = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    candidate = payload["candidates"][0]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    pipeline = KPipeline(lang_code="e")
    silence = np.zeros(int(SAMPLE_RATE * PAUSE_SECONDS), dtype=np.float32)
    manifest = {
        "schemaVersion": 1,
        "targetLexiconVersion": payload["targetLexiconVersion"],
        "term": candidate["term"],
        "proposedSpeech": candidate["proposedSpeech"],
        "productionTouched": False,
        "clips": [],
    }

    for voice_name, voice_id in VOICES.items():
        current_parts = []
        proposed_parts = []

        for index, sample in enumerate(candidate["samples"]):
            current_text = normalize_for_speech(sample, "2026-09-16")
            proposed_text = replace_candidate(
                current_text,
                candidate["term"],
                candidate.get("variants", []),
                candidate["proposedSpeech"],
            )

            if index:
                current_parts.append(silence)
                proposed_parts.append(silence)

            current_parts.append(synthesize(pipeline, current_text, voice_id))
            proposed_parts.append(synthesize(pipeline, proposed_text, voice_id))

        outputs = {
            "current": np.concatenate(current_parts),
            "proposed": np.concatenate(proposed_parts),
        }

        for variant, samples in outputs.items():
            filename = f"bypass-{voice_name}-{variant}.mp3"
            write_mp3(OUT_DIR / filename, samples)
            manifest["clips"].append(
                {
                    "voice": voice_name,
                    "voiceId": voice_id,
                    "variant": variant,
                    "file": filename,
                }
            )

    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("Lexicon V4 LAB generado: bypass · Dora/Alex · current/proposed")


if __name__ == "__main__":
    main()
