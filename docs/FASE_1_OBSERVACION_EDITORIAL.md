# Fase 1 — Observación editorial en shadow mode

## Objetivo

Agregar una capa de diagnóstico editorial sin modificar la lógica automática existente de ATLAS NEWS.

La Fase 1 observa cuatro señales:

1. memoria editorial corta de los últimos 5 días;
2. novedad frente a publicaciones recientes;
3. repetición de títulos o tesis;
4. solapamiento entre General, Nacional y Mercados en una misma fecha.

## Principio de seguridad

Esta fase es exclusivamente observacional.

- No modifica `data/editorial_state.json`.
- No cambia prompts ni reglas de generación.
- No modifica `publish-site.yml`.
- No cambia `status` de publicaciones.
- No bloquea build, merge ni despliegue.
- No publica contenido.
- No escribe resultados de vuelta al repositorio.

El sistema actual sigue siendo la autoridad operacional y editorial.

## Implementación

### Auditor

`scripts/editorial-shadow-audit.mjs`

Lee las publicaciones existentes en:

- `src/content/editions/`;
- `src/content/briefings/`.

A partir de ellas deriva una memoria corta y genera dos archivos temporales:

- `report.json`: diagnóstico estructurado;
- `summary.md`: resumen legible para GitHub Actions.

### Workflow independiente

`.github/workflows/editorial-shadow-audit.yml`

Se ejecuta una vez al día después del paquete matutino y también admite ejecución manual.

El workflow usa `main` como fuente, corre el auditor y guarda el resultado como artefacto por 14 días. Incluso si el auditor falla técnicamente, el job no altera ni bloquea la publicación.

## Umbrales iniciales

Los umbrales son deliberadamente heurísticos y no representan reglas editoriales definitivas.

- similitud de título: `0.45`;
- similitud de tesis (título + resumen): `0.35`;
- solapamiento entre secciones: `0.32`;
- novedad baja: menos de `55/100`.

Estos valores deben calibrarse observando varios ciclos reales antes de convertir cualquier señal en una recomendación o gate.

## Memoria corta

La memoria corta no es una segunda fuente de verdad. Se reconstruye en cada ejecución desde las publicaciones reales de los últimos cinco días.

Esto evita duplicar o competir con `data/editorial_state.json`, cuya función sigue siendo conservar únicamente hilos editoriales activos y persistentes.

## Qué mide la novedad

La novedad es una señal léxica comparativa entre título + resumen de una pieza y publicaciones anteriores recientes.

Un puntaje bajo significa que el vocabulario y la formulación temática son parecidos a publicaciones previas. No significa que la noticia carezca de valor: un mismo tema puede merecer repetición si existe un cambio material.

## Qué mide el solapamiento

El auditor compara las piezas publicadas de una misma fecha y alerta cuando General, Nacional y Mercados presentan una similitud elevada en título + resumen.

La señal sirve para identificar paquetes donde las secciones pueden estar respondiendo a la misma pregunta editorial.

## Criterio para avanzar a Fase 2

No se debe usar esta capa para intervenir la generación hasta observar suficientes ciclos para responder tres preguntas:

1. ¿Los falsos positivos son manejables?
2. ¿Las alertas coinciden con las evaluaciones editoriales humanas de la semana?
3. ¿Los umbrales distinguen repetición legítima de falta real de rotación?

Solo entonces corresponde usar estas señales como contexto para selección editorial o rotación temática.
