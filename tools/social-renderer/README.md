# ATLAS NEWS — Social Renderer post-publicación

Capacidad operativa **staged** para generar piezas sociales sólo después de que Atlas News ya esté publicado.

## Contrato operacional v1

- Entrada: un Social Content Contract v1 aprobado en JSON.
- Campos dinámicos admitidos: `version`, `sourceCommit`/`sourceId`, `canonicalUrl`, `publishedDate`, `productType`, `sectionLabel`, `title`, `dek`, `ideaCentral`, `ideaSupport`, `keyPoints[3]` e `impactItems[3]`.
- El renderer no lee el artículo para resumirlo, no interpreta contenido y no inventa copy.
- Si falta un campo obligatorio, la ejecución falla cerrada antes de generar las piezas.
- La activación requiere la confirmación textual exacta `PUBLICACIÓN DISPONIBLE / VERIFICADA`.
- Un push o commit no constituye señal de ejecución válida.
- Salida: una tarjeta social 1200×630, cinco láminas 1080×1350 y `benchmark.json`.
- No publica en Instagram ni en ningún otro canal.
- No llama a Morning Package, Publisher, Audio V2 ni a workflows productivos.

## Arquitectura

Social Content Contract v1 aprobado → HTML/CSS Atlas controlado → Playwright/Chromium → PNG. `astro-og-canvas` materializa la tarjeta OG final usando el fondo ya compuesto. El carrusel usa implementación mínima propia; `open-carrusel` no forma parte del stack.

La plantilla contiene únicamente marca, CTA, colores, posiciones y un set SVG determinista/versionado. El texto específico de cada nota vive en el contrato, no en el renderer.

## Activación actual

`.github/workflows/social-renderer-post-publish.yml` es **manual-only** mediante `workflow_dispatch`. Exige ruta a un contrato aprobado y confirmación explícita de publicación verificada. No existe trigger `push` y no hay operación recurrente habilitada.

La automatización regular post-publicación queda fuera de este cambio hasta certificación de Integridad Operacional y cierre de Dirección.

## Rollback

Mientras no exista merge, basta con no integrar esta rama. Si posteriormente se incorporara, el rollback sigue desacoplado: deshabilitar/eliminar `.github/workflows/social-renderer-post-publish.yml` y retirar `tools/social-renderer/`. Ningún workflow productivo depende de estos archivos, por lo que la reversión no requiere tocar la publicación diaria.
