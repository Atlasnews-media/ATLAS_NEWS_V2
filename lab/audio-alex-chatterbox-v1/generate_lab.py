import gc
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from audio_speech import normalize_for_speech

LAB_PY = Path(os.environ["KOKORO_LAB_PY"])
CHATTERBOX_SPACE = Path(os.environ["CHATTERBOX_SPACE_DIR"])
sys.path.insert(0, str(LAB_PY))
from kokoro_lab.engine import KokoroLab

OUT_DIR = ROOT / "lab" / "audio-alex-chatterbox-v1" / "out"
SAMPLE_RATE = 24_000
ALEX_VOICE = "em_alex"
LAB_COMMIT = "9820dd38f40e71f8df318cdcf017bd24c62a03f7"

TEST_TEXT = (
    "La novedad no es sólo el alza: la Reserva Federal vuelve a colocar el "
    "endurecimiento monetario como una opción activa. China profundiza su "
    "apuesta por manufactura avanzada mientras crece la fricción comercial con Europa."
)

REFERENCE_PARTS = [
    "¿Por qué es importante la forma de la curva y no sólo que las tasas estén altas?",
    "¿Qué está descontando ahora el mercado?",
]

B2_PITCH_SEMITONES = -0.28
B2_RANGE_SCALE = 0.95
B2_ENERGY_SCALE = 0.99


def write_mp3(path: Path, samples: np.ndarray, sr: int = SAMPLE_RATE):
    wav = path.with_suffix(".wav")
    sf.write(wav, np.asarray(samples, np.float32).reshape(-1), sr)
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(wav), "-ac", "1", "-ar", str(SAMPLE_RATE),
            "-codec:a", "libmp3lame", "-b:a", "96k", str(path),
        ],
        check=True,
    )
    wav.unlink(missing_ok=True)


def probe(path: Path) -> float:
    r = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
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
        shift = 2.0 ** (B2_PITCH_SEMITONES / 12.0)
        out_f0[voiced] = np.clip(
            np.exp(mean_log + (np.log(f0[voiced]) - mean_log) * B2_RANGE_SCALE)
            * shift,
            0.0,
            1000.0,
        )
    out_n = np.maximum(0.0, n * B2_ENERGY_SCALE)
    return out_f0.astype(np.float32), out_n.astype(np.float32)


class KokoroControls:
    def __init__(self):
        self.pipeline = KPipeline(lang_code="e")
        self.lab = KokoroLab(self.pipeline.model)
        self.g2p = self.lab.make_g2p("e")
        self.pack = self.pipeline.load_voice(ALEX_VOICE).detach().cpu()

    def current(self, text: str, speed: float = 1.0) -> np.ndarray:
        speech = normalize_for_speech(text, "2026-09-17")
        chunks = []
        for _, _, audio in self.pipeline(
            speech, voice=ALEX_VOICE, speed=speed, split_pattern=r"\n+"
        ):
            if audio is None:
                continue
            arr = np.asarray(audio, np.float32).reshape(-1)
            if arr.size:
                chunks.append(arr)
        if not chunks:
            raise RuntimeError("Kokoro actual no produjo audio.")
        return np.concatenate(chunks)

    def b2(self, text: str, speed: float = 1.0) -> np.ndarray:
        speech = normalize_for_speech(text, "2026-09-17")
        phonemes = self.lab.phonemize(self.g2p, speech)
        if not phonemes:
            raise RuntimeError("Alex B2 no produjo fonemas.")
        if len(phonemes) > 500:
            raise RuntimeError(f"Referencia B2 excede límite staged: {len(phonemes)}")
        idx = min(len(phonemes) - 1, self.pack.shape[0] - 1)
        ref_s = self.pack[idx].numpy()
        _, trace, ctx = self.lab.synthesize(phonemes, ref_s, speed=speed, trace=True)
        f0, n = transform_b2(trace.stages["F0_pred"], trace.stages["N_pred"])
        return self.lab.decode(ctx, f0=f0, n=n)


def make_reference(engine: KokoroControls) -> np.ndarray:
    pause = np.zeros(int(SAMPLE_RATE * 0.30), np.float32)
    parts = []
    for i, text in enumerate(REFERENCE_PARTS):
        if i:
            parts.append(pause)
        parts.append(engine.b2(text, speed=0.96))
    return np.concatenate(parts)


def chatterbox_generate(model, text: str, ref_path: Path, *, exaggeration, temperature, cfg, seed):
    torch.manual_seed(seed)
    np.random.seed(seed)
    wav = model.generate(
        text[:300],
        audio_prompt_path=str(ref_path),
        exaggeration=exaggeration,
        temperature=temperature,
        cfg_weight=cfg,
        language_id="es",
    )
    if hasattr(wav, "detach"):
        wav = wav.detach().cpu().numpy()
    return np.asarray(wav, np.float32).reshape(-1)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("FASE 1/3 · Generando controles Kokoro y referencia B2...")
    kokoro = KokoroControls()
    current = kokoro.current(TEST_TEXT, speed=1.0)
    b2 = kokoro.b2(TEST_TEXT, speed=1.0)
    reference = make_reference(kokoro)

    current_path = OUT_DIR / "a-alex-current.mp3"
    b2_path = OUT_DIR / "b-alex-b2.mp3"
    ref_path = OUT_DIR / "reference-alex-b2.wav"

    write_mp3(current_path, current)
    write_mp3(b2_path, b2)
    sf.write(ref_path, reference, SAMPLE_RATE)

    # Liberar Kokoro antes de cargar Chatterbox: los dos modelos no deben coexistir.
    del kokoro, current, b2, reference
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    print("FASE 2/3 · Cargando Chatterbox LatAm oficial en CPU...")
    sys.path.insert(0, str(CHATTERBOX_SPACE))
    from chatterbox.src.chatterbox.tts import ChatterboxTTS

    chatterbox = ChatterboxTTS.from_pretrained("cpu")

    print("FASE 3/3 · Generando dos perfiles Chatterbox...")
    neutral = chatterbox_generate(
        chatterbox,
        TEST_TEXT,
        ref_path,
        exaggeration=0.50,
        temperature=0.80,
        cfg=0.50,
        seed=1701,
    )
    narrator = chatterbox_generate(
        chatterbox,
        TEST_TEXT,
        ref_path,
        exaggeration=0.42,
        temperature=0.72,
        cfg=0.35,
        seed=2701,
    )

    neutral_path = OUT_DIR / "c-chatterbox-neutral.mp3"
    narrator_path = OUT_DIR / "d-chatterbox-narrator.mp3"
    write_mp3(neutral_path, neutral, sr=int(chatterbox.sr))
    write_mp3(narrator_path, narrator, sr=int(chatterbox.sr))

    manifest = {
        "schemaVersion": 1,
        "experiment": "alex-chatterbox-v1-cpu",
        "productionTouched": False,
        "date": "2026-09-18",
        "sourceDate": "2026-09-17",
        "testText": TEST_TEXT,
        "referenceText": " ".join(REFERENCE_PARTS),
        "referenceVoice": "em_alex B2",
        "model": "ResembleAI/Chatterbox-Multilingual-es-mx-latam",
        "modelLicense": "MIT",
        "runtime": "GitHub Actions CPU",
        "kokoroLabPyCommit": LAB_COMMIT,
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
                "seed": 1701,
            },
            "D": {
                "label": "Chatterbox LatAm narrador",
                "file": narrator_path.name,
                "durationSeconds": probe(narrator_path),
                "exaggeration": 0.42,
                "temperature": 0.72,
                "cfg": 0.35,
                "seed": 2701,
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
