import gc
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch

from audio_speech import normalize_for_speech

ROOT = Path(__file__).resolve().parent.parent
PROFILE_PATH = ROOT / "config" / "audio" / "alex-c-v1.json"
PROFILE = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))

VOICE_PROFILE_VERSION = str(PROFILE["profile"])
CHATTERBOX_ENGINE = str(PROFILE["engine"])
PARAMS = PROFILE["parameters"]
CHUNKING = PROFILE["chunking"]
REFERENCE = PROFILE["reference"]

_model = None


def _reference_path(public_dir: Path) -> Path:
    path = public_dir / str(REFERENCE["publicPath"])
    if not path.exists():
        raise RuntimeError(f"Referencia Alex C ausente: {path}")

    result = subprocess.run(
        ["git", "-C", str(public_dir), "hash-object", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    observed = result.stdout.strip()
    expected = str(REFERENCE["gitBlobSha"])
    if observed != expected:
        raise RuntimeError(
            f"Referencia Alex C cambió: blob={observed}, esperado={expected}"
        )
    return path


def _load_model(public_dir: Path):
    global _model
    if _model is not None:
        return _model

    space_dir = Path(os.environ["ATLAS_CHATTERBOX_SPACE_DIR"])
    ckpt_dir = Path(os.environ["ATLAS_CHATTERBOX_CKPT_DIR"])
    if not space_dir.exists() or not ckpt_dir.exists():
        raise RuntimeError("Runtime Chatterbox productivo no preparado.")

    sys.path.insert(0, str(space_dir))
    from chatterbox.src.chatterbox.tts import ChatterboxTTS

    model = ChatterboxTTS.from_local(
        ckpt_dir,
        "cpu",
        t3_filename="t3_es_mx_latam.safetensors",
        s3gen_filename="s3gen_v3.pt",
    )
    reference = _reference_path(public_dir)
    model.prepare_conditionals(
        str(reference),
        exaggeration=float(PARAMS["exaggeration"]),
    )
    if int(model.sr) != 24_000:
        raise RuntimeError(f"Sample rate Chatterbox inesperado: {model.sr}")

    _model = model
    return _model


def release_alexc():
    global _model
    _model = None
    gc.collect()


def _split_for_chatterbox(text: str):
    limit = int(CHUNKING["maxChars"])
    hard_limit = int(CHUNKING["hardMaxChars"])
    headings = {"El hecho central.", "Qué está cambiando.", "Qué observar ahora."}

    units = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", text)
        if sentence.strip()
    ]

    chunks = []
    current = ""
    for unit in units:
        if unit in headings:
            if current:
                chunks.append(current)
            current = unit
            continue

        candidate = f"{current} {unit}".strip() if current else unit
        if len(candidate) <= limit:
            current = candidate
            continue

        if current:
            chunks.append(current)
            current = ""

        if len(unit) <= limit:
            current = unit
            continue

        pieces = [
            piece.strip()
            for piece in re.split(r"(?<=[,;:])\s+", unit)
            if piece.strip()
        ]
        buffer = ""
        for piece in pieces:
            candidate = f"{buffer} {piece}".strip() if buffer else piece
            if len(candidate) <= hard_limit - 5:
                buffer = candidate
            else:
                if buffer:
                    chunks.append(buffer)
                buffer = piece
        current = buffer

    if current:
        chunks.append(current)

    if not chunks or any(len(chunk) > hard_limit for chunk in chunks):
        raise RuntimeError(
            f"Chunking Alex C inválido: {[len(chunk) for chunk in chunks]}"
        )
    return chunks


def _generate_chunk(model, text: str, seed: int) -> np.ndarray:
    torch.manual_seed(seed)
    np.random.seed(seed)
    wav = model.generate(
        text,
        audio_prompt_path=None,
        exaggeration=float(PARAMS["exaggeration"]),
        temperature=float(PARAMS["temperature"]),
        cfg_weight=float(PARAMS["cfg"]),
        language_id=str(PARAMS["languageId"]),
    )
    if hasattr(wav, "detach"):
        wav = wav.detach().cpu().numpy()
    samples = np.asarray(wav, dtype=np.float32).reshape(-1)
    if not samples.size:
        raise RuntimeError("Chatterbox devolvió audio vacío.")
    return samples


def synthesize_alexc(
    text: str,
    public_dir: Path,
    reference_date: str | None,
    seed_base: int,
    long_form: bool = False,
) -> np.ndarray:
    speech_text = normalize_for_speech(text, reference_date)
    model = _load_model(public_dir)
    chunks = _split_for_chatterbox(speech_text) if long_form else [speech_text]

    pause = np.zeros(
        int(24_000 * float(CHUNKING["pauseSeconds"])),
        dtype=np.float32,
    )
    section_pause = np.zeros(
        int(24_000 * float(CHUNKING["sectionPauseSeconds"])),
        dtype=np.float32,
    )

    parts = []
    for index, chunk in enumerate(chunks):
        if index:
            previous = chunks[index - 1]
            boundary = (
                previous.endswith("central.")
                or previous.endswith("cambiando.")
                or previous.endswith("ahora.")
            )
            parts.append(section_pause if boundary else pause)
        parts.append(_generate_chunk(model, chunk, seed_base + index))

    return np.concatenate(parts)
