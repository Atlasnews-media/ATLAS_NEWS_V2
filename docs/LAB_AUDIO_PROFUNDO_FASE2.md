# ATLAS NEWS — LAB Audio Profundo — Fase 2

Estado: **COMPONENTES CONSTRUIDOS / PRIMER RUN MEDIDO PENDIENTE**

Fecha: 2026-08-25

## Objetivo

Construir el Experimento 2 de `/lab` sin tocar Portada, Nacional o Mercados productivos y sin crear una programación nueva de GitHub Actions.

## Componentes construidos

### Inputs estáticos aprobados

- `lab/exp2/inputs/2026-08-25-national.json`
- `lab/exp2/inputs/2026-08-25-markets.json`

Ambos cumplen el contrato `lab/contracts/deep-dialogue.schema.json` y contienen las conversaciones aprobadas para la primera prueba.

Voces iniciales de LAB, no definitivas:

- Voz A: `ef_dora`
- Voz B: `em_alex`

### Preparador

`scripts/lab-prepare-deep-dialogue.mjs`

Funciones:

- localiza la fecha experimental;
- carga Nacional y Mercados;
- valida sección, fuentes, temas, speakers y alternancia A/B;
- normaliza términos para síntesis;
- comprueba el conteo de palabras;
- calcula duración estimada;
- genera un plan único de síntesis.

No instala dependencias npm adicionales y no llama a un LLM.

### Sintetizador

`scripts/lab-generate-deep-audio.py`

Funciones:

- carga Kokoro una sola vez por idioma requerido;
- sintetiza por turno con la voz correspondiente;
- inserta una pausa controlada de 0,34 s entre intervenciones;
- concatena por sección;
- genera MP3 a 96 kbps;
- registra duración, tamaño, palabras, número de turnos y tiempos reales.

Salidas:

- `/lab/audio/exp2-national.mp3`
- `/lab/audio/exp2-markets.mp3`
- `/lab/audio/exp2-benchmark.json`

### Workflow LAB

`.github/workflows/lab-deep-audio.yml`

El workflow tiene únicamente `workflow_dispatch`; no posee `schedule`, `push` ni `pull_request`.

Una ejecución realiza:

1. checkout;
2. preparación/validación de ambos guiones;
3. clon shallow del repo público;
4. restauración de caché de Kokoro;
5. medición de setup;
6. generación de Nacional y Mercados en el mismo entorno;
7. publicación de ambos MP3;
8. medición del push real;
9. finalización del benchmark.

La publicación del benchmark final requiere un segundo commit de metadatos al repo público dentro de la misma ejecución. Ese segundo push no se incluye en `totalSeconds`; el campo `benchmarkFinalizationExcluded: true` lo hace explícito.

### UI LAB

`src/pages/lab/index.astro` incorpora un nuevo Experimento 2 independiente del Experimento 1:

- reproductor Nacional;
- reproductor Mercados;
- duración real;
- tiempo TTS por sección;
- palabras;
- setup;
- carga Kokoro;
- encode;
- publicación;
- total;
- cache hit/miss.

La UI obtiene las métricas desde `/lab/audio/exp2-benchmark.json` y permanece en estado `pendiente` hasta la primera corrida.

## Datos del input inicial

- Nacional: 426 palabras; duración teórica a 125 ppm: 204 s.
- Mercados: 516 palabras; duración teórica a 125 ppm: 248 s.
- Total: 942 palabras; duración teórica conjunta: 452 s.

Estos tiempos son sólo estimaciones editoriales de duración del contenido; no son tiempos de CPU ni de GitHub Actions.

## Gate pendiente

Para cerrar Fase 2 falta exactamente una acción controlada: ejecutar manualmente `LAB — audio profundo A/B` desde la rama `lab/deep-audio-stage1`.

La corrida deberá entregar los dos MP3 y el benchmark real. No se abre PR ni se fusiona la rama antes de revisar ese resultado.

## Seguridad productiva

- `main` no fue modificado por los componentes de Fase 2.
- No se modificó `generate-daily-audio.yml` productivo.
- No se modificó el publicador de las 07:00.
- No se modificaron las páginas productivas Nacional/Mercados.
- No se agregó Podcastfy ni nuevas dependencias permanentes.
- No existe programación automática para Experimento 2.
