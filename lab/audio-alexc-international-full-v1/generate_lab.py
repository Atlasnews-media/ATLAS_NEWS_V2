import gc
import hashlib
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
from audio_speech import normalize_for_speech

LAB_PY = Path(os.environ["KOKORO_LAB_PY"])
CHATTERBOX_SPACE = Path(os.environ["CHATTERBOX_SPACE_DIR"])
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
OUT_DIR = ROOT / "lab" / "audio-alexc-international-full-v1" / "out"
SCRIPT_PATH = ROOT / "lab" / "audio-alexc-international-full-v1" / "international-2026-09-17.txt"

SAMPLE_RATE = 24_000
EXPECTED_SCRIPT_HASH = "8e94cd99200d89c913ba5b7b30127a720ff1bebf92f69138706d8a8262424012"
REFERENCE_DATE = "2026-09-17"
REFERENCE_PARTS = [
    "¿Por qué es importante la forma de la curva y no sólo que las tasas estén altas?",
    "¿Qué está descontando ahora el mercado?",
]
ALEX_VOICE = "em_alex"
B2_PITCH_SEMITONES = -0.28
B2_RANGE_SCALE = 0.95
B2_ENERGY_SCALE = 0.99
CHUNK_LIMIT = 280
CHUNK_PAUSE_SECONDS = 0.24
SECTION_PAUSE_SECONDS = 0.34

PERCENT_RANGE_RE = re.compile(
    r"(?<!\d)(\d+(?:,\d+)?)\s*%\s*[-–—]\s*(\d+(?:,\d+)?)\s*%"
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def probe(path: Path) -> float:
    r = subprocess.run(
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
    return round(float(r.stdout.strip()), 1)


def write_mp3(path: Path, samples: np.ndarray, sr: int):
    wav = path.with_suffix(".wav")
    sf.write(wav, np.asarray(samples, np.float32).reshape(-1), sr)
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(wav),
            "-ac", "1",
            "-ar", str(SAMPLE_RATE),
            "-codec:a", "libmp3lame",
            "-b:a", "96k",
            str(path),
        ],
        check=True,
    )
    wav.unlink(missing_ok=True)


def normalize_full_script(text: str) -> str:
    # Único ajuste adicional: bug real ya observado en rangos porcentuales.
    # Sólo speech_text; el texto editorial no se modifica.
    text = PERCENT_RANGE_RE.sub(
        lambda m: f"{m.group(1)} a {m.group(2)} por ciento",
        text,
    )
    return normalize_for_speech(text, REFERENCE_DATE)


def split_for_chatterbox(text: str):
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    headings = {"El hecho central.", "Qué está cambiando.", "Qué observar ahora."}
    units = []

    for paragraph in paragraphs:
        sentences = [
            s.strip()
            for s in re.split(r"(?<=[.!?])\s+", paragraph)
            if s.strip()
        ]
        units.extend(sentences or [paragraph])

    chunks = []
    current = ""

    for unit in units:
        # Un encabezado abre un bloque nuevo para que acompañe al contenido siguiente,
        # nunca quede pegado al cierre de la sección anterior.
        if unit in headings:
            if current:
                chunks.append(current)
            current = unit
            continue

        candidate = f"{current} {unit}".strip() if current else unit
        if len(candidate) <= CHUNK_LIMIT:
            current = candidate
            continue

        if current:
            chunks.append(current)
            current = ""

        if len(unit) <= CHUNK_LIMIT:
            current = unit
            continue

        # Fallback sólo para oraciones realmente largas. Se permite hasta 295
        # caracteres para no crear prefijos huérfanos alrededor de dos puntos.
        pieces = [p.strip() for p in re.split(r"(?<=[,;:])\s+", unit) if p.strip()]
        buffer = ""
        for piece in pieces:
            candidate = f"{buffer} {piece}".strip() if buffer else piece
            if len(candidate) <= 295:
                buffer = candidate
            else:
                if buffer:
                    chunks.append(buffer)
                buffer = piece
        current = buffer

    if current:
        chunks.append(current)

    if not chunks or any(len(chunk) > 300 for chunk in chunks):
        raise RuntimeError(f"Chunking inválido: {[len(chunk) for chunk in chunks]}")

    # Evita fragmentos artificialmente cortos salvo el saludo inicial.
    for idx, chunk in enumerate(chunks):
        if idx > 0 and len(chunk) < 45:
            raise RuntimeError(f"Chunk huérfano detectado: {chunk!r}")

    return chunks


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


class ReferenceAlex:
    def __init__(self):
        sys.path.insert(0, str(LAB_PY))
        from kokoro_lab.engine import KokoroLab
        self.pipeline = KPipeline(lang_code="e")
        self.lab = KokoroLab(self.pipeline.model)
        self.g2p = self.lab.make_g2p("e")
        self.pack = self.pipeline.load_voice(ALEX_VOICE).detach().cpu()

    def b2(self, text: str, speed: float = 0.96):
        speech = normalize_for_speech(text, REFERENCE_DATE)
        phonemes = self.lab.phonemize(self.g2p, speech)
        if not phonemes:
            raise RuntimeError("Referencia Alex B2 no produjo fonemas.")
        idx = min(len(phonemes) - 1, self.pack.shape[0] - 1)
        ref_s = self.pack[idx].numpy()
        _, trace, ctx = self.lab.synthesize(
            phonemes,
            ref_s,
            speed=speed,
            trace=True,
        )
        f0, n = transform_b2(trace.stages["F0_pred"], trace.stages["N_pred"])
        return self.lab.decode(ctx, f0=f0, n=n)


def make_reference(path: Path):
    engine = ReferenceAlex()
    pause = np.zeros(int(SAMPLE_RATE * 0.30), np.float32)
    parts = []
    for i, text in enumerate(REFERENCE_PARTS):
        if i:
            parts.append(pause)
        parts.append(engine.b2(text))
    sf.write(path, np.concatenate(parts), SAMPLE_RATE)
    del engine
    gc.collect()


def synthesize_chunk(model, text: str, seed: int):
    torch.manual_seed(seed)
    np.random.seed(seed)
    wav = model.generate(
        text,
        audio_prompt_path=None,
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

    source_script = SCRIPT_PATH.read_text(encoding="utf-8").strip()
    source_hash = sha256_bytes(source_script.encode("utf-8"))
    if source_hash != EXPECTED_SCRIPT_HASH:
        raise RuntimeError(
            f"Guion Internacional no coincide con el aprobado: {source_hash}"
        )

    control_src = PUBLIC_DIR / "audio" / "2026-09-17-international-analysis.mp3"
    if not control_src.exists():
        raise RuntimeError("No existe el MP3 productivo de Internacional 17-09.")
    control_dst = OUT_DIR / "a-international-production-2026-09-17.mp3"
    shutil.copy2(control_src, control_dst)

    reference_path = OUT_DIR / "reference-alex-b2.wav"
    make_reference(reference_path)
    reference_hash = sha256_file(reference_path)

    speech_text = normalize_full_script(source_script)
    chunks = split_for_chatterbox(speech_text)

    # Libera Kokoro antes de cargar Chatterbox.
    gc.collect()

    sys.path.insert(0, str(CHATTERBOX_SPACE))
    from chatterbox.src.chatterbox.tts import ChatterboxTTS
    model = ChatterboxTTS.from_pretrained("cpu")
    model.prepare_conditionals(str(reference_path), exaggeration=0.50)

    normal_pause = np.zeros(int(SAMPLE_RATE * CHUNK_PAUSE_SECONDS), np.float32)
    section_pause = np.zeros(int(SAMPLE_RATE * SECTION_PAUSE_SECONDS), np.float32)
    parts = []
    chunk_manifest = []

    for idx, chunk in enumerate(chunks):
        seed = 5100 + idx
        samples = synthesize_chunk(model, chunk, seed)
        if idx:
            previous = chunks[idx - 1]
            is_section_boundary = (
                previous.endswith("central.")
                or previous.endswith("cambiando.")
                or previous.endswith("ahora.")
            )
            parts.append(section_pause if is_section_boundary else normal_pause)
        parts.append(samples)
        chunk_manifest.append(
            {
                "index": idx + 1,
                "seed": seed,
                "chars": len(chunk),
                "durationSeconds": round(len(samples) / SAMPLE_RATE, 2),
                "text": chunk,
            }
        )

    output = OUT_DIR / "b-international-alexc-full.mp3"
    write_mp3(output, np.concatenate(parts), int(model.sr))

    manifest = {
        "schemaVersion": 1,
        "experiment": "alexc-international-full-v1",
        "productionTouched": False,
        "sourceDate": REFERENCE_DATE,
        "sourceScriptHash": source_hash,
        "speechRangeFix": "3,75%-4,00% -> 3,75 a 4,00 por ciento, speech_text_only",
        "control": {
            "label": "Internacional producción 17-09",
            "file": control_dst.name,
            "durationSeconds": probe(control_dst),
            "sha256": sha256_file(control_dst),
        },
        "candidate": {
            "label": "Internacional completo · Alex C",
            "file": output.name,
            "durationSeconds": probe(output),
            "sha256": sha256_file(output),
            "engine": "ResembleAI/Chatterbox-Multilingual-es-mx-latam",
            "profile": "C neutral",
            "exaggeration": 0.50,
            "temperature": 0.80,
            "cfg": 0.50,
            "reference": {
                "recipe": "em_alex B2",
                "sha256": reference_hash,
                "durationSeconds": round(len(sf.read(reference_path)[0]) / SAMPLE_RATE, 2),
            },
            "chunks": chunk_manifest,
        },
        "runtime": {
            "chatterboxSpaceCommit": os.environ.get("CHATTERBOX_SPACE_COMMIT"),
            "chatterboxModelRevision": os.environ.get("CHATTERBOX_MODEL_REVISION"),
            "chatterboxBaseRevision": os.environ.get("CHATTERBOX_BASE_REVISION"),
            "kokoroLabPyCommit": "9820dd38f40e71f8df318cdcf017bd24c62a03f7",
        },
    }

    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
