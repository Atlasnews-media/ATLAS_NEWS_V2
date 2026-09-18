import gc
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from audio_speech import is_question, normalize_for_speech

CHATTERBOX_SPACE = Path(os.environ["CHATTERBOX_SPACE_DIR"])
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
DIALOGUE = ROOT / "lab" / "audio-dora-alexc-v1" / "dialogue.txt"
OUT_DIR = ROOT / "lab" / "audio-dora-alexc-v1" / "out"

SAMPLE_RATE = 24_000
DORA_VOICE = "ef_dora"
STATEMENT_PAUSE = 0.34
QUESTION_PAUSE = 0.40

# Exactamente la referencia usada para crear Alex C en el LAB anterior.
REFERENCE_PARTS = [
    "¿Por qué es importante la forma de la curva y no sólo que las tasas estén altas?",
    "¿Qué está descontando ahora el mercado?",
]
B2_PITCH_SEMITONES = -0.28
B2_RANGE_SCALE = 0.95
B2_ENERGY_SCALE = 0.99


def parse_dialogue(text: str):
    turns = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"^(VOZ [12]):\s*(.+)$", line)
        if not m:
            raise RuntimeError(f"Línea inválida: {line}")
        turns.append((m.group(1), m.group(2)))
    return turns


def write_mp3(path: Path, samples: np.ndarray, sr: int = SAMPLE_RATE):
    wav = path.with_suffix(".wav")
    sf.write(wav, np.asarray(samples, np.float32).reshape(-1), sr)
    subprocess.run(
        [
            "ffmpeg","-y","-hide_banner","-loglevel","error",
            "-i",str(wav),"-ac","1","-ar",str(SAMPLE_RATE),
            "-codec:a","libmp3lame","-b:a","96k",str(path)
        ],
        check=True,
    )
    wav.unlink(missing_ok=True)


def probe(path: Path) -> float:
    r = subprocess.run(
        [
            "ffprobe","-v","error","-show_entries","format=duration",
            "-of","default=noprint_wrappers=1:nokey=1",str(path)
        ],
        check=True,capture_output=True,text=True
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
            np.exp(mean_log + (np.log(f0[voiced]) - mean_log) * B2_RANGE_SCALE) * shift,
            0.0, 1000.0
        )
    return out_f0.astype(np.float32), np.maximum(0.0, n * B2_ENERGY_SCALE).astype(np.float32)


class ReferenceAlex:
    def __init__(self, lab_path: Path):
        sys.path.insert(0, str(lab_path))
        from kokoro_lab.engine import KokoroLab
        self.pipeline = KPipeline(lang_code="e")
        self.lab = KokoroLab(self.pipeline.model)
        self.g2p = self.lab.make_g2p("e")
        self.pack = self.pipeline.load_voice("em_alex").detach().cpu()

    def b2(self, text: str, speed: float = 0.96):
        speech = normalize_for_speech(text, "2026-09-17")
        phonemes = self.lab.phonemize(self.g2p, speech)
        idx = min(len(phonemes) - 1, self.pack.shape[0] - 1)
        ref_s = self.pack[idx].numpy()
        _, trace, ctx = self.lab.synthesize(phonemes, ref_s, speed=speed, trace=True)
        f0, n = transform_b2(trace.stages["F0_pred"], trace.stages["N_pred"])
        return self.lab.decode(ctx, f0=f0, n=n)


def make_reference(lab_path: Path, ref_path: Path):
    engine = ReferenceAlex(lab_path)
    pause = np.zeros(int(SAMPLE_RATE * 0.30), np.float32)
    parts = []
    for i, text in enumerate(REFERENCE_PARTS):
        if i:
            parts.append(pause)
        parts.append(engine.b2(text))
    sf.write(ref_path, np.concatenate(parts), SAMPLE_RATE)
    del engine
    gc.collect()


def synthesize_dora(pipeline: KPipeline, text: str):
    speech = normalize_for_speech(text, "2026-09-17")
    chunks = []
    for _, _, audio in pipeline(speech, voice=DORA_VOICE, speed=1.0, split_pattern=r"\n+"):
        if audio is None:
            continue
        arr = np.asarray(audio, np.float32).reshape(-1)
        if arr.size:
            chunks.append(arr)
    if not chunks:
        raise RuntimeError("Dora no produjo audio.")
    return np.concatenate(chunks)


def synthesize_alexc(model, text: str, ref_path: Path, seed: int):
    torch.manual_seed(seed)
    np.random.seed(seed)
    try:
        wav = model.generate(
            text[:300],
            audio_prompt_path=None,
            exaggeration=0.50,
            temperature=0.80,
            cfg_weight=0.50,
            language_id="es",
        )
    except Exception:
        wav = model.generate(
            text[:300],
            audio_prompt_path=str(ref_path),
            exaggeration=0.50,
            temperature=0.80,
            cfg_weight=0.50,
            language_id="es",
        )
    if hasattr(wav, "detach"):
        wav = wav.detach().cpu().numpy()
    return np.asarray(wav, np.float32).reshape(-1)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    lab_path = Path(os.environ["KOKORO_LAB_PY"])
    turns = parse_dialogue(DIALOGUE.read_text(encoding="utf-8"))

    # Control exacto aprobado: no se regenera.
    control_src = PUBLIC_DIR / "lab" / "audio" / "b2-1-solo" / "dialogue-b2-1-hybrid.mp3"
    if not control_src.exists():
        raise RuntimeError("No existe el control público B2.1.")
    control_dst = OUT_DIR / "a-dialogue-b2-1-control.mp3"
    shutil.copy2(control_src, control_dst)

    # Referencia de identidad de Alex C: la misma receta del LAB anterior.
    ref_path = OUT_DIR / "reference-alex-b2.wav"
    make_reference(lab_path, ref_path)

    # Libera el modelo staged antes de cargar Chatterbox.
    gc.collect()

    sys.path.insert(0, str(CHATTERBOX_SPACE))
    from chatterbox.src.chatterbox.tts import ChatterboxTTS
    chatterbox = ChatterboxTTS.from_pretrained("cpu")
    # Prepara una sola vez la identidad/estilo Alex C para todos sus turnos.
    chatterbox.prepare_conditionals(str(ref_path), exaggeration=0.50)

    dora = KPipeline(lang_code="e")
    normal_pause = np.zeros(int(SAMPLE_RATE * STATEMENT_PAUSE), np.float32)
    question_pause = np.zeros(int(SAMPLE_RATE * QUESTION_PAUSE), np.float32)
    parts = []
    alex_turns = []

    previous_question = False
    alex_index = 0
    for i, (speaker, content) in enumerate(turns):
        if i:
            parts.append(question_pause if previous_question else normal_pause)

        if speaker == "VOZ 1":
            samples = synthesize_dora(dora, content)
        else:
            seed = 3101 + alex_index
            samples = synthesize_alexc(chatterbox, content, ref_path, seed)
            alex_turns.append({
                "text": content,
                "seed": seed,
                "durationSeconds": round(len(samples) / SAMPLE_RATE, 2),
            })
            alex_index += 1

        parts.append(samples)
        previous_question = speaker == "VOZ 2" and is_question(content)

    experimental = OUT_DIR / "b-dora-alexc.mp3"
    write_mp3(experimental, np.concatenate(parts))

    manifest = {
        "schemaVersion": 1,
        "experiment": "dora-alexc-dialogue-v1",
        "productionTouched": False,
        "sourceDate": "2026-09-17",
        "control": {
            "file": control_dst.name,
            "label": "B2.1 aprobado",
            "durationSeconds": probe(control_dst),
            "source": "exact public LAB artifact",
        },
        "candidate": {
            "file": experimental.name,
            "label": "Dora + Alex C",
            "durationSeconds": probe(experimental),
            "dora": {
                "engine": "Kokoro 0.9.4",
                "voice": DORA_VOICE,
                "speed": 1.0,
            },
            "alexC": {
                "engine": "ResembleAI/Chatterbox-Multilingual-es-mx-latam",
                "profile": "neutral C",
                "exaggeration": 0.50,
                "temperature": 0.80,
                "cfg": 0.50,
                "reference": "em_alex B2",
                "turns": alex_turns,
            },
            "pauses": {
                "afterStatementSeconds": STATEMENT_PAUSE,
                "afterQuestionSeconds": QUESTION_PAUSE,
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
