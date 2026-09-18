import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from gradio_client import Client, handle_file
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from audio_speech import normalize_for_speech

LAB_PY = os.environ["KOKORO_LAB_PY"]
sys.path.insert(0, LAB_PY)
from kokoro_lab.engine import KokoroLab

EXCERPT = ROOT / "lab" / "audio-alex-chatterbox-v1" / "international-excerpt.txt"
OUT_DIR = ROOT / "lab" / "audio-alex-chatterbox-v1" / "out"

SAMPLE_RATE = 24_000
ALEX_VOICE = "em_alex"
LAB_COMMIT = "9820dd38f40e71f8df318cdcf017bd24c62a03f7"
HF_SPACE = "ResembleAI/Chatterbox-Multilingual-TTS-es-mx-latam"

REFERENCE_TEXT = (
    "¿Y el bono a diez años, que venía sobre cinco por ciento? "
    "¿Por qué es importante la forma de la curva y no sólo que las tasas estén altas? "
    "¿Qué está descontando ahora el mercado?"
)

B2 = {
    "pitch_semitones": -0.28,
    "pitch_range_scale": 0.95,
    "energy_scale": 0.99,
}


def write_mp3(path: Path, samples: np.ndarray):
    wav = path.with_suffix(".wav")
    sf.write(wav, np.asarray(samples, np.float32), SAMPLE_RATE)
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "96k", str(path)
        ],
        check=True,
    )
    wav.unlink(missing_ok=True)


def probe(path: Path) -> float:
    r = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path)
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return round(float(r.stdout.strip()), 1)


def transform_b2(f0, n):
    f0 = np.asarray(f0, np.float32).reshape(-1)
    n = np.asarray(n, np.float32).reshape(-1)
    voiced = f0 > 1e-3
    out_f0 = f0.copy()
    if voiced.any():
        mean_log = float(np.log(f0[voiced]).mean())
        shift = 2.0 ** (B2["pitch_semitones"] / 12.0)
        out_f0[voiced] = np.clip(
            np.exp(
                mean_log
                + (np.log(f0[voiced]) - mean_log) * B2["pitch_range_scale"]
            )
            * shift,
            0.0,
            1000.0,
        )
    out_n = np.maximum(0.0, n * B2["energy_scale"])
    return out_f0.astype(np.float32), out_n.astype(np.float32)


class KokoroAlex:
    def __init__(self):
        self.pipeline = KPipeline(lang_code="e")
        self.lab = KokoroLab(self.pipeline.model)
        self.g2p = self.lab.make_g2p("e")
        self.pack = self.pipeline.load_voice(ALEX_VOICE).detach().cpu()

    def current(self, text: str) -> np.ndarray:
        speech = normalize_for_speech(text, "2026-09-17")
        chunks = []
        for _, _, audio in self.pipeline(
            speech, voice=ALEX_VOICE, speed=1.0, split_pattern=r"\n+"
        ):
            if audio is not None:
                arr = np.asarray(audio, np.float32).reshape(-1)
                if arr.size:
                    chunks.append(arr)
        if not chunks:
            raise RuntimeError("Alex actual no produjo audio.")
        return np.concatenate(chunks)

    def b2(self, text: str, speed: float = 1.0) -> np.ndarray:
        speech = normalize_for_speech(text, "2026-09-17")
        phonemes = self.lab.phonemize(self.g2p, speech)
        if not phonemes:
            raise RuntimeError("Alex B2 no produjo fonemas.")
        index = min(len(phonemes) - 1, self.pack.shape[0] - 1)
        ref_s = self.pack[index].numpy()
        _, trace, ctx = self.lab.synthesize(
            phonemes, ref_s, speed=speed, trace=True
        )
        f0, n = transform_b2(trace.stages["F0_pred"], trace.stages["N_pred"])
        return self.lab.decode(ctx, f0=f0, n=n)


def split_chunks(text: str, limit: int = 255):
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    sentences = []
    for paragraph in paragraphs:
        sentences.extend(
            s.strip()
            for s in re.split(r"(?<=[.!?])\s+", paragraph)
            if s.strip()
        )
    chunks = []
    current = ""
    for sentence in sentences:
        if len(sentence) > limit:
            parts = re.split(r"(?<=[,;:])\s+", sentence)
        else:
            parts = [sentence]
        for part in parts:
            candidate = f"{current} {part}".strip() if current else part
            if len(candidate) <= limit:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                if len(part) <= limit:
                    current = part
                else:
                    words = part.split()
                    buf = ""
                    for word in words:
                        c = f"{buf} {word}".strip()
                        if len(c) <= limit:
                            buf = c
                        else:
                            chunks.append(buf)
                            buf = word
                    current = buf
    if current:
        chunks.append(current)
    if not chunks or any(len(c) > 300 for c in chunks):
        raise RuntimeError(f"Chunking inválido: {[len(c) for c in chunks]}")
    return chunks


def result_path(result):
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        for key in ("path", "name"):
            value = result.get(key)
            if value:
                return value
    if isinstance(result, (list, tuple)) and result:
        return result_path(result[0])
    raise RuntimeError(f"Salida Gradio no reconocida: {type(result)} {result!r}")


def normalize_remote_wav(source_path: str, target: Path):
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", source_path, "-ac", "1", "-ar", str(SAMPLE_RATE),
            "-c:a", "pcm_s16le", str(target)
        ],
        check=True,
    )
    samples, sr = sf.read(target, dtype="float32")
    if sr != SAMPLE_RATE:
        raise RuntimeError(f"Sample rate inesperado tras ffmpeg: {sr}")
    return np.asarray(samples, np.float32).reshape(-1)


def chatterbox_variant(
    client: Client,
    text: str,
    ref_path: Path,
    *,
    exaggeration: float,
    temperature: float,
    cfg: float,
    seed_base: int,
):
    chunks = split_chunks(text)
    pause = np.zeros(int(SAMPLE_RATE * 0.28), np.float32)
    parts = []
    with tempfile.TemporaryDirectory(prefix="atlas-chatterbox-") as td:
        td_path = Path(td)
        for idx, chunk in enumerate(chunks):
            seed = seed_base + idx
            kwargs = dict(
                exaggeration_input=exaggeration,
                temperature_input=temperature,
                seed_num_input=seed,
                cfgw_input=cfg,
            )
            try:
                result = client.predict(
                    chunk,
                    handle_file(str(ref_path)),
                    exaggeration,
                    temperature,
                    seed,
                    cfg,
                    api_name="/generate_tts_audio",
                )
            except Exception as first_error:
                print(f"Endpoint nominal falló: {first_error}")
                print(client.view_api(return_format="dict"))
                result = client.predict(
                    chunk,
                    handle_file(str(ref_path)),
                    exaggeration,
                    temperature,
                    seed,
                    cfg,
                    fn_index=0,
                )
            src = result_path(result)
            wav = td_path / f"chunk-{idx:02d}.wav"
            samples = normalize_remote_wav(src, wav)
            if idx:
                parts.append(pause)
            parts.append(samples)
    return np.concatenate(parts), chunks


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    text = EXCERPT.read_text(encoding="utf-8").strip()
    alex = KokoroAlex()

    current = alex.current(text)
    b2 = alex.b2(text, speed=1.0)
    reference = alex.b2(REFERENCE_TEXT, speed=0.96)

    current_path = OUT_DIR / "a-alex-current.mp3"
    b2_path = OUT_DIR / "b-alex-b2.mp3"
    ref_path = OUT_DIR / "reference-alex-b2.wav"
    write_mp3(current_path, current)
    write_mp3(b2_path, b2)
    sf.write(ref_path, reference, SAMPLE_RATE)

    client = Client(HF_SPACE, verbose=False)

    neutral, neutral_chunks = chatterbox_variant(
        client,
        text,
        ref_path,
        exaggeration=0.50,
        temperature=0.80,
        cfg=0.50,
        seed_base=1701,
    )
    narrator, narrator_chunks = chatterbox_variant(
        client,
        text,
        ref_path,
        exaggeration=0.42,
        temperature=0.72,
        cfg=0.35,
        seed_base=2701,
    )

    neutral_path = OUT_DIR / "c-chatterbox-neutral.mp3"
    narrator_path = OUT_DIR / "d-chatterbox-narrator.mp3"
    write_mp3(neutral_path, neutral)
    write_mp3(narrator_path, narrator)

    manifest = {
        "schemaVersion": 1,
        "experiment": "alex-chatterbox-v1",
        "productionTouched": False,
        "date": "2026-09-18",
        "sourceDate": "2026-09-17",
        "hfModel": "ResembleAI/Chatterbox-Multilingual-es-mx-latam",
        "hfSpace": HF_SPACE,
        "hfModelLicense": "MIT",
        "kokoroLabPyCommit": LAB_COMMIT,
        "reference": {
            "voice": ALEX_VOICE,
            "profile": "B2",
            "speed": 0.96,
            "text": REFERENCE_TEXT,
            "file": ref_path.name,
        },
        "tracks": {
            "A": {
                "label": "Alex actual",
                "file": current_path.name,
                "durationSeconds": probe(current_path),
            },
            "B": {
                "label": "Alex B2",
                "file": b2_path.name,
                "durationSeconds": probe(b2_path),
            },
            "C": {
                "label": "Chatterbox LatAm neutral",
                "file": neutral_path.name,
                "durationSeconds": probe(neutral_path),
                "exaggeration": 0.50,
                "temperature": 0.80,
                "cfg": 0.50,
                "chunks": neutral_chunks,
            },
            "D": {
                "label": "Chatterbox LatAm narrador",
                "file": narrator_path.name,
                "durationSeconds": probe(narrator_path),
                "exaggeration": 0.42,
                "temperature": 0.72,
                "cfg": 0.35,
                "chunks": narrator_chunks,
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
