import os
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
SCRIPT_PATH = ROOT / "lab" / "exp1-voice-test.txt"
SAMPLE_RATE = 24_000
VOICES = ("em_alex", "em_santa")

text = SCRIPT_PATH.read_text(encoding="utf-8").strip()
if not text:
    raise RuntimeError("El guion estático del LAB está vacío.")

pipeline = KPipeline(lang_code="e")
out_dir = PUBLIC_DIR / "lab" / "audio"
out_dir.mkdir(parents=True, exist_ok=True)

for voice in VOICES:
    chunks = []
    for _, _, audio in pipeline(
        text,
        voice=voice,
        speed=1.0,
        split_pattern=r"\n+",
    ):
        if audio is None:
            continue
        array = np.asarray(audio, dtype=np.float32).reshape(-1)
        if array.size:
            chunks.append(array)

    if not chunks:
        raise RuntimeError(f"Kokoro no devolvió audio para {voice}.")

    samples = np.concatenate(chunks)
    stem = f"exp1-{voice}"
    wav_path = out_dir / f"{stem}.wav"
    mp3_path = out_dir / f"{stem}.mp3"
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
    print(f"LAB exp1 generado: {mp3_path.name} · voz {voice}")
