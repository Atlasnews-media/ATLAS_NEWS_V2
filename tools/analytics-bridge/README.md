# ATLAS Analytics Bridge

Servicio read-only y desacoplado para consultar métricas agregadas de Umami Cloud de ATLAS NEWS.

## Objetivo

Exponer un endpoint JSON mínimo para WEB ATLAS ANALYTICS sin depender del dashboard dinámico público de Umami.

## Seguridad y gobernanza

- Solo lectura contra Umami Cloud.
- `UMAMI_API_KEY` debe existir únicamente como secreto del runtime; nunca en Git, Drive o Slack.
- Website ID permitido por configuración: `e34fdb19-91b3-41d5-82ad-a577498b31ca`.
- Zona horaria canónica: `America/Santiago`.
- No expone `distinctId`, sesiones crudas, nombres, emails ni datos personales.
- No ejecuta GitHub Actions por visita.
- No modifica la publicación de ATLAS NEWS y falla de forma aislada.

## Salida prevista

Resumen agregado con visitors, visits, views, bounce rate, duración, serie temporal, páginas, referrers, países, dispositivos, navegadores, sistemas operativos y eventos editoriales permitidos.

## Variables de entorno

- `UMAMI_API_KEY` — obligatoria y secreta.
- `ATLAS_ANALYTICS_BRIDGE_TOKEN` — recomendada; protege el endpoint del bridge.
- `UMAMI_API_BASE` — opcional; por defecto `https://api.umami.is/v1`.

## Estado

Código preparado para despliegue independiente. El secreto debe ser cargado por el owner directamente en el runtime.
