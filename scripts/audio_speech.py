import json
import re
from datetime import date as date_type, timedelta
from pathlib import Path

LEXICON_PATH = Path(__file__).resolve().parent.parent / "config" / "audio" / "lexicon-v3.json"
LEXICON_PAYLOAD = json.loads(LEXICON_PATH.read_text(encoding="utf-8"))
LEXICON_VERSION = int(LEXICON_PAYLOAD.get("version") or 0)
LEXICON_REVISION = int(LEXICON_PAYLOAD.get("revision") or 0)
SPEECH_NORMALIZER_VERSION = 5
DAY_NAMES = (
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
)

_SMALL_NUMBERS = {
    0: "cero",
    1: "uno",
    2: "dos",
    3: "tres",
    4: "cuatro",
    5: "cinco",
    6: "seis",
    7: "siete",
    8: "ocho",
    9: "nueve",
    10: "diez",
    11: "once",
    12: "doce",
    13: "trece",
    14: "catorce",
    15: "quince",
    16: "dieciséis",
    17: "diecisiete",
    18: "dieciocho",
    19: "diecinueve",
    20: "veinte",
    21: "veintiuno",
    22: "veintidós",
    23: "veintitrés",
    24: "veinticuatro",
    25: "veinticinco",
    26: "veintiséis",
    27: "veintisiete",
    28: "veintiocho",
    29: "veintinueve",
}
_TENS = {
    30: "treinta",
    40: "cuarenta",
    50: "cincuenta",
    60: "sesenta",
    70: "setenta",
    80: "ochenta",
    90: "noventa",
}
_HUNDREDS = {
    100: "cien",
    200: "doscientos",
    300: "trescientos",
    400: "cuatrocientos",
    500: "quinientos",
    600: "seiscientos",
    700: "setecientos",
    800: "ochocientos",
    900: "novecientos",
}
_NUMBER_TOKEN = r"[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?"


def load_lexicon(payload=LEXICON_PAYLOAD):
    if int(payload.get("version") or 0) != 3:
        raise RuntimeError("Lexicon V3 inválido: version debe ser 3.")
    if int(payload.get("revision") or 0) < 1:
        raise RuntimeError("Lexicon V3 inválido: revision debe ser >= 1.")

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


def _preserve_initial_case(match: re.Match, replacement: str) -> str:
    original = match.group(0)
    if original and original[0].isupper():
        return replacement[0].upper() + replacement[1:]
    return replacement


def normalize_financial_spoken_form(text: str) -> str:
    """Adapta términos financieros al español hablado sin tocar display_text."""
    normalized = str(text)

    article_context_rules = (
        (
            r"\b(el|un|este|ese)\s+repricing\s+de\s+tasas\b",
            r"\1 reajuste de expectativas sobre las tasas",
        ),
        (
            r"\b(la|una|esta|esa)\s+repricing\s+de\s+tasas\b",
            r"\1 revisión de expectativas sobre las tasas",
        ),
        (
            r"\b(el|un|este|ese)\s+repricing\s+de\s+duraci[oó]n\b",
            r"\1 reajuste de expectativas de larga duración",
        ),
        (
            r"\b(la|una|esta|esa)\s+repricing\s+de\s+duraci[oó]n\b",
            r"\1 revisión de expectativas de larga duración",
        ),
    )
    for pattern, replacement in article_context_rules:
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)

    contextual_rules = (
        (r"\brepricing\s+de\s+tasas\b", "reajuste de expectativas sobre las tasas"),
        (
            r"\brepricing\s+de\s+duraci[oó]n\b",
            "reajuste de expectativas de larga duración",
        ),
        (r"\bcross[- ]asset\b", "entre distintas clases de activos"),
    )
    for pattern, replacement in contextual_rules:
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)

    article_rules = (
        (r"\b(el|un|este|ese)\s+repricing\b", r"\1 reajuste de expectativas"),
        (r"\b(la|una|esta|esa)\s+repricing\b", r"\1 revisión de expectativas"),
    )
    for pattern, replacement in article_rules:
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)

    return re.sub(
        r"\brepricing\b",
        "reajuste de expectativas",
        normalized,
        flags=re.IGNORECASE,
    )


def normalize_public_section_names(text: str) -> str:
    normalized = str(text)
    replacements = (
        (r"\bla edición\s+General\b", "la Portada"),
        (r"\ben la\s+General\b", "en la Portada"),
        (r"\bde la\s+General\b", "de la Portada"),
        (r"\bla\s+General\b", "la Portada"),
    )
    for pattern, replacement in replacements:
        normalized = re.sub(
            pattern,
            lambda match, value=replacement: _preserve_initial_case(match, value),
            normalized,
            flags=re.IGNORECASE,
        )
    return normalized


def _relative_replacement(match: re.Match, replacement: str) -> str:
    return _preserve_initial_case(match, replacement)


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


def _apocope_masculine(words: str) -> str:
    if words.endswith("veintiuno"):
        return words[:-9] + "veintiún"
    if words.endswith(" y uno"):
        return words[:-6] + " y un"
    if words.endswith("uno"):
        return words[:-3] + "un"
    return words


def _integer_to_words(value: int) -> str:
    if value < 0:
        return f"menos {_integer_to_words(-value)}"
    if value < 30:
        return _SMALL_NUMBERS[value]
    if value < 100:
        tens = (value // 10) * 10
        remainder = value % 10
        if remainder == 0:
            return _TENS[tens]
        return f"{_TENS[tens]} y {_SMALL_NUMBERS[remainder]}"
    if value < 1_000:
        if value in _HUNDREDS:
            return _HUNDREDS[value]
        hundreds = (value // 100) * 100
        remainder = value % 100
        prefix = "ciento" if hundreds == 100 else _HUNDREDS[hundreds]
        return f"{prefix} {_integer_to_words(remainder)}"
    if value < 1_000_000:
        thousands, remainder = divmod(value, 1_000)
        prefix = "mil" if thousands == 1 else f"{_integer_to_words(thousands)} mil"
        if remainder == 0:
            return prefix
        return f"{prefix} {_integer_to_words(remainder)}"
    if value < 1_000_000_000:
        millions, remainder = divmod(value, 1_000_000)
        prefix = (
            "un millón"
            if millions == 1
            else f"{_apocope_masculine(_integer_to_words(millions))} millones"
        )
        if remainder == 0:
            return prefix
        return f"{prefix} {_integer_to_words(remainder)}"
    if value < 1_000_000_000_000:
        billions, remainder = divmod(value, 1_000_000_000)
        prefix = (
            "mil millones"
            if billions == 1
            else f"{_apocope_masculine(_integer_to_words(billions))} mil millones"
        )
        if remainder == 0:
            return prefix
        return f"{prefix} {_integer_to_words(remainder)}"
    return str(value)


def _number_token_to_words(token: str, masculine: bool = False) -> str:
    raw = str(token).strip()
    sign = ""
    if raw.startswith("+"):
        sign = "más "
        raw = raw[1:]
    elif raw.startswith("-"):
        sign = "menos "
        raw = raw[1:]

    if "," in raw:
        integer_part, decimal_part = raw.split(",", 1)
    else:
        integer_part, decimal_part = raw, ""

    integer_value = int(integer_part.replace(".", ""))
    integer_words = _integer_to_words(integer_value)
    decimal_part = decimal_part.rstrip("0")

    if decimal_part:
        if len(decimal_part) == 1:
            decimal_words = _SMALL_NUMBERS[int(decimal_part)]
        elif decimal_part.startswith("0"):
            decimal_words = " ".join(
                _SMALL_NUMBERS[int(digit)] for digit in decimal_part
            )
        else:
            decimal_words = _integer_to_words(int(decimal_part))
        return f"{sign}{integer_words} coma {decimal_words}"

    if masculine:
        integer_words = _apocope_masculine(integer_words)
    return f"{sign}{integer_words}"


def _normalize_usd(match: re.Match) -> str:
    number = match.group("number")
    scale = (match.group("scale") or "").lower()
    spoken_number = _number_token_to_words(number, masculine=True)
    if scale:
        unit = "millón" if scale == "millón" else "millones"
        return f"{spoken_number} {unit} de dólares"
    return f"{spoken_number} dólares"


def _normalize_clock(match: re.Match) -> str:
    hour = int(match.group("hour"))
    minute = int(match.group("minute"))
    hour_words = _integer_to_words(hour)
    if minute == 0:
        return f"{hour_words} horas"
    return f"{hour_words} {_integer_to_words(minute)} horas"


def normalize_numbers_and_symbols(text: str) -> str:
    normalized = str(text)

    # Divisas estadounidenses: US$99, USD $99, US$11.120 millones.
    normalized = re.sub(
        rf"(?:\bUSD\s*\$?|\bUS\s*\$)\s*(?P<number>{_NUMBER_TOKEN})(?:\s+(?P<scale>millón|millones))?",
        _normalize_usd,
        normalized,
        flags=re.IGNORECASE,
    )

    # Horas HH:MM. Mantiene el texto editorial intacto y oraliza sólo speech_text.
    normalized = re.sub(
        r"(?<!\d)(?P<hour>[01]?\d|2[0-3]):(?P<minute>[0-5]\d)(?!\d)",
        _normalize_clock,
        normalized,
    )

    # Pesos escritos con símbolo local.
    normalized = re.sub(
        rf"\$\s*(?P<number>{_NUMBER_TOKEN})",
        lambda match: (
            f"{_number_token_to_words(match.group('number'), masculine=True)} pesos"
        ),
        normalized,
    )

    # Monedas ya expresadas en palabras dentro de guiones de diálogo.
    normalized = re.sub(
        rf"(?<!\d)(?P<number>{_NUMBER_TOKEN})\s+(?P<unit>dólares|pesos)\b",
        lambda match: (
            f"{_number_token_to_words(match.group('number'), masculine=True)} "
            f"{match.group('unit')}"
        ),
        normalized,
        flags=re.IGNORECASE,
    )

    # Rangos porcentuales observados en producción:
    # 3,75%-4,00% -> tres coma setenta y cinco a cuatro por ciento.
    # Esta regla debe correr antes del porcentaje individual para evitar
    # interpretar el guion como signo negativo.
    normalized = re.sub(
        rf"(?<!\d)(?P<start>{_NUMBER_TOKEN})\s*%\s*[-–—]\s*(?P<end>{_NUMBER_TOKEN})\s*%",
        lambda match: (
            f"{_number_token_to_words(match.group('start'))} a "
            f"{_number_token_to_words(match.group('end'))} por ciento"
        ),
        normalized,
    )

    # Porcentajes: 8,7% -> ocho coma siete por ciento.
    normalized = re.sub(
        rf"(?<!\d)(?P<number>{_NUMBER_TOKEN})\s*%",
        lambda match: f"{_number_token_to_words(match.group('number'))} por ciento",
        normalized,
    )

    # Otros números con formato español que Kokoro suele segmentar mal.
    normalized = re.sub(
        r"(?<!\d)([+-]?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+))(?!\d)",
        lambda match: _number_token_to_words(match.group(1)),
        normalized,
    )
    return normalized


def normalize_for_speech(text: str, reference_date: str | None = None) -> str:
    normalized = str(text)
    normalized = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", normalized)
    normalized = re.sub(r"\*\*([^*]+)\*\*", r"\1", normalized)
    normalized = re.sub(r"[`_*#>]", "", normalized)
    normalized = normalize_public_section_names(normalized)
    normalized = normalize_financial_spoken_form(normalized)
    normalized = normalize_relative_days(normalized, reference_date)
    normalized = normalize_lexicon(normalized)
    normalized = normalize_numbers_and_symbols(normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def normalize_for_kokoro_dora(
    text: str,
    reference_date: str | None = None,
) -> str:
    """Mantiene Speech V5 continuo para Dora/Kokoro sin tocar display_text."""
    return normalize_for_speech(text, reference_date)


def is_question(text: str) -> bool:
    stripped = str(text).strip()
    return stripped.startswith("¿") or stripped.endswith("?")
