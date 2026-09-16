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

from audio_speech import (
    LEXICON_REVISION,
    LEXICON_VERSION,
    SPEECH_NORMALIZER_VERSION,
    normalize_for_speech,
)

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
READING_ID = os.environ["ATLAS_READING_ID"].strip()
SOURCE_COMMIT = os.environ.get("ATLAS_SOURCE_SHA")

SOURCE_PATH = ROOT / "src" / "content" / "readings" / f"{READING_ID}.md"
SCRIPT_PATH = ROOT / "audio" / "scripts" / "readings" / f"{READING_ID}.txt"
OUTPUT_DIR = PUBLIC_DIR / "audio" / "readings"
MP3_PATH = OUTPUT_DIR / f"{READING_ID}.mp3"
METADATA_PATH = OUTPUT_DIR / f"{READING_ID}.json"

VOICE = "ef_dora"
VOICE_LABEL = "Dora"
LANG_CODE = "e"
SAMPLE_RATE = 24_000
SPEED = 1.0
PARAGRAPH_PAUSE_SECONDS = 0.24
MIN_DURATION_SECONDS = 100.0
MAX_DURATION_SECONDS = 220.0
MIN_AUDIO_BYTES = 100_000


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_source(source_text: str) -> None:
    if not re.search(r'^status:\s*"?published"?\s*$', source_text, re.M):
        raise RuntimeError("La lectura de Contingencia no está publicada.")
    if not re.search(r'^\s*-\s*contingencia\s*$', source_text, re.M):
        raise RuntimeError("La lectura no está marcada como Contingencia.")


def metadata_is_current(source_sha: str, script_sha: str) -> bool:
    if not MP3_PATH.exists() or not METADATA_PATH.exists():
        return False
    try:
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return (
        metadata.get("status") == "published"
        and metadata.get("production") is True
        and metadata.get("sourceId") == READING_ID
        and metadata.get("sourceSha256") == source_sha
        and metadata.get("scriptSha256") == script_sha
        and metadata.get("voice") == VOICE
        and metadata.get("speechNormalizerVersion") == SPEECH_NORMALIZER_VERSION
        and metadata.get("lexiconVersion") == LEXICON_VERSION
        and metadata.get("lexiconRevision") == LEXICON_REVISION
        and MP3_PATH.stat().st_size >= MIN_AUDIO_BYTES
    )


def synthesize_longform(text: str, reference_date: str) -> np.ndarray:
    pipeline = KPipeline(lang_code=LANG_CODE)
    silence = np.zeros(int(SAMPLE_RATE * PARAGRAPH_PAUSE_SECONDS), dtype=np.float32)
    parts = []

    paragraphs = [part.strip() for part in re.split(r"\n+", text) if part.strip()]
    for index, paragraph in enumerate(paragraphs):
        speech_text = normalize_for_speech(paragraph, reference_date)
        chunks = []
        for _, _, audio in pipeline(
            speech_text,
            voice=VOICE,
            speed=SPEED,
            split_pattern=r"\n+",
        ):
            if audio is None:
                continue
            array = np.asarray(audio, dtype=np.float32).reshape(-1)
            if array.size:
                chunks.append(array)
        if not chunks:
            raise RuntimeError(f"Kokoro no devolvió audio en párrafo {index + 1}.")
        if parts:
            parts.append(silence)
        parts.append(np.concatenate(chunks))

    if not parts:
        raise RuntimeError("El guion de Contingencia no produjo audio.")
    samples = np.concatenate(parts)
    if not np.isfinite(samples).all():
        raise RuntimeError("Kokoro produjo valores no finitos.")
    peak = float(np.max(np.abs(samples)))
    if peak <= 0.0:
        raise RuntimeError("Audio silencioso: peak=0.")
    if peak > 0.99:
        samples = samples * (0.99 / peak)
    return samples.astype(np.float32)


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
        raise RuntimeError(f"MP3 inválido o demasiado pequeño: {path.name}")
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
            f"Duración fuera del contrato de Contingencia: {duration:.1f}s "
            f"(esperado {MIN_DURATION_SECONDS:.0f}-{MAX_DURATION_SECONDS:.0f}s)."
        )
    return round(duration, 1)


if not READING_ID or not re.fullmatch(r"[a-z0-9-]+", READING_ID):
    raise RuntimeError("ATLAS_READING_ID inválido.")
if not SOURCE_PATH.exists():
    raise RuntimeError(f"No existe la lectura fuente: {SOURCE_PATH}")
if not SCRIPT_PATH.exists():
    raise RuntimeError(f"No existe el guion: {SCRIPT_PATH}")

source_bytes = SOURCE_PATH.read_bytes()
script_bytes = SCRIPT_PATH.read_bytes()
source_text = source_bytes.decode("utf-8")
script_text = script_bytes.decode("utf-8").strip()
validate_source(source_text)
if not script_text:
    raise RuntimeError("El guion de Contingencia está vacío.")

source_sha = sha256_bytes(source_bytes)
script_sha = sha256_bytes(script_bytes)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

if metadata_is_current(source_sha, script_sha):
    print(f"Contingencia Audio idempotente: {READING_ID}")
    raise SystemExit(0)

samples = synthesize_longform(script_text, READING_ID[:10])
write_mp3(MP3_PATH, samples)
duration = probe_mp3(MP3_PATH)

metadata = {
    "schemaVersion": 1,
    "audioType": "contingency",
    "status": "published",
    "production": True,
    "sourceId": READING_ID,
    "sourceCommit": SOURCE_COMMIT,
    "sourceSha256": source_sha,
    "scriptSha256": script_sha,
    "voice": VOICE,
    "voiceLabel": VOICE_LABEL,
    "language": "es",
    "engine": "Kokoro-82M",
    "speed": SPEED,
    "speechNormalizerVersion": SPEECH_NORMALIZER_VERSION,
    "lexiconVersion": LEXICON_VERSION,
    "lexiconRevision": LEXICON_REVISION,
    "durationSeconds": duration,
    "durationLabel": f"{round(duration / 60)} min",
    "bytes": MP3_PATH.stat().st_size,
    "sha256": sha256_file(MP3_PATH),
    "path": f"/audio/readings/{READING_ID}.mp3",
    "generatedAt": datetime.now(timezone.utc).isoformat(),
}
METADATA_PATH.write_text(
    json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(
    f"Contingencia Audio generado: {READING_ID} · {duration:.1f}s · "
    f"{MP3_PATH.stat().st_size} bytes · voz {VOICE_LABEL}"
)
