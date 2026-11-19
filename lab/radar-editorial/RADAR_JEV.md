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

## Motor JEV durable y compatibilidad de productor

El motor JEV es una superficie durable reutilizable en GitHub Actions:

- `.github/workflows/lab-radar-editorial-jev-engine.yml` recibe la ruta y el commit exacto de un `jev-request` canónico;
- fija la versión del motor con `job.workflow_sha`, hace checkout de ese SHA como código ejecutable y hace un segundo checkout aislado del `request_ref` bajo `.request/`; el commit que transporta la request no puede elegir ni sustituir la versión del motor;
- ejecuta sin cambios `scripts/lab/radar-editorial/run-jev-memory-judge.mjs` y `typesafe-jev-client.mjs`;
- valida identidad, `engine: JEV_TYPESAFE`, `thresholdsApplied: false` y judgments no vacíos;
- persiste de forma fail-closed e idempotente `jev-request.json` y `jev-judgments.json` en `radar-runtime/editorial`.

La ejecución del motor ya no depende de que ChatGPT sea el orquestador ni de que el core conozca la rama `radar-ingress/editorial`. Un productor/retrieval durable puede invocar el workflow reusable directamente con la misma request canónica.

Mientras exista el productor externo actual, `.github/workflows/lab-radar-jev-resolver.yml` permanece como adaptador de compatibilidad: detecta un único `lab/radar-editorial/jev-requests/<radarRunId>.json` agregado en `radar-ingress/editorial` y delega la ejecución al motor durable. El adaptador no contiene lógica JEV.

`radar-ingress/editorial` es una rama divergida y no se supone que un merge a `main` la actualice. `.github/workflows/lab-radar-jev-adapter-sync.yml` sincroniza exclusivamente el archivo del adaptador después de un cambio canónico del motor en `main`, preserva y compara SHA-256 de todos los requests antes/después, conserva la historia de la rama mediante commit normal + rebase acotado y fija la llamada del adapter al SHA exacto de `main` que contiene el motor. No copia ni reescribe requests.

El paquete editorial final continúa en `lab/radar-editorial/requests/<radarRunId>.json` después de la selección editorial. El ingest exige que `artifacts["jev-judgments.json"]` coincida byte a byte con el juicio persistido para el mismo `radarRunId`, por lo que el consumidor no puede fabricar ni modificar evidencia JEV.

ChatGPT no escribe en `radar-runtime/editorial`. El motor JEV durable y el ingest siguen siendo los únicos escritores de runtime en sus respectivas fases.
