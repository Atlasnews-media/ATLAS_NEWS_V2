# ATLAS NEWS — Refresco de indicadores financieros

## Contrato operativo

El workflow `market-data-refresh.yml` se ejecuta por `schedule` o
`workflow_dispatch`. Produce exclusivamente los snapshots públicos
`data/market-pulse.json` y `data/economic-indicators.json`. No construye
HTML ni modifica ediciones, audio, LAB o manifiestos de identidad editorial.

El publicador editorial `publish-site.yml` mantiene el control explícito
`validate:publication-provenance` antes de generar el sitio. La ejecución
programada financiera no debe pasar por el control de procedencia editorial.

## Procedencia, temporalidad y degradación

- Cada activo conserva proveedor, fecha efectiva, estado y variación.
- El IPSA prioriza una fuente con hora bursátil verificable.
- Las capturas sin hora de cotización no se presentan como precio vigente.
- La política `public/js/market-data-policy.mjs` es compartida por el
  validador del runner y por el navegador.
- Datos atrasados y cierres bursátiles conservan su fecha real, y un dato
  vencido deja de ser elegible.
- Los snapshots con fallos parciales preservan diagnósticos, sin falsear el
  estado general del mercado.

## Publicación y comprobación

El publicador financiero concilia el HEAD público ante colisiones, escribe
solo los dos JSON y comprueba por HTTP que las fechas de los snapshots
visibles coinciden con las recién generadas.

Portada e Índices leen `/data/market-pulse.json` periódicamente desde el
mismo origen. La UTM se consulta en `/data/economic-indicators.json`.
La página estática sigue siendo el respaldo si una consulta falla.

Las ediciones publicadas mantienen sus valores históricos y su corte
editorial; el mecanismo de actualización no reescribe cuerpos ni notas.

## Pruebas y regresión

`npm run format:check` incluye las pruebas de vigencia, cambios de
sesión, fecha futura y comportamiento de fallback. La validación técnica
del PR requiere checks verdes sobre su HEAD exacto antes del merge.
