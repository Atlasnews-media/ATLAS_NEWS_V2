from audio_speech import is_question, normalize_for_speech


def check(source: str, expected: str, reference_date: str | None = None):
    actual = normalize_for_speech(source, reference_date)
    if actual != expected:
        raise AssertionError(f"{source!r} -> {actual!r}; esperado {expected!r}")


check("Powell habló en Wall Street.", "Páuel habló en Uól Strít.")
check("JPMorgan publicó su visión.", "Yéi pí Morgan publicó su visión.")
check("J.P. Morgan publicó su visión.", "Yéi pí Morgan publicó su visión.")
check("Los Treasuries reaccionaron.", "Los Tréchuri reaccionaron.")
check(
    "El Treasury subió y la Fed reaccionó.",
    "El bono del Tesoro estadounidense subió y la Reserva Federal reaccionó.",
)
check(
    "En la General queda el contexto completo.",
    "En la Portada queda el contexto completo.",
)
check(
    "Los ataques del sábado cambian la reapertura del lunes.",
    "Los ataques de ayer sábado cambian la reapertura de mañana lunes.",
    "2026-09-06",
)
check(
    "Para la reapertura del lunes hay una señal previa; el sábado apareció información nueva.",
    "Para la reapertura de mañana lunes hay una señal previa; ayer sábado apareció información nueva.",
    "2026-09-06",
)
check(
    "JPMorgan mira Treasuries mientras el Treasury a dos años reacciona.",
    "Yéi pí Morgan mira Tréchuri mientras el bono del Tesoro estadounidense a dos años reacciona.",
)
check(
    "El lunes pasado cambió la curva.",
    "El lunes pasado cambió la curva.",
    "2026-09-06",
)
check("US$11.120 millones", "dólares 11120 millones")
check("El IPC fue 3,20%.", "El índice de precios al consumidor fue 3,2 por ciento.")

if not is_question("¿Qué significa esto?"):
    raise AssertionError("No se detectó una pregunta explícita.")
if is_question("Esto es una afirmación."):
    raise AssertionError("Se clasificó una afirmación como pregunta.")

print("Audio speech V3: golden tests OK")
