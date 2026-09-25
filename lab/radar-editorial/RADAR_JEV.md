# ATLAS NEWS LAB — contrato RADAR_JEV

Estado: experimental LAB_ONLY.

Este modo amplía el flujo ya validado General → Nacional → Mercados con tres capas observables:

1. RADAR pre-search.
2. Retrieval determinístico contra corpus/histórico.
3. Juicios semánticos JEV antes de la selección final.

No cambia la identidad de producción ni autoriza escrituras fuera de `lab/radar-editorial/**`.

## Identidad

Cada corrida usa:

- `experimentMode: RADAR_JEV`
- `mode: LAB_ONLY`
- `productionWritesAllowed: false`
- `memoryMode: RADAR_PLUS_CORPUS`
- `radarInterventionUsed: true`
- `corpusUsed: true`
- `jevUsed: true`

El `sourceMainCommit` se congela al inicio.

## Evidencia experimental obligatoria

Cada corrida RADAR_JEV debe persistir además:

- `radar-context.json`
- `corpus-retrieval.json`
- `jev-judgments.json`

Los tres artefactos comparten la identidad del run.

### radar-context.json

Debe registrar al menos una señal pre-search derivada del estado RADAR disponible. Su función es orientar cobertura; no seleccionar automáticamente una noticia.

### corpus-retrieval.json

Debe contener `candidateRetrievals` con los antecedentes realmente recuperados para los candidatos. El retrieval es determinístico y precede al juicio semántico.

### jev-judgments.json

Debe declarar:

- `engine: JEV_TYPESAFE`
- `thresholdsApplied: false`
- `judgments` no vacío

Los juicios pueden expresar continuidad, novedad, actualización material, repetición o incertidumbre, pero no inventan umbrales ni sustituyen la política editorial determinística.

## Secuencia

RADAR pre-search
→ búsqueda
→ candidatos
→ retrieval de corpus
→ JEV
→ selección editorial
→ General
→ Nacional
→ Mercados
→ READY
→ runtime gate
→ publisher LAB
→ verificación remota.

## Fail-closed

Una corrida RADAR_JEV sin los tres artefactos experimentales no pasa el runtime gate.

Una falla preserva la última publicación READY válida.

La superficie pública sigue bajo `/lab/radar-editorial/` y la trazabilidad enlaza los tres artefactos experimentales.

## Handoff de productor

Mientras el productor sea una tarea externa de ChatGPT, RADAR_JEV usa dos handoffs acotados sobre `radar-ingress/editorial`:

1. `lab/radar-editorial/jev-requests/<radarRunId>.json`: candidatos + priors recuperados antes de la selección final.
2. `lab/radar-editorial/requests/<radarRunId>.json`: paquete editorial final, después de observar los juicios JEV.

ChatGPT no escribe en `radar-runtime/editorial`. El resolver JEV y el ingest durable son los únicos escritores de runtime.

El ingest final exige que `artifacts["jev-judgments.json"]` coincida byte a byte con el juicio persistido por el resolver TypeSafe para el mismo `radarRunId`. Así, el productor no puede fabricar ni modificar la evidencia JEV.

Este doble handoff es una compatibilidad temporal del productor ChatGPT. Un productor futuro que pueda invocar TypeSafe directamente puede conservar el mismo contrato editorial sin usar GitHub como transporte intermedio del juicio.
