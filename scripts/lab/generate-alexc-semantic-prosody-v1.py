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
OUTPUT_DIR = PUBLIC_DIR / "lab" / "audio" / "alexc-semantic-prosody-v1"
OUTPUT_FILE = OUTPUT_DIR / "international-semantic-v1.mp3"
MANIFEST_FILE = OUTPUT_DIR / "manifest.json"

SAMPLE_RATE = 24_000
SEED_BASE = 9200
CLAUSE_PAUSE_SECONDS = 0.22
SENTENCE_PAUSE_SECONDS = 0.55
TURN_PAUSE_SECONDS = float(
    audio_alexc.PROFILE.get("dialogue", {}).get("statementPauseSeconds", 0.34)
)
QUESTION_TURN_PAUSE_SECONDS = float(
    audio_alexc.PROFILE.get("dialogue", {}).get("questionPauseSeconds", 0.40)
)
EXPECTED_CFG = 0.50
EXPECTED_TEMPERATURE = 0.80
TARGET_WORDS = ("intensidad", "será", "escenario", "normalización")

# Cortes manuales y semánticos para ESTE guion de Internacional.
# No existe límite de palabras ni corte por caracteres.
SEMANTIC_BREAKS = (
    r"(?<=,)\s+(?=mientras el Banco de Inglaterra\b)",
    r"(?<=,)\s+(?=reforzando el giro\b)",
    r"(?<=,)\s+(?=el nivel más alto\b)",
    r"(?<=,)\s+(?=después de que la Reserva Federal\b)",
    r"(?<=,)\s+(?=aunque tres de sus nueve miembros\b)",
    r"\s+(?=y la institución advirtió\b)",
    r"(?<=,)\s+(?=apoyados por la recuperación\b)",
    r"(?<=,)\s+(?=mientras el yen se debilitó\b)",
    r"\s+(?=y la reacción de otros bancos centrales\b)",
    r"(?<=;)\s+(?=nuevos ataques o interrupciones\b)",
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
        raise RuntimeError("No se detectaron turnos en Internacional.")
    return turns


def _compact(text: str) -> str:
    return re.sub(r"\s+", " ", str(text)).strip()


def semantic_segments(speech_text: str) -> list[str]:
    """Divide sólo en límites semánticos predefinidos para la muestra."""
    sentences = [
        sentence.strip()
        for sentence in re.split(
            r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])",
            speech_text,
        )
        if sentence.strip()
    ]
    segments = []

    for sentence in sentences or [speech_text.strip()]:
        pieces = [sentence]
        for pattern in SEMANTIC_BREAKS:
            next_pieces = []
            for piece in pieces:
                next_pieces.extend(
                    part.strip()
                    for part in re.split(pattern, piece)
                    if part.strip()
                )
            pieces = next_pieces
        segments.extend(pieces)

    if not segments:
        raise RuntimeError("La segmentación semántica no produjo unidades.")

    if _compact(" ".join(segments)) != _compact(speech_text):
        raise RuntimeError(
            "La segmentación alteró el speech_text; el LAB queda bloqueado."
        )

    return segments


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
    seed_start: int,
) -> tuple[np.ndarray, int, list[str]]:
    # Orden canónico del handoff:
    # display_text -> Speech V5/Lexicon -> speech_text -> segmentación -> Chatterbox.
    speech_text = normalize_for_speech(text, reference_date)
    segments = semantic_segments(speech_text)
    model = audio_alexc._load_model(PUBLIC_DIR)

    clause_pause = np.zeros(
        int(SAMPLE_RATE * CLAUSE_PAUSE_SECONDS),
        dtype=np.float32,
    )
    sentence_pause = np.zeros(
        int(SAMPLE_RATE * SENTENCE_PAUSE_SECONDS),
        dtype=np.float32,
    )

    parts = []
    for index, segment in enumerate(segments):
        if index:
            previous = segments[index - 1]
            parts.append(
                sentence_pause
                if previous.endswith((".", "?", "!"))
                else clause_pause
            )
        parts.append(
            audio_alexc._generate_chunk(
                model,
                segment,
                seed_start + index,
            )
        )

    return np.concatenate(parts), len(segments), segments


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
        f"LAB bloqueado: sourceId={source_id}; esperado={EXPECTED_SOURCE_ID}."
    )
if script_hash != EXPECTED_SCRIPT_HASH:
    raise RuntimeError(
        "LAB bloqueado: el guion ya no coincide con el Internacional escuchado."
    )

cfg = float(audio_alexc.PARAMS["cfg"])
temperature = float(audio_alexc.PARAMS["temperature"])
if abs(cfg - EXPECTED_CFG) > 1e-9:
    raise RuntimeError(f"Alex C cambió cfg={cfg}; esperado={EXPECTED_CFG}.")
if abs(temperature - EXPECTED_TEMPERATURE) > 1e-9:
    raise RuntimeError(
        f"Alex C cambió temperature={temperature}; esperado={EXPECTED_TEMPERATURE}."
    )

turns = parse_dialogue(script)
normal_turn_pause = np.zeros(
    int(SAMPLE_RATE * TURN_PAUSE_SECONDS),
    dtype=np.float32,
)
question_turn_pause = np.zeros(
    int(SAMPLE_RATE * QUESTION_TURN_PAUSE_SECONDS),
    dtype=np.float32,
)

parts = []
previous_was_question = False
seed_cursor = 0
all_alex_segments = []

for turn_index, (speaker, content) in enumerate(turns):
    if speaker == "VOZ 1":
        samples = synthesize_dora(content, str(plan["date"]))
    elif speaker == "VOZ 2":
        samples, segment_count, segments = synthesize_alexc_turn(
            content,
            str(plan["date"]),
            SEED_BASE + seed_cursor,
        )
        seed_cursor += segment_count
        all_alex_segments.extend(segments)
    else:
        raise RuntimeError(f"Hablante inesperado: {speaker}")

    if turn_index:
        parts.append(
            question_turn_pause if previous_was_question else normal_turn_pause
        )
    parts.append(samples)
    previous_was_question = is_question(content)

joined_alex = " ".join(all_alex_segments).lower()
missing_targets = [word for word in TARGET_WORDS if word not in joined_alex]
if missing_targets:
    raise RuntimeError(
        f"Faltan palabras patrón obligatorias: {missing_targets}"
    )

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
audio = np.concatenate(parts)
write_mp3(OUTPUT_FILE, audio)
duration, size_bytes = probe_mp3(OUTPUT_FILE)

manifest = {
    "schemaVersion": 1,
    "experiment": "alexc-semantic-prosody-v1",
    "scope": "LAB_ONLY",
    "productionTouched": False,
    "sourceId": source_id,
    "scriptHash": script_hash,
    "audioPath": "/lab/audio/alexc-semantic-prosody-v1/international-semantic-v1.mp3",
    "durationSeconds": duration,
    "bytes": size_bytes,
    "voiceProfile": str(audio_alexc.VOICE_PROFILE_VERSION),
    "checkpoint": str(audio_alexc.CHATTERBOX_ENGINE),
    "strategy": "correct-orthography-semantic-prosody-segmentation",
    "cfgWeight": cfg,
    "temperature": temperature,
    "seedBase": SEED_BASE,
    "clausePauseSeconds": CLAUSE_PAUSE_SECONDS,
    "sentencePauseSeconds": SENTENCE_PAUSE_SECONDS,
    "turnPauseSeconds": TURN_PAUSE_SECONDS,
    "questionTurnPauseSeconds": QUESTION_TURN_PAUSE_SECONDS,
    "segmentation": {
        "mode": "manual-semantic-breakpoints",
        "maxWords": None,
        "maxChars": None,
        "alexSegments": all_alex_segments,
    },
    "listeningTargets": list(TARGET_WORDS),
}

MANIFEST_FILE.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(
    "LAB Alex C semántico listo: "
    f"{len(all_alex_segments)} segmentos, {duration:.1f}s, {size_bytes} bytes."
)
