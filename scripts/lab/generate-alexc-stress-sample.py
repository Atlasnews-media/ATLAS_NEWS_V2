import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from audio_alexc import CHATTERBOX_ENGINE, VOICE_PROFILE_VERSION, synthesize_alexc

PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
OUTPUT_DIR = PUBLIC_DIR / "lab" / "audio" / "alexc-stress-v1"
REFERENCE_DATE = "2026-09-18"
SAMPLE_RATE = 24_000

DISPLAY_TEXT = (
    "El mapa monetario global se endurece mientras el shock energético pierde "
    "intensidad inmediata, pero no desaparece. La Reserva Federal mantiene una "
    "postura restrictiva y el petróleo sigue bajo presión. La señal relevante será "
    "si los bancos centrales confirman este escenario y si la normalización logística "
    "reduce los riesgos de inflación."
)

# Hipótesis LAB: marcar explícitamente la sílaba tónica en speech_text, incluso
# cuando la ortografía española normalmente no necesita tilde. El display_text
# productivo no se modifica.
SPEECH_TEXT = (
    "El mapa monetário global se endurece mientras el shock energético pierde "
    "intensidád inmediáta, pero no desaparece. La Resérva Federál mantiene una "
    "postúra restríctiva y el petróleo sigue bajo presión. La señal relevánte será "
    "si los báncos centráles confírman este escenário y si la normalizáción logística "
    "reduce los riesgos de inflación."
)

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
samples = synthesize_alexc(
    SPEECH_TEXT,
    PUBLIC_DIR,
    REFERENCE_DATE,
    seed_base=9100,
    long_form=False,
)

wav_path = OUTPUT_DIR / "alexc-accent-corrected.wav"
mp3_path = OUTPUT_DIR / "alexc-accent-corrected.mp3"
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

probe = subprocess.run(
    [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(mp3_path),
    ],
    check=True,
    capture_output=True,
    text=True,
)
duration = round(float(probe.stdout.strip()), 1)

manifest = {
    "schemaVersion": 1,
    "experiment": "alexc-stress-v1",
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "productionTouched": False,
    "sourceDate": REFERENCE_DATE,
    "engine": CHATTERBOX_ENGINE,
    "voiceProfileVersion": VOICE_PROFILE_VERSION,
    "strategy": "explicit-stress-marks-in-speech-text",
    "displayText": DISPLAY_TEXT,
    "speechText": SPEECH_TEXT,
    "audio": {
        "path": "/lab/audio/alexc-stress-v1/alexc-accent-corrected.mp3",
        "durationSeconds": duration,
        "bytes": mp3_path.stat().st_size,
    },
}
(OUTPUT_DIR / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(f"LAB Alex C acentuación listo: {duration:.1f}s")
