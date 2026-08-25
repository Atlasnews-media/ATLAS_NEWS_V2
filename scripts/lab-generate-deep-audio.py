import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


PLAN_PATH = Path(os.environ["ATLAS_LAB_EXP2_PLAN"])
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
SAMPLE_RATE = 24_000
TURN_PAUSE_SECONDS = float(os.environ.get("ATLAS_LAB_TURN_PAUSE_SECONDS", "0.34"))
SPEED = float(os.environ.get("ATLAS_LAB_AUDIO_SPEED", "1.0"))


def lang_code_for_voice(voice: str) -> str:
    if not voice:
        raise ValueError("Voice vacío.")
    code = voice[0].lower()
    if code not in {"a", "b", "e", "f", "h", "i", "j", "p", "z"}:
        raise ValueError(f"No se pudo inferir lang_code para {voice}.")
    return code


def duration_seconds(samples: np.ndarray) -> float:
    return round(len(samples) / SAMPLE_RATE, 1)


def synthesize_turn(pipeline: KPipeline, text: str, voice: str) -> np.ndarray:
    chunks = []
    for _, _, audio in pipeline(
        text,
        voice=voice,
        speed=SPEED,
        split_pattern=r"\n+",
    ):
        if audio is None:
            continue
        array = np.asarray(audio, dtype=np.float32).reshape(-1)
        if array.size:
            chunks.append(array)
    if not chunks:
        raise RuntimeError(f"Kokoro no devolvió audio para {voice}: {text[:80]}")
    return np.concatenate(chunks)


def encode_mp3(samples: np.ndarray, stem: Path) -> tuple[Path, float]:
    start = time.perf_counter()
    wav_path = stem.with_suffix(".wav")
    mp3_path = stem.with_suffix(".mp3")
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
            str(mp3_path),
        ],
        check=True,
    )
    wav_path.unlink(missing_ok=True)
    return mp3_path, time.perf_counter() - start


run_started = time.perf_counter()
plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
if plan.get("experiment") != "exp2":
    raise RuntimeError("El plan no corresponde a LAB exp2.")

out_dir = PUBLIC_DIR / "lab" / "audio"
out_dir.mkdir(parents=True, exist_ok=True)

voices = {
    section_name: section["voices"]
    for section_name, section in plan["sections"].items()
}
lang_codes = sorted(
    {
        lang_code_for_voice(voice)
        for section_voices in voices.values()
        for voice in section_voices.values()
    }
)

load_started = time.perf_counter()
pipelines = {code: KPipeline(lang_code=code) for code in lang_codes}
kokoro_load_seconds = time.perf_counter() - load_started

pause = np.zeros(max(1, int(SAMPLE_RATE * TURN_PAUSE_SECONDS)), dtype=np.float32)
section_metrics = {}
encode_seconds = 0.0

for section_name in ("national", "markets"):
    section = plan["sections"][section_name]
    tts_started = time.perf_counter()
    pieces = []

    for index, turn in enumerate(section["dialogue"]):
        speaker = turn["speaker"]
        voice = section["voices"][speaker]
        pipeline = pipelines[lang_code_for_voice(voice)]
        samples = synthesize_turn(pipeline, turn["text"], voice)
        pieces.append(samples)
        if index < len(section["dialogue"]) - 1:
            pieces.append(pause)

    combined = np.concatenate(pieces)
    tts_seconds = time.perf_counter() - tts_started
    stem = out_dir / f"exp2-{section_name}"
    mp3_path, section_encode_seconds = encode_mp3(combined, stem)
    encode_seconds += section_encode_seconds

    section_metrics[section_name] = {
        "ttsSeconds": round(tts_seconds, 3),
        "audioSeconds": duration_seconds(combined),
        "fileBytes": mp3_path.stat().st_size,
        "wordCount": section["wordCount"],
        "estimatedDurationSeconds": section["estimatedDurationSeconds"],
        "voices": section["voices"],
        "turns": len(section["dialogue"]),
        "path": f"/lab/audio/{mp3_path.name}",
    }
    print(
        f"LAB exp2 {section_name}: {section_metrics[section_name]['audioSeconds']}s de audio · "
        f"TTS {section_metrics[section_name]['ttsSeconds']}s · {mp3_path.name}"
    )

benchmark = {
    "schemaVersion": 1,
    "experiment": "exp2",
    "status": "generated",
    "date": plan["date"],
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "setupSeconds": float(os.environ.get("ATLAS_LAB_SETUP_SECONDS", "0")),
    "kokoroLoadSeconds": round(kokoro_load_seconds, 3),
    "nationalTtsSeconds": section_metrics["national"]["ttsSeconds"],
    "marketsTtsSeconds": section_metrics["markets"]["ttsSeconds"],
    "encodeSeconds": round(encode_seconds, 3),
    "publishSeconds": None,
    "totalSecondsBeforePublish": round(time.perf_counter() - run_started, 3),
    "totalSeconds": None,
    "kokoroCacheHit": os.environ.get("ATLAS_LAB_KOKORO_CACHE_HIT", "false").lower() == "true",
    "turnPauseSeconds": TURN_PAUSE_SECONDS,
    "speed": SPEED,
    "sections": section_metrics,
    "sourceIds": plan["sections"]["national"]["sourceIds"],
}

(out_dir / "exp2-benchmark.json").write_text(
    json.dumps(benchmark, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(
    "LAB exp2 generado. Benchmark preliminar escrito; publishSeconds y totalSeconds "
    "se completan en el workflow después de medir la publicación."
)
