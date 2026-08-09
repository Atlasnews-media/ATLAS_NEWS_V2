# ATLAS NEWS — Reglas permanentes del repositorio

## Misión

Mantener un periódico financiero digital donde el código, los datos y el contenido estén separados. Los procesos técnicos construyen y protegen el sistema; los procesos editoriales agregan publicaciones sin modificar la arquitectura.

## Fuente de verdad

- `main` representa el estado remoto aceptado y desplegable.
- Las ediciones viven exclusivamente en `src/content/editions/`.
- Las lecturas seleccionadas viven exclusivamente en `src/content/readings/`.
- La memoria editorial persistente vive únicamente en `data/editorial_state.json` y conserva solo hilos activos.
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

## Memoria editorial mínima

- Cada generación parte del archivo vigente en `main`: la edición diaria compara solo los hilos pertinentes y el panorama semanal puede considerar todos los hilos activos.
- Clasificar la relación de cada hecho con una tesis usando solo `new`, `continues`, `confirmed`, `weakened`, `changed`, `contradicted` o `closed`.
- Actualizar únicamente los hilos afectados y conservar sin cambios los demás objetos.
- Toda publicación debe evaluar la memoria, pero `data/editorial_state.json` solo se modifica cuando existe un cambio editorial sustantivo. No crear cambios artificiales para satisfacer validadores.
- Cuando la memoria cambie, la publicación y su actualización deben viajar en la misma rama editorial y en el mismo Pull Request.
- La memoria solo avanza al fusionarse esa publicación en `main`; no crear commits ni Pull Requests independientes para adelantarla.
- Una lectura seleccionada puede integrar, reformular o cerrar hilos en su mismo Pull Request.

## Borradores automatizados

- Radar IPSA debe usar las etiquetas `radar-ipsa` y `pendiente-verificacion`.
- El Buzón Editorial debe usar las etiquetas `buzon-editorial` y `pendiente-verificacion`.
- Ningún archivo con `pendiente-verificacion` puede cambiar a `published`.
- Radar IPSA y Buzón Editorial son colas de calibración independientes y nunca bloquean la edición diaria, semanal ni una Lectura solicitada directamente.
- No copiar el cuerpo completo de artículos externos.

## Reglas técnicas

- Mantener Astro en modo estático mientras el alcance no requiera servidor.
- Mantener TypeScript estricto.
- Favorecer HTML y CSS; añadir JavaScript de cliente solo cuando sea imprescindible.
- No incluir secretos en Git, contenido, prompts, logs o archivos de ejemplo.
- `npm run format:check` protege código, configuración y documentación técnica; el estilo cosmético de los Markdown editoriales y de `data/editorial_state.json` no puede bloquear una publicación.
- La integridad de publicaciones y memoria se controla con `npm run validate:content`, el esquema Astro, el build, el manifiesto y el auditor.
- Un error editorial nunca debe reemplazar o eliminar una edición anterior.
- Los Pull Requests validan y no despliegan producción.

## Autonomía editorial

- Las ediciones diaria y semanal y las Lecturas solicitadas directamente deben completar su ciclo sin aprobación humana rutinaria.
- La evaluación previa al merge es automatizada y objetiva: contrato de contenido, fuentes, estructura, build, manifiesto y despliegue.
- Un fallo determinista y reparable en el contenido debe corregirse en la misma rama y volver a validarse automáticamente cuando el agente ejecutor tenga capacidad para hacerlo.
- Si persiste un fallo objetivo que impide una publicación íntegra, conservar la última versión pública válida y registrar la excepción; no sustituir el fallo por una solicitud rutinaria de aprobación.

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
- La publicación automática siempre debe incluir una etapa explícita de evaluación automatizada; no requiere aprobación humana por defecto.
