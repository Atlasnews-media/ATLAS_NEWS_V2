# ATLAS NEWS — Procedimiento para GPT

## Propósito

Entregar publicaciones diarias, semanales y Lecturas solicitadas directamente a ATLAS NEWS sin copiar, resumir ni reescribir el contenido entre su generación y el sitio público, y sin depender de aprobaciones humanas rutinarias.

## Principio obligatorio

El Markdown terminado es la publicación. GPT debe escribirlo para el lector final y entregarlo íntegro al repositorio. La portada, el archivo y la página de la publicación se generan automáticamente desde ese único archivo.

La investigación se realiza una sola vez por publicación. El contenido público utiliza exactamente esa investigación y no inicia una segunda búsqueda durante la etapa editorial.

Para formular el titular de una edición, responder: **¿Cuál es la principal conclusión de mercado que surge del conjunto completo del informe?** El titular debe reflejar esa conclusión y no simplemente la primera noticia o el activo más repetido.

## Fuente de verdad y roles

- Repositorio privado: `EldeSiempre100/ATLAS_NEWS`.
- Ediciones: `src/content/editions/`.
- Lecturas: `src/content/readings/`.
- Memoria editorial: `data/editorial_state.json`.
- Nombre diario: `AAAA-MM-DD-daily-titulo-breve.md`.
- Nombre semanal: `AAAA-MM-DD-weekly-titulo-breve.md`.
- Nombre de Lectura: `AAAA-MM-DD-reading-titulo-breve.md`.
- Rama editorial diaria: `editorial/AAAA-MM-DD-daily`.
- Rama editorial semanal: `editorial/AAAA-MM-DD-weekly`.
- Rama de Lectura directa: `reading/AAAA-MM-DD-titulo-breve`.
- `main` es la fuente canónica aceptada y desplegable.
- Supabase es memoria operacional; nunca sustituye a GitHub como autoridad ni bloquea por sí solo una publicación.
- Linear registra únicamente excepciones persistentes que requieren atención; no registra ejecuciones normales ni correcciones mecánicas resueltas automáticamente.

## Preparación del archivo

1. Escribir el titular, resumen y cuerpo completo; en ediciones, incorporar además los tres destacados requeridos.
2. Incorporar fecha de publicación y, cuando corresponda, hora de corte con zona horaria de Santiago.
3. Declarar las fuentes públicas verificables en el frontmatter correspondiente.
4. Cuando existan entre tres y seis cifras de mercado verificadas dentro del cuerpo de una edición, resumirlas también en el campo opcional `marketSummary`. Cada cifra debe conservar nombre, valor, variación cuando corresponda, categoría y la misma fecha de corte.
5. En ediciones, escribir el cuerpo en este orden:
   - Hecho central.
   - En una mirada.
   - Por qué importa.
   - Mercados globales.
   - Chile.
   - Tasas, monedas y commodities.
   - Qué observar.
6. Crear inicialmente el contenido automatizado con `status: draft`.
7. No agregar una sección duplicada de fuentes cuando el sitio ya la construye desde el frontmatter.

Cuando un mercado esté cerrado, utilizar el último cierre disponible con su fecha correspondiente y no presentarlo como una cotización del día.

`marketSummary` nunca debe construirse extrayendo números automáticamente desde párrafos ya redactados. Debe generarse junto con el artículo a partir de los mismos datos verificados. Si no existen al menos tres cifras aptas, el campo se omite y la portada utiliza su contenido de respaldo.

Las fuentes deben utilizar URLs públicas completas. Antes de entregar el archivo, GPT debe reemplazar todos sus marcadores internos de cita (`cite...`) por fuentes verificables. Un archivo que conserve esos marcadores debe quedar fuera de publicación.

La plantilla canónica de ediciones está en `docs/templates/edition.md.example`.

## Memoria editorial mínima

`data/editorial_state.json` conserva solo hilos activos. Cada hilo contiene `id`, `topic`, `thesis`, `status`, `last_evidence`, `effect`, `base_scenario`, `invalidate_if`, `watch` y `last_publication`. El estado debe ser `new`, `continues`, `confirmed`, `weakened`, `changed`, `contradicted` o `closed`.

Toda publicación debe evaluar la memoria pertinente. La edición diaria contrasta solo los hilos relevantes; el panorama semanal puede leer todos los hilos activos; una Lectura puede integrar, reformular o cerrar un hilo.

`data/editorial_state.json` se modifica únicamente cuando la nueva publicación cambia sustantivamente un hilo. Si no existe cambio, permanece idéntico. Nunca se debe inventar una modificación para satisfacer un workflow. Cuando sí cambie, memoria y publicación viajan en la misma rama y Pull Request.

## Entrega de las 06:00

1. Leer `AGENTS.md`, `docs/CONTRATO_EDITORIAL.md`, la plantilla y `data/editorial_state.json` desde el `main` remoto vigente.
2. Comprobar que no exista otra edición del mismo tipo para la misma fecha.
3. Crear la rama editorial desde ese mismo `main`.
4. Comparar la información nueva con los hilos pertinentes y clasificar su efecto sobre las tesis; el panorama semanal puede usar todos los hilos activos.
5. Escribir un único Markdown completo con `status: draft`.
6. Actualizar `data/editorial_state.json` solo cuando exista un cambio editorial sustantivo; conservarlo idéntico en caso contrario.
7. Si la memoria cambió, incluirla junto con el Markdown en la misma rama y Pull Request.
8. Abrir un Pull Request **normal, no Draft PR**, contra `main`.
9. No fusionar en esta etapa.

La creación o actualización del Pull Request dispara GitHub Actions mediante `pull_request`. GitHub valida contenido y construcción; el PR no despliega producción.

## Evaluación y publicación de las 07:00

La tarea de publicación revisa exclusivamente el Pull Request de la edición vigente.

La evaluación es automatizada. No existe aprobación humana rutinaria ni un gate editorial subjetivo.

Antes de detener el ciclo, distinguir entre:

- **fallo mecánico reparable**: normalización de texto, salto de línea final, comillas/frontmatter corregibles, estado editorial o inconsistencia determinista equivalente;
- **fallo objetivo persistente**: fuente inválida, contrato estructural incumplido, JSON inválido no reparable con certeza, conflicto Git, build roto, autenticación o despliegue fallido.

Los fallos mecánicos reparables se corrigen en el mismo archivo y rama, sin pedir autorización, y se vuelve a ejecutar la validación. Realizar como máximo dos ciclos de autocorrección por publicación para evitar bucles. Una corrección mecánica resuelta no se escala a Linear ni al usuario.

Si no existe un fallo objetivo persistente:

1. Confirmar que la memoria fue evaluada. Si cambió, verificar que acompañe la publicación y que los hilos no afectados permanezcan intactos; si no cambió, aceptar el estado vigente sin exigir una modificación artificial.
2. Cambiar `status: draft` por `status: published` en el mismo archivo y rama, sin reescribir el contenido. Si una corrección sustantiva altera una tesis, actualizar también el hilo correspondiente.
3. Crear el commit de promoción editorial.
4. Esperar las validaciones del **SHA final** del Pull Request.
5. Si aparece un fallo mecánico reparable, corregirlo en la misma rama, crear un nuevo SHA y volver a validar.
6. Si el SHA final queda verde, fusionar mediante `squash` verificando el SHA esperado.
7. Si persiste un fallo objetivo después de la autocorrección permitida, no fusionar; conservar la última versión pública válida y registrar la excepción.

No es necesario ejecutar una aprobación humana ni convertir un Draft PR en Ready for review porque los PR editoriales se crean como PR normales. Si la publicación no se fusiona, la memoria editorial tampoco avanza en `main`.

## Formato y validaciones

El formato cosmético de los Markdown editoriales y de `data/editorial_state.json` no es un criterio editorial y no debe bloquear por sí solo una publicación. Esos archivos quedan fuera del gate general de Prettier.

La integridad se protege mediante validaciones objetivas: `validate:content`, esquema Astro, build, manifiesto y auditor. El formato técnico de código, workflows, componentes y documentación técnica continúa protegido por `format:check`.

## Lecturas solicitadas directamente

Cuando el usuario solicita publicar una Lectura, GPT ejecuta el mismo principio autónomo: investigar una vez, crear el Markdown en `src/content/readings/`, evaluar memoria, abrir PR normal, validar, promover a `published`, autocorregir fallos mecánicos deterministas, hacer `squash merge` y verificar la URL pública. No debe detenerse para solicitar aprobación GitHub si las validaciones objetivas son correctas.

## Despliegue

El `push` resultante sobre `main` dispara automáticamente el workflow de producción:

1. construir el sitio;
2. generar y comprobar `status.json`;
3. publicar el contenido estático en `EldeSiempre100/EldeSiempre100.github.io`;
4. comprobar que `sourceCommit` coincida con el SHA aceptado en `main`;
5. comprobar la publicación, la portada o índice correspondiente y la URL final.

No existe un trigger horario adicional de publicación. `workflow_dispatch` queda disponible solamente como recuperación manual.

## Memoria operacional

Cuando el cambio corresponde a una edición, GitHub Actions registra de forma no bloqueante en Supabase:

`pr_open → validated → merged → deployed → verified`

Si una etapa falla de forma persistente, registra `failed`, la etapa y el enlace al workflow. Un problema de Supabase no debe impedir por sí mismo la publicación.

Linear recibe únicamente fallos persistentes que realmente requieren atención y evita duplicar incidencias de una misma publicación.

## Correcciones

Si se detecta un error antes del merge, GPT corrige el mismo archivo y crea un nuevo commit en la misma rama. Nunca debe borrar una edición anterior ni crear una segunda versión divergente para la misma fecha.

Si GitHub Actions falla, la versión pública anterior permanece disponible mientras se intenta la autocorrección permitida.

## Confirmación final de GPT

Al terminar, GPT debe informar:

- nombre del archivo creado o corregido;
- estado `draft` o `published`;
- fuentes incluidas;
- commit generado;
- Pull Request correspondiente;
- resultado de las validaciones;
- squash merge, cuando corresponda;
- resultado del despliegue;
- URL pública, cuando corresponda.
