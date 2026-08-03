# ATLAS NEWS — Reglas permanentes del repositorio

## Misión

Mantener un periódico financiero digital donde el código y el contenido estén separados. Codex construye y protege el sistema; los procesos editoriales agregan publicaciones sin modificar la arquitectura.

## Fuente de verdad

- Las ediciones viven exclusivamente en `src/content/editions/`.
- Las lecturas seleccionadas viven exclusivamente en `src/content/readings/`.
- Cada publicación corresponde a un solo archivo Markdown o MDX.
- No duplicar contenido en componentes, datos JSON o páginas manuales.

## Reglas de contenido

- Utilizar nombres `AAAA-MM-DD-tipo-slug.md`.
- Crear contenido automatizado inicialmente con `status: draft`.
- Citar al menos una fuente con URL válida.
- Registrar `publishedAt` y `cutoffAt` con zona horaria explícita.
- Diferenciar hechos, inferencias y lectura profesional.
- No presentar análisis como recomendación personalizada de inversión.
- No insertar HTML sin una necesidad revisada y documentada.

## Reglas técnicas

- Mantener Astro en modo estático mientras el alcance no requiera servidor.
- Mantener TypeScript estricto.
- Favorecer HTML y CSS; añadir JavaScript de cliente solo cuando sea imprescindible.
- No incluir secretos en Git, contenido, prompts, logs o archivos de ejemplo.
- Antes de entregar cambios, ejecutar `npm run build` y `npm run format:check`.
- Un error editorial nunca debe reemplazar o eliminar una edición anterior.

## Límites de las fases

- Fase 1: fundación técnica y contrato editorial.
- Fase 2: sistema de contenido y muestras editoriales.
- Fase 3: experiencia visual completa.
- Fases posteriores: generación, automatización y despliegue.

No adelantar credenciales, publicación remota o automatizaciones productivas sin la fase correspondiente.
