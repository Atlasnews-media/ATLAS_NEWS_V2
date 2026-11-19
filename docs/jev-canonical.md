# ATLAS NEWS — JEV canónico

JEV es una capacidad de juicio semántico neutral. No selecciona noticias, no publica y no escribe contenido editorial.

## Arquitectura

```
productor / retrieval
        ↓
request neutral
        ↓
scripts/jev/jev-core.mjs
        ↓
scripts/jev/typesafe-jev-client.mjs
        ↓
TypeSafe · jev-latest
        ↓
JEV_TYPESAFE judgments
        ↓
consumidor
```

Consumidores:
- Producción: `scripts/jev/adapters/production-adapter.mjs`.
- RADAR LAB: `scripts/jev/adapters/lab-radar-adapter.mjs`.

El core no conoce `LAB_ONLY`, `radarRunId`, ramas RADAR, runtime LAB ni políticas de escritura. Esas propiedades pertenecen al adapter LAB.

## Request neutral v1

Campos mínimos:
- `schemaVersion: 1`
- `requestId`
- `consumer`
- `sourceCommit`
- `editorialDate`
- `candidates[]`
  - `candidateKey`
  - `section` opcional
  - `title`
  - `description`
  - `sourceName` / `publishedAt` opcionales
  - `historicalPriors[]`

## Resultado

El core conserva:
- `requestId`, `sourceCommit`, `editorialDate`, `consumer`
- `engine: JEV_TYPESAFE`
- `modelRequested: jev-latest`
- `modelObserved`
- `thresholdsApplied: false`
- `judgments[]` con `candidateKey`
- `telemetry[]`
- `generatedAt`
- `status`

La superficie reusable `.github/workflows/jev-engine.yml` ejecuta el core con código fijado a la revisión del workflow, trata `request_ref` sólo como datos y persiste el resultado como artifact de Actions. Tiene permisos `contents: read`.

## Semántica preservada

`event_relation`: SAME_EVENT · NEW_EVENT · UNRELATED · UNCERTAIN.

`information_relation`: NEW · CONTINUATION · MEANINGFUL_UPDATE · REPETITION · CONTRADICTION · UNCERTAIN.

También: `adds_new_information`, `historical_context_needed`, `angle_repeated`.

No hay score agregado, ranking, threshold editorial ni selección automática.

## Aislamiento

El core no escribe General, Nacional, Mercados, Señales, `editorial_state.json`, `status.json`, Audio ni RRSS. La persistencia LAB continúa siendo responsabilidad del resolver/adaptador RADAR.

Los paths históricos bajo `scripts/lab/radar-editorial/` que se conservan son únicamente wrappers de compatibilidad; no contienen implementación TypeSafe/JEV.
