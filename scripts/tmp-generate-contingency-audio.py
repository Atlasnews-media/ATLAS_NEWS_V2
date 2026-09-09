import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

from audio_speech import (
    LEXICON_REVISION,
    LEXICON_VERSION,
    SPEECH_NORMALIZER_VERSION,
    normalize_for_speech,
)

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
SCRIPT_PATH = ROOT / "tmp" / "contingency-audio-2026-09-08.txt"
OUTPUT_STEM = "2026-09-08-reading-ipc-sorpresa-inflacion"
SOURCE_ID = "2026-09-08-reading-ipc-sorpresa-inflacion"
REFERENCE_DATE = "2026-09-08"
VOICE = "em_alex"
LANG_CODE = "e"
SAMPLE_RATE = 24_000
SPEED = 1.0
PARAGRAPH_PAUSE_SECONDS = 0.22
MIN_DURATION_SECONDS = 110.0
MAX_DURATION_SECONDS = 210.0
MIN_AUDIO_BYTES = 500_000


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def prepare_paragraphs(text: str) -> list[str]:
    raw_paragraphs = [part.strip() for part in text.split("\n\n") if part.strip()]
    paragraphs = [
        normalize_for_speech(part, reference_date=REFERENCE_DATE)
        for part in raw_paragraphs
    ]
    speech_text = " ".join(paragraphs)
    required = (
        "cero coma seis por ciento",
        "cero coma tres por ciento",
        "cuatro coma uno por ciento",
        "cero coma uno por ciento",
        "uno coma cuatro por ciento",
        "uno coma seis por ciento",
        "cien dólares",
    )
    missing = [fragment for fragment in required if fragment not in speech_text.lower()]
    if missing:
        raise RuntimeError(
            "Numeric Normalizer V4 no produjo las formas esperadas: "
            + ", ".join(missing)
        )
    return paragraphs


def synthesize(paragraphs: list[str]) -> np.ndarray:
    pipeline = KPipeline(lang_code=LANG_CODE)
    pause = np.zeros(int(SAMPLE_RATE * PARAGRAPH_PAUSE_SECONDS), dtype=np.float32)
    parts: list[np.ndarray] = []

    for paragraph_index, paragraph in enumerate(paragraphs, start=1):
        paragraph_parts: list[np.ndarray] = []
        for chunk_index, (_, _, audio) in enumerate(
            pipeline(
                paragraph,
                voice=VOICE,
                speed=SPEED,
                split_pattern=r"(?<=[.!?])\s+",
            ),
            start=1,
        ):
            if audio is None:
                continue
            array = np.asarray(audio, dtype=np.float32).reshape(-1)
            if not array.size:
                continue
            if not np.isfinite(array).all():
                raise RuntimeError(
                    f"Kokoro produjo valores no finitos en párrafo {paragraph_index}, "
                    f"chunk {chunk_index}."
                )
            paragraph_parts.append(array)

        if not paragraph_parts:
            raise RuntimeError(f"Kokoro no devolvió audio para párrafo {paragraph_index}.")

        if parts:
            parts.append(pause)
        parts.extend(paragraph_parts)
        print(
            f"CONTINGENCIA · párrafo {paragraph_index} · "
            f"{sum(part.size for part in paragraph_parts) / SAMPLE_RATE:.1f}s"
        )

    samples = np.concatenate(parts)
    peak = float(np.max(np.abs(samples)))
    if peak <= 0.0:
        raise RuntimeError("Audio silencioso: peak=0.")
    if peak > 1.01:
        raise RuntimeError(f"Audio fuera de rango: peak={peak:.3f}.")
    return samples


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


def probe_mp3(path: Path) -> float:
    if not path.exists() or path.stat().st_size < MIN_AUDIO_BYTES:
        raise RuntimeError(f"MP3 inválido o demasiado pequeño: {path}")
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    duration = float(result.stdout.strip())
    if duration < MIN_DURATION_SECONDS or duration > MAX_DURATION_SECONDS:
        raise RuntimeError(
            f"Duración fuera del objetivo 2–3 min: {duration:.1f}s "
            f"(rango técnico {MIN_DURATION_SECONDS:.0f}–{MAX_DURATION_SECONDS:.0f}s)."
        )
    return round(duration, 1)


text = SCRIPT_PATH.read_text(encoding="utf-8").strip()
if not text:
    raise RuntimeError("El guion de Contingencia está vacío.")

paragraphs = prepare_paragraphs(text)
out_dir = PUBLIC_DIR / "audio" / "readings"
out_dir.mkdir(parents=True, exist_ok=True)
mp3_path = out_dir / f"{OUTPUT_STEM}.mp3"
metadata_path = out_dir / f"{OUTPUT_STEM}.json"

samples = synthesize(paragraphs)
write_mp3(mp3_path, samples)
duration = probe_mp3(mp3_path)

metadata = {
    "schemaVersion": 1,
    "status": "published",
    "kind": "contingency-analysis",
    "sourceId": SOURCE_ID,
    "sourceCommit": os.environ.get("ATLAS_READING_SOURCE_COMMIT"),
    "generatorCommit": os.environ.get("GITHUB_SHA"),
    "voice": VOICE,
    "voiceLabel": "Alex",
    "language": "es",
    "engine": "Kokoro-82M",
    "speed": SPEED,
    "lexiconVersion": LEXICON_VERSION,
    "lexiconRevision": LEXICON_REVISION,
    "speechNormalizerVersion": SPEECH_NORMALIZER_VERSION,
    "durationSeconds": duration,
    "durationLabel": f"{round(duration / 60)} min",
    "bytes": mp3_path.stat().st_size,
    "sha256": sha256_file(mp3_path),
    "path": f"/audio/readings/{mp3_path.name}",
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "production": True,
}
metadata_path.write_text(
    json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(
    "Contingencia audio generado: "
    f"{mp3_path.name} · {duration:.1f}s · {mp3_path.stat().st_size} bytes · "
    f"voz {VOICE} · Lexicon V{LEXICON_VERSION}.{LEXICON_REVISION} · "
    f"Normalizer V{SPEECH_NORMALIZER_VERSION}"
)
