import json
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import requests
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from audio_question_prosody import raise_terminal_pitch
from audio_speech import is_question, normalize_for_speech

SAMPLE_PATH = ROOT / "lab" / "audio-naturalness-v1" / "sample-markets-2026-09-17.txt"
OUT_DIR = ROOT / "lab" / "audio-naturalness-v1" / "out"
FASTAPI_BASE = os.environ.get("KOKORO_FASTAPI_BASE", "http://127.0.0.1:8880")

SAMPLE_RATE = 24_000
TURN_PAUSE_SECONDS = 0.28
QUESTION_TURN_PAUSE_SECONDS = 0.42
QUESTION_SPEED = 0.92
QUESTION_TAIL_SECONDS = 0.65
QUESTION_TAIL_GAIN = 1.12
QUESTION_PITCH_SEMITONES = 1.5
QUESTION_PITCH_TAIL_SECONDS = 0.65
QUESTION_PITCH_CROSSFADE_SECONDS = 0.10
FASTAPI_STATEMENT_PAUSE = 0.34
FASTAPI_QUESTION_PAUSE = 0.40
FASTAPI_QUESTION_RATE = 0.96

DIALOGUE_VOICES = {
    "VOZ 1": ("ef_dora", "e"),
    "VOZ 2": ("em_alex", "e"),
}


def parse_dialogue(text: str):
    turns = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = re.match(r"^(VOZ [12]):\s*(.+)$", line)
        if not match:
            raise RuntimeError(f"Línea inválida en muestra LAB: {line[:100]}")
        turns.append((match.group(1), match.group(2)))
    if not turns:
        raise RuntimeError("La muestra LAB no contiene turnos.")
    return turns


def pipeline_for(lang_code: str):
    if not hasattr(pipeline_for, "cache"):
        pipeline_for.cache = {}
    cache = pipeline_for.cache
    return cache.setdefault(lang_code, KPipeline(lang_code=lang_code))


def synthesize_direct(text: str, voice: str, lang_code: str, speed: float) -> np.ndarray:
    pipeline = pipeline_for(lang_code)
    speech_text = normalize_for_speech(text, "2026-09-17")
    chunks = []
    for _, _, audio in pipeline(
        speech_text,
        voice=voice,
        speed=speed,
        split_pattern=r"\n+",
    ):
        if audio is None:
            continue
        chunk = np.asarray(audio, dtype=np.float32).reshape(-1)
        if chunk.size:
            chunks.append(chunk)
    if not chunks:
        raise RuntimeError(f"Kokoro no devolvió audio para {voice}.")
    return np.concatenate(chunks)


def emphasize_question_tail(samples: np.ndarray) -> np.ndarray:
    if samples.size == 0:
        return samples
    output = samples.astype(np.float32, copy=True)
    tail_samples = min(output.size, int(SAMPLE_RATE * QUESTION_TAIL_SECONDS))
    if tail_samples <= 1:
        return output
    ramp = np.linspace(1.0, QUESTION_TAIL_GAIN, tail_samples, dtype=np.float32)
    output[-tail_samples:] *= ramp
    peak = float(np.max(np.abs(output)))
    if peak > 0.99:
        output *= 0.99 / peak
    return output


def generate_production_baseline(turns) -> np.ndarray:
    normal_silence = np.zeros(int(SAMPLE_RATE * TURN_PAUSE_SECONDS), dtype=np.float32)
    question_silence = np.zeros(
        int(SAMPLE_RATE * QUESTION_TURN_PAUSE_SECONDS), dtype=np.float32
    )
    parts = []
    previous_was_question = False

    for index, (speaker, content) in enumerate(turns):
        voice, lang_code = DIALOGUE_VOICES[speaker]
        alex_question = speaker == "VOZ 2" and is_question(content)
        samples = synthesize_direct(
            content,
            voice,
            lang_code,
            QUESTION_SPEED if alex_question else 1.0,
        )
        if alex_question:
            samples = emphasize_question_tail(samples)
            samples = raise_terminal_pitch(
                samples,
                SAMPLE_RATE,
                semitones=QUESTION_PITCH_SEMITONES,
                tail_seconds=QUESTION_PITCH_TAIL_SECONDS,
                crossfade_seconds=QUESTION_PITCH_CROSSFADE_SECONDS,
            )
        if index:
            parts.append(question_silence if previous_was_question else normal_silence)
        parts.append(samples)
        previous_was_question = alex_question

    return np.concatenate(parts)


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


def probe(path: Path):
    if not path.exists() or path.stat().st_size < 10_000:
        raise RuntimeError(f"Salida LAB inválida: {path.name}")
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
    return round(float(result.stdout.strip()), 1)


def tagged_dialogue(turns, *, blended_alex: bool) -> tuple[str, dict]:
    aliases = {
        "dora": {"voice": "ef_dora", "rate": 1.0},
        "alex": {
            "voice": "em_alex(3)+em_santa(1)" if blended_alex else "em_alex",
            "rate": FASTAPI_QUESTION_RATE,
        },
    }
    parts = []
    for speaker, content in turns:
        alias = "dora" if speaker == "VOZ 1" else "alex"
        normalized = normalize_for_speech(content, "2026-09-17")
        parts.append(f"[voice:{alias}] {normalized}")
        pause = FASTAPI_QUESTION_PAUSE if speaker == "VOZ 2" and is_question(content) else FASTAPI_STATEMENT_PAUSE
        parts.append(f"[pause:{pause:.2f}s]")
    return " ".join(parts), aliases


def generate_fastapi(turns, target: Path, *, blended_alex: bool) -> None:
    tagged, aliases = tagged_dialogue(turns, blended_alex=blended_alex)
    response = requests.post(
        f"{FASTAPI_BASE}/v1/audio/speech",
        json={
            "model": "kokoro",
            "voice": "dora",
            "input": tagged,
            "response_format": "mp3",
            "speed": 1.0,
            "allow_voice_tags": True,
            "voice_aliases": aliases,
        },
        timeout=300,
    )
    if response.status_code != 200:
        raise RuntimeError(
            f"Kokoro-FastAPI devolvió HTTP {response.status_code}: {response.text[:500]}"
        )
    target.write_bytes(response.content)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    turns = parse_dialogue(SAMPLE_PATH.read_text(encoding="utf-8"))

    baseline_path = OUT_DIR / "a-production-current.mp3"
    write_mp3(baseline_path, generate_production_baseline(turns))

    fastapi_path = OUT_DIR / "b-fastapi-dialogue.mp3"
    generate_fastapi(turns, fastapi_path, blended_alex=False)

    blend_path = OUT_DIR / "c-fastapi-alex-blend.mp3"
    generate_fastapi(turns, blend_path, blended_alex=True)

    manifest = {
        "schemaVersion": 1,
        "experiment": "kokoro-naturalness-v1",
        "date": "2026-09-17",
        "sourceId": "2026-09-17-markets-fed-aplana-la-curva-y-el-dolar-toma-el-relevo",
        "productionTouched": False,
        "fastApiVersion": "v0.9.0",
        "baseline": {
            "voice1": "ef_dora",
            "voice2": "em_alex",
            "questionSpeed": QUESTION_SPEED,
            "questionPitchSemitones": QUESTION_PITCH_SEMITONES,
            "turnPauseSeconds": TURN_PAUSE_SECONDS,
            "questionTurnPauseSeconds": QUESTION_TURN_PAUSE_SECONDS,
            "file": baseline_path.name,
            "durationSeconds": probe(baseline_path),
        },
        "fastApiDialogue": {
            "voice1": "ef_dora",
            "voice2": "em_alex",
            "voice2Rate": FASTAPI_QUESTION_RATE,
            "turnPauseSeconds": FASTAPI_STATEMENT_PAUSE,
            "questionTurnPauseSeconds": FASTAPI_QUESTION_PAUSE,
            "file": fastapi_path.name,
            "durationSeconds": probe(fastapi_path),
        },
        "fastApiBlend": {
            "voice1": "ef_dora",
            "voice2": "em_alex(3)+em_santa(1)",
            "voice2Rate": FASTAPI_QUESTION_RATE,
            "turnPauseSeconds": FASTAPI_STATEMENT_PAUSE,
            "questionTurnPauseSeconds": FASTAPI_QUESTION_PAUSE,
            "file": blend_path.name,
            "durationSeconds": probe(blend_path),
        },
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("LAB naturalidad V1 generado: producción / FastAPI / blend Alex.")


if __name__ == "__main__":
    main()
