import os
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
EXP1_SCRIPT_PATH = ROOT / "lab" / "exp1-voice-test.txt"
DIALOGUE_SCRIPTS = {
    "exp2-national-dialogue": ROOT / "lab" / "exp2-national-dialogue.txt",
    "exp2-markets-dialogue": ROOT / "lab" / "exp2-markets-dialogue.txt",
}
EXP4_SCRIPTS = {
    "exp4-speech-current": ROOT / "lab" / "exp4-speech-current.txt",
    "exp4-speech-normalized": ROOT / "lab" / "exp4-speech-normalized.txt",
}
SAMPLE_RATE = 24_000
TURN_PAUSE_SECONDS = 0.28

EXP1_VOICES = (
    ("em_alex", "e"),
    ("em_santa", "e"),
    ("af_heart", "a"),
)

DIALOGUE_VOICES = {
    "VOZ 1": ("ef_dora", "e"),
    "VOZ 2": ("em_alex", "e"),
}

EXP4_VOICE = ("ef_dora", "e")

out_dir = PUBLIC_DIR / "lab" / "audio"
out_dir.mkdir(parents=True, exist_ok=True)
pipelines = {}


def pipeline_for(lang_code):
    return pipelines.setdefault(lang_code, KPipeline(lang_code=lang_code))


def synthesize(text, voice, lang_code):
    chunks = []
    pipeline = pipeline_for(lang_code)
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

    return np.concatenate(chunks)


def write_mp3(stem, samples):
    mp3_path = out_dir / f"{stem}.mp3"
    wav_path = out_dir / f"{stem}.wav"
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
    return mp3_path


def generate_exp1():
    text = EXP1_SCRIPT_PATH.read_text(encoding="utf-8").strip()
    if not text:
        raise RuntimeError("El guion estático del LAB está vacío.")

    for voice, lang_code in EXP1_VOICES:
        stem = f"exp1-{voice}"
        mp3_path = out_dir / f"{stem}.mp3"
        if mp3_path.exists() and mp3_path.stat().st_size > 0:
            print(f"LAB exp1 reutilizado: {mp3_path.name} · voz {voice}")
            continue

        samples = synthesize(text, voice, lang_code)
        write_mp3(stem, samples)
        print(f"LAB exp1 generado: {mp3_path.name} · voz {voice} · idioma {lang_code}")


def parse_dialogue(path):
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        raise RuntimeError(f"El guion de diálogo está vacío: {path.name}")

    turns = []
    current_speaker = None
    current_lines = []

    def flush():
        nonlocal current_speaker, current_lines
        if current_speaker and current_lines:
            text = " ".join(current_lines).strip()
            if text:
                turns.append((current_speaker, text))
        current_speaker = None
        current_lines = []

    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        match = re.match(r"^(VOZ [12]):\s*(.+)$", stripped)
        if match:
            flush()
            current_speaker = match.group(1)
            current_lines = [match.group(2)]
        elif current_speaker:
            current_lines.append(stripped)
        else:
            raise RuntimeError(
                f"Línea sin hablante en {path.name}: {stripped[:80]}"
            )

    flush()

    if not turns:
        raise RuntimeError(f"No se detectaron turnos en {path.name}.")
    if {speaker for speaker, _ in turns} - set(DIALOGUE_VOICES):
        raise RuntimeError(f"Hay hablantes no configurados en {path.name}.")

    return turns


def generate_dialogue(stem, script_path):
    turns = parse_dialogue(script_path)
    silence = np.zeros(int(SAMPLE_RATE * TURN_PAUSE_SECONDS), dtype=np.float32)
    parts = []

    for index, (speaker, text) in enumerate(turns):
        voice, lang_code = DIALOGUE_VOICES[speaker]
        audio = synthesize(text, voice, lang_code)
        if index:
            parts.append(silence)
        parts.append(audio)
        print(
            f"LAB exp2 · {stem} · turno {index + 1}/{len(turns)} · "
            f"{speaker}={voice}"
        )

    samples = np.concatenate(parts)
    mp3_path = write_mp3(stem, samples)
    duration = samples.size / SAMPLE_RATE
    print(
        f"LAB exp2 generado: {mp3_path.name} · {len(turns)} turnos · "
        f"{duration:.1f}s"
    )


def generate_exp4():
    voice, lang_code = EXP4_VOICE
    for stem, script_path in EXP4_SCRIPTS.items():
        text = script_path.read_text(encoding="utf-8").strip()
        if not text:
            raise RuntimeError(f"El guion de exp4 está vacío: {script_path.name}")
        samples = synthesize(text, voice, lang_code)
        mp3_path = write_mp3(stem, samples)
        duration = samples.size / SAMPLE_RATE
        print(
            f"LAB exp4 generado: {mp3_path.name} · voz {voice} · "
            f"idioma {lang_code} · {duration:.1f}s"
        )


generate_exp1()

for stem, script_path in DIALOGUE_SCRIPTS.items():
    generate_dialogue(stem, script_path)

generate_exp4()
