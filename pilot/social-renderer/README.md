# ATLAS NEWS — Social Renderer pilot

Isolated proof-of-concept. It reads the real published reading `src/content/readings/2026-09-04-reading-activo-seguro-riesgo.md`, renders one 1200×630 social card and five 1080×1350 Instagram slides, and writes them only to `pilot/social-renderer/output/`.

Guardrails: no production workflow is called; no publish step exists; no main-branch write exists; no AI graphics dependency exists. The Atlas figure is a compact vector silhouette extracted from the approved prototype solely for the isolated renderer.

Architecture: Playwright/Chromium renders the controlled HTML/CSS composition; `astro-og-canvas` materializes the final OG card; Playwright renders the five carousel PNGs.
