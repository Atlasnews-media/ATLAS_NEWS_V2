# JEV — puente de evaluación productiva (fase de integración)

Este puente reutiliza el cliente TypeSafe comprobado en LAB, sin alterar el resolver LAB ni el flujo F4A.

## Solicitud
Un productor editorial versiona `data/jev/requests/<requestId>.json` en su rama de edición, con:
`schemaVersion:1`, `mode:"PRODUCTION_JEV"`, `requestId`, `editorialDate`,
`editionSlot:"morning"|"midday"`, `sourceCommit` (SHA exacto del commit con la solicitud),
`candidates:[{candidateKey,title,description,priors:[{title,publishedAt,sourcePath}]}]`.

**Identidad:** `sourceCommit` representa el commit editorial base usado para generar los candidatos, mientras `request_ref` identifica el commit exacto que contiene la solicitud. Nunca exigir que un archivo contenga el SHA de su propio commit. La correlación del resultado debe conservar ambas identidades antes de habilitar la publicación.

## Resultado
El workflow entrega un artifact `production-jev-result` con juicios TypeSafe y telemetría.
No modifica publicaciones ni decide automáticamente la selección. El productor debe consumir el resultado y registrar su decisión antes de redactar.

## Pendiente de integración E2E
1. Validar la correlación de identidades y la pertenencia del commit de solicitud a la rama editorial autorizada.
2. Automatizar el despacho desde T1/T2/Vespertina y la recuperación del artifact.
3. Incorporar gate de consumo del juicio en el flujo editorial.
4. Probar con candidatos duplicados y nuevos, y verificar titulares resultantes.

No fusionar este PR hasta completar esas verificaciones.
