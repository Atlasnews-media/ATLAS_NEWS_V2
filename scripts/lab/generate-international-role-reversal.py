import gc
import hashlib
import json
import os
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

from audio_alexc import CHATTERBOX_ENGINE, PROFILE, VOICE_PROFILE_VERSION, synthesize_alexc
from audio_speech import normalize_for_speech

SAMPLE_RATE = 24_000
PUBLIC_DIR = Path(os.environ["ATLAS_PUBLIC_REPO_DIR"])
OUTPUT_DIR = PUBLIC_DIR / "lab" / "audio" / "international-role-reversal-v1"
SOURCE_ID = "2026-09-18-daily-bancos-centrales-endurecen-el-mapa-global"
SOURCE_COMMIT = "78e2f96838bd2a5956619913feb6a5d480eb4c1c"
REFERENCE_DATE = "2026-09-18"
STATEMENT_PAUSE = float(PROFILE.get("dialogue", {}).get("statementPauseSeconds", 0.34))
QUESTION_PAUSE = float(PROFILE.get("dialogue", {}).get("questionPauseSeconds", 0.40))

TURNS = [
    (
        "ALEX C",
        "ATLAS NEWS. Análisis internacional del viernes 18 de septiembre de 2026. "
        "El mapa monetario global se endurece mientras el shock energético pierde "
        "intensidad inmediata, pero no desaparece. Japón acaba de elevar su tasa al "
        "nivel más alto en treinta y un años, la Reserva Federal ya inició un nuevo "
        "ciclo de alzas y el Banco de Inglaterra mantiene una postura restrictiva. "
        "Al mismo tiempo, el petróleo retrocede, aunque Hormuz sigue lejos de normalizarse.",
    ),
    ("DORA", "¿Qué cambió hoy en el mapa de tasas?"),
    (
        "ALEX C",
        "El Banco de Japón elevó su tasa de referencia de 1,0% a 1,25%. "
        "La Reserva Federal subió esta semana su rango objetivo en veinticinco puntos "
        "base, a 3,75%-4,00%, y mantiene el foco en una inflación todavía elevada. "
        "En Reino Unido, el Banco de Inglaterra dejó Bank Rate en 3,75%, pero tres de "
        "sus nueve miembros prefirieron elevarla a 4%. La señal común es que varias "
        "economías relevantes están enfrentando presiones de precios con condiciones "
        "monetarias más restrictivas.",
    ),
    (
        "DORA",
        "¿Y por qué importa que el petróleo baje si Hormuz sigue tensionado?",
    ),
    (
        "ALEX C",
        "Porque la caída del crudo entrega alivio inmediato, pero todavía no equivale "
        "a una normalización del riesgo energético. El Brent retrocedió hacia ciento "
        "tres dólares por barril, apoyado por una mejor capacidad saudí para sostener "
        "exportaciones. Sin embargo, el tráfico por el estrecho de Hormuz continúa muy "
        "por debajo de su ritmo habitual. Arabia Saudita está usando rutas alternativas "
        "y transferencias frente a Omán para sostener envíos, lo que reduce parte de la "
        "presión, pero mantiene costos logísticos y un cuello de botella estratégico.",
    ),
    ("DORA", "Entonces, ¿qué debería mirar el mercado desde ahora?"),
    (
        "ALEX C",
        "Dos cosas. Primero, si el descenso del petróleo se sostiene junto con una "
        "recuperación efectiva del tráfico por Hormuz. Segundo, la reacción de los "
        "bancos centrales si el shock energético empieza a trasladarse a salarios y "
        "precios. Una normalización logística duradera aliviaría parte de la presión "
        "inflacionaria. Nuevas interrupciones devolverían rápidamente el foco al riesgo "
        "de oferta y a la posibilidad de mantener tasas restrictivas por más tiempo. "
        "La señal a vigilar es si los próximos datos confirman este endurecimiento o "
        "devuelven al mercado hacia un escenario menos restrictivo.",
    ),
]


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


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
pipeline = KPipeline(lang_code="e")
parts = []
alex_seed = 8100

for index, (speaker, text) in enumerate(TURNS):
    if speaker == "ALEX C":
        samples = synthesize_alexc(
            text,
            PUBLIC_DIR,
            REFERENCE_DATE,
            seed_base=alex_seed,
            long_form=False,
        )
        alex_seed += 1
    else:
        samples = synthesize_dora(text, pipeline)

    if index:
        previous_speaker = TURNS[index - 1][0]
        pause_seconds = QUESTION_PAUSE if previous_speaker == "DORA" else STATEMENT_PAUSE
        parts.append(np.zeros(int(SAMPLE_RATE * pause_seconds), dtype=np.float32))
    parts.append(samples)

candidate = np.concatenate(parts)
output_path = OUTPUT_DIR / "b-alexc-dora-dialogue.mp3"
write_mp3(output_path, candidate)
duration, size_bytes = probe(output_path)

dialogue_text = "\n\n".join(f"{speaker}: {text}" for speaker, text in TURNS)
(OUTPUT_DIR / "dialogue.txt").write_text(dialogue_text + "\n", encoding="utf-8")

manifest = {
    "schemaVersion": 1,
    "experiment": "international-role-reversal-v1",
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "sourceId": SOURCE_ID,
    "sourceCommit": SOURCE_COMMIT,
    "productionTouched": False,
    "control": {
        "label": "A · Producción actual · Alex C solo",
        "path": "/audio/2026-09-18-international-analysis.mp3",
    },
    "candidate": {
        "label": "B · Alex C conduce · Dora pregunta",
        "path": "/lab/audio/international-role-reversal-v1/b-alexc-dora-dialogue.mp3",
        "durationSeconds": duration,
        "bytes": size_bytes,
        "voiceProfileVersion": VOICE_PROFILE_VERSION,
        "leader": "alex-c-v1",
        "interviewer": "ef_dora",
        "engine": f"{CHATTERBOX_ENGINE} + Kokoro-82M",
        "statementPauseSeconds": STATEMENT_PAUSE,
        "questionPauseSeconds": QUESTION_PAUSE,
        "dialogueSha256": hashlib.sha256(dialogue_text.encode("utf-8")).hexdigest(),
    },
}
(OUTPUT_DIR / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

pipeline = None
gc.collect()

print(
    f"LAB Internacional roles invertidos listo: {duration:.1f}s · "
    "Alex C conduce / Dora pregunta."
)
