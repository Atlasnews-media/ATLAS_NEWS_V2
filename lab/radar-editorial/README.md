# RADAR EDITORIAL — perímetro LAB

Infraestructura experimental aislada. No contiene búsqueda, selección ni generación editorial.

## Contrato de runtime

- Rama exclusiva: `radar-runtime/editorial`.
- Único scope escribible por el runtime: `lab/radar-editorial/**`.
- `data/editorial_state.json` es sólo lectura; el bootstrap experimental vive en `state/radar-state.json`.
- El artefacto publicable del gate arquitectónico es `runtime/latest.json` y se publica como `/lab/radar-editorial/latest.json`.
- `sourceMainCommit` identifica el `main` usado como referencia y nunca debe renombrarse a `sourceCommit`.
- `productionWritesAllowed` debe ser `false`.
- No existe sincronización inversa hacia producción.

## Secuencia

`runtime write → scope guard → contract validation → RADAR publisher → remote identity verification`.

El publicador RADAR no usa `status.json`, no escribe fuera de `/lab/radar-editorial/` y concilia escritores laterales mediante `pull --rebase` + `push`, con máximo tres intentos y sin force-push.

## Superficie editorial pública

La superficie web es una proyección de artefactos READY ya validados. No participa en búsqueda, selección, redacción ni definición de READY.

El mismo publicador RADAR mantiene:

- `/lab/radar-editorial/`: Portada LAB de la corrida READY vigente.
- `/lab/radar-editorial/internacional/`: alias visible de `general`.
- `/lab/radar-editorial/nacional/`: sección Nacional vigente.
- `/lab/radar-editorial/mercados/`: sección Mercados vigente.
- `/lab/radar-editorial/archivo/`: índice editorial de corridas READY.
- `/lab/radar-editorial/archivo/<radarRunId>/<seccion>/`: lectura histórica estable.
- `/lab/radar-editorial/trazabilidad/<radarRunId>/`: evidencia técnica secundaria.
- `/lab/radar-editorial/runs/<radarRunId>/`: artefactos crudos históricos, inmutables.

`latest` puede avanzar. Las rutas históricas por `radarRunId` no se reescriben. Una corrida incompleta o no READY no entra a Portada ni al archivo editorial.

El archivo `runtime/surface-refresh.json` es únicamente una señal técnica excepcional para volver a proyectar la superficie desde el último READY ya publicado. No crea una corrida, no cambia identidad editorial y no autoriza a reescribir `runs/<radarRunId>/`.

El publicador general de `lab-site` debe conservar permanentemente la exclusión `radar-editorial/`; la superficie RADAR continúa bajo ownership exclusivo del publicador RADAR.
