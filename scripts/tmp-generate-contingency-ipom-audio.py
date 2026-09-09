import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

from audio_question_prosody import raise_terminal_pitch
from audio_speech import (
    LEXICON_REVISION,
    LEXICON_VERSION,
    SPEECH_NORMALIZER_VERSION,
    is_question,
    normalize_for_speech,
)

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
SCRIPT_PATH = ROOT / "tmp" / "contingency-audio-2026-09-09-ipom.txt"
OUTPUT_STEM = "2026-09-09-reading-ipom-escenario-2026"
SOURCE_ID = OUTPUT_STEM
REFERENCE_DATE = "2026-09-09"
VOICE = "em_alex"
LANG_CODE = "e"
SAMPLE_RATE = 24_000
SPEED = 1.0
QUESTION_SPEED = 0.92
PARAGRAPH_PAUSE_SECONDS = 0.22
QUESTION_PAUSE_SECONDS = 0.36
QUESTION_PITCH_SEMITONES = 1.5
QUESTION_PITCH_TAIL_SECONDS = 0.65
QUESTION_PITCH_CROSSFADE_SECONDS = 0.10
MIN_DURATION_SECONDS = 120.0
MAX_DURATION_SECONDS = 240.0
MIN_AUDIO_BYTES = 500_000
QUESTION_PROSODY_VERSION = 2


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def synthesize_paragraph(pipeline: KPipeline, paragraph: str) -> np.ndarray:
    question = is_question(paragraph)
    speech_text = normalize_for_speech(paragraph, reference_date=REFERENCE_DATE)
    chunks = []
    for _, _, audio in pipeline(
        speech_text,
        voice=VOICE,
        speed=QUESTION_SPEED if question else SPEED,
        split_pattern=r"(?<=[.!?])\s+",
    ):
        if audio is None:
            continue
        array = np.asarray(audio, dtype=np.float32).reshape(-1)
        if array.size:
            chunks.append(array)
    if not chunks:
        raise RuntimeError("Kokoro no devolvió audio para un párrafo de Contingencia.")
    samples = np.concatenate(chunks)
    if question:
        samples = raise_terminal_pitch(
            samples,
            SAMPLE_RATE,
            semitones=QUESTION_PITCH_SEMITONES,
            tail_seconds=QUESTION_PITCH_TAIL_SECONDS,
            crossfade_seconds=QUESTION_PITCH_CROSSFADE_SECONDS,
        )
    return samples


def synthesize(text: str) -> np.ndarray:
    pipeline = KPipeline(lang_code=LANG_CODE)
    paragraphs = [part.strip() for part in text.split("\n\n") if part.strip()]
    normal_pause = np.zeros(int(SAMPLE_RATE * PARAGRAPH_PAUSE_SECONDS), dtype=np.float32)
    question_pause = np.zeros(int(SAMPLE_RATE * QUESTION_PAUSE_SECONDS), dtype=np.float32)
    parts = []
    previous_question = False

    for index, paragraph in enumerate(paragraphs, start=1):
        samples = synthesize_paragraph(pipeline, paragraph)
        if parts:
            parts.append(question_pause if previous_question else normal_pause)
        parts.append(samples)
        previous_question = is_question(paragraph)
        print(f"CONTINGENCIA IPoM · párrafo {index} · {samples.size / SAMPLE_RATE:.1f}s")

    if not parts:
        raise RuntimeError("El guion de Contingencia está vacío.")
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
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(wav_path), "-codec:a", "libmp3lame", "-b:a", "96k", str(path),
        ],
        check=True,
    )
    wav_path.unlink(missing_ok=True)


def probe_mp3(path: Path) -> float:
    if not path.exists() or path.stat().st_size < MIN_AUDIO_BYTES:
        raise RuntimeError(f"MP3 inválido o demasiado pequeño: {path}")
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    duration = float(result.stdout.strip())
    if duration < MIN_DURATION_SECONDS or duration > MAX_DURATION_SECONDS:
        raise RuntimeError(
            f"Duración fuera del objetivo ~3 min: {duration:.1f}s "
            f"(rango técnico {MIN_DURATION_SECONDS:.0f}–{MAX_DURATION_SECONDS:.0f}s)."
        )
    return round(duration, 1)


text = SCRIPT_PATH.read_text(encoding="utf-8").strip()
if not text:
    raise RuntimeError("El guion de Contingencia está vacío.")

out_dir = PUBLIC_DIR / "audio" / "readings"
out_dir.mkdir(parents=True, exist_ok=True)
mp3_path = out_dir / f"{OUTPUT_STEM}.mp3"
metadata_path = out_dir / f"{OUTPUT_STEM}.json"

samples = synthesize(text)
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
    "questionProsodyVersion": QUESTION_PROSODY_VERSION,
    "durationSeconds": duration,
    "durationLabel": f"{max(1, round(duration / 60))} min",
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
    "Contingencia IPoM audio generado: "
    f"{mp3_path.name} · {duration:.1f}s · {mp3_path.stat().st_size} bytes · "
    f"voz {VOICE} · Lexicon V{LEXICON_VERSION}.{LEXICON_REVISION} · "
    f"Normalizer V{SPEECH_NORMALIZER_VERSION} · Prosody V{QUESTION_PROSODY_VERSION}"
)
