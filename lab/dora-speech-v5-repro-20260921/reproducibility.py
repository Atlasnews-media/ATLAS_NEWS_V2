import argparse
import hashlib
import json
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
    normalize_for_speech,
)

VOICE = "ef_dora"
LANG_CODE = "e"
SPEED = 1.0
SAMPLE_RATE = 24_000
REPEATS = 5

PORTADA_PARAGRAPH = (
    "En monedas, el dólar observado marcó 958 pesos con 42 centavos, con una variación positiva de 0,37% frente a la jornada hábil anterior. "
    "El euro se ubicó en 1.099 pesos con 86 centavos, con un retroceso de 0,1%. "
    "La UF vigente alcanza los 40.983 pesos con 58 centavos. "
    "En renta variable y energía, el IPSA retrocede 0,99%, el S&P 500 cae 1,25% y el Brent retrocede 9,23%. "
    "El cobre, en tanto, sube 1,26%. El Treasury a diez años se ubica en 5%. "
    "Entre los movimientos destacados, Bitcoin avanza 5,61%."
)


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


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


def decode_mp3_s16le(path: Path) -> np.ndarray:
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(path),
            "-f",
            "s16le",
            "-acodec",
            "pcm_s16le",
            "-ar",
            str(SAMPLE_RATE),
            "-ac",
            "1",
            "pipe:1",
        ],
        check=True,
        stdout=subprocess.PIPE,
    )
    return np.frombuffer(proc.stdout, dtype="<i2").copy()


def compare_pcm(left: np.ndarray, right: np.ndarray) -> dict:
    common = min(left.size, right.size)
    if common:
        diff = left[:common].astype(np.int32) - right[:common].astype(np.int32)
        max_abs = int(np.max(np.abs(diff)))
        rms = float(np.sqrt(np.mean(np.square(diff.astype(np.float64)))))
    else:
        max_abs = 0
        rms = 0.0
    return {
        "leftSamples": int(left.size),
        "rightSamples": int(right.size),
        "sameLength": bool(left.size == right.size),
        "exactEqual": bool(np.array_equal(left, right)),
        "commonSamples": int(common),
        "maxAbsSampleDiff": max_abs,
        "rmsSampleDiff": round(rms, 6),
    }


def synthesize_once(pipeline: KPipeline, speech_text: str):
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
            }
        )
        if result.audio is None:
            continue
        array = np.asarray(result.audio, dtype=np.float32).reshape(-1)
        if array.size:
            chunks.append(array)
    if not chunks:
        raise RuntimeError("Kokoro no devolvió audio.")
    return np.concatenate(chunks), trace


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-a", type=Path, required=True)
    parser.add_argument("--sample-b", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    speech_text = normalize_for_speech(PORTADA_PARAGRAPH)

    a_pcm = decode_mp3_s16le(args.sample_a)
    b_pcm = decode_mp3_s16le(args.sample_b)

    pipeline = KPipeline(lang_code=LANG_CODE)
    renders = []

    for index in range(1, REPEATS + 1):
        samples, trace = synthesize_once(pipeline, speech_text)
        mp3_path = args.out / f"repeat-{index}.mp3"
        write_mp3(mp3_path, samples)
        decoded = decode_mp3_s16le(mp3_path)
        renders.append(
            {
                "index": index,
                "audio": mp3_path.name,
                "floatPcmSha256": sha256_bytes(
                    samples.astype("<f4", copy=False).tobytes()
                ),
                "decodedPcmSha256": sha256_bytes(decoded.tobytes()),
                "samplesFloat": int(samples.size),
                "samplesDecoded": int(decoded.size),
                "durationSeconds": round(samples.size / SAMPLE_RATE, 6),
                "bytes": mp3_path.stat().st_size,
                "trace": trace,
            }
        )

    baseline_decoded = decode_mp3_s16le(args.out / "repeat-1.mp3")
    comparisons = [
        {
            "left": "repeat-1",
            "right": f"repeat-{item['index']}",
            **compare_pcm(
                baseline_decoded,
                decode_mp3_s16le(args.out / item["audio"]),
            ),
        }
        for item in renders[1:]
    ]

    report = {
        "experiment": "dora-speech-v5-repro-20260921",
        "productionTouched": False,
        "fallbackAllowed": False,
        "voice": VOICE,
        "engine": "Kokoro-82M / kokoro==0.9.4",
        "speed": SPEED,
        "splitPattern": r"\n+",
        "speechNormalizerVersion": SPEECH_NORMALIZER_VERSION,
        "lexiconVersion": LEXICON_VERSION,
        "lexiconRevision": LEXICON_REVISION,
        "sourceText": PORTADA_PARAGRAPH,
        "speechText": speech_text,
        "existingLabAB": {
            "sampleA": args.sample_a.name,
            "sampleB": args.sample_b.name,
            "sampleADecodedPcmSha256": sha256_bytes(a_pcm.tobytes()),
            "sampleBDecodedPcmSha256": sha256_bytes(b_pcm.tobytes()),
            "comparison": compare_pcm(a_pcm, b_pcm),
        },
        "repeats": renders,
        "repeatComparisons": comparisons,
        "allFloatPcmHashesEqual": len(
            {item["floatPcmSha256"] for item in renders}
        )
        == 1,
        "allDecodedPcmHashesEqual": len(
            {item["decodedPcmSha256"] for item in renders}
        )
        == 1,
        "allTracesEqual": all(
            item["trace"] == renders[0]["trace"] for item in renders[1:]
        ),
    }

    target = args.out / "report.json"
    target.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(target.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
