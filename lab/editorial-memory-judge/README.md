# EXP-011 — Memoria editorial semántica

Estado: `BOOTSTRAP`  
Superficie: **LAB únicamente**  
Producción: **sin autoridad ni escritura**

## Objetivo

Comparar, sobre el mismo conjunto de candidatos editoriales:

1. la referencia determinística/Shadow vigente;
2. un juez semántico experimental inspirado en decisiones tipadas;
3. el resultado híbrido para evaluar continuidad, novedad material, repetición de ángulo y necesidad de contexto histórico.

El experimento no integra Jev de TypeSafe. Construye un juez propio de ATLAS NEWS.

## Barandas

- Nunca escribir en `src/content/editions/**`, `src/content/briefings/**` ni `data/editorial_state.json`.
- Nunca crear, modificar, promover o fusionar el Morning Package productivo.
- Nunca disparar Publicar ATLAS NEWS.
- Nunca modificar T1 productiva.
- Todo artefacto del experimento vive bajo `lab/editorial-memory-judge/**`.
- Toda superficie visible vive bajo `lab-site/**`.
- Un fallo del experimento puede fallar LAB, pero no F4A ni producción.
- La Skill 003 se trata como versión fija por experimento.
- Los resultados registran salidas tipadas, evidencia y códigos de decisión; no chain-of-thought.

## Orden operativo

`ESCRIBE → VALIDA → PUBLICA LAB → IDENTIDAD`

La tarea programada experimental deberá producir primero un artefacto conforme al contrato de este directorio. El validador de LAB lo comprueba antes de que el sitio aislado lo exponga.

## Artefactos

- `latest.json`: última corrida visible.
- `runs/YYYY-MM-DD.json`: histórico futuro de corridas.
- `scripts/lab/validate-editorial-memory-judge.mjs`: validación mecánica.
- `lab-site/src/pages/memoria-editorial.astro`: superficie humana del experimento.

## Baseline

Skill: `atlas-editorial-memory 0.2.0-candidate`.

La baseline histórica documentada contiene 60 publicaciones distribuidas en cuatro ventanas de cinco días. La incorporación de ese benchmark al runtime se hará en una fase posterior y separada.
