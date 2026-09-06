import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf


def raise_terminal_pitch(
    samples: np.ndarray,
    sample_rate: int,
    *,
    semitones: float = 1.5,
    tail_seconds: float = 0.65,
    crossfade_seconds: float = 0.10,
) -> np.ndarray:
    """Raise pitch on the terminal tail while preserving approximate duration.

    Intended only for explicit Alex questions after Kokoro synthesis. It never
    alters source text or the base voice. ffmpeg's asetrate+atempo pair shifts
    pitch while returning the tail to its original duration; the start of the
    processed tail is crossfaded to avoid a hard tonal jump.
    """
    source = np.asarray(samples, dtype=np.float32).reshape(-1)
    if source.size < 2 or semitones <= 0 or tail_seconds <= 0:
        return source.copy()

    tail_count = min(source.size, max(2, int(sample_rate * tail_seconds)))
    tail = source[-tail_count:]
    pitch_ratio = 2 ** (float(semitones) / 12.0)
    tempo_ratio = 1.0 / pitch_ratio

    with tempfile.TemporaryDirectory(prefix="atlas-question-pitch-") as temp_name:
        temp_dir = Path(temp_name)
        input_path = temp_dir / "input.wav"
        output_path = temp_dir / "output.wav"
        sf.write(input_path, tail, sample_rate)
        filter_expr = (
            f"asetrate={sample_rate * pitch_ratio:.6f},"
            f"aresample={sample_rate},"
            f"atempo={tempo_ratio:.8f}"
        )
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(input_path),
                "-af",
                filter_expr,
                "-ar",
                str(sample_rate),
                "-ac",
                "1",
                str(output_path),
            ],
            check=True,
        )
        shifted, shifted_rate = sf.read(output_path, dtype="float32")

    shifted = np.asarray(shifted, dtype=np.float32).reshape(-1)
    if shifted_rate != sample_rate or shifted.size < 2:
        raise RuntimeError("Pitch terminal de pregunta produjo audio inválido.")

    # ffmpeg can differ by a few samples after atempo. Interpolate only to
    # restore the exact tail length expected by the dialogue concatenation.
    if shifted.size != tail_count:
        x_old = np.linspace(0.0, 1.0, shifted.size, dtype=np.float64)
        x_new = np.linspace(0.0, 1.0, tail_count, dtype=np.float64)
        shifted = np.interp(x_new, x_old, shifted).astype(np.float32)

    output = source.copy()
    start = output.size - tail_count
    crossfade_count = min(
        max(1, int(sample_rate * crossfade_seconds)),
        max(1, tail_count // 2),
    )

    if crossfade_count > 1:
        blend = np.linspace(0.0, 1.0, crossfade_count, dtype=np.float32)
        output[start : start + crossfade_count] = (
            tail[:crossfade_count] * (1.0 - blend)
            + shifted[:crossfade_count] * blend
        )
        output[start + crossfade_count :] = shifted[crossfade_count:]
    else:
        output[start:] = shifted

    peak = float(np.max(np.abs(output))) if output.size else 0.0
    if peak > 0.99:
        output *= 0.99 / peak
    return output
