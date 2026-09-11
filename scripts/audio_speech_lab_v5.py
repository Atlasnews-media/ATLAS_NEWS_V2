import re

from audio_speech import normalize_for_speech

LAB_SPOKEN_FORM_VERSION = 5

_ARTICLE_MAP = {
    "la": "el",
    "una": "un",
    "esa": "ese",
    "esta": "este",
    "aquella": "aquel",
    "el": "el",
    "un": "un",
    "ese": "ese",
    "este": "este",
    "aquel": "aquel",
}


def _match_case(source: str, replacement: str) -> str:
    if source and source[0].isupper():
        return replacement[0].upper() + replacement[1:]
    return replacement


def adapt_financial_terms_lab(text: str):
    """LAB-only spoken-form adapter. Never mutates editorial/display text."""
    normalized = str(text)
    changes = []

    def replace_article_repricing(match: re.Match) -> str:
        article = match.group("article")
        mapped = _ARTICLE_MAP[article.lower()]
        mapped = _match_case(article, mapped)
        replacement = f"{mapped} reajuste de expectativas"
        changes.append(
            {
                "rule": "repricing_article",
                "source": match.group(0),
                "target": replacement,
            }
        )
        return replacement

    normalized = re.sub(
        r"\b(?P<article>la|una|esa|esta|aquella|el|un|ese|este|aquel)\s+repricing\b",
        replace_article_repricing,
        normalized,
        flags=re.IGNORECASE,
    )

    def replace_rates(match: re.Match) -> str:
        replacement = "reajuste de expectativas sobre las tasas"
        replacement = _match_case(match.group(0), replacement)
        changes.append(
            {
                "rule": "repricing_rates",
                "source": match.group(0),
                "target": replacement,
            }
        )
        return replacement

    normalized = re.sub(
        r"\brepricing\s+de\s+tasas\b",
        replace_rates,
        normalized,
        flags=re.IGNORECASE,
    )

    def replace_inflation(match: re.Match) -> str:
        replacement = "reajuste de expectativas de inflación"
        replacement = _match_case(match.group(0), replacement)
        changes.append(
            {
                "rule": "repricing_inflation",
                "source": match.group(0),
                "target": replacement,
            }
        )
        return replacement

    normalized = re.sub(
        r"\brepricing\s+de\s+inflaci[oó]n\b",
        replace_inflation,
        normalized,
        flags=re.IGNORECASE,
    )

    def replace_market(match: re.Match) -> str:
        replacement = "reajuste de precios del mercado"
        replacement = _match_case(match.group(0), replacement)
        changes.append(
            {
                "rule": "repricing_market",
                "source": match.group(0),
                "target": replacement,
            }
        )
        return replacement

    normalized = re.sub(
        r"\brepricing\s+del\s+mercado\b",
        replace_market,
        normalized,
        flags=re.IGNORECASE,
    )

    def replace_bare_repricing(match: re.Match) -> str:
        replacement = "reajuste de expectativas"
        replacement = _match_case(match.group(0), replacement)
        changes.append(
            {
                "rule": "repricing_bare",
                "source": match.group(0),
                "target": replacement,
            }
        )
        return replacement

    normalized = re.sub(
        r"\brepricing\b",
        replace_bare_repricing,
        normalized,
        flags=re.IGNORECASE,
    )

    def replace_cross_asset(match: re.Match) -> str:
        replacement = "entre distintas clases de activos"
        replacement = _match_case(match.group(0), replacement)
        changes.append(
            {
                "rule": "cross_asset",
                "source": match.group(0),
                "target": replacement,
            }
        )
        return replacement

    normalized = re.sub(
        r"\bcross[-\s]?asset\b",
        replace_cross_asset,
        normalized,
        flags=re.IGNORECASE,
    )

    return normalized, changes


def normalize_for_speech_lab_v5(text: str, reference_date: str | None = None):
    adapted, changes = adapt_financial_terms_lab(text)
    speech_text = normalize_for_speech(adapted, reference_date)
    return speech_text, changes
