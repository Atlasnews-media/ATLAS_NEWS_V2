# ATLAS NEWS LAB — contrato BASELINE editorial

El BASELINE reproduce de forma observable la secuencia editorial **General → Nacional → Mercados** dentro del perímetro RADAR aprobado. No introduce memoria RADAR como intervención, JEV, Corpus, Skill 003, Audio ni Social.

## Identidad de una corrida

Cada productor externo debe resolver `main` al inicio de la ejecución y congelar ese SHA como `sourceMainCommit`. Si `main` avanza después, la corrida conserva el SHA inicial.

Campos invariantes:

- `radarRunId`: identidad única e inmutable de la corrida.
- `sourceMainCommit`: SHA de `main` leído al inicio, sólo como referencia.
- `radarStateVersion`: versión del estado experimental disponible, no una autorización para usarlo como condicionante.
- `editorialDate`: fecha editorial.
- `mode: LAB_ONLY`.
- `experimentMode: BASELINE`.
- `productionWritesAllowed: false`.

Un mismo `radarRunId` no puede representar dos contenidos distintos.

## Estructura durable

```text
lab/radar-editorial/runtime/
  active.json
  latest.json
  runs/<radarRunId>/
    run.json
    search-log.json
    candidates.json
    checkpoints/
      general.json
      national.json
      markets.json
    general/
      input.json
      output.md
      metadata.json
    national/
      input.json
      output.md
      metadata.json
    markets/
      input.json
      output.md
      metadata.json
    result.json
    publish-request.json
    index.html
```

## Secuencia del productor externo

1. Resolver el HEAD vigente de `main` y congelarlo como `sourceMainCommit`.
2. Leer desde ese SHA, en modo read-only, `AGENTS.md`, `docs/PROCEDIMIENTO_GPT_PUBLICACION.md`, `docs/CONTRATO_EDITORIAL.md`, la plantilla pertinente y `data/editorial_state.json`.
3. Investigar General y registrar búsqueda/candidatos reales. No inventar descartes ni consultas.
4. Escribir General LAB + checkpoint PASS + `active.json=GENERAL_PASS`; commit y push.
5. Investigar Nacional usando sólo el marco permitido y la evidencia realmente obtenida; escribir checkpoint + `active.json=NATIONAL_PASS`; commit y push.
6. Investigar Mercados; escribir checkpoint + `active.json=MARKETS_PASS`; commit y push.
7. Construir `result.json`; sólo si las tres fases y validadores pasan, crear `publish-request.json`, `index.html`, actualizar `active.json=READY` y `runtime/latest.json`; commit y push.
8. El runtime gate valida. El publicador es no-op en checkpoints y sólo publica cuando el commit modifica `runtime/latest.json`.

## Fail-closed

Si falla Nacional, General queda durable y no existe READY. Si falla Mercados, General + Nacional quedan durables y no existe READY. Un FAIL nunca borra evidencia anterior.

## Publicación

El publicador aprobado conserva los artefactos crudos de cada corrida en:

`/lab/radar-editorial/runs/<radarRunId>/`

y mantiene la superficie editorial dentro del mismo ownership RADAR:

- `/lab/radar-editorial/latest.json`: identidad READY vigente.
- `/lab/radar-editorial/index.html`: Portada LAB vigente.
- `/lab/radar-editorial/internacional/`: General visible como Internacional.
- `/lab/radar-editorial/nacional/`: Nacional vigente.
- `/lab/radar-editorial/mercados/`: Mercados vigente.
- `/lab/radar-editorial/archivo/index.html`: archivo editorial de corridas READY.
- `/lab/radar-editorial/archivo/<radarRunId>/<seccion>/`: pieza histórica estable.
- `/lab/radar-editorial/trazabilidad/<radarRunId>/`: evidencia técnica secundaria.
- `/lab/radar-editorial/runs/<radarRunId>/**`: fuente histórica cruda e inmutable.

La publicación cruda es idempotente: si el mismo `radarRunId` ya existe con bytes distintos, el workflow falla. Las páginas históricas de `archivo/<radarRunId>/` y `trazabilidad/<radarRunId>/` son append-only: una corrida nueva puede actualizar Portada, secciones vigentes e índice de archivo, pero no reescribe una corrida histórica existente.

La superficie se construye exclusivamente desde artefactos READY reales. Una corrida incompleta queda fuera de Portada y archivo. La representación visible no altera `output.md`, no inventa metadata ni incorpora imágenes ausentes.

La exclusión `radar-editorial/` del publicador general `lab-site` forma parte de esta frontera y no puede eliminarse.

## Futuro productor de las 09:00

La futura tarea externa será **una sola** ejecución secuencial General → Nacional → Mercados. GitHub no contiene cron editorial para este baseline. El schedule no se activa hasta aprobar un E2E manual real.
