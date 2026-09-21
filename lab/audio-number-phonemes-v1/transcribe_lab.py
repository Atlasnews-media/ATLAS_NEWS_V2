import json
from pathlib import Path

from faster_whisper import WhisperModel

OUT = Path(__file__).resolve().parent / "out"


def main() -> None:
    model = WhisperModel("small", device="cpu", compute_type="int8")
    rows = []
    for audio_path in sorted(OUT.glob("*.mp3")):
        segments, info = model.transcribe(
            str(audio_path),
            language="es",
            beam_size=5,
            vad_filter=False,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        rows.append(
            {
                "audio": audio_path.name,
                "language": info.language,
                "languageProbability": round(float(info.language_probability), 4),
                "transcript": text,
            }
        )
    payload = {"model": "faster-whisper-small", "items": rows}
    target = OUT / "asr.json"
    target.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(target.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
