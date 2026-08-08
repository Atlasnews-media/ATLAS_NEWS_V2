# ATLAS NEWS — Procedimiento para GPT

## Propósito

Entregar cada publicación diaria o semanal a ATLAS NEWS sin copiar, resumir ni reescribir el contenido entre su generación y el sitio público.

## Principio obligatorio

El Markdown terminado es la publicación. GPT debe escribirlo para el lector final y entregarlo íntegro al repositorio. La portada, el archivo y la página de la edición se generan automáticamente desde ese único archivo.

La investigación de mercado se realiza una sola vez por edición. El contenido público utiliza exactamente esa investigación y no inicia una segunda búsqueda durante la etapa editorial.

Para formular el titular, responder: **¿Cuál es la principal conclusión de mercado que surge del conjunto completo del informe?** El titular debe reflejar esa conclusión y no simplemente la primera noticia o el activo más repetido.

## Fuente de verdad y roles

- Repositorio privado: `EldeSiempre100/ATLAS_NEWS`.
- Carpeta: `src/content/editions/`.
- Nombre diario: `AAAA-MM-DD-daily-titulo-breve.md`.
- Nombre semanal: `AAAA-MM-DD-weekly-titulo-breve.md`.
- Rama editorial diaria: `editorial/AAAA-MM-DD-daily`.
- Rama editorial semanal: `editorial/AAAA-MM-DD-weekly`.
- `main` es la fuente canónica aceptada y desplegable.
- Supabase es memoria operacional; nunca sustituye a GitHub como autoridad ni bloquea por sí solo una publicación.
- Linear registra únicamente excepciones que requieren atención humana; no registra ejecuciones normales.

## Preparación del archivo

1. Escribir el titular, resumen, tres destacados y cuerpo completo.
2. Incorporar fecha de publicación y hora de corte con zona horaria de Santiago.
3. Declarar las fuentes primarias en `sources`.
4. Cuando existan entre tres y seis cifras de mercado verificadas dentro del cuerpo, resumirlas también en el campo opcional `marketSummary`. Cada cifra debe conservar nombre, valor, variación cuando corresponda, categoría y la misma fecha de corte. El campo no agrega información nueva ni altera el texto visible.
5. Escribir el cuerpo en este orden:
   - Hecho central.
   - En una mirada.
   - Por qué importa.
   - Mercados globales.
   - Chile.
   - Tasas, monedas y commodities.
   - Qué observar.
6. La automatización crea inicialmente la edición con `status: draft`.
7. No agregar una sección duplicada de fuentes: el sitio la construye desde `sources`.

Cuando un mercado esté cerrado, utilizar el último cierre disponible con su fecha correspondiente y no presentarlo como una cotización del día.

`marketSummary` nunca debe construirse extrayendo números automáticamente desde párrafos ya redactados. Debe generarse junto con el artículo a partir de los mismos datos verificados. Si no existen al menos tres cifras aptas, el campo se omite y la portada utiliza su contenido de respaldo.

Las fuentes deben utilizar URLs públicas completas. Antes de entregar el archivo, GPT debe reemplazar todos sus marcadores internos de cita (`cite...`) por entradas verificables en `sources`. Un archivo que conserve esos marcadores debe quedar fuera de publicación.

La plantilla canónica está en `docs/templates/edition.md.example`.

## Entrega de las 06:00

1. Leer `AGENTS.md`, `docs/CONTRATO_EDITORIAL.md` y la plantilla vigente.
2. Comprobar que no exista otra edición del mismo tipo para la misma fecha.
3. Crear la rama editorial desde el `main` remoto vigente.
4. Escribir un único Markdown completo con `status: draft`.
5. Crear un commit que identifique fecha y tipo de publicación.
6. Abrir un Pull Request **normal, no Draft PR**, contra `main`.
7. No fusionar en esta etapa.

La creación o actualización del Pull Request dispara GitHub Actions mediante `pull_request`. GitHub valida contenido y construcción; el PR no despliega producción.

## Evaluación y publicación de las 07:00

La tarea de publicación revisa exclusivamente el Pull Request de la edición vigente.

Si existe un error real de contenido, contrato o build, no publica y reporta la causa.

Si no existe un error bloqueante:

1. Cambiar únicamente `status: draft` por `status: published` en el mismo archivo y rama.
2. Crear el commit de promoción editorial.
3. Esperar las validaciones del **SHA final** del Pull Request.
4. Si el SHA final queda verde, fusionar mediante `squash` verificando el SHA esperado.
5. Si el SHA final falla, no fusionar.

No es necesario ejecutar una aprobación humana ni convertir un Draft PR en Ready for review porque los PR editoriales se crean como PR normales.

## Despliegue

El `push` resultante sobre `main` dispara automáticamente el workflow de producción:

1. construir el sitio;
2. generar y comprobar `status.json`;
3. publicar el contenido estático en `EldeSiempre100/EldeSiempre100.github.io`;
4. comprobar que `sourceCommit` coincida con el SHA aceptado en `main`;
5. comprobar la edición publicada, la portada y la URL final.

No existe un trigger horario adicional de publicación. `workflow_dispatch` queda disponible solamente como recuperación manual.

## Memoria operacional

Cuando el cambio corresponde a una edición, GitHub Actions registra de forma no bloqueante en Supabase:

`pr_open → validated → merged → deployed → verified`

Si una etapa falla, registra `failed`, la etapa y el enlace al workflow. Un problema de Supabase no debe impedir por sí mismo la publicación.

Linear recibe únicamente fallos que requieran atención y evita duplicar incidencias de una misma edición.

## Correcciones

Si se detecta un error editorial antes del merge, GPT corrige el mismo archivo y crea un nuevo commit en la misma rama. Nunca debe borrar una edición anterior ni crear una segunda versión divergente para la misma fecha.

Si GitHub Actions falla, la versión pública anterior permanece disponible.

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
