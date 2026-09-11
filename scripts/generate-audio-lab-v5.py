import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

from audio_speech import SPEECH_NORMALIZER_VERSION, normalize_for_speech
from audio_speech_lab_v5 import LAB_SPOKEN_FORM_VERSION, normalize_for_speech_lab_v5

ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = ROOT / "lab" / "audio-v2" / "2026-09-11-spoken-form-v5-source.txt"
REPORT_PATH = ROOT / "lab" / "audio-v2" / "2026-09-11-speech-v5-preview.md"
OUTPUT_DIR = ROOT / "public" / "lab" / "audio"
CURRENT_MP3 = OUTPUT_DIR / "speech-v5-current.mp3"
PROPOSED_MP3 = OUTPUT_DIR / "speech-v5-proposed.mp3"
REFERENCE_DATE = "2026-09-11"
VOICE = "ef_dora"
SAMPLE_RATE = 24_000


def synthesize(pipeline: KPipeline, text: str) -> np.ndarray:
    chunks = []
    for _, _, audio in pipeline(
        text,
        voice=VOICE,
        speed=1.0,
        split_pattern=r"\n+",
    ):
        if audio is None:
            continue
        chunk = np.asarray(audio, dtype=np.float32).reshape(-1)
        if chunk.size:
            chunks.append(chunk)
    if not chunks:
        raise RuntimeError("Kokoro no devolvió audio para la prueba LAB.")
    return np.concatenate(chunks)


def write_mp3(path: Path, samples: np.ndarray):
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


source = SOURCE_PATH.read_text(encoding="utf-8").strip()
current_speech = normalize_for_speech(source, REFERENCE_DATE)
proposed_speech, changes = normalize_for_speech_lab_v5(source, REFERENCE_DATE)

if current_speech == proposed_speech:
    raise RuntimeError("La prueba LAB no produjo diferencias entre V4 y V5.")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
pipeline = KPipeline(lang_code="e")
write_mp3(CURRENT_MP3, synthesize(pipeline, current_speech))
write_mp3(PROPOSED_MP3, synthesize(pipeline, proposed_speech))

change_lines = "\n".join(
    f"- `{item['source']}` → `{item['target']}` (`{item['rule']}`)" for item in changes
)
report = (
    "# ATLAS NEWS — LAB Speech Normalizer V5\n\n"
    f"Fecha: {REFERENCE_DATE}\n"
    "Estado: LAB / NO PRODUCTIVO\n"
    f"Voz: `{VOICE}`\n"
    f"Normalizador productivo de base: V{SPEECH_NORMALIZER_VERSION}\n"
    f"Adaptador oral experimental: V{LAB_SPOKEN_FORM_VERSION}\n\n"
    "## Texto editorial intacto\n\n"
    f"> {source.replace(chr(10), ' ')}\n\n"
    "## Speech text actual — V4\n\n"
    f"> {current_speech}\n\n"
    "## Speech text propuesto — V5 LAB\n\n"
    f"> {proposed_speech}\n\n"
    "## Transformaciones aplicadas\n\n"
    f"{change_lines}\n\n"
    "## Contrato del experimento\n\n"
    "- No modifica `display_text`.\n"
    "- No modifica `scripts/audio_speech.py`.\n"
    "- No modifica Lexicon V3 ni Numeric Normalizer V4.\n"
    "- Solo prueba verbalización financiera controlada antes de Kokoro.\n"
    "- Ningún cambio queda autorizado para producción por esta prueba.\n"
)
REPORT_PATH.write_text(report, encoding="utf-8")

print(f"LAB V5 generado: {CURRENT_MP3.name} / {PROPOSED_MP3.name}")
