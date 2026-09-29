import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from audio_alexc import CHATTERBOX_ENGINE, VOICE_PROFILE_VERSION, synthesize_alexc

PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
OUTPUT_DIR = PUBLIC_DIR / "lab" / "audio" / "alexc-prosody-words-v2"
REFERENCE_DATE = "2026-09-18"
SAMPLE_RATE = 24_000
PAUSE_SECONDS = 0.55

# Todo el texto conserva ortografía española normal.
# La intervención LAB consiste únicamente en:
# 1) frases cortas y naturales;
# 2) cada frase se sintetiza por separado;
# 3) se añade una micro-pausa entre frases.
SENTENCES = [
    "Con mayor intensidad, la presión energética vuelve al centro del debate.",
    "El próximo dato será decisivo para la Reserva Federal.",
    "Este escenario exige una lectura más cautelosa de los mercados.",
    "La normalización logística será gradual y dependerá del tráfico por Hormuz.",
]

parts = []
for index, sentence in enumerate(SENTENCES):
    samples = synthesize_alexc(
        sentence,
        PUBLIC_DIR,
        REFERENCE_DATE,
        seed_base=9200 + index,
        long_form=False,
    )
    if index:
        parts.append(
            np.zeros(int(SAMPLE_RATE * PAUSE_SECONDS), dtype=np.float32)
        )
    parts.append(samples)

audio = np.concatenate(parts)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

wav_path = OUTPUT_DIR / "alexc-prosody-words-v2.wav"
mp3_path = OUTPUT_DIR / "alexc-prosody-words-v2.mp3"
sf.write(wav_path, audio, SAMPLE_RATE)
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
    "experiment": "alexc-prosody-words-v2",
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "productionTouched": False,
    "sourceDate": REFERENCE_DATE,
    "engine": CHATTERBOX_ENGINE,
    "voiceProfileVersion": VOICE_PROFILE_VERSION,
    "strategy": "correct-orthography-short-sentence-segmentation",
    "pauseSeconds": PAUSE_SECONDS,
    "sentences": SENTENCES,
    "targets": ["intensidad", "será", "escenario", "normalización"],
    "audio": {
        "path": "/lab/audio/alexc-prosody-words-v2/alexc-prosody-words-v2.mp3",
        "durationSeconds": duration,
        "bytes": mp3_path.stat().st_size,
    },
}
(OUTPUT_DIR / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(f"LAB Alex C prosodia v2 listo: {duration:.1f}s")
