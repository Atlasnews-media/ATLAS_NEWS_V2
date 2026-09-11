from audio_speech_lab_v5 import (
    LAB_SPOKEN_FORM_VERSION,
    adapt_financial_terms_lab,
    normalize_for_speech_lab_v5,
)


def check(source: str, expected: str):
    actual, _changes = adapt_financial_terms_lab(source)
    if actual != expected:
        raise AssertionError(f"{source!r} -> {actual!r}; esperado {expected!r}")


if LAB_SPOKEN_FORM_VERSION != 5:
    raise AssertionError("El prototipo LAB debe publicar versión 5.")

check(
    "El IPC decidirá si esa repricing se consolida.",
    "El IPC decidirá si esa revisión de expectativas se consolida.",
)
check(
    "Si el repricing de tasas continúa, la curva puede moverse.",
    "Si el reajuste de expectativas sobre las tasas continúa, la curva puede moverse.",
)
check(
    "La repricing de inflación cambió el escenario.",
    "La revisión de expectativas de inflación cambió el escenario.",
)
check(
    "La repricing del mercado fue rápida.",
    "La revisión de precios del mercado fue rápida.",
)
check(
    "El endurecimiento cross-asset se mantiene.",
    "El endurecimiento entre distintas clases de activos se mantiene.",
)

speech, changes = normalize_for_speech_lab_v5(
    "El IPC decidirá si esa repricing se consolida y el Treasury reacciona.",
    "2026-09-11",
)
expected_speech = (
    "El índice de precios al consumidor decidirá si esa revisión de expectativas "
    "se consolida y el bono del Tesoro estadounidense reacciona."
)
if speech != expected_speech:
    raise AssertionError(f"Speech V5 -> {speech!r}; esperado {expected_speech!r}")
if not changes:
    raise AssertionError("La prueba V5 no registró transformaciones.")

print("Audio speech LAB V5: golden tests OK")
