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
SCRIPT_PATH = ROOT / "lab" / "international-2026-09-08-alex.txt"
OUTPUT_STEM = "international-2026-09-08-alex"
SOURCE_ID = "2026-09-08-daily-shock-energetico-amplia-su-alcance"
VOICE = "em_alex"
LANG_CODE = "e"
REFERENCE_DATE = "2026-09-08"
SAMPLE_RATE = 24_000
SPEED = 1.0
PARAGRAPH_PAUSE_SECONDS = 0.30
QUESTION_SPEED = 0.92
QUESTION_PITCH_SEMITONES = 1.5
QUESTION_PITCH_TAIL_SECONDS = 0.65
QUESTION_PITCH_CROSSFADE_SECONDS = 0.10
MIN_DURATION_SECONDS = 120.0
MIN_AUDIO_BYTES = 250_000

pipeline = KPipeline(lang_code=LANG_CODE)


def synthesize_paragraph(text: str, *, question: bool = False) -> np.ndarray:
    speech_text = normalize_for_speech(text, REFERENCE_DATE)
    chunks = []
    for _, _, audio in pipeline(
        speech_text,
        voice=VOICE,
        speed=QUESTION_SPEED if question else SPEED,
        split_pattern=r"\n+",
    ):
        if audio is None:
            continue
        array = np.asarray(audio, dtype=np.float32).reshape(-1)
        if array.size:
            chunks.append(array)
    if not chunks:
        raise RuntimeError("Kokoro no devolvió audio para un párrafo del LAB internacional.")
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


def synthesize_script(text: str) -> np.ndarray:
    pause = np.zeros(int(SAMPLE_RATE * PARAGRAPH_PAUSE_SECONDS), dtype=np.float32)
    parts = []
    paragraphs = [item.strip() for item in text.split("\n\n") if item.strip()]
    for index, paragraph in enumerate(paragraphs, start=1):
        question = is_question(paragraph)
        samples = synthesize_paragraph(paragraph, question=question)
        if parts:
            parts.append(pause)
        parts.append(samples)
        print(
            f"LAB-INTERNATIONAL · párrafo {index}/{len(paragraphs)} · "
            f"{samples.size / SAMPLE_RATE:.1f}s · pregunta={question}"
        )
    if not parts:
        raise RuntimeError("El guion LAB internacional está vacío.")
    output = np.concatenate(parts)
    peak = float(np.max(np.abs(output)))
    if peak <= 0.0:
        raise RuntimeError("Audio silencioso: peak=0.")
    if peak > 0.99:
        output *= 0.99 / peak
    return output


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
out_dir = PUBLIC_DIR / "lab" / "audio"
out_dir.mkdir(parents=True, exist_ok=True)
mp3_path = out_dir / f"{OUTPUT_STEM}.mp3"
metadata_path = out_dir / f"{OUTPUT_STEM}.json"

samples = synthesize_script(text)
write_mp3(mp3_path, samples)
duration = probe_mp3(mp3_path)

metadata = {
    "schemaVersion": 1,
    "labId": "AUD-INTERNATIONAL-2026-09-08-ALEX",
    "status": "lab_generated",
    "sourceId": SOURCE_ID,
    "sourceCommit": os.environ.get("ATLAS_SOURCE_COMMIT"),
    "labCommit": os.environ.get("GITHUB_SHA"),
    "voice": VOICE,
    "language": "es",
    "engine": "Kokoro-82M",
    "speed": SPEED,
    "speechNormalizerVersion": SPEECH_NORMALIZER_VERSION,
    "lexiconVersion": LEXICON_VERSION,
    "lexiconRevision": LEXICON_REVISION,
    "questionProsodyVersion": 2,
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
    f"LAB internacional generado: {mp3_path.name} · {duration:.1f}s · "
    f"voz {VOICE} · normalizador {SPEECH_NORMALIZER_VERSION}"
)
