import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import audio_alexc
from audio_speech import is_question, normalize_for_speech

PLAN_PATH = Path(os.environ["ATLAS_INTERNATIONAL_PLAN"])
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])

EXPECTED_SOURCE_ID = "2026-09-18-daily-bancos-centrales-endurecen-el-mapa-global"
EXPECTED_SCRIPT_HASH = "df99671f0c9d0a43107b837e0919c2a2a4c9866786830bbcefeb5cbd223eb8e4"
OUTPUT_DIR = PUBLIC_DIR / "lab" / "audio" / "alexc-accent-cfg-v1"
OUTPUT_FILE = OUTPUT_DIR / "international-cfg-030.mp3"
MANIFEST_FILE = OUTPUT_DIR / "manifest.json"

SAMPLE_RATE = 24_000
CANDIDATE_CFG = 0.30
EXPECTED_BASELINE_CFG = 0.50
EXPECTED_TEMPERATURE = 0.80
MAX_PHRASE_WORDS = 12
PHRASE_PAUSE_SECONDS = 0.55
TURN_PAUSE_SECONDS = float(
    audio_alexc.PROFILE.get("dialogue", {}).get("statementPauseSeconds", 0.34)
)
QUESTION_TURN_PAUSE_SECONDS = float(
    audio_alexc.PROFILE.get("dialogue", {}).get("questionPauseSeconds", 0.40)
)

DORA_PIPELINE = KPipeline(lang_code="e")


def parse_dialogue(text: str) -> list[tuple[str, str]]:
    turns = []
    current_speaker = None
    current_lines = []

    def flush():
        nonlocal current_speaker, current_lines
        if current_speaker and current_lines:
            content = " ".join(current_lines).strip()
            if content:
                turns.append((current_speaker, content))
        current_speaker = None
        current_lines = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = re.match(r"^(VOZ [12]):\s*(.+)$", line)
        if match:
            flush()
            current_speaker = match.group(1)
            current_lines = [match.group(2)]
        elif current_speaker:
            current_lines.append(line)
        else:
            raise RuntimeError(f"Línea sin hablante: {line[:80]}")

    flush()
    if not turns:
        raise RuntimeError("No se detectaron turnos en el diálogo Internacional.")
    return turns


def split_sentences(text: str) -> list[str]:
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])", text)
        if sentence.strip()
    ]
    return sentences or [text.strip()]


def split_short_phrases(text: str, max_words: int) -> list[str]:
    phrases = []

    for sentence in split_sentences(text):
        remaining = sentence.split()
        while len(remaining) > max_words:
            split_at = max_words

            for index in range(max_words - 1, 4, -1):
                if remaining[index].endswith((",", ";", ":")):
                    split_at = index + 1
                    break

            phrases.append(" ".join(remaining[:split_at]))
            remaining = remaining[split_at:]

        if remaining:
            phrases.append(" ".join(remaining))

    return phrases or [text.strip()]


def synthesize_dora(text: str, reference_date: str) -> np.ndarray:
    speech_text = normalize_for_speech(text, reference_date)
    chunks = []

    for _, _, audio in DORA_PIPELINE(
        speech_text,
        voice="ef_dora",
        speed=1.0,
        split_pattern=r"\n+",
    ):
        if audio is None:
            continue
        samples = np.asarray(audio, dtype=np.float32).reshape(-1)
        if samples.size:
            chunks.append(samples)

    if not chunks:
        raise RuntimeError("Kokoro no devolvió audio para Dora.")

    return np.concatenate(chunks)


def synthesize_alexc_turn(
    text: str,
    reference_date: str,
    seed_base: int,
) -> tuple[np.ndarray, int]:
    phrases = split_short_phrases(text, MAX_PHRASE_WORDS)
    pause = np.zeros(
        int(SAMPLE_RATE * PHRASE_PAUSE_SECONDS),
        dtype=np.float32,
    )
    parts = []

    for index, phrase in enumerate(phrases):
        if index:
            parts.append(pause)
        parts.append(
            audio_alexc.synthesize_alexc(
                phrase,
                PUBLIC_DIR,
                reference_date,
                seed_base + index,
                long_form=False,
            )
        )

    return np.concatenate(parts), len(phrases)


def write_mp3(path: Path, samples: np.ndarray):
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


def probe_mp3(path: Path) -> tuple[float, int]:
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
    return round(float(result.stdout.strip()), 1), path.stat().st_size


plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
script = str(plan.get("script") or "").strip()
source_id = str(plan.get("sourceId") or "")
script_hash = hashlib.sha256(script.encode("utf-8")).hexdigest()

if source_id != EXPECTED_SOURCE_ID:
    raise RuntimeError(
        f"LAB bloqueado: sourceId cambió ({source_id}); se esperaba {EXPECTED_SOURCE_ID}."
    )

if script_hash != EXPECTED_SCRIPT_HASH:
    raise RuntimeError(
        "LAB bloqueado: el guion Internacional ya no coincide con la muestra escuchada."
    )

baseline_cfg = float(audio_alexc.PARAMS["cfg"])
temperature = float(audio_alexc.PARAMS["temperature"])
if abs(baseline_cfg - EXPECTED_BASELINE_CFG) > 1e-9:
    raise RuntimeError(
        f"Perfil Alex C cambió: cfg={baseline_cfg}, esperado={EXPECTED_BASELINE_CFG}."
    )
if abs(temperature - EXPECTED_TEMPERATURE) > 1e-9:
    raise RuntimeError(
        f"Perfil Alex C cambió: temperature={temperature}, esperado={EXPECTED_TEMPERATURE}."
    )

# Única variable del experimento: cfg_weight 0.50 -> 0.30.
# La mutación vive sólo en este proceso LAB y no modifica config/audio/alex-c-v1.json.
audio_alexc.PARAMS["cfg"] = CANDIDATE_CFG

normal_pause = np.zeros(
    int(SAMPLE_RATE * TURN_PAUSE_SECONDS),
    dtype=np.float32,
)
question_pause = np.zeros(
    int(SAMPLE_RATE * QUESTION_TURN_PAUSE_SECONDS),
    dtype=np.float32,
)

parts = []
previous_was_question = False
alex_index = 0

for turn_index, (speaker, content) in enumerate(parse_dialogue(script)):
    if speaker == "VOZ 1":
        samples = synthesize_dora(content, str(plan["date"]))
    elif speaker == "VOZ 2":
        samples, phrase_count = synthesize_alexc_turn(
            content,
            str(plan["date"]),
            9200 + alex_index,
        )
        alex_index += phrase_count
    else:
        raise RuntimeError(f"Hablante inesperado: {speaker}")

    if turn_index:
        parts.append(question_pause if previous_was_question else normal_pause)

    parts.append(samples)
    previous_was_question = is_question(content)

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
audio = np.concatenate(parts)
write_mp3(OUTPUT_FILE, audio)
duration, size_bytes = probe_mp3(OUTPUT_FILE)

manifest = {
    "schemaVersion": 1,
    "experiment": "alexc-accent-cfg-v1",
    "scope": "LAB_ONLY",
    "productionTouched": False,
    "sourceId": source_id,
    "scriptHash": script_hash,
    "audioPath": "/lab/audio/alexc-accent-cfg-v1/international-cfg-030.mp3",
    "durationSeconds": duration,
    "bytes": size_bytes,
    "voiceProfile": str(audio_alexc.VOICE_PROFILE_VERSION),
    "checkpoint": str(audio_alexc.CHATTERBOX_ENGINE),
    "referencePublicPath": str(audio_alexc.REFERENCE["publicPath"]),
    "baseline": {
        "cfgWeight": EXPECTED_BASELINE_CFG,
        "temperature": EXPECTED_TEMPERATURE,
        "maxPhraseWords": MAX_PHRASE_WORDS,
        "phrasePauseSeconds": PHRASE_PAUSE_SECONDS,
        "seedBase": 9200,
    },
    "candidate": {
        "cfgWeight": CANDIDATE_CFG,
        "temperature": EXPECTED_TEMPERATURE,
        "maxPhraseWords": MAX_PHRASE_WORDS,
        "phrasePauseSeconds": PHRASE_PAUSE_SECONDS,
        "seedBase": 9200,
    },
    "onlyChangedVariable": "cfg_weight",
    "listeningTargets": [
        "dólares",
        "cayó",
        "Inglaterra",
        "subió",
        "energético",
    ],
}

MANIFEST_FILE.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(
    "LAB Alex C acento listo: "
    f"cfg={CANDIDATE_CFG:.2f}, {duration:.1f}s, {size_bytes} bytes."
)
