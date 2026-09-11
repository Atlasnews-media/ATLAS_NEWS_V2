# ATLAS NEWS — Reglas permanentes del repositorio

## Misión

Mantener un periódico financiero digital donde el código, los datos y el contenido estén separados. Los procesos técnicos construyen y protegen el sistema; los procesos editoriales agregan publicaciones sin modificar la arquitectura.

## Fuente de verdad

- `main` representa el estado remoto aceptado y desplegable.
- Las ediciones viven exclusivamente en `src/content/editions/`.
- Nacional y Mercados viven exclusivamente en `src/content/briefings/` y se distinguen por `section: national | markets`.
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

## Paquete editorial matutino

- La rama canónica del paquete diario es `editorial/AAAA-MM-DD-morning`.
- El Pull Request canónico se titula `Paquete editorial matutino — AAAA-MM-DD`.
- El paquete contiene exactamente una edición General diaria y puede contener como máximo una pieza Nacional y una pieza Mercados para la misma fecha.
- General es obligatoria. Nacional y Mercados son componentes complementarios y pueden faltar sin crear una segunda edición General ni un segundo pipeline.
- Los tres contenidos, cuando existan, viajan en la misma rama y el mismo Pull Request y se validan con un solo build.
- Un merge del paquete produce un solo despliegue del sitio.
- No crear ramas, Pull Requests, merges o despliegues independientes para Nacional o Mercados durante el flujo matutino.
- Las ramas `editorial/AAAA-MM-DD-daily` y `editorial/AAAA-MM-DD-weekly` se conservan por compatibilidad con flujos existentes; la rama `-morning` es la convención canónica del nuevo paquete diario.

## Memoria editorial mínima

- Cada generación parte del archivo vigente en `main`: la edición diaria compara solo los hilos pertinentes y el panorama semanal puede considerar todos los hilos activos.
- Nacional y Mercados pueden leer `data/editorial_state.json` para mantener continuidad, pero no lo modifican por sí mismos.
- Dentro del paquete matutino, solo la edición General tiene autoridad para proponer cambios en `data/editorial_state.json`.
- Clasificar la relación de cada hecho con una tesis usando solo `new`, `continues`, `confirmed`, `weakened`, `changed`, `contradicted` o `closed`.
- Actualizar únicamente los hilos afectados y conservar sin cambios los demás objetos.
- Toda publicación debe evaluar la memoria pertinente, pero `data/editorial_state.json` solo se modifica cuando existe un cambio editorial sustantivo. No crear cambios artificiales para satisfacer validadores.
- Cuando la memoria cambie, la edición General y su actualización deben viajar en la misma rama editorial y en el mismo Pull Request del paquete.
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
- La memoria operacional de Supabase conserva una sola secuencia de estado para el paquete matutino, identificada por la edición General diaria; Nacional y Mercados no crean estados operacionales independientes.

## Gate de integración técnica

- Todo cambio en componentes, layouts, páginas, estilos, scripts, workflows, configuración, esquema o herramientas del repositorio se considera cambio técnico.
- Los cambios técnicos deben partir desde el `main` remoto vigente, viajar por una rama separada y entrar mediante Pull Request. No escribir cambios técnicos directamente sobre `main`.
- Antes de fusionar un cambio técnico, la validación canónica del HEAD exacto del Pull Request debe estar en estado terminal y verde. `queued`, `in_progress`, `cancelled` o un SHA anterior no habilitan el merge.
- Si una corrección produce un nuevo commit, el gate se reinicia sobre el nuevo HEAD y solo ese SHA puede autorizarse para merge.
- Tras el merge, verificar el workflow de producción disparado por el nuevo `main` y confirmar la versión pública. Un fallo de despliegue conserva la última versión pública válida y bloquea nuevos cambios técnicos hasta recuperar un `main` verde.
- El Morning Package editorial mantiene su flujo y su propio Pull Request diario; esta regla no autoriza a modificarlo ni a convertir un fallo técnico en una reescritura editorial.
- Cuando la configuración administrativa de GitHub lo permita, este mismo contrato debe reflejarse además como protección mecánica de `main` mediante required checks o ruleset equivalente.

## Autonomía editorial

- Las ediciones diaria y semanal, Nacional, Mercados y las Lecturas solicitadas directamente deben completar su ciclo sin aprobación humana rutinaria cuando el flujo correspondiente esté habilitado.
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
