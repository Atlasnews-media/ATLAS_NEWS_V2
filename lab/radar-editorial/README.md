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
