import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


PLAN_PATH = Path(os.environ["ATLAS_AUDIO_PLAN"])
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
SAMPLE_RATE = 24_000


def duration_label(seconds: float) -> str:
    minutes = max(1, round(seconds / 60))
    return f"{minutes} min"


plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
if not plan.get("needsGeneration"):
    print("Kokoro omitido: el audio vigente ya coincide con las fuentes publicadas.")
    raise SystemExit(0)

text = str(plan["script"]).strip()
voice = str(plan.get("voice") or "ef_dora")
speed = float(os.environ.get("ATLAS_AUDIO_SPEED", "1.0"))
if not text:
    raise RuntimeError("El plan de audio no contiene un guion narrable.")

pipeline = KPipeline(lang_code="e")
chunks = []
for _, _, audio in pipeline(
    text,
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
    raise RuntimeError("Kokoro no devolvió audio para el guion diario.")

samples = np.concatenate(chunks)
audio_dir = PUBLIC_DIR / "audio"
audio_dir.mkdir(parents=True, exist_ok=True)

date = str(plan["date"])
filename = f"{date}-resumen-diario.mp3"
wave_path = audio_dir / f"{date}-resumen-diario.wav"
mp3_path = audio_dir / filename

sf.write(wave_path, samples, SAMPLE_RATE)
subprocess.run(
    [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(wave_path),
        "-codec:a",
        "libmp3lame",
        "-b:a",
        "96k",
        str(mp3_path),
    ],
    check=True,
)
wave_path.unlink(missing_ok=True)

for old_audio in audio_dir.glob("*-resumen-diario.mp3"):
    if old_audio.name != filename:
        old_audio.unlink()

duration_seconds = round(len(samples) / SAMPLE_RATE, 1)
metadata = {
    "schemaVersion": 1,
    "scriptVersion": plan.get("scriptVersion", 1),
    "status": "published",
    "date": date,
    "title": plan["title"],
    "summary": plan["summary"],
    "path": f"/audio/{filename}",
    "durationSeconds": duration_seconds,
    "durationLabel": duration_label(duration_seconds),
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "engine": plan.get("engine", "Kokoro-82M"),
    "voice": voice,
    "language": "es",
    "completeness": plan.get("completeness", 1),
    "sourceIds": plan["sourceIds"],
}
(audio_dir / "latest.json").write_text(
    json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(
    f"Audio diario generado: {filename} · {duration_seconds:.1f}s · "
    f"voz {voice} · paquete {metadata['completeness']}/3 · guion v{metadata['scriptVersion']}."
)
