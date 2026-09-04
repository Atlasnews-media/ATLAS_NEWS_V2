# ATLAS NEWS — Social Renderer post-publicación

Capacidad operativa **staged** para generar piezas sociales después de que una edición ya esté publicada.

## Contrato operacional

- Entrada: una lectura existente bajo `src/content/readings/` con `status: published`, `demo: false` y fecha de publicación no futura.
- Precondición adicional: la ejecución debe declarar explícitamente que la publicación ya fue confirmada (`SOCIAL_PUBLICATION_CONFIRMED=true`).
- Salida: una tarjeta social 1200×630, cinco láminas 1080×1350 y `benchmark.json`.
- No publica en Instagram ni en ningún otro canal.
- No llama a Morning Package, Publisher, Audio V2 ni a workflows productivos.
- Si este renderer falla, sólo falla este workflow; Atlas News ya debe estar publicado y no existe dependencia de retorno hacia la edición diaria.

## Arquitectura

HTML/CSS controlado → Playwright/Chromium → PNG. `astro-og-canvas` materializa la tarjeta OG final usando el fondo ya compuesto. El carrusel se genera con implementación mínima propia; `open-carrusel` no forma parte del stack.

## Activación actual

El workflow `social-renderer-post-publish.yml` queda preparado para ejecución manual sobre contenido confirmado. Mientras esta rama esté en revisión, mantiene además un trigger de `push` **exclusivo** de `integration/social-renderer-post-publish` para la ejecución controlada; ese trigger no coincide con `main` y no activa operación diaria.

La automatización regular post-publicación queda fuera de este cambio hasta certificación de Integridad Operacional y cierre de Dirección.

## Rollback

La reversión es independiente del producto: deshabilitar/eliminar `.github/workflows/social-renderer-post-publish.yml` y retirar `tools/social-renderer/`. Ningún workflow productivo depende de estos archivos, por lo que el rollback no requiere tocar la publicación diaria.
