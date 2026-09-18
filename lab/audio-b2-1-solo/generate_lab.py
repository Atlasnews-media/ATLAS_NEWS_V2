import json
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
from audio_speech import is_question, normalize_for_speech

LAB_PY = os.environ["KOKORO_LAB_PY"]
sys.path.insert(0, LAB_PY)
from kokoro_lab.engine import KokoroLab

PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
FASTAPI_BASE = os.environ.get("KOKORO_FASTAPI_BASE", "http://127.0.0.1:8880")
DIALOGUE = ROOT / "lab" / "audio-b2-1-solo" / "dialogue.txt"
INTERNATIONAL = ROOT / "lab" / "audio-b2-1-solo" / "international.txt"
OUT_DIR = ROOT / "lab" / "audio-b2-1-solo" / "out"
SAMPLE_RATE = 24000
ALEX_VOICE = "em_alex"
DORA_VOICE = "ef_dora"
ALEX_DIALOGUE_SPEED = 0.96
SHORT_QUESTION_WORDS = 5
STATEMENT_PAUSE = 0.34
QUESTION_PAUSE = 0.40
EXPECTED_INTL_HASH = "8e94cd99200d89c913ba5b7b30127a720ff1bebf92f69138706d8a8262424012"
LAB_COMMIT = "9820dd38f40e71f8df318cdcf017bd24c62a03f7"


def parse_dialogue(text: str):
    turns = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"^(VOZ [12]):\s*(.+)$", line)
        if not m:
            raise RuntimeError(f"Línea inválida: {line[:100]}")
        turns.append((m.group(1), m.group(2)))
    return turns


def write_mp3(path: Path, samples: np.ndarray):
    wav = path.with_suffix(".wav")
    sf.write(wav, samples.astype(np.float32), SAMPLE_RATE)
    subprocess.run([
        "ffmpeg","-y","-hide_banner","-loglevel","error",
        "-i",str(wav),"-codec:a","libmp3lame","-b:a","96k",str(path)
    ], check=True)
    wav.unlink(missing_ok=True)


def probe(path: Path) -> float:
    r = subprocess.run([
        "ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1",str(path)
    ], check=True, capture_output=True, text=True)
    return round(float(r.stdout.strip()), 1)


def transform_b2(f0, n):
    f0 = np.asarray(f0, np.float32).reshape(-1)
    n = np.asarray(n, np.float32).reshape(-1)
    voiced = f0 > 1e-3
    out_f0 = f0.copy()
    if voiced.any():
        mean_log = float(np.log(f0[voiced]).mean())
        shift = 2.0 ** (-0.28 / 12.0)
        out_f0[voiced] = np.clip(
            np.exp(mean_log + (np.log(f0[voiced]) - mean_log) * 0.95) * shift,
            0.0,
            1000.0,
        )
    out_n = np.maximum(0.0, n * 0.99)
    return out_f0.astype(np.float32), out_n.astype(np.float32)


class Engine:
    def __init__(self):
        self.pipeline = KPipeline(lang_code="e")
        self.lab = KokoroLab(self.pipeline.model)
        self.g2p = self.lab.make_g2p("e")
        self.alex_pack = self.pipeline.load_voice(ALEX_VOICE).detach().cpu()
        self.dora_cache = {}
        self.alex_b2_cache = {}

    def dora(self, text: str) -> np.ndarray:
        if text in self.dora_cache:
            return self.dora_cache[text].copy()
        speech = normalize_for_speech(text, "2026-09-17")
        chunks = []
        for _, _, audio in self.pipeline(speech, voice=DORA_VOICE, speed=1.0, split_pattern=r"\n+"):
            if audio is not None:
                arr = np.asarray(audio, np.float32).reshape(-1)
                if arr.size:
                    chunks.append(arr)
        if not chunks:
            raise RuntimeError("Dora no produjo audio.")
        out = np.concatenate(chunks)
        self.dora_cache[text] = out
        return out.copy()

    def alex_b2(self, text: str, speed: float) -> np.ndarray:
        key = (text, speed)
        if key in self.alex_b2_cache:
            return self.alex_b2_cache[key].copy()
        speech = normalize_for_speech(text, "2026-09-17")
        phonemes = self.lab.phonemize(self.g2p, speech)
        if not phonemes:
            raise RuntimeError("Alex no produjo fonemas.")
        idx = min(len(phonemes)-1, self.alex_pack.shape[0]-1)
        ref_s = self.alex_pack[idx].numpy()
        _, trace, ctx = self.lab.synthesize(phonemes, ref_s, speed=speed, trace=True)
        f0, n = transform_b2(trace.stages["F0_pred"], trace.stages["N_pred"])
        out = self.lab.decode(ctx, f0=f0, n=n)
        self.alex_b2_cache[key] = out
        return out.copy()

    def alex_current(self, text: str) -> np.ndarray:
        speech = normalize_for_speech(text, "2026-09-17")
        chunks = []
        for _, _, audio in self.pipeline(speech, voice=ALEX_VOICE, speed=1.0, split_pattern=r"\n+"):
            if audio is not None:
                arr = np.asarray(audio, np.float32).reshape(-1)
                if arr.size:
                    chunks.append(arr)
        if not chunks:
            raise RuntimeError("Alex actual no produjo audio.")
        return np.concatenate(chunks)


def fastapi_short_question(text: str) -> np.ndarray:
    speech = normalize_for_speech(text, "2026-09-17")
    r = requests.post(
        f"{FASTAPI_BASE}/v1/audio/speech",
        json={
            "model": "kokoro",
            "voice": ALEX_VOICE,
            "input": speech,
            "response_format": "wav",
            "speed": ALEX_DIALOGUE_SPEED,
        },
        timeout=180,
    )
    if r.status_code != 200:
        raise RuntimeError(f"FastAPI short question HTTP {r.status_code}: {r.text[:300]}")
    tmp = OUT_DIR / "_short.wav"
    tmp.write_bytes(r.content)
    samples, sr = sf.read(tmp, dtype="float32")
    tmp.unlink(missing_ok=True)
    if sr != SAMPLE_RATE:
        raise RuntimeError(f"Sample rate inesperado: {sr}")
    return np.asarray(samples, np.float32).reshape(-1)


def is_short_alex_question(text: str) -> bool:
    words = re.findall(r"\b[\wÁÉÍÓÚÜÑáéíóúüñ]+\b", text, flags=re.UNICODE)
    return is_question(text) and len(words) <= SHORT_QUESTION_WORDS


def dialogue_variant(engine: Engine, hybrid: bool) -> np.ndarray:
    turns = parse_dialogue(DIALOGUE.read_text(encoding="utf-8"))
    parts = []
    previous_question = False
    normal_silence = np.zeros(int(SAMPLE_RATE * STATEMENT_PAUSE), np.float32)
    question_silence = np.zeros(int(SAMPLE_RATE * QUESTION_PAUSE), np.float32)
    for i, (speaker, content) in enumerate(turns):
        if i:
            parts.append(question_silence if previous_question else normal_silence)
        if speaker == "VOZ 1":
            samples = engine.dora(content)
        else:
            if hybrid and is_short_alex_question(content):
                samples = fastapi_short_question(content)
            else:
                samples = engine.alex_b2(content, ALEX_DIALOGUE_SPEED)
        parts.append(samples)
        previous_question = speaker == "VOZ 2" and is_question(content)
    return np.concatenate(parts)


def international_b2(engine: Engine) -> np.ndarray:
    text = INTERNATIONAL.read_text(encoding="utf-8").strip()
    blocks = [x.strip() for x in re.split(r"\n\s*\n", text) if x.strip()]
    silence = np.zeros(int(SAMPLE_RATE * 0.24), np.float32)
    parts = []
    for i, block in enumerate(blocks):
        if i:
            parts.append(silence)
        parts.append(engine.alex_b2(block, 1.0))
    return np.concatenate(parts)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    import hashlib
    intl_text = INTERNATIONAL.read_text(encoding="utf-8").strip()
    digest = hashlib.sha256(intl_text.encode("utf-8")).hexdigest()
    if digest != EXPECTED_INTL_HASH:
        raise RuntimeError(f"Guion Internacional no coincide con producción: {digest}")

    engine = Engine()

    b2_control = PUBLIC_DIR / "lab" / "audio" / "alex-v2" / "b2-alex-broadcast.mp3"
    if not b2_control.exists():
        raise RuntimeError("No existe control B2 público.")
    shutil.copy2(b2_control, OUT_DIR / "dialogue-b2-control.mp3")

    current_international = PUBLIC_DIR / "audio" / "2026-09-17-international-analysis.mp3"
    if not current_international.exists():
        raise RuntimeError("No existe Internacional productivo 17-09.")
    shutil.copy2(current_international, OUT_DIR / "international-current.mp3")

    write_mp3(OUT_DIR / "dialogue-b2-1-hybrid.mp3", dialogue_variant(engine, hybrid=True))
    write_mp3(OUT_DIR / "international-b2.mp3", international_b2(engine))

    manifest = {
        "schemaVersion": 1,
        "experiment": "alex-b2-1-and-solo",
        "productionTouched": False,
        "sourceDate": "2026-09-17",
        "kokoroLabPyCommit": LAB_COMMIT,
        "shortQuestionThresholdWords": SHORT_QUESTION_WORDS,
        "dialogue": {
            "B2": {
                "file": "dialogue-b2-control.mp3",
                "durationSeconds": probe(OUT_DIR / "dialogue-b2-control.mp3"),
                "source": "exact prior approved LAB artifact",
            },
            "B2.1": {
                "file": "dialogue-b2-1-hybrid.mp3",
                "durationSeconds": probe(OUT_DIR / "dialogue-b2-1-hybrid.mp3"),
                "rule": "Alex short question <=5 words uses FastAPI; all other Alex turns stay B2",
            },
        },
        "internationalSolo": {
            "current": {
                "file": "international-current.mp3",
                "durationSeconds": probe(OUT_DIR / "international-current.mp3"),
                "source": "exact production artifact 2026-09-17",
            },
            "B2": {
                "file": "international-b2.mp3",
                "durationSeconds": probe(OUT_DIR / "international-b2.mp3"),
                "speed": 1.0,
                "pitchSemitones": -0.28,
                "pitchRangeScale": 0.95,
                "energyScale": 0.99,
            },
        },
        "internationalScriptHash": digest,
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
