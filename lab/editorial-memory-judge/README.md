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

- `bootstrap.json`: estado estático de arranque versionado con el código.
- `input.json`: paquete determinístico diario publicado sólo en la superficie pública LAB.
- `latest.json`: salida runtime del juez semántico; vive sólo en la superficie pública LAB y nunca se copia desde este repositorio.
- `runs/YYYY-MM-DD.json`: histórico futuro de corridas, cuando se habilite.
- `scripts/lab/prepare-editorial-memory-input.mjs`: productor determinístico de candidatos, claims publicados y antecedentes.
- `scripts/lab/validate-editorial-memory-input.mjs`: scope gate del paquete de entrada.
- `scripts/lab/validate-editorial-memory-judge.mjs`: validación mecánica de la salida visible.
- `lab-site/src/pages/memoria-editorial.astro`: superficie humana del experimento.

El deploy general de LAB preserva explícitamente `input.json` y `latest.json`; por diseño no puede reemplazarlos ni borrarlos mediante `rsync --delete`.

## Baseline

Skill: `atlas-editorial-memory 0.2.0-candidate`.

Snapshot congelado para EXP-011: `1oZLcsmCwPV0KapLAHbaGuUoDfodUGUky`.

La primera fase usa como control el Shadow canónico vigente y, para el juez semántico, recupera por recall todos los antecedentes publicados dentro del pool comparativo. No asigna lineage, no inventa thresholds ni ejecuta acciones de política.

La baseline histórica documentada contiene 60 publicaciones distribuidas en cuatro ventanas de cinco días. La incorporación de ese benchmark al runtime se hará en una fase posterior y separada.
