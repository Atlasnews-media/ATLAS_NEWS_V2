# ATLAS NEWS — LAB Speech Normalizer V5

Fecha: 2026-09-11
Estado: LAB / NO PRODUCTIVO
Voz: `ef_dora`
Normalizador productivo de base: V4
Adaptador oral experimental: V5

## Texto editorial intacto

> El dato de inflación de hoy decidirá si esa repricing se consolida o retrocede. Si el repricing de tasas continúa, los rendimientos largos podrían seguir bajo presión. Petróleo, inflación y tasas ya se movieron en la misma dirección; el endurecimiento cross-asset refleja un mercado que exige más prima por riesgo.

## Speech text actual — V4

> El dato de inflación de hoy decidirá si esa repricing se consolida o retrocede. Si el repricing de tasas continúa, los rendimientos largos podrían seguir bajo presión. Petróleo, inflación y tasas ya se movieron en la misma dirección; el endurecimiento cross-asset refleja un mercado que exige más prima por riesgo.

## Speech text propuesto — V5 LAB

> El dato de inflación de hoy decidirá si esa revisión de expectativas se consolida o retrocede. Si el reajuste de expectativas sobre las tasas continúa, los rendimientos largos podrían seguir bajo presión. Petróleo, inflación y tasas ya se movieron en la misma dirección; el endurecimiento entre distintas clases de activos refleja un mercado que exige más prima por riesgo.

## Transformaciones aplicadas

- `esa repricing` → `esa revisión de expectativas` (`repricing_article`)
- `el repricing de tasas` → `el reajuste de expectativas sobre las tasas` (`repricing_rates_article`)
- `cross-asset` → `entre distintas clases de activos` (`cross_asset`)

## Contrato del experimento

- No modifica `display_text`.
- No modifica `scripts/audio_speech.py`.
- No modifica Lexicon V3 ni Numeric Normalizer V4.
- Solo prueba verbalización financiera controlada antes de Kokoro.
- Ningún cambio queda autorizado para producción por esta prueba.
