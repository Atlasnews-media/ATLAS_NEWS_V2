# ATLAS NEWS — LAB Audio Profundo — Fase 1

Estado: **DISEÑO CERRADO / SIN CAMBIOS PRODUCTIVOS**

Fecha: 2026-08-25

## 1. Objetivo

Diseñar el componente mínimo para incorporar conversaciones profundas de dos voces en las pestañas Nacional y Mercados, manteniendo intacta la Portada y su audio diario actual.

La Fase 1 no genera audio productivo, no modifica las pestañas Nacional/Mercados, no añade dependencias al runtime productivo y no abre un Pull Request. El siguiente paso será un experimento manual en `/lab`.

## 2. Principios de arquitectura

1. **Portada no cambia.** Conserva el guion y audio diario actuales.
2. **Nacional y Mercados agregan profundidad, no resumen.** Cada diálogo selecciona 1–3 asuntos que ganan valor al ser explicados, relacionados o cuestionados.
3. **Profundidad no significa tecnicismo.** Voz A conduce y contextualiza; Voz B representa curiosidad inteligente, contrapunto y aterrizaje.
4. **Kokoro sigue siendo el motor de voz.** No se sustituye.
5. **El LLM no se ejecuta dentro de GitHub Actions.** La generación editorial del guion ocurre antes del workflow sonoro.
6. **No se incorpora Podcastfy completo.** Se toma su patrón conceptual de conversación, no su aplicación ni su árbol de dependencias.
7. **Una sola ejecución sonora diaria.** Portada, Nacional y Mercados deben compartir el mismo runner y la misma preparación de Kokoro.
8. **LAB antes de producción.** El Experimento 2 será manual (`workflow_dispatch`) y medirá calidad y costo real antes de cualquier integración diaria.

## 3. Hallazgos del repositorio actual

### 3.1 Peso

GitHub reporta actualmente aproximadamente 1.436 KB para `EldeSiempre100/ATLAS_NEWS` y 351.909 KB para `souzatharsis/podcastfy`.

Conclusión: no se debe vendorizar/clonar Podcastfy dentro de ATLAS NEWS como parte permanente del repositorio. Su tamaño reportado es aproximadamente 245 veces el del repo de ATLAS NEWS y su paquete incorpora dependencias que no necesitamos para este caso.

### 3.2 Pipeline sonoro vigente

El workflow `generate-daily-audio.yml` ya realiza en un solo job:

- checkout del repo privado;
- setup de Node;
- `npm ci`;
- acceso y clonación shallow del repo público;
- planificación del guion;
- restauración de caché de Kokoro;
- instalación de `espeak-ng`, `ffmpeg`, venv y Kokoro;
- generación del audio;
- publicación del MP3 y metadatos.

El componente nuevo debe reutilizar esta preparación una sola vez y generar tres salidas dentro del mismo job en la fase productiva.

### 3.3 Costo oculto de un commit adicional a la rama morning

`publish-site.yml` se dispara en cualquier actualización de un Pull Request contra `main`. Por ello, si una tarea separada de las 06:45 escribe los guiones en la rama `editorial/AAAA-MM-DD-morning`, crea una ejecución adicional de validación/construcción.

Esto es evitable.

## 4. Decisión de integración editorial

### Durante LAB

La tarea experimental de guiones puede seguir ejecutándose de forma separada y **no escribe en GitHub**. Se usa para validar el tono y construir inputs estáticos del Experimento 2.

### En producción

La opción preferida es **integrar la creación/persistencia de los dos guiones al cierre de la tarea Mercados**, cuando General, Nacional y Mercados ya existen.

Secuencia objetivo:

```text
06:00  General
06:15  Nacional
06:30  Mercados + selección editorial + Guion Nacional + Guion Mercados
07:00  Publicador final / promoción / merge
07:30  Un único workflow sonoro → Portada + Nacional + Mercados
```

Ventaja: briefing Mercados y dos guiones viajan en la misma actualización lógica, evitando un commit diario adicional de las 06:45 y, por tanto, evitando una validación PR adicional atribuible al nuevo formato.

La automatización separada de las 06:45 se mantiene sólo durante la fase experimental. Su destino productivo se decide después del benchmark LAB.

## 5. Contrato mínimo del guion

Cada conversación se representa como JSON estructurado y validable. El esquema de Fase 1 vive en:

`lab/contracts/deep-dialogue.schema.json`

Campos esenciales:

- `schemaVersion`
- `scriptVersion`
- `date`
- `section`: `national | markets`
- `sourceIds`: IDs exactos de General/Nacional/Mercados usados
- `topicsChosen`: 1–3 temas seleccionados
- `discarded`: temas omitidos deliberadamente
- `dialogue`: secuencia ordenada de intervenciones A/B
- `wordCount`
- `estimatedDurationSeconds`

El contrato no contiene SSML, HTML ni marcas de Astro.

## 6. Rutas

### LAB

Inputs experimentales:

```text
lab/exp2/inputs/YYYY-MM-DD-national.json
lab/exp2/inputs/YYYY-MM-DD-markets.json
```

Resultados públicos experimentales:

```text
/lab/audio/exp2-national.mp3
/lab/audio/exp2-markets.mp3
/lab/audio/exp2-benchmark.json
```

### Producción — propuesta para Fase 4

Si LAB valida el diseño, los archivos canónicos viajarán con el Morning Package en:

```text
data/audio-scripts/YYYY-MM-DD-national.json
data/audio-scripts/YYYY-MM-DD-markets.json
```

Estos archivos son **insumos técnicos del audio**, no publicaciones editoriales ni una cuarta/quinta pieza del sitio. Antes de habilitarlos en producción habrá que actualizar `AGENTS.md` y el contrato operativo para reconocer explícitamente esta nueva ruta.

## 7. Componentes mínimos a construir en Fase 2

### A. Preparador LAB

`scripts/lab-prepare-deep-dialogue.mjs`

Responsabilidades:

- validar JSON contra el contrato lógico;
- verificar alternancia y presencia de A/B;
- normalizar texto para voz;
- calcular palabras y duración estimada;
- producir un plan de síntesis.

No llama a un LLM.

### B. Generador LAB

`scripts/lab-generate-deep-audio.py`

Responsabilidades:

- cargar Kokoro una vez por idioma requerido;
- asignar una voz aprobada a A y otra a B;
- sintetizar cada intervención;
- insertar pausas breves y consistentes;
- unir el audio por sección;
- codificar MP3;
- escribir métricas reales.

### C. Benchmark

`exp2-benchmark.json` debe registrar como mínimo:

```text
setup_seconds
kokoro_load_seconds
national_tts_seconds
markets_tts_seconds
encode_seconds
publish_seconds
total_seconds
kokoro_cache_hit
national_audio_seconds
markets_audio_seconds
```

También debe registrar tamaño de archivos y cantidad de palabras.

### D. UI LAB

La página `/lab` mostrará un Experimento 2 independiente del Experimento 1, con dos reproductores y las métricas de la corrida. No modifica las páginas productivas.

## 8. Voces

La Fase 1 no congela voces productivas.

Regla de diseño:

- Voz A y Voz B deben ser claramente distinguibles.
- Preferencia por una combinación de registros distintos, no por efectos teatrales.
- La selección final se hace con las voces ya probadas/aprobadas en LAB.
- `ef_dora` permanece asociada al audio actual de Portada mientras no exista una decisión explícita distinta.

## 9. Actions — presupuesto objetivo

### Fase 2 LAB

- 0 ejecuciones programadas nuevas.
- 1 ejecución manual por prueba solicitada.
- El workflow de LAB debe quedar sólo con `workflow_dispatch` durante el experimento para evitar generar audio por cambios visuales o commits de documentación.

### Producción objetivo

Incremento esperado del nuevo formato:

- **0 workflows sonoros diarios adicionales**: se amplía `generate-daily-audio.yml`.
- **0 validaciones PR adicionales** si los guiones se persisten junto con Mercados en la misma actualización lógica.
- **+1 validación PR diaria** si se mantiene una tarea 06:45 que escriba separadamente en la rama morning. Esta opción se considera subóptima.

El costo real en minutos/segundos se decidirá sólo con benchmark medido; no se fijan estimaciones de CPU antes del experimento.

## 10. Gate de Fase 2

Fase 2 puede comenzar cuando se cumplan estas condiciones:

- contrato JSON definido;
- no vendorizar Podcastfy;
- LAB manual, no programado;
- ningún cambio productivo en Nacional/Mercados;
- un solo entorno Kokoro por corrida;
- métricas de tiempo obligatorias;
- Portada intacta;
- guiones de prueba con tono aprobado: conversación natural, clara, no técnica y con selección editorial.

## 11. Resultado esperado de la Fase 2

Dos audios reproducibles en `/lab`, uno Nacional y otro Mercados, generados desde guiones A/B estáticos y con un reporte exacto de duración del audio y tiempo real de ejecución.

Sólo después se decidirá la persistencia productiva, la modificación de la tarea Mercados, la extensión del publicador de las 07:00 y la ampliación del workflow sonoro diario.
