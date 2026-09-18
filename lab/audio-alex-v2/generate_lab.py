import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import requests
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

KOKORO_LAB_PY = os.environ.get("KOKORO_LAB_PY")
if not KOKORO_LAB_PY:
    raise RuntimeError("KOKORO_LAB_PY no está definido.")
sys.path.insert(0, KOKORO_LAB_PY)

from kokoro_lab.engine import KokoroLab
from audio_speech import is_question, normalize_for_speech

SAMPLE_PATH = ROOT / "lab" / "audio-alex-v2" / "sample-markets-2026-09-17.txt"
OUT_DIR = ROOT / "lab" / "audio-alex-v2" / "out"
FASTAPI_BASE = os.environ.get("KOKORO_FASTAPI_BASE", "http://127.0.0.1:8880")

SAMPLE_RATE = 24_000
STATEMENT_PAUSE = 0.34
QUESTION_PAUSE = 0.40
ALEX_SPEED = 0.96
LAB_SOURCE_COMMIT = "9820dd38f40e71f8df318cdcf017bd24c62a03f7"

DORA_VOICE = "ef_dora"
ALEX_VOICE = "em_alex"


def parse_dialogue(text: str):
    turns = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = re.match(r"^(VOZ [12]):\s*(.+)$", line)
        if not match:
            raise RuntimeError(f"Línea inválida: {line[:100]}")
        turns.append((match.group(1), match.group(2)))
    if not turns:
        raise RuntimeError("Muestra vacía.")
    return turns


def write_mp3(path: Path, samples: np.ndarray) -> None:
    wav_path = path.with_suffix(".wav")
    sf.write(wav_path, samples.astype(np.float32), SAMPLE_RATE)
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(wav_path),
            "-codec:a", "libmp3lame", "-b:a", "96k", str(path),
        ],
        check=True,
    )
    wav_path.unlink(missing_ok=True)


def duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return round(float(result.stdout.strip()), 1)


def generate_fastapi_reference(turns, target: Path) -> None:
    aliases = {
        "dora": {"voice": DORA_VOICE, "rate": 1.0},
        "alex": {"voice": ALEX_VOICE, "rate": ALEX_SPEED},
    }
    parts = []
    for speaker, content in turns:
        alias = "dora" if speaker == "VOZ 1" else "alex"
        speech = normalize_for_speech(content, "2026-09-17")
        parts.append(f"[voice:{alias}] {speech}")
        pause = QUESTION_PAUSE if speaker == "VOZ 2" and is_question(content) else STATEMENT_PAUSE
        parts.append(f"[pause:{pause:.2f}s]")
    response = requests.post(
        f"{FASTAPI_BASE}/v1/audio/speech",
        json={
            "model": "kokoro",
            "voice": "dora",
            "input": " ".join(parts),
            "response_format": "mp3",
            "speed": 1.0,
            "allow_voice_tags": True,
            "voice_aliases": aliases,
        },
        timeout=300,
    )
    if response.status_code != 200:
        raise RuntimeError(f"FastAPI HTTP {response.status_code}: {response.text[:500]}")
    target.write_bytes(response.content)


def transform_f0_energy(f0, n, *, semitones: float, range_scale: float, energy_scale: float):
    f0 = np.asarray(f0, np.float32).reshape(-1)
    n = np.asarray(n, np.float32).reshape(-1)
    voiced = f0 > 1e-3
    out_f0 = f0.copy()
    if voiced.any():
        mean_log = float(np.log(f0[voiced]).mean())
        shift = 2.0 ** (semitones / 12.0)
        out_f0[voiced] = np.clip(
            np.exp(mean_log + (np.log(f0[voiced]) - mean_log) * range_scale) * shift,
            0.0,
            1000.0,
        )
    out_n = np.maximum(0.0, n * energy_scale)
    return out_f0.astype(np.float32), out_n.astype(np.float32)


class StagedAlex:
    def __init__(self):
        self.pipeline = KPipeline(lang_code="e")
        self.lab = KokoroLab(self.pipeline.model)
        self.g2p = self.lab.make_g2p("e")
        self.pack = self.pipeline.load_voice(ALEX_VOICE).detach().cpu()

    def synthesize(self, text: str, *, profile: str) -> np.ndarray:
        speech = normalize_for_speech(text, "2026-09-17")
        phonemes = self.lab.phonemize(self.g2p, speech)
        if not phonemes:
            raise RuntimeError("Alex no produjo fonemas.")
        index = min(len(phonemes) - 1, self.pack.shape[0] - 1)
        ref_s = self.pack[index].numpy()
        _, trace, ctx = self.lab.synthesize(
            phonemes,
            ref_s,
            speed=ALEX_SPEED,
            trace=True,
        )

        question = is_question(text)
        if profile == "broadcast":
            params = {
                "semitones": -0.28,
                "range_scale": 0.95,
                "energy_scale": 0.99,
            }
        elif profile == "conversational":
            params = (
                {
                    "semitones": 0.04,
                    "range_scale": 1.10,
                    "energy_scale": 1.01,
                }
                if question
                else {
                    "semitones": -0.12,
                    "range_scale": 1.01,
                    "energy_scale": 1.00,
                }
            )
        else:
            raise ValueError(profile)

        f0, n = transform_f0_energy(
            trace.stages["F0_pred"],
            trace.stages["N_pred"],
            **params,
        )
        return self.lab.decode(ctx, f0=f0, n=n)


def synthesize_dora(text: str) -> np.ndarray:
    pipeline = KPipeline(lang_code="e")
    speech = normalize_for_speech(text, "2026-09-17")
    chunks = []
    for _, _, audio in pipeline(speech, voice=DORA_VOICE, speed=1.0, split_pattern=r"\n+"):
        if audio is None:
            continue
        arr = np.asarray(audio, dtype=np.float32).reshape(-1)
        if arr.size:
            chunks.append(arr)
    if not chunks:
        raise RuntimeError("Dora no produjo audio.")
    return np.concatenate(chunks)


def generate_variant(turns, target: Path, *, profile: str) -> None:
    alex = StagedAlex()
    silence_statement = np.zeros(int(SAMPLE_RATE * STATEMENT_PAUSE), dtype=np.float32)
    silence_question = np.zeros(int(SAMPLE_RATE * QUESTION_PAUSE), dtype=np.float32)
    parts = []
    previous_question = False

    for idx, (speaker, content) in enumerate(turns):
        if idx:
            parts.append(silence_question if previous_question else silence_statement)
        if speaker == "VOZ 1":
            samples = synthesize_dora(content)
        else:
            samples = alex.synthesize(content, profile=profile)
        parts.append(samples)
        previous_question = speaker == "VOZ 2" and is_question(content)

    write_mp3(target, np.concatenate(parts))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    turns = parse_dialogue(SAMPLE_PATH.read_text(encoding="utf-8"))

    b1 = OUT_DIR / "b1-fastapi-approved.mp3"
    b2 = OUT_DIR / "b2-alex-broadcast.mp3"
    b3 = OUT_DIR / "b3-alex-conversational.mp3"

    generate_fastapi_reference(turns, b1)
    generate_variant(turns, b2, profile="broadcast")
    generate_variant(turns, b3, profile="conversational")

    manifest = {
        "schemaVersion": 1,
        "experiment": "alex-naturalness-v2",
        "date": "2026-09-17",
        "sourceId": "2026-09-17-markets-fed-aplana-la-curva-y-el-dolar-toma-el-relevo",
        "productionTouched": False,
        "doraFrozen": True,
        "alexVoice": ALEX_VOICE,
        "alexSpeed": ALEX_SPEED,
        "kokoroFastApiVersion": "v0.9.0",
        "kokoroLabPyCommit": LAB_SOURCE_COMMIT,
        "variants": {
            "B1": {
                "label": "FastAPI aprobada",
                "file": b1.name,
                "durationSeconds": duration(b1),
            },
            "B2": {
                "label": "Alex broadcast",
                "file": b2.name,
                "durationSeconds": duration(b2),
                "alexTransform": {
                    "pitchSemitones": -0.28,
                    "pitchRangeScale": 0.95,
                    "energyScale": 0.99,
                },
            },
            "B3": {
                "label": "Alex conversacional",
                "file": b3.name,
                "durationSeconds": duration(b3),
                "alexStatementTransform": {
                    "pitchSemitones": -0.12,
                    "pitchRangeScale": 1.01,
                    "energyScale": 1.0,
                },
                "alexQuestionTransform": {
                    "pitchSemitones": 0.04,
                    "pitchRangeScale": 1.10,
                    "energyScale": 1.01,
                },
            },
        },
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
