---
title: "Prueba controlada del paquete editorial matutino de ATLAS NEWS"
summary: "Contenido sintético creado exclusivamente para validar que el paquete matutino admite una edición general y dos verticales sin alterar producción."
publishedAt: "2099-01-01T06:10:00-03:00"
cutoffAt: "2099-01-01T06:00:00-03:00"
type: "daily"
status: "published"
tags:
  - prueba-controlada
sources:
  - name: "Fuente de prueba"
    url: "https://example.com/atlas-news-phase6"
featured: false
demo: false
highlights:
  - label: "Paquete único"
    text: "La prueba verifica que General, Nacional y Mercados puedan coexistir en una sola rama."
  - label: "Sin producción"
    text: "Los tres contenidos parten como borradores y no deben generar páginas públicas."
  - label: "Trazabilidad"
    text: "La validación comprueba numeración, manifiesto, rutas y comportamiento del workflow."
---

## Hecho central

ATLAS NEWS ejecuta una prueba controlada de su arquitectura de paquete matutino con contenido sintético y sin intención editorial real.

## En una mirada

La edición general comparte rama y Pull Request con una pieza Nacional y una pieza Mercados. Los tres archivos comienzan en estado draft.

## Por qué importa

El objetivo es comprobar que la arquitectura admite varios contenidos sin duplicar la numeración diaria, sin publicar borradores y sin multiplicar merges o despliegues.

## Mercados globales

No se evalúan mercados reales en esta prueba. El contenido existe únicamente para ejercitar el contrato técnico de publicación.

## Chile

No se evalúan datos reales de Chile. La sección permite comprobar que la estructura obligatoria de la edición general permanece intacta.

## Tasas, monedas y commodities

No se incorporan cotizaciones reales. La prueba evita mezclar información financiera efectiva con datos sintéticos.

## Qué observar

La validación debe mantener los borradores ocultos, conservar /ediciones/, preservar la numeración vigente y mantener coherente status.json.
