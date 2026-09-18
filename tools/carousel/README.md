# ATLAS NEWS — Carousel V2

Módulo productivo aislado del carrusel de Instagram.

## Producto canónico

El Carrusel V2 tiene exactamente **5 láminas**:

1. Portada
2. Idea central
3. Qué cambió
4. Por qué importa
5. Cierre / Lee la nota completa

Las cinco bases oficiales viven en `assets/CARRUSEL_1.png` … `assets/CARRUSEL_5.png`.

## Componentes

- `prepare-carousel-contract.mjs`: deriva el contrato v1 desde la edición diaria publicada y verificada.
- `carousel-renderer.mjs`: render productivo de cinco láminas.
- `publish-instagram.mjs`: publisher de cinco children que consume la sesión Instagram resuelta por producción.
- `contracts/example-v1.json`: fixture de validación / LAB.

## Reglas

- Carrusel y Reel son pipelines hermanos e independientes.
- El carrusel deriva su contenido de la edición publicada; no depende de «En una mirada».
- La identidad se conserva por `sourceCommit`.
- `VERIFY_FIRST`, idempotencia, staging HTTPS, evidencia durable y recovery siguen siendo responsabilidad del workflow canónico.
- El Social Renderer histórico no es el renderer productivo del carrusel. Por compatibilidad, durante este bloque `tools/social-renderer/render.mjs` se conserva únicamente para producir la tarjeta SHARE/OG 1200×630; sus PNG de carrusel no se publican.

## Estado

**BLOQUE A — F4C conectado en rama de PR.**

La producción en `main` no cambia hasta que este PR sea revisado y mergeado.
