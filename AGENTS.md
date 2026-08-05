# ATLAS NEWS — Reglas permanentes del repositorio

## Misión

Mantener un periódico financiero digital donde el código, los datos y el contenido estén separados. Los procesos técnicos construyen y protegen el sistema; los procesos editoriales agregan publicaciones sin modificar la arquitectura.

## Fuente de verdad

- `main` representa el estado remoto aceptado y desplegable.
- Las ediciones viven exclusivamente en `src/content/editions/`.
- Las lecturas seleccionadas viven exclusivamente en `src/content/readings/`.
- Cada publicación corresponde a un solo archivo Markdown o MDX.
- No duplicar contenido en componentes, datos JSON o páginas manuales.
- El clon local puede quedar desactualizado, pero no debe utilizarse para editar hasta ejecutar `fetch` y `pull --ff-only` con el árbol limpio.

## Reglas de contenido

- Utilizar nombres `AAAA-MM-DD-tipo-slug.md`.
- Crear contenido automatizado inicialmente con `status: draft`.
- Citar al menos una fuente con URL válida.
- Registrar fechas con zona horaria explícita cuando incluyan hora.
- Diferenciar hechos, inferencias y lectura profesional.
- No presentar análisis como recomendación personalizada de inversión.
- Tratar cada Markdown como la publicación final: no resumir, reescribir ni duplicar su cuerpo durante el ingreso.
- Omitir términos internos como `briefing` o `brifing` en contenido publicado.
- Mantener el cuerpo limpio de avisos generales ya presentes en el pie del sitio.
- No insertar HTML sin una necesidad revisada y documentada.
- `marketSummary` es opcional y solo puede resumir cifras verificadas que ya estén presentes en el cuerpo y respaldadas por las fuentes de la misma edición.
- El resumen de mercado no sustituye el texto editorial ni puede presentarse como cotización en tiempo real; debe conservar su fecha de corte.

## Borradores automatizados

- Radar IPSA debe usar las etiquetas `radar-ipsa` y `pendiente-verificacion`.
- El Buzón Editorial debe usar las etiquetas `buzon-editorial` y `pendiente-verificacion`.
- Ningún archivo con `pendiente-verificacion` puede cambiar a `published`.
- Una clasificación técnica de fuente primaria no sustituye la revisión humana.
- No copiar el cuerpo completo de artículos externos.

## Reglas técnicas

- Mantener Astro en modo estático mientras el alcance no requiera servidor.
- Mantener TypeScript estricto.
- Favorecer HTML y CSS; añadir JavaScript de cliente solo cuando sea imprescindible.
- No incluir secretos en Git, contenido, prompts, logs o archivos de ejemplo.
- Antes de entregar cambios, ejecutar `npm run format:check` y `npm run build:site`.
- Un error editorial nunca debe reemplazar o eliminar una edición anterior.
- Los Pull Requests validan y no despliegan producción.

## Cambios y recuperación

- Crear ramas desde el `main` remoto vigente.
- Revisar cambios mediante Pull Request.
- Preferir `squash` para integrar una unidad de trabajo completa.
- Revertir historia compartida mediante `git revert`.
- No usar `reset --hard`, force-push ni eliminación de commits publicados como procedimiento de recuperación.

## Límites vigentes

- Los indicadores económicos usan un proveedor desacoplado, snapshot y fallback.
- Las credenciales de una futura API oficial deben vivir en GitHub Secrets.
- Radar IPSA funciona en calibración manual y solo crea borradores.
- No incorporar precios, volúmenes o valorizaciones bursátiles sin confirmar fuente y licencia de exhibición pública.
- No activar publicación editorial automática sin una etapa explícita de evaluación.
