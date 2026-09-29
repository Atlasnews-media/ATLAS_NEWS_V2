from __future__ import annotations

from array import array
from hashlib import sha256
import json
import math
from pathlib import Path
import subprocess
import sys
from typing import Sequence

WAVEFORM_SCHEMA_VERSION = 1
WAVEFORM_POINTS = 1200
WAVEFORM_PRECISION = 10_000
WAVEFORM_SAMPLE_RATE = 24_000


def peaks_path_for_audio(audio_path: str) -> str:
    if not audio_path.endswith(".mp3"):
        raise ValueError(f"Ruta MP3 inválida: {audio_path}")
    return f"{audio_path[:-4]}.peaks.json"


def decode_mono_f32(
    mp3_path: Path,
    sample_rate: int = WAVEFORM_SAMPLE_RATE,
) -> array:
    result = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(mp3_path),
            "-f",
            "f32le",
            "-ac",
            "1",
            "-ar",
            str(sample_rate),
            "pipe:1",
        ],
        check=True,
        capture_output=True,
    )
    samples = array("f")
    samples.frombytes(result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        raise RuntimeError(f"No fue posible decodificar {mp3_path.name}.")
    return samples


def export_peaks(
    samples: Sequence[float],
    max_length: int = WAVEFORM_POINTS,
    precision: int = WAVEFORM_PRECISION,
) -> list[list[float]]:
    if max_length <= 0:
        raise ValueError("max_length debe ser mayor que cero.")
    if precision <= 0:
        raise ValueError("precision debe ser mayor que cero.")
    if not samples:
        raise ValueError("No hay muestras para calcular peaks.")

    output_length = min(max_length, len(samples))
    sample_size = len(samples) / output_length
    peaks: list[float] = []

    for index in range(output_length):
        start = math.floor(index * sample_size)
        end = math.ceil((index + 1) * sample_size)
        maximum = 0.0
        for sample in samples[start:end]:
            value = float(sample)
            if abs(value) > abs(maximum):
                maximum = value
        peaks.append(round(maximum * precision) / precision)

    return [peaks]


def build_waveform_sidecar(
    mp3_path: Path,
    audio_path: str,
    duration_seconds: float,
) -> dict:
    if duration_seconds <= 0:
        raise ValueError("duration_seconds debe ser mayor que cero.")

    samples = decode_mono_f32(mp3_path)
    peaks = export_peaks(samples)

    return {
        "schemaVersion": WAVEFORM_SCHEMA_VERSION,
        "audioPath": audio_path,
        "audioSha256": sha256(mp3_path.read_bytes()).hexdigest(),
        "durationSeconds": duration_seconds,
        "sampleRate": WAVEFORM_SAMPLE_RATE,
        "points": len(peaks[0]),
        "peaks": peaks,
    }


def write_waveform_sidecar(
    mp3_path: Path,
    audio_path: str,
    duration_seconds: float,
    output_path: Path,
) -> None:
    payload = build_waveform_sidecar(mp3_path, audio_path, duration_seconds)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
