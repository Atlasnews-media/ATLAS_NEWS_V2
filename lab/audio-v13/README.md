# Audio Portada V13 — LAB · Iteración 1

Estado: **LAB / NO PRODUCCIÓN**

Objetivo: validar dos ajustes de locución antes de tocar la ruta productiva de Audio V2.

## 1. Sello temporal de generación

La apertura propuesta incorpora la hora real en que se construye el audio, usando `America/Santiago`.

Ejemplo de prueba:

> ATLAS NEWS. Briefing de la mañana del miércoles 16 de septiembre de 2026. Son las siete veinticinco de la mañana. Estas son las señales que conviene tener presentes hoy.

Reglas:

- La hora corresponde a la **generación del MP3**, no a la hora de escucha.
- Una recuperación posterior debe hablar su hora real de generación.
- Se usa lenguaje hablado (`siete veinticinco`) y no `07:25` dentro del guion.

## 2. Dirección explícita del dólar

Se conserva el valor observado y se vuelve inequívoco el signo de la variación.

Casos de prueba:

- Positivo: `con una variación positiva de 0,42% frente a la jornada hábil anterior`.
- Negativo: `con una variación negativa de 0,42% frente a la jornada hábil anterior`.
- Plano: `sin variación relevante frente a la jornada hábil anterior`.

El umbral de plano se mantiene en `abs(changePercent) < 0.01`, consistente con la lógica actual.

## Guardrails de esta iteración

- No modifica `scripts/prepare-daily-audio.mjs`.
- No modifica workflows.
- No modifica Kokoro, voces, manifests, sourceIds, Lexicon ni Speech Normalizer.
- No altera Internacional, Nacional ni Mercados.
- No publica ni regenera ningún MP3.

## Ejecución local del LAB

```bash
node lab/audio-v13/cover-v13-lab.mjs
```

El script contiene verificaciones deterministas para:

1. 07:25 Chile → `Son las siete veinticinco de la mañana.`
2. 09:00 Chile → `Son las nueve de la mañana.`
3. dólar positivo.
4. dólar negativo.
5. dólar prácticamente plano.

La siguiente iteración sólo debe comenzar después de aprobación de la redacción hablada de este LAB.
