# ATLAS NEWS — Carousel V2

Módulo aislado del carrusel de Instagram.

## Objetivo

Separar completamente la implementación del carrusel respecto de Reel Maker y del renderer social histórico.

## Arquitectura de esta iteración

- `assets/CARRUSEL_1.png` … `assets/CARRUSEL_5.png`: cinco bases oficiales del carrusel V2.
- `carousel-renderer.mjs`: renderer de cinco láminas basado en esas bases.
- `publish-instagram.mjs`: publisher específico de carrusel de cinco imágenes.
- `package.json`: runtime propio del módulo.

## Regla de aislamiento

Carrusel y Reel comparten únicamente la fuente editorial. No comparten plantillas, renderer, outputs ni publisher.

El Reel permanece en `tools/reel_maker/`.

## Estado de migración

ITERACIÓN 1: módulo creado y aislado, sin conectar todavía el workflow productivo.

El workflow `.github/workflows/instagram-carousel-publish-automatic.yml` continúa sin cambios en esta iteración. Por lo tanto, este PR no debe publicar en Instagram ni alterar la producción actual.

La conexión del workflow, la preparación del contrato definitivo y la prueba E2E en seco corresponden a la siguiente iteración.
