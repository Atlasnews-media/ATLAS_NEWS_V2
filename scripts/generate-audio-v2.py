import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

from audio_question_prosody import raise_terminal_pitch
from audio_speech import (
    LEXICON_REVISION,
    LEXICON_VERSION,
    is_question,
    normalize_for_speech,
)

PLAN_PATH = Path(os.environ["ATLAS_AUDIO_V2_PLAN"])
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
SAMPLE_RATE = 24_000
TURN_PAUSE_SECONDS = 0.28
QUESTION_TURN_PAUSE_SECONDS = 0.42
QUESTION_SPEED = float(os.environ.get("ATLAS_AUDIO_QUESTION_SPEED", "0.92"))
QUESTION_TAIL_SECONDS = 0.65
QUESTION_TAIL_GAIN = 1.12
QUESTION_PITCH_SEMITONES = float(
    os.environ.get("ATLAS_AUDIO_QUESTION_PITCH_SEMITONES", "1.5")
)
QUESTION_PITCH_TAIL_SECONDS = float(
    os.environ.get("ATLAS_AUDIO_QUESTION_PITCH_TAIL_SECONDS", "0.65")
)
QUESTION_PITCH_CROSSFADE_SECONDS = float(
    os.environ.get("ATLAS_AUDIO_QUESTION_PITCH_CROSSFADE_SECONDS", "0.10")
)
MIN_AUDIO_BYTES = 10_000
MIN_DURATION_SECONDS = 5.0
SPEECH_NORMALIZER_VERSION = 3
QUESTION_PROSODY_VERSION = 2

DIALOGUE_VOICES = {
    "VOZ 1": ("ef_dora", "e"),
    "VOZ 2": ("em_alex", "e"),
}

pipelines = {}


def pipeline_for(lang_code: str):
    return pipelines.setdefault(lang_code, KPipeline(lang_code=lang_code))


def synthesize(
    text: str,
    voice: str,
    lang_code: str = "e",
    reference_date: str | None = None,
    speed_override: float | None = None,
) -> np.ndarray:
    chunks = []
    pipeline = pipeline_for(lang_code)
    speech_text = normalize_for_speech(text, reference_date)
    speed = (
        speed_override
        if speed_override is not None
        else float(os.environ.get("ATLAS_AUDIO_SPEED", "1.0"))
    )
    for _, _, audio in pipeline(
        speech_text,
        voice=voice,
        speed=speed,
        split_pattern=r"\n+",
    ):
        if audio is None:
            continue
        array = np.asarray(audio, dtype=np.float32).reshape(-1)
        if array.size:
            chunks.append(array)
    if not chunks:
        raise RuntimeError(f"Kokoro no devolvió audio para {voice}.")
    return np.concatenate(chunks)


def parse_dialogue(text: str):
    turns = []
    current_speaker = None
    current_lines = []

    def flush():
        nonlocal current_speaker, current_lines
        if current_speaker and current_lines:
            content = " ".join(current_lines).strip()
            if content:
                turns.append((current_speaker, content))
        current_speaker = None
        current_lines = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = re.match(r"^(VOZ [12]):\s*(.+)$", line)
        if match:
            flush()
            current_speaker = match.group(1)
            current_lines = [match.group(2)]
        elif current_speaker:
            current_lines.append(line)
        else:
            raise RuntimeError(f"Línea sin hablante: {line[:80]}")

    flush()
    if not turns:
        raise RuntimeError("No se detectaron turnos de diálogo.")
    unknown = {speaker for speaker, _ in turns} - set(DIALOGUE_VOICES)
    if unknown:
        raise RuntimeError(f"Hablantes sin configurar: {sorted(unknown)}")
    return turns


def emphasize_question_tail(samples: np.ndarray) -> np.ndarray:
    if samples.size == 0:
        return samples
    output = samples.astype(np.float32, copy=True)
    tail_samples = min(
        output.size,
        int(SAMPLE_RATE * QUESTION_TAIL_SECONDS),
    )
    if tail_samples <= 1:
        return output
    ramp = np.linspace(1.0, QUESTION_TAIL_GAIN, tail_samples, dtype=np.float32)
    output[-tail_samples:] *= ramp
    peak = float(np.max(np.abs(output)))
    if peak > 0.99:
        output *= 0.99 / peak
    return output


def synthesize_dialogue(text: str, reference_date: str) -> np.ndarray:
    turns = parse_dialogue(text)
    normal_silence = np.zeros(
        int(SAMPLE_RATE * TURN_PAUSE_SECONDS), dtype=np.float32
    )
    question_silence = np.zeros(
        int(SAMPLE_RATE * QUESTION_TURN_PAUSE_SECONDS), dtype=np.float32
    )
    parts = []
    previous_was_question = False

    for index, (speaker, content) in enumerate(turns):
        voice, lang_code = DIALOGUE_VOICES[speaker]
        alex_question = speaker == "VOZ 2" and is_question(content)
        samples = synthesize(
            content,
            voice,
            lang_code,
            reference_date=reference_date,
            speed_override=QUESTION_SPEED if alex_question else None,
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


def write_mp3(output_path: Path, samples: np.ndarray):
    wav_path = output_path.with_suffix(".wav")
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
            str(output_path),
        ],
        check=True,
    )
    wav_path.unlink(missing_ok=True)


def probe_mp3(path: Path):
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
    if duration < MIN_DURATION_SECONDS:
        raise RuntimeError(f"Duración inválida para {path.name}: {duration:.1f}s")
    return round(duration, 1), path.stat().st_size


def duration_label(seconds: float):
    return f"{max(1, round(seconds / 60))} min"


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
if not plan.get("needsGeneration"):
    print("Audio V2 omitido: no hay síntesis pendiente.")
    raise SystemExit(0)
if (
    plan.get("lexiconVersion") != LEXICON_VERSION
    or plan.get("lexiconRevision") != LEXICON_REVISION
):
    raise RuntimeError("El plan de Audio V2 no coincide con la revisión del Lexicon V3.")

audio_dir = PUBLIC_DIR / "audio"
audio_dir.mkdir(parents=True, exist_ok=True)
existing_analysis = read_json(audio_dir / "analysis-latest.json") or {
    "schemaVersion": 1
}
now = datetime.now(timezone.utc).isoformat()
date = str(plan["date"])
source_commit = os.environ.get("ATLAS_SOURCE_SHA") or os.environ.get("GITHUB_SHA")

with tempfile.TemporaryDirectory(prefix="atlas-audio-v2-") as temp_dir_name:
    temp_dir = Path(temp_dir_name)
    staged_files = []

    cover_product = plan["products"]["cover"]
    cover_metadata = None
    if cover_product.get("needsGeneration"):
        cover_plan = cover_product["plan"]
        cover_text = str(cover_plan.get("script") or "").strip()
        if not cover_text:
            raise RuntimeError("El guion de Portada está vacío.")
        cover_voice = str(cover_plan.get("voice") or "ef_dora")
        samples = synthesize(
            cover_text,
            cover_voice,
            "e",
            reference_date=date,
        )
        cover_filename = f"{date}-resumen-diario.mp3"
        cover_temp = temp_dir / cover_filename
        write_mp3(cover_temp, samples)
        duration, size_bytes = probe_mp3(cover_temp)
        staged_files.append((cover_temp, audio_dir / cover_filename))
        cover_metadata = {
            "schemaVersion": 1,
            "scriptVersion": cover_plan.get("scriptVersion", 1),
            "speechNormalizerVersion": SPEECH_NORMALIZER_VERSION,
            "lexiconVersion": LEXICON_VERSION,
            "lexiconRevision": LEXICON_REVISION,
            "questionProsodyVersion": QUESTION_PROSODY_VERSION,
            "status": "published",
            "date": date,
            "title": cover_plan["title"],
            "summary": cover_plan["summary"],
            "path": f"/audio/{cover_filename}",
            "durationSeconds": duration,
            "durationLabel": duration_label(duration),
            "bytes": size_bytes,
            "generatedAt": now,
            "engine": cover_plan.get("engine", "Kokoro-82M"),
            "voice": cover_voice,
            "language": "es",
            "completeness": cover_plan.get("completeness", 1),
            "sourceIds": cover_plan["sourceIds"],
            "sourceCommit": source_commit,
        }

    analysis_manifest = {
        "schemaVersion": 1,
        "date": date,
        "generatedAt": now,
        "sourceCommit": source_commit,
        "speechNormalizerVersion": SPEECH_NORMALIZER_VERSION,
        "lexiconVersion": LEXICON_VERSION,
        "lexiconRevision": LEXICON_REVISION,
        "questionProsodyVersion": QUESTION_PROSODY_VERSION,
    }

    for section in ("national", "markets"):
        product = plan["products"][section]
        existing = existing_analysis.get(section)

        if not product.get("sourceId"):
            analysis_manifest[section] = {
                "status": "unavailable",
                "sourceId": None,
                "reason": "source_missing",
            }
            continue

        if not product.get("needsGeneration"):
            if (
                existing
                and existing.get("status") == "published"
                and existing.get("sourceId") == product.get("sourceId")
                and existing.get("scriptHash") == product.get("scriptHash")
                and existing.get("lexiconVersion") == LEXICON_VERSION
                and existing.get("lexiconRevision") == LEXICON_REVISION
            ):
                analysis_manifest[section] = existing
            else:
                analysis_manifest[section] = {
                    "status": "unavailable",
                    "sourceId": product.get("sourceId"),
                    "reason": product.get("unavailableReason") or "not_generated",
                    "scriptVersion": product.get("scriptVersion"),
                    "scriptHash": product.get("scriptHash"),
                }
            continue

        try:
            if section == "markets" and plan.get("simulateMarketsFailure"):
                raise RuntimeError("Fallo de Mercados simulado por prueba de aislamiento.")

            script = str(product.get("script") or "").strip()
            if not script:
                raise RuntimeError(f"Guion {section} vacío.")
            samples = synthesize_dialogue(script, reference_date=date)
            filename = f"{date}-{section}-analysis.mp3"
            temp_path = temp_dir / filename
            write_mp3(temp_path, samples)
            duration, size_bytes = probe_mp3(temp_path)
            staged_files.append((temp_path, audio_dir / filename))
            analysis_manifest[section] = {
                "status": "published",
                "sourceId": product["sourceId"],
                "path": f"/audio/{filename}",
                "durationSeconds": duration,
                "durationLabel": duration_label(duration),
                "bytes": size_bytes,
                "scriptVersion": product["scriptVersion"],
                "scriptHash": product["scriptHash"],
                "speechNormalizerVersion": SPEECH_NORMALIZER_VERSION,
                "lexiconVersion": LEXICON_VERSION,
                "lexiconRevision": LEXICON_REVISION,
                "questionProsodyVersion": QUESTION_PROSODY_VERSION,
                "engine": "Kokoro-82M",
                "voices": {"voice1": "ef_dora", "voice2": "em_alex"},
                "language": "es",
            }
        except Exception as exc:
            analysis_manifest[section] = {
                "status": "unavailable",
                "sourceId": product.get("sourceId"),
                "reason": "generation_failed",
                "error": str(exc)[:240],
                "scriptVersion": product.get("scriptVersion"),
                "scriptHash": product.get("scriptHash"),
                "lexiconVersion": LEXICON_VERSION,
                "lexiconRevision": LEXICON_REVISION,
            }
            print(f"Audio V2 {section}: unavailable · {exc}")

    # Atomic publication boundary: no public file is mutated before this point.
    for source, destination in staged_files:
        shutil.copy2(source, destination)

    if cover_metadata is not None:
        (audio_dir / "latest.json").write_text(
            json.dumps(cover_metadata, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    (audio_dir / "analysis-latest.json").write_text(
        json.dumps(analysis_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

print(
    "Audio V2 preparado: "
    f"portada={'nueva' if cover_metadata else 'conservada'}, "
    f"nacional={analysis_manifest['national']['status']}, "
    f"mercados={analysis_manifest['markets']['status']}."
)
