import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from audio_speech import (  # noqa: E402
    LEXICON_REVISION,
    LEXICON_VERSION,
    SPEECH_NORMALIZER_VERSION,
    normalize_for_kokoro_dora,
    normalize_for_speech,
)

VOICE = "ef_dora"
LANG_CODE = "e"
SPEED = 1.0
SAMPLE_RATE = 24_000
OUT = Path(__file__).resolve().parent / "out"

CASES = [
    ("euro-1099", "El euro se ubicó en 1.099 pesos con 86 centavos."),
    ("euro-1100", "El euro se ubicó en 1.100 pesos con 95 centavos."),
    ("euro-1101", "El euro se ubicó en 1.101 pesos con 20 centavos."),
    ("costo-8743", "El costo medio llegó a 8.743 pesos."),
    ("fondos-22330", "Los fondos retiraron 22.330 millones de pesos."),
    ("uf-40983", "La UF vigente alcanza los 40.983 pesos con 58 centavos."),
]

PHONEME_AB_CASES = {"euro-1099", "euro-1100", "euro-1101", "uf-40983"}


def safe_slug(value: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")


def write_mp3(path: Path, samples: np.ndarray) -> None:
    wav_path = path.with_suffix(".wav")
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
            str(path),
        ],
        check=True,
    )
    wav_path.unlink(missing_ok=True)


def mil_duration_windows(result):
    pred_dur = result.pred_dur
    phonemes = result.phonemes
    if pred_dur is None or not phonemes:
        return []
    durations = pred_dur.detach().cpu().tolist()
    if len(durations) < len(phonemes) + 2:
        return []

    windows = []
    start = 0
    while True:
        index = phonemes.find("mˈil", start)
        if index < 0:
            break
        after = index + len("mˈil")
        left = max(0, index - 4)
        right = min(len(phonemes), after + 6)
        items = []
        for pos in range(left, right):
            frames = int(durations[pos + 1])
            items.append(
                {
                    "index": pos,
                    "char": phonemes[pos],
                    "frames": frames,
                    "seconds": round(frames / 40.0, 4),
                }
            )

        boundary_frames = None
        if after < len(phonemes) and phonemes[after].isspace():
            boundary_frames = int(durations[after + 1])

        mil_frames = int(
            sum(durations[pos + 1] for pos in range(index, after))
        )
        windows.append(
            {
                "matchIndex": index,
                "milFrames": mil_frames,
                "milSeconds": round(mil_frames / 40.0, 4),
                "followingBoundaryFrames": boundary_frames,
                "followingBoundarySeconds": (
                    round(boundary_frames / 40.0, 4)
                    if boundary_frames is not None
                    else None
                ),
                "window": items,
            }
        )
        start = after
    return windows


def run_pipeline(pipeline: KPipeline, speech_text: str):
    chunks = []
    trace = []
    for result in pipeline(
        speech_text,
        voice=VOICE,
        speed=SPEED,
        split_pattern=r"\n+",
    ):
        trace.append(
            {
                "graphemes": result.graphemes,
                "phonemes": result.phonemes,
                "milDurationWindows": mil_duration_windows(result),
            }
        )
        if result.audio is not None:
            array = np.asarray(result.audio, dtype=np.float32).reshape(-1)
            if array.size:
                chunks.append(array)
    if not chunks:
        raise RuntimeError(f"Kokoro no devolvió audio para: {speech_text!r}")
    return np.concatenate(chunks), trace


def run_raw_phonemes(pipeline: KPipeline, phonemes: str):
    chunks = []
    windows = []
    for result in pipeline.generate_from_tokens(
        tokens=phonemes,
        voice=VOICE,
        speed=SPEED,
    ):
        windows.extend(mil_duration_windows(result))
        audio = result.audio
        if audio is None:
            continue
        array = np.asarray(audio, dtype=np.float32).reshape(-1)
        if array.size:
            chunks.append(array)
    if not chunks:
        raise RuntimeError(f"Kokoro no devolvió audio para fonemas: {phonemes!r}")
    return np.concatenate(chunks), windows


def phoneme_candidates(phonemes: str):
    return [
        ("phoneme-baseline", phonemes),
        ("phoneme-mil-joined", phonemes.replace("mˈil ", "mˈil")),
        ("phoneme-mil-unstressed", phonemes.replace("mˈil", "mil")),
        (
            "phoneme-mil-joined-unstressed",
            phonemes.replace("mˈil ", "mil"),
        ),
    ]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old_file in OUT.glob("*.mp3"):
        old_file.unlink()
    pipeline = KPipeline(lang_code=LANG_CODE)

    manifest = {
        "lab": "audio-number-phonemes-v1",
        "engine": "kokoro==0.9.4",
        "voice": VOICE,
        "language": "es",
        "speechNormalizerVersion": SPEECH_NORMALIZER_VERSION,
        "lexiconVersion": LEXICON_VERSION,
        "lexiconRevision": LEXICON_REVISION,
        "cases": [],
    }

    for case_id, source in CASES:
        generic = normalize_for_speech(source)
        dora = normalize_for_kokoro_dora(source)
        variants = [
            ("generic", generic),
            ("dora", dora),
            ("dora-joined", dora.replace("\n", " ")),
        ]

        case_entry = {
            "id": case_id,
            "source": source,
            "genericSpeechText": generic,
            "doraSpeechText": dora,
            "variants": [],
            "phonemeVariants": [],
        }

        for variant, speech_text in variants:
            samples, trace = run_pipeline(pipeline, speech_text)
            filename = f"{safe_slug(case_id)}-{safe_slug(variant)}.mp3"
            write_mp3(OUT / filename, samples)
            case_entry["variants"].append(
                {
                    "name": variant,
                    "speechText": speech_text,
                    "trace": trace,
                    "audio": filename,
                    "samples": int(samples.size),
                    "durationSeconds": round(samples.size / SAMPLE_RATE, 3),
                }
            )

        if case_id in PHONEME_AB_CASES:
            base_phonemes, _ = pipeline.g2p(generic)
            for variant, candidate in phoneme_candidates(base_phonemes):
                samples, duration_windows = run_raw_phonemes(pipeline, candidate)
                filename = f"{safe_slug(case_id)}-{safe_slug(variant)}.mp3"
                write_mp3(OUT / filename, samples)
                case_entry["phonemeVariants"].append(
                    {
                        "name": variant,
                        "phonemes": candidate,
                        "audio": filename,
                        "samples": int(samples.size),
                        "durationSeconds": round(samples.size / SAMPLE_RATE, 3),
                        "milDurationWindows": duration_windows,
                    }
                )

        manifest["cases"].append(case_entry)

    manifest_path = OUT / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(manifest_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
