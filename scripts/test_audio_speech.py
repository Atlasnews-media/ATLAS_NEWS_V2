from audio_speech import (
    SPEECH_NORMALIZER_VERSION,
    is_question,
    normalize_for_speech,
)


def check(source: str, expected: str, reference_date: str | None = None):
    actual = normalize_for_speech(source, reference_date)
    if actual != expected:
        raise AssertionError(f"{source!r} -> {actual!r}; esperado {expected!r}")


if SPEECH_NORMALIZER_VERSION != 4:
    raise AssertionError("El normalizador numérico debe publicar versión 4.")

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

# Golden tests del bug detectado el 2026-09-08.
check("Brent cerca de US$99.", "Brent cerca de noventa y nueve dólares.")
check("Brent llegó a USD $99.", "Brent llegó a noventa y nueve dólares.")
check(
    "El Brent ya había alcanzado US$97,5.",
    "El Brent ya había alcanzado noventa y siete coma cinco dólares.",
)
check(
    "El cobre superó US$14.500 por tonelada.",
    "El cobre superó catorce mil quinientos dólares por tonelada.",
)
check(
    "Los fondos retiraron US$11.120 millones.",
    "Los fondos retiraron once mil ciento veinte millones de dólares.",
)
check(
    "El comunicado sale a las 18:00 y el dato a las 08:00.",
    "El comunicado sale a las dieciocho horas y el dato a las ocho horas.",
)
check(
    "La reunión comienza a las 18:30.",
    "La reunión comienza a las dieciocho treinta horas.",
)
check(
    "El costo laboral subió 8,7% y la actividad 1,4%.",
    "El costo laboral subió ocho coma siete por ciento y la actividad uno coma cuatro por ciento.",
)
check(
    "El índice cayó -0,25%.",
    "El índice cayó menos cero coma veinticinco por ciento.",
)
check(
    "El costo medio llegó a 8.743 pesos.",
    "El costo medio llegó a ocho mil setecientos cuarenta y tres pesos.",
)
check(
    "El dólar observado quedó en $913,86.",
    "El dólar observado quedó en novecientos trece coma ochenta y seis pesos.",
)
check(
    "El IPC fue 3,20%.",
    "El índice de precios al consumidor fue tres coma dos por ciento.",
)

if not is_question("¿Qué significa esto?"):
    raise AssertionError("No se detectó una pregunta explícita.")
if is_question("Esto es una afirmación."):
    raise AssertionError("Se clasificó una afirmación como pregunta.")

print("Audio speech V4: golden tests OK")
