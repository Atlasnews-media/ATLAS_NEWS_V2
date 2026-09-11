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


def _record(changes: list[dict], rule: str, source: str, target: str) -> str:
    changes.append({"rule": rule, "source": source, "target": target})
    return target


def adapt_financial_terms_lab(text: str):
    """LAB-only spoken-form adapter. Never mutates editorial/display text."""
    normalized = str(text)
    changes = []

    def replace_article_repricing(match: re.Match) -> str:
        article = match.group("article")
        context = (match.group("context") or "").lower()
        mapped = _match_case(article, _ARTICLE_MAP[article.lower()])
        if context == "tasas":
            wording = "reajuste de expectativas sobre las tasas"
            rule = "repricing_rates_article"
        elif context in {"inflacion", "inflación"}:
            wording = "reajuste de expectativas de inflación"
            rule = "repricing_inflation_article"
        elif context == "mercado":
            wording = "reajuste de precios del mercado"
            rule = "repricing_market_article"
        else:
            wording = "reajuste de expectativas"
            rule = "repricing_article"
        target = f"{mapped} {wording}"
        return _record(changes, rule, match.group(0), target)

    normalized = re.sub(
        r"\b(?P<article>la|una|esa|esta|aquella|el|un|ese|este|aquel)\s+repricing"
        r"(?:\s+de\s+(?P<context>tasas|inflaci[oó]n)|\s+del\s+(?P<context_market>mercado))?\b",
        lambda match: replace_article_repricing(
            _RepricingMatchAdapter(match)
        ),
        normalized,
        flags=re.IGNORECASE,
    )

    contextual_rules = (
        (
            "repricing_rates",
            r"\brepricing\s+de\s+tasas\b",
            "reajuste de expectativas sobre las tasas",
        ),
        (
            "repricing_inflation",
            r"\brepricing\s+de\s+inflaci[oó]n\b",
            "reajuste de expectativas de inflación",
        ),
        (
            "repricing_market",
            r"\brepricing\s+del\s+mercado\b",
            "reajuste de precios del mercado",
        ),
        (
            "repricing_bare",
            r"\brepricing\b",
            "reajuste de expectativas",
        ),
        (
            "cross_asset",
            r"\bcross[-\s]?asset\b",
            "entre distintas clases de activos",
        ),
    )

    for rule, pattern, replacement in contextual_rules:
        def replace(match: re.Match, *, rule=rule, replacement=replacement) -> str:
            target = _match_case(match.group(0), replacement)
            return _record(changes, rule, match.group(0), target)

        normalized = re.sub(pattern, replace, normalized, flags=re.IGNORECASE)

    return normalized, changes


class _RepricingMatchAdapter:
    """Expose a unified context group for the article-aware repricing rule."""

    def __init__(self, match: re.Match):
        self.match = match

    def group(self, name_or_index):
        if name_or_index == "context":
            return self.match.group("context") or self.match.group("context_market")
        return self.match.group(name_or_index)


def normalize_for_speech_lab_v5(text: str, reference_date: str | None = None):
    adapted, changes = adapt_financial_terms_lab(text)
    speech_text = normalize_for_speech(adapted, reference_date)
    return speech_text, changes
