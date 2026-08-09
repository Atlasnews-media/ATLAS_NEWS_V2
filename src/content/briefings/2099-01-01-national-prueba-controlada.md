---
title: "Nacional: prueba controlada de profundidad Chile en el paquete matutino"
summary: "Pieza sintética destinada únicamente a validar la vertical Nacional dentro del mismo paquete editorial, sin publicar contenido real ni modificar memoria compartida."
publishedAt: "2099-01-01T06:20:00-03:00"
cutoffAt: "2099-01-01T06:10:00-03:00"
section: "national"
status: "published"
tags:
  - chile
  - prueba-controlada
sources:
  - name: "Fuente de prueba"
    url: "https://example.com/atlas-news-phase6-national"
    publishedAt: "2099-01-01T05:50:00-03:00"
highlights:
  - label: "Vertical Chile"
    text: "La pieza Nacional se valida como contenido propio sin entrar en la numeración diaria."
  - label: "Misma rama"
    text: "El archivo comparte la rama morning con General y Mercados sin escribir memoria editorial."
  - label: "Draft oculto"
    text: "Mientras permanezca en borrador no debe generar una página pública en /nacional/."
demo: false
---

## Desarrollo

Esta pieza sintética representa la vertical Nacional y existe únicamente para comprobar el contrato técnico de la nueva sección.

## Implicancias y riesgos

La prueba debe demostrar que Nacional puede coexistir con la edición general sin alterar su numeración, sin modificar la memoria editorial y sin aparecer públicamente mientras sea draft.

## Qué observar

El build debe conservar el índice /nacional/, excluir esta URL individual mientras siga en draft y mantener consistentes los conteos del manifiesto público.
