# ATLAS NEWS — LAB Audio Profundo — Fase 3

Estado: **INTEGRACIÓN LAB PREPARADA / SIN EJECUCIÓN DE ACTIONS**

Fecha: 2026-08-25

## Objetivo

Reducir al mínimo el costo operativo de la primera prueba pública de conversación profunda y dejar todo preparado para una única ejecución controlada.

## Cambios de Fase 3

### 1. Un solo push público

El workflow `.github/workflows/lab-deep-audio.yml` fue simplificado para que la corrida experimental publique en un único commit/push público:

- `lab/index.html` con Experimento 1 + Experimento 2;
- `lab/audio/exp2-national.mp3`;
- `lab/audio/exp2-markets.mp3`;
- `lab/audio/exp2-benchmark.json`.

Se eliminó el segundo push que antes se utilizaba para completar las métricas de publicación.

### 2. Guard explícito

El workflow mantiene únicamente `workflow_dispatch` y exige el texto exacto `PUBLICAR` en el input `confirm_publish` antes de ejecutar la preparación de audio.

No posee `schedule`, `push` ni `pull_request`.

### 3. Snapshot estático de LAB

Se añadió:

`lab/exp2/public-lab-index.html`

Esto permite que la misma corrida que genera los audios publique también la interfaz completa del Experimento 2 sin abrir un PR ni fusionar la rama experimental a `main`.

La página mantiene `noindex, nofollow, noarchive`.

### 4. Benchmark sin segundo push

Para evitar un segundo cambio en el repositorio público:

- las métricas de TTS, carga de Kokoro, setup, encode, duración y tamaño quedan en `exp2-benchmark.json`;
- `publish_seconds` y `total_wall_seconds` se miden después del push y se conservan en el log y `GITHUB_STEP_SUMMARY` del único run;
- si se desea reflejar esos dos valores posteriormente en la página, pueden actualizarse directamente en el repositorio público sin ejecutar un nuevo workflow privado.

## Presupuesto de ejecución pendiente

Para pasar de Fase 3 a revisión humana se necesita:

- **1 único workflow privado manual**: `LAB — audio profundo A/B`;
- **1 único push al repositorio público** dentro de esa misma corrida;
- **0 PRs**;
- **0 merges**;
- **0 workflows programados nuevos**;
- **0 cambios a Portada, Nacional o Mercados productivos**.

## Link de revisión

Una vez ejecutada esa única corrida, la revisión se hace en:

`https://eldesiempre100.github.io/lab/`

## Fases restantes

### Fase 4 — Validación humana LAB

Escuchar Nacional y Mercados, revisar alternancia de voces, pausas, naturalidad, duración y benchmark real. Puede requerir ajustes de guion o voz, pero esos cambios se acumulan antes de decidir si vale la pena otra corrida.

### Fase 5 — Integración productiva

Sólo si Fase 4 es aprobada:

- incorporar los guiones al paquete editorial sin crear una validación adicional diaria;
- extender el workflow sonoro existente para producir Portada + Nacional + Mercados en el mismo runner;
- insertar los reproductores en las pestañas productivas;
- retirar el workflow experimental LAB o dejarlo deshabilitado/manual como referencia.

## Regla de cuota

No ejecutar Actions por cambios de código, documentación o diseño de LAB. Las pruebas son discretas, manuales y acumulativas. Si una modificación puede esperar a la siguiente corrida, se acumula y se prueba en conjunto.
