# ATLAS NEWS — Procedimiento para GPT

## Propósito

Entregar publicaciones diarias, semanales, Nacional, Mercados y Lecturas solicitadas directamente a ATLAS NEWS sin copiar, resumir ni reescribir el contenido entre su generación y el sitio público, y sin depender de aprobaciones humanas rutinarias.

## Principio obligatorio

El Markdown terminado es la publicación. GPT debe escribirlo para el lector final y entregarlo íntegro al repositorio. La portada, los índices, el archivo y la página de la publicación se generan automáticamente desde esos archivos.

La investigación se realiza una sola vez por publicación. El contenido público utiliza exactamente esa investigación y no inicia una segunda búsqueda durante la etapa editorial.

Para formular el titular de una edición General, responder: **¿Cuál es la principal conclusión internacional de relevancia económica o financiera que surge del conjunto completo del informe?** El titular debe reflejar esa conclusión y no simplemente la primera noticia, Estados Unidos por defecto o el activo más repetido.

### Alcance editorial de General diaria

General conserva su nombre, archivo `daily`, colección, schema, encabezados técnicos y lugar dentro del Morning Package, pero editorialmente cubre exclusivamente información internacional.

La investigación de General debe barrer el mundo según relevancia y no limitarse por rutina a Estados Unidos. Debe considerar, cuando exista información material, América del Norte, América Latina fuera de Chile, Europa, Asia, Medio Oriente, África y Oceanía, priorizando los hechos internacionales con mayor impacto económico, financiero o geopolítico.

General no investiga ni incorpora noticias domésticas chilenas, agenda legislativa local, anuncios o decisiones de autoridades chilenas, regulación nacional, datos macroeconómicos domésticos ni hechos empresariales exclusivamente locales. Esos hechos pertenecen a Nacional.

El encabezado `## Chile` se conserva exactamente por contrato técnico. En General se utiliza únicamente para explicar cómo los hechos internacionales ya investigados pueden transmitirse hacia Chile. No abre una segunda búsqueda local y no introduce noticias domésticas nuevas para completar la sección. Si no existe un canal de transmisión material, debe indicarse brevemente sin rellenar con información local.

Nacional es el propietario editorial exclusivo de los hechos domésticos de Chile. Mercados es el propietario editorial de precios, activos, flujos, posicionamiento y dinámica cross-asset. General puede mencionar una reacción de mercado cuando sea necesaria para comprender el hecho internacional y su relevancia, pero no sustituye la profundización propia de Mercados.

## Fuente de verdad y roles

- Repositorio privado: `EldeSiempre100/ATLAS_NEWS`.
- Ediciones: `src/content/editions/`.
- Nacional y Mercados: `src/content/briefings/`.
- Lecturas: `src/content/readings/`.
- Memoria editorial: `data/editorial_state.json`.
- Nombre diario General: `AAAA-MM-DD-daily-titulo-breve.md`.
- Nombre semanal: `AAAA-MM-DD-weekly-titulo-breve.md`.
- Nombre Nacional: `AAAA-MM-DD-national-titulo-breve.md`.
- Nombre Mercados: `AAAA-MM-DD-markets-titulo-breve.md`.
- Nombre de Lectura: `AAAA-MM-DD-reading-titulo-breve.md`.
- Rama canónica del paquete matutino: `editorial/AAAA-MM-DD-morning`.
- Rama editorial semanal: `editorial/AAAA-MM-DD-weekly`.
- Rama de Lectura directa: `reading/AAAA-MM-DD-titulo-breve`.
- `main` es la fuente canónica aceptada y desplegable.
- Supabase es memoria operacional; nunca sustituye a GitHub como autoridad ni bloquea por sí solo una publicación.
- Linear registra únicamente excepciones persistentes que requieren atención; no registra ejecuciones normales ni correcciones mecánicas resueltas automáticamente.

## Preparación de archivos

1. Escribir el titular, resumen y cuerpo completo; en nuevas ediciones General diarias, incorporar exactamente cinco destacados para la portada y para los consumidores posteriores.
2. Incorporar fecha de publicación y hora de corte con zona horaria de Santiago cuando corresponda.
3. Declarar las fuentes públicas verificables en el frontmatter correspondiente.
4. Cuando existan entre tres y seis cifras de mercado verificadas dentro del cuerpo de una edición General, resumirlas también en el campo opcional `marketSummary`. Cada cifra debe conservar nombre, valor, variación cuando corresponda, categoría y la misma fecha de corte.
5. En ediciones General, escribir el cuerpo en este orden, conservando exactamente estos encabezados técnicos:
   - Hecho central.
   - En una mirada.
   - Por qué importa.
   - Mercados globales.
   - Chile.
   - Tasas, monedas y commodities.
   - Qué observar.
6. En General, todo el cuerpo debe derivar de la investigación internacional. `Chile` solo explica transmisión de esa evidencia internacional. En Nacional, desarrollar exclusivamente los hechos locales de Chile. En Mercados, desarrollar precios, activos, flujos, posicionamiento y dinámica cross-asset. Las verticales deben evitar clonar párrafos de General.
7. Crear inicialmente todo contenido automatizado con `status: draft`.
8. No agregar una sección duplicada de fuentes cuando el sitio ya la construye desde el frontmatter.

Los `highlights` de toda nueva General diaria son exactamente cinco y se generan a partir de la misma investigación internacional verificada y del mismo cuerpo editorial. No abren una segunda búsqueda ni introducen hechos nuevos. Esos mismos cinco alimentan Portada y los consumidores sociales posteriores; ningún proceso downstream debe inventar, completar o sustituir un highlight con contenido de `Qué observar`, `Chile`, `Mercados globales`, `Hecho central` ni otra sección. Deben priorizar las cinco señales que más valor entregan al lector y evitar una secuencia fija de categorías.

Cuando un mercado esté cerrado, utilizar el último cierre disponible con su fecha correspondiente y no presentarlo como una cotización del día.

`marketSummary` nunca debe construirse extrayendo números automáticamente desde párrafos ya redactados. Debe generarse junto con el artículo a partir de los mismos datos verificados. Si no existen al menos tres cifras aptas, el campo se omite y la portada utiliza su contenido de respaldo.

Las fuentes deben utilizar URLs públicas completas. Antes de entregar el archivo, GPT debe reemplazar todos sus marcadores internos de cita (`cite...`) por fuentes verificables. Un archivo que conserve esos marcadores debe quedar fuera de publicación.

Las plantillas canónicas están en `docs/templates/edition.md.example` y `docs/templates/briefing.md.example`.

## Memoria editorial mínima

`data/editorial_state.json` conserva solo hilos activos. Cada hilo contiene `id`, `topic`, `thesis`, `status`, `last_evidence`, `effect`, `base_scenario`, `invalidate_if`, `watch` y `last_publication`. El estado debe ser `new`, `continues`, `confirmed`, `weakened`, `changed`, `contradicted` o `closed`.

La edición General contrasta únicamente los hilos efectivamente investigados dentro de su alcance internacional en esa ejecución y tiene autoridad para actualizar la memoria cuando exista un cambio sustantivo en esos hilos. Los hilos no investigados por General permanecen intactos. Nacional y Mercados pueden leer la memoria para mantener continuidad editorial, pero no la modifican de forma independiente. El panorama semanal puede leer todos los hilos activos; una Lectura puede integrar, reformular o cerrar un hilo.

`data/editorial_state.json` se modifica únicamente cuando la nueva edición General, panorama semanal o Lectura autorizada cambia sustantivamente un hilo que efectivamente evaluó. Si no existe cambio, permanece idéntico. Nunca se debe inventar una modificación para satisfacer un workflow ni actualizar un hilo doméstico únicamente porque Nacional haya encontrado evidencia local.

Dentro del paquete matutino, si la memoria cambia, la actualización viaja junto con General, Nacional y Mercados en la misma rama y Pull Request. Nacional y Mercados no producen commits de memoria separados ni trasladan a General hechos que esta no haya investigado para forzar una actualización de `editorial_state.json`.

## Paquete editorial matutino

El flujo diario usa una sola unidad de trabajo GitHub:

```text
Rama: editorial/AAAA-MM-DD-morning
PR: Paquete editorial matutino — AAAA-MM-DD
```

La rama se crea desde el `main` remoto vigente. Debe contener exactamente una edición General diaria de esa fecha y puede contener una pieza Nacional y una pieza Mercados. General es obligatoria; Nacional y Mercados son complementarias.

No crear ramas o PR separados para Nacional y Mercados. Los tres contenidos comparten el mismo build, manifiesto, auditor, merge y despliegue.

### Construcción del paquete

1. Leer `AGENTS.md`, `docs/CONTRATO_EDITORIAL.md`, las plantillas pertinentes y `data/editorial_state.json` desde el `main` remoto vigente.
2. Comprobar que no exista otra edición General diaria publicada o en preparación para la misma fecha.
3. Crear o reutilizar únicamente la rama `editorial/AAAA-MM-DD-morning` para el paquete de esa fecha.
4. Preparar General como `draft` con alcance exclusivamente internacional y evaluar solo la memoria editorial de los hilos efectivamente investigados por General.
5. Preparar Nacional y Mercados como `draft` cuando estén disponibles; ambas pueden leer la memoria vigente, pero no escribirla.
6. Actualizar `data/editorial_state.json` solo desde la evaluación de General, únicamente respecto de hilos efectivamente investigados y solo cuando exista un cambio editorial sustantivo.
7. Incluir todos los archivos disponibles en la misma rama.
8. Abrir o actualizar un único Pull Request normal, no Draft PR, titulado exactamente `Paquete editorial matutino — AAAA-MM-DD` contra `main`.
9. No fusionar durante la etapa de generación.

La creación o actualización del Pull Request dispara GitHub Actions mediante `pull_request`. GitHub valida el paquete completo con una sola ejecución; el PR no despliega producción.

## Evaluación y publicación del paquete

La tarea de publicación revisa exclusivamente el Pull Request matutino de la fecha vigente.

La evaluación es automatizada. No existe aprobación humana rutinaria ni un gate editorial subjetivo.

Antes de detener el ciclo, distinguir entre:

- **fallo mecánico reparable**: normalización de texto, salto de línea final, comillas/frontmatter corregibles, estado editorial o inconsistencia determinista equivalente;
- **fallo objetivo persistente**: fuente inválida, contrato estructural incumplido, JSON inválido no reparable con certeza, conflicto Git, build roto, autenticación o despliegue fallido.

Los fallos mecánicos reparables se corrigen en los mismos archivos y rama, sin pedir autorización, y se vuelve a ejecutar la validación. Realizar como máximo dos ciclos de autocorrección por paquete para evitar bucles. Una corrección mecánica resuelta no se escala a Linear ni al usuario.

Si no existe un fallo objetivo persistente:

1. Confirmar que General evaluó únicamente la memoria correspondiente a los hilos efectivamente investigados. Si cambió, verificar que `data/editorial_state.json` acompañe el paquete y que los hilos no afectados permanezcan intactos.
2. Confirmar que Nacional y Mercados, si existen, no hayan escrito memoria de forma independiente.
3. Cambiar `status: draft` por `status: published` en los contenidos válidos del mismo paquete sin reescribir el cuerpo.
4. Crear un único commit de promoción editorial.
5. Esperar las validaciones del **SHA final** del Pull Request.
6. Si aparece un fallo mecánico reparable, corregirlo en la misma rama, crear un nuevo SHA y volver a validar.
7. Si el SHA final queda verde, fusionar mediante `squash` verificando el SHA esperado.
8. Si persiste un fallo objetivo después de la autocorrección permitida, no fusionar el contenido inválido; conservar la última versión pública válida y registrar la excepción según la política vigente.

La edición General es obligatoria para completar el paquete matutino. Nacional y Mercados son componentes complementarios: su ausencia no debe provocar la creación de un segundo ciclo editorial ni bloquear una General válida cuando la política de publicación vigente permita continuar.

No es necesario ejecutar una aprobación humana ni convertir un Draft PR en Ready for review porque los PR editoriales se crean como PR normales. Si el paquete no se fusiona, la memoria editorial tampoco avanza en `main`.

## Formato y validaciones

El formato cosmético de los Markdown editoriales y de `data/editorial_state.json` no es un criterio editorial y no debe bloquear por sí solo una publicación. Esos archivos quedan fuera del gate general de Prettier.

La integridad se protege mediante validaciones objetivas: `validate:content`, esquema Astro, build, manifiesto y auditor. El formato técnico de código, workflows, componentes y documentación técnica continúa protegido por `format:check`.

El workflow reconoce el paquete matutino por su rama, exige exactamente una edición General diaria y admite como máximo una pieza Nacional y una Mercados. La memoria operacional se registra una sola vez usando la identidad de General; las verticales no crean secuencias operacionales separadas.

## Panorama semanal

El panorama semanal conserva su rama `editorial/AAAA-MM-DD-weekly`, su archivo `weekly` y su ciclo independiente. No se incorpora al Morning Package diario.

## Lecturas solicitadas directamente

Cuando el usuario solicita publicar una Lectura, GPT ejecuta el mismo principio autónomo: investigar una vez, crear el Markdown en `src/content/readings/`, evaluar memoria, abrir PR normal, validar, promover a `published`, autocorregir fallos mecánicos deterministas, hacer `squash merge` y verificar la URL pública. No debe detenerse para solicitar aprobación GitHub si las validaciones objetivas son correctas.

## Despliegue

El `push` resultante sobre `main` dispara automáticamente el workflow de producción:

1. construir el sitio una sola vez;
2. generar y comprobar `status.json`;
3. publicar la salida estática en `EldeSiempre100/EldeSiempre100.github.io` mediante un solo despliegue;
4. comprobar que `sourceCommit` coincida con el SHA aceptado en `main`;
5. comprobar la edición General más reciente y, cuando existan, las últimas URLs de Nacional y Mercados;
6. verificar la Portada y las rutas finales.

No existe un trigger horario adicional de publicación. `workflow_dispatch` queda disponible solamente como recuperación manual.

## Memoria operacional

Cuando el cambio corresponde a una edición General o a un paquete matutino, GitHub Actions registra de forma no bloqueante en Supabase una sola secuencia:

`pr_open → validated → merged → deployed → verified`

La clave operacional sigue siendo la edición General diaria. Nacional y Mercados no generan secuencias `pr_open → verified` independientes.

Si una etapa falla de forma persistente, registra `failed`, la etapa y el enlace al workflow. Un problema de Supabase no debe impedir por sí mismo la publicación.

Linear recibe únicamente fallos persistentes que realmente requieren atención y evita duplicar incidencias de una misma publicación o paquete.

## Correcciones

Si se detecta un error antes del merge, GPT corrige el mismo archivo dentro de la rama del paquete y crea un nuevo commit. Nunca debe borrar una edición anterior ni crear una segunda versión divergente para la misma fecha.

Si GitHub Actions falla, la versión pública anterior permanece disponible mientras se intenta la autocorrección permitida.

## Confirmación final de GPT

Al terminar, GPT debe informar:

- archivos creados o corregidos;
- estado `draft` o `published` de cada pieza;
- fuentes incluidas;
- commit generado;
- Pull Request correspondiente;
- resultado de las validaciones;
- squash merge, cuando corresponda;
- resultado del despliegue;
- URLs públicas verificadas, cuando corresponda.
