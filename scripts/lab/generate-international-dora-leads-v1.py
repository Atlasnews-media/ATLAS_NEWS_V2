import gc
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from audio_alexc import (
    CHATTERBOX_ENGINE,
    PROFILE,
    VOICE_PROFILE_VERSION,
    release_alexc,
    synthesize_alexc,
)
from audio_speech import (
    LEXICON_REVISION,
    LEXICON_VERSION,
    SPEECH_NORMALIZER_VERSION,
    is_question,
    normalize_for_speech,
)

SAMPLE_RATE = 24_000
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
OUTPUT_DIR = PUBLIC_DIR / "lab" / "audio" / "international-dora-leads-v1"

SOURCE_ID = "2026-09-19-daily-endurecimiento-global-gana-alcance"
SOURCE_REPO_COMMIT = "229a0793eb18b95b7846d81be463026d80a3e86a"
PRODUCTION_AUDIO_SOURCE_COMMIT = "0c92582d17f70c7b6801d1a2d1b8b7fcff259c60"
PRODUCTION_SCRIPT_HASH = "7b131441f78a312d825a94a1e101b9c86fa0ad39554aa0c08d017d1223a9991f"
REFERENCE_DATE = "2026-09-19"
PRODUCTION_WORD_COUNT = 380

ALEX_SEED_BASE = 5100
ALEX_SENTENCE_PAUSE_SECONDS = 0.55
STATEMENT_PAUSE_SECONDS = float(
    PROFILE.get("dialogue", {}).get("statementPauseSeconds", 0.34)
)
QUESTION_PAUSE_SECONDS = float(
    PROFILE.get("dialogue", {}).get("questionPauseSeconds", 0.40)
)

# Previo de aproximadamente la mitad funcional del Internacional productivo.
# Los hechos y respuestas provienen del mismo guion de producción del 19-09.
# Única variable editorial bajo prueba: Dora abre/conduce y Alex C responde.
TURNS = [
    (
        "DORA",
        "ATLAS NEWS. Análisis internacional del sábado 19 de septiembre de 2026. "
        "Japón se suma al giro restrictivo mientras Estados Unidos y Europa mantienen "
        "el foco en inflación, con energía y Hormuz ampliando el riesgo para precios, "
        "crédito y comercio mundial. El Banco de Japón elevó su tasa a 1,25% y abrió "
        "una fase más preventiva frente al riesgo de inflación persistente. "
        "Alex, ¿qué está cambiando y por qué importa?",
    ),
    (
        "ALEX C",
        "El mapa monetario internacional se volvió más restrictivo esta semana y Japón "
        "aportó la señal nueva más clara. La decisión amplía un movimiento que ya había "
        "incluido la subida de la Reserva Federal y el endurecimiento del tono en Europa: "
        "el shock energético dejó de ser sólo una perturbación de precios y está "
        "condicionando simultáneamente decisiones monetarias en varias economías avanzadas. "
        "La coincidencia de señales restrictivas reduce la posibilidad de que una gran "
        "economía compense a las demás con condiciones financieras claramente más laxas. "
        "Si el shock energético dura, los bancos centrales enfrentan el riesgo de que el "
        "aumento inicial de combustibles se propague hacia expectativas, salarios y otros "
        "precios, aun cuando la actividad pierda fuerza.",
    ),
]


def count_words(text: str) -> int:
    return len([token for token in re.split(r"\s+", text.strip()) if token])


def split_alexc_sentences(text: str) -> list[str]:
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])", text)
        if sentence.strip()
    ]
    return sentences or [text.strip()]


def synthesize_dora(text: str, pipeline: KPipeline) -> np.ndarray:
    speech_text = normalize_for_speech(text, REFERENCE_DATE)
    chunks = []
    for _, _, audio in pipeline(
        speech_text,
        voice="ef_dora",
        speed=1.0,
        split_pattern=r"\n+",
    ):
        if audio is None:
            continue
        arr = np.asarray(audio, dtype=np.float32).reshape(-1)
        if arr.size:
            chunks.append(arr)
    if not chunks:
        raise RuntimeError("Kokoro no devolvió audio para Dora.")
    return np.concatenate(chunks)


def synthesize_alexc_response(
    text: str,
    seed_base: int,
) -> tuple[np.ndarray, int]:
    sentences = split_alexc_sentences(text)
    sentence_pause = np.zeros(
        int(SAMPLE_RATE * ALEX_SENTENCE_PAUSE_SECONDS),
        dtype=np.float32,
    )
    parts = []

    for index, sentence in enumerate(sentences):
        if index:
            parts.append(sentence_pause)
        parts.append(
            synthesize_alexc(
                sentence,
                PUBLIC_DIR,
                REFERENCE_DATE,
                seed_base + index,
                long_form=False,
            )
        )

    return np.concatenate(parts), len(sentences)


def write_mp3(path: Path, samples: np.ndarray):
    wav = path.with_suffix(".wav")
    sf.write(wav, samples, SAMPLE_RATE)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(wav),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "96k",
            str(path),
        ],
        check=True,
    )
    wav.unlink(missing_ok=True)


def probe(path: Path):
    if not path.exists() or path.stat().st_size < 10_000:
        raise RuntimeError("MP3 LAB inválido o demasiado pequeño.")
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    duration = round(float(result.stdout.strip()), 1)
    if duration < 20:
        raise RuntimeError(f"Duración LAB inesperadamente corta: {duration:.1f}s")
    return duration, path.stat().st_size


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
pipeline = KPipeline(lang_code="e")
parts = []
alex_sentence_index = 0
alex_sentence_count = 0

for turn_index, (speaker, text) in enumerate(TURNS):
    if speaker == "DORA":
        samples = synthesize_dora(text, pipeline)
    else:
        samples, sentence_count = synthesize_alexc_response(
            text,
            ALEX_SEED_BASE + alex_sentence_index,
        )
        alex_sentence_index += sentence_count
        alex_sentence_count += sentence_count

    if turn_index:
        previous_text = TURNS[turn_index - 1][1]
        pause_seconds = (
            QUESTION_PAUSE_SECONDS
            if is_question(previous_text)
            else STATEMENT_PAUSE_SECONDS
        )
        parts.append(np.zeros(int(SAMPLE_RATE * pause_seconds), dtype=np.float32))

    parts.append(samples)

candidate = np.concatenate(parts)
output_path = OUTPUT_DIR / "preview-dora-leads.mp3"
write_mp3(output_path, candidate)
duration, size_bytes = probe(output_path)

dialogue_text = "\n\n".join(f"{speaker}: {text}" for speaker, text in TURNS)
dialogue_words = count_words(dialogue_text)
dialogue_hash = hashlib.sha256(dialogue_text.encode("utf-8")).hexdigest()
(OUTPUT_DIR / "dialogue.txt").write_text(dialogue_text + "\n", encoding="utf-8")

manifest = {
    "schemaVersion": 1,
    "experiment": "international-dora-leads-v1",
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "productionTouched": False,
    "fallbackAllowed": False,
    "source": {
        "date": REFERENCE_DATE,
        "sourceId": SOURCE_ID,
        "sourceRepoCommit": SOURCE_REPO_COMMIT,
        "productionAudioSourceCommit": PRODUCTION_AUDIO_SOURCE_COMMIT,
        "productionScriptHash": PRODUCTION_SCRIPT_HASH,
        "productionWordCount": PRODUCTION_WORD_COUNT,
    },
    "hypothesis": "Dora abre y conduce; Alex C responde y desarrolla.",
    "candidate": {
        "path": "/lab/audio/international-dora-leads-v1/preview-dora-leads.mp3",
        "durationSeconds": duration,
        "bytes": size_bytes,
        "dialogueWords": dialogue_words,
        "productionWordFraction": round(dialogue_words / PRODUCTION_WORD_COUNT, 3),
        "turnCount": len(TURNS),
        "leader": "ef_dora",
        "responder": VOICE_PROFILE_VERSION,
        "engine": f"Kokoro-82M + {CHATTERBOX_ENGINE}",
        "speechNormalizerVersion": SPEECH_NORMALIZER_VERSION,
        "lexiconVersion": LEXICON_VERSION,
        "lexiconRevision": LEXICON_REVISION,
        "dialogueRhythmVersion": 2,
        "alexSeedBase": ALEX_SEED_BASE,
        "alexSentenceCount": alex_sentence_count,
        "alexSentencePauseSeconds": ALEX_SENTENCE_PAUSE_SECONDS,
        "statementPauseSeconds": STATEMENT_PAUSE_SECONDS,
        "questionPauseSeconds": QUESTION_PAUSE_SECONDS,
        "dialogueSha256": dialogue_hash,
    },
}

(OUTPUT_DIR / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

pipeline = None
release_alexc()
gc.collect()

print(
    "LAB Internacional Dora lidera listo: "
    f"{duration:.1f}s · {dialogue_words}/{PRODUCTION_WORD_COUNT} palabras · "
    f"{alex_sentence_count} oraciones Alex C."
)
