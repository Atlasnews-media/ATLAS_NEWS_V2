import json
import re
from datetime import date as date_type, timedelta
from pathlib import Path

LEXICON_PATH = Path(__file__).resolve().parent.parent / "config" / "audio" / "lexicon-v3.json"
DAY_NAMES = (
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
)


def load_lexicon(path: Path = LEXICON_PATH):
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("version") != 3:
        raise RuntimeError("Lexicon V3 inválido: version debe ser 3.")

    entries = []
    for entry in payload.get("entries", []):
        if not entry.get("approved"):
            continue
        term = str(entry.get("term") or "").strip()
        speech = str(entry.get("speech") or "").strip()
        entry_type = str(entry.get("type") or "").strip()
        if not term or not speech or entry_type not in {
            "pronunciation",
            "normalization",
            "spanish",
        }:
            raise RuntimeError(f"Entrada Lexicon V3 inválida: {entry!r}")
        forms = [term, *[str(value).strip() for value in entry.get("variants", [])]]
        for form in forms:
            if form:
                entries.append((form, speech, entry_type))

    return sorted(entries, key=lambda item: len(item[0]), reverse=True)


LEXICON_ENTRIES = load_lexicon()


def _replace_literal(text: str, source: str, target: str) -> str:
    pattern = rf"(?<!\w){re.escape(source)}(?!\w)"
    return re.sub(pattern, lambda _: target, text, flags=re.IGNORECASE)


def normalize_lexicon(text: str) -> str:
    normalized = str(text)
    for source, speech, _entry_type in LEXICON_ENTRIES:
        normalized = _replace_literal(normalized, source, speech)
    return normalized


def normalize_public_section_names(text: str) -> str:
    normalized = str(text)
    replacements = (
        (r"\bla edición\s+General\b", "la Portada"),
        (r"\ben la\s+General\b", "en la Portada"),
        (r"\bde la\s+General\b", "de la Portada"),
        (r"\bla\s+General\b", "la Portada"),
    )
    for pattern, replacement in replacements:
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)
    return normalized


def _relative_replacement(match: re.Match, replacement: str) -> str:
    original = match.group(0)
    if original and original[0].isupper():
        return replacement[0].upper() + replacement[1:]
    return replacement


def normalize_relative_days(text: str, reference_date: str | None) -> str:
    if not reference_date:
        return str(text)
    try:
        current = date_type.fromisoformat(reference_date)
    except ValueError:
        return str(text)

    previous_day = DAY_NAMES[(current - timedelta(days=1)).weekday()]
    next_day = DAY_NAMES[(current + timedelta(days=1)).weekday()]
    normalized = str(text)
    guard = r"(?!\s+(?:pasado|pasada|anterior|próximo|próxima|siguiente|\d{1,2}\b))"

    patterns = (
        (rf"\bpara el {re.escape(next_day)}\b{guard}", f"para mañana {next_day}"),
        (rf"\bdel {re.escape(next_day)}\b{guard}", f"de mañana {next_day}"),
        (rf"\bel {re.escape(next_day)}\b{guard}", f"mañana {next_day}"),
        (rf"\bpara el {re.escape(previous_day)}\b{guard}", f"para ayer {previous_day}"),
        (rf"\bdel {re.escape(previous_day)}\b{guard}", f"de ayer {previous_day}"),
        (rf"\bel {re.escape(previous_day)}\b{guard}", f"ayer {previous_day}"),
    )

    for pattern, replacement in patterns:
        normalized = re.sub(
            pattern,
            lambda match, value=replacement: _relative_replacement(match, value),
            normalized,
            flags=re.IGNORECASE,
        )
    return normalized


def normalize_numbers_and_symbols(text: str) -> str:
    normalized = str(text)
    normalized = re.sub(r"US\$", "dólares ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(
        r"\$\s*([0-9]+(?:\.[0-9]{3})*(?:,[0-9]+)?)",
        r"\1 pesos",
        normalized,
    )
    normalized = re.sub(
        r"\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b",
        lambda match: match.group(0).replace(".", ""),
        normalized,
    )
    normalized = re.sub(r"(\d+),(\d)0%", r"\1,\2%", normalized)
    normalized = re.sub(r"(\d+),00%", r"\1%", normalized)
    normalized = re.sub(r"(\d[\d.,]*)%", r"\1 por ciento", normalized)
    return normalized


def normalize_for_speech(text: str, reference_date: str | None = None) -> str:
    normalized = str(text)
    normalized = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", normalized)
    normalized = re.sub(r"\*\*([^*]+)\*\*", r"\1", normalized)
    normalized = re.sub(r"[`_*#>]", "", normalized)
    normalized = normalize_public_section_names(normalized)
    normalized = normalize_relative_days(normalized, reference_date)
    normalized = normalize_lexicon(normalized)
    normalized = normalize_numbers_and_symbols(normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def is_question(text: str) -> bool:
    stripped = str(text).strip()
    return stripped.startswith("¿") or stripped.endswith("?")
