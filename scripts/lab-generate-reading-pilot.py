import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
SCRIPT_PATH = ROOT / "lab" / "reading-pilot-2026-09-04-activo-seguro-alex.txt"
OUTPUT_STEM = "reading-pilot-2026-09-04-activo-seguro-alex"
SOURCE_ID = "2026-09-04-reading-activo-seguro-riesgo"
VOICE = "em_alex"
LANG_CODE = "e"
SAMPLE_RATE = 24_000
SPEED = 1.0
CHUNK_PAUSE_SECONDS = 0.24
MIN_DURATION_SECONDS = 480.0
MIN_AUDIO_BYTES = 1_000_000
SPEECH_NORMALIZER_VERSION = "reading-pilot-1"

PRONUNCIATION_LEXICON = {
    "ATLAS NEWS": "Atlas Niús",
    "Treasury": "Tréshuri",
    "Reuters": "Róiters",
    "Saint Louis": "Séint Lúis",
}


def normalize_for_speech(text: str) -> str:
    normalized = str(text)
    for term, spoken in sorted(
        PRONUNCIATION_LEXICON.items(), key=lambda item: len(item[0]), reverse=True
    ):
        normalized = re.sub(
            rf"\b{re.escape(term)}\b",
            lambda _: spoken,
            normalized,
            flags=re.IGNORECASE,
        )
    return normalized


def synthesize_longform(text: str) -> np.ndarray:
    pipeline = KPipeline(lang_code=LANG_CODE)
    speech_text = normalize_for_speech(text)
    pause = np.zeros(int(SAMPLE_RATE * CHUNK_PAUSE_SECONDS), dtype=np.float32)
    parts = []

    for index, (_, _, audio) in enumerate(
        pipeline(
            speech_text,
            voice=VOICE,
            speed=SPEED,
            split_pattern=r"\n+",
        )
    ):
        if audio is None:
            continue
        array = np.asarray(audio, dtype=np.float32).reshape(-1)
        if not array.size:
            continue
        if not np.isfinite(array).all():
            raise RuntimeError(f"Kokoro produjo valores no finitos en chunk {index + 1}.")
        if parts:
            parts.append(pause)
        parts.append(array)
        print(f"AUD-READ-01 · chunk {index + 1} · {array.size / SAMPLE_RATE:.1f}s")

    if not parts:
        raise RuntimeError("Kokoro no devolvió audio para la Lectura Seleccionada.")

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
    if duration < MIN_DURATION_SECONDS:
        raise RuntimeError(
            f"Duración inesperadamente corta: {duration:.1f}s < {MIN_DURATION_SECONDS:.0f}s"
        )
    return round(duration, 1)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


text = SCRIPT_PATH.read_text(encoding="utf-8").strip()
if not text:
    raise RuntimeError("El guion del piloto está vacío.")

out_dir = PUBLIC_DIR / "lab" / "audio"
out_dir.mkdir(parents=True, exist_ok=True)
mp3_path = out_dir / f"{OUTPUT_STEM}.mp3"
metadata_path = out_dir / f"{OUTPUT_STEM}.json"

samples = synthesize_longform(text)
write_mp3(mp3_path, samples)
duration = probe_mp3(mp3_path)

metadata = {
    "schemaVersion": 1,
    "pilotId": "AUD-READ-01",
    "status": "pilot_generated",
    "sourceId": SOURCE_ID,
    "sourceCommit": os.environ.get("ATLAS_READING_SOURCE_COMMIT"),
    "pilotCommit": os.environ.get("GITHUB_SHA"),
    "voice": VOICE,
    "language": "es",
    "engine": "Kokoro-82M",
    "speed": SPEED,
    "speechNormalizerVersion": SPEECH_NORMALIZER_VERSION,
    "durationSeconds": duration,
    "durationLabel": f"{round(duration / 60)} min",
    "bytes": mp3_path.stat().st_size,
    "sha256": sha256_file(mp3_path),
    "path": f"/lab/audio/{mp3_path.name}",
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "production": False,
}
metadata_path.write_text(
    json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(
    "AUD-READ-01 generado: "
    f"{mp3_path.name} · {duration:.1f}s · {mp3_path.stat().st_size} bytes · "
    f"voz {VOICE}"
)
