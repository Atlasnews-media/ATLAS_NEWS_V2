# ATLAS NEWS — Procedimiento para GPT

## Propósito

Entregar cada publicación diaria o semanal a ATLAS NEWS sin copiar, resumir ni reescribir el contenido entre su generación y el sitio público.

## Principio obligatorio

El Markdown terminado es la publicación. GPT debe escribirlo para el lector final y entregarlo íntegro al repositorio. La portada, el archivo y la página de la edición se generan automáticamente desde ese único archivo.

No se debe crear primero un informe interno para luego convertirlo en artículo. Tampoco se debe mencionar el proceso de preparación dentro del texto público.

## Destino

- Repositorio privado: `EldeSiempre100/ATLAS_NEWS`.
- Carpeta: `src/content/editions/`.
- Nombre diario: `AAAA-MM-DD-daily-titulo-breve.md`.
- Nombre semanal: `AAAA-MM-DD-weekly-titulo-breve.md`.
- Rama: `main`.

Drive puede conservar una copia documental, pero GitHub es la fuente que publica el sitio. Si se guarda una copia en Drive, debe contener exactamente el mismo Markdown enviado a GitHub.

## Preparación del archivo

1. Escribir el titular, resumen, tres destacados y cuerpo completo.
2. Incorporar fecha de publicación y hora de corte con zona horaria de Santiago.
3. Declarar las fuentes primarias en `sources`.
4. Escribir el cuerpo en este orden:
   - Hecho central.
   - En una mirada.
   - Por qué importa.
   - Mercados globales.
   - Chile.
   - Tasas, monedas y commodities.
   - Qué observar.
5. Utilizar `status: published` cuando el archivo esté completo y respaldado por fuentes. Utilizar `status: draft` si falta un dato, una fuente o una revisión necesaria.
6. No agregar una sección duplicada de fuentes: el sitio la construye desde `sources`.

Las fuentes deben utilizar URLs públicas completas. Antes de entregar el archivo, GPT debe reemplazar todos sus marcadores internos de cita (`cite...`) por entradas verificables en `sources`. Un archivo que conserve esos marcadores debe quedar fuera de publicación.

La plantilla canónica está en `docs/templates/edition.md.example`.

## Criterios de redacción pública

- Hablar directamente de los hechos y sus implicancias.
- No utilizar “briefing”, “brifing”, “documento recibido” ni expresiones equivalentes.
- No explicar que el texto fue generado, transformado o cargado por GPT.
- No repetir avisos generales sobre recomendaciones de inversión dentro del cuerpo.
- No incluir referencias internas de ChatGPT ni citas que el lector no pueda abrir.
- Mantener las cautelas que formen parte del análisis, pero expresarlas como condiciones del escenario.
- No inventar información para completar una sección.

## Entrega mediante GitHub

1. Leer `AGENTS.md`, `docs/CONTRATO_EDITORIAL.md` y la plantilla antes de crear el archivo.
2. Comprobar que no exista otro archivo para la misma edición.
3. Crear el Markdown directamente en `src/content/editions/` mediante el conector de GitHub.
4. Enviar exactamente el archivo terminado, sin una transformación intermedia.
5. Crear un commit cuyo mensaje identifique fecha y tipo de publicación.
6. Revisar el resultado de GitHub Actions.
7. Informar la URL pública cuando el despliegue termine.

GitHub Actions valida el contrato, construye el sitio y publica la nueva versión. GPT no debe editar componentes, estilos, scripts ni archivos de configuración durante una entrega editorial.

## Correcciones

Si se detecta un error, GPT debe corregir el mismo archivo y crear un nuevo commit. Nunca debe borrar una edición anterior ni crear una segunda versión con contenido divergente para la misma fecha.

Si GitHub Actions falla, la versión pública anterior permanece disponible. GPT debe leer el error, corregir únicamente el Markdown y volver a ejecutar el flujo.

## Confirmación final de GPT

Al terminar, GPT debe informar:

- nombre del archivo creado o corregido;
- estado `draft` o `published`;
- fuentes incluidas;
- commit generado;
- resultado del despliegue;
- URL pública, si corresponde.
