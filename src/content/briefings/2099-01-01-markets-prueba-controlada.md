---
title: "Mercados: prueba controlada de profundidad financiera en el paquete matutino"
summary: "Pieza sintética destinada exclusivamente a validar la vertical Mercados dentro del paquete editorial compartido, sin usar datos financieros reales ni desplegar producción."
publishedAt: "2099-01-01T06:30:00-03:00"
cutoffAt: "2099-01-01T06:20:00-03:00"
section: "markets"
status: "published"
tags:
  - mercados
  - prueba-controlada
sources:
  - name: "Fuente de prueba"
    url: "https://example.com/atlas-news-phase6-markets"
    publishedAt: "2099-01-01T05:55:00-03:00"
highlights:
  - label: "Vertical mercados"
    text: "La pieza Mercados se valida como contenido propio dentro del paquete editorial compartido."
  - label: "Sin memoria"
    text: "La vertical puede leer contexto editorial, pero esta prueba confirma que no necesita escribirlo."
  - label: "Ruta aislada"
    text: "Mientras sea borrador no debe existir una página pública individual bajo /mercados/."
demo: false
---

## Desarrollo

Esta pieza sintética representa la vertical Mercados y se utiliza únicamente para comprobar el funcionamiento técnico del paquete matutino.

## Implicancias y riesgos

La prueba debe confirmar que Mercados comparte rama y Pull Request con las otras piezas sin crear numeración propia ni una segunda secuencia operacional de publicación.

## Qué observar

El build debe mantener /mercados/, excluir esta URL individual mientras continúe en draft y preservar la coherencia de status.json y del auditor.
