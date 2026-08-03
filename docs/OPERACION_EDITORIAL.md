# Operación editorial sin API de pago

## Flujo vigente

ATLAS NEWS utiliza GitHub como fuente editorial y GitHub Pages como alojamiento:

1. GPT prepara una publicación completa en Markdown.
2. El mismo archivo, sin adaptar ni reescribir su cuerpo, se incorpora en `src/content/editions/`.
3. Si cumple el contrato editorial y contiene fuentes primarias, se registra con estado `published`; si falta algún requisito, queda como `draft`.
4. El cambio llega a la rama `main` del repositorio privado.
5. GitHub Actions valida el contrato, ejecuta Astro y publica únicamente la salida web en el repositorio público.
6. GitHub Pages actualiza `https://eldesiempre100.github.io/`.

## Separación de responsabilidades

- `ATLAS_NEWS` permanece privado y conserva código, Markdown e historial editorial.
- `EldeSiempre100.github.io` es público y contiene solo HTML, CSS y activos generados.
- La clave SSH de despliegue existe únicamente como secreto de GitHub Actions.
- No se utiliza `OPENAI_API_KEY` y, por tanto, este flujo de construcción y publicación no genera consumo de la API de OpenAI.

## Alta de una publicación

La unidad de trabajo es un archivo `AAAA-MM-DD-tipo-slug.md`. Nunca se edita manualmente la portada ni el archivo cronológico: ambos se regeneran desde las colecciones.

El archivo que llega al repositorio es la versión que leerá el público. No existe una segunda redacción dentro del sitio. Antes de publicarlo se debe comprobar:

- estructura exigida por el contrato editorial;
- fecha de publicación y hora de cierre con zona horaria;
- URLs primarias verificables;
- distinción entre hechos, inferencias y criterio profesional;
- lenguaje dirigido al lector, sin referencias al proceso interno de preparación;
- ausencia de avisos generales repetidos dentro del cuerpo.

Las fuentes se declaran en los metadatos y aparecen automáticamente al final. El aviso general de inversión aparece una sola vez en el pie del sitio.

## Recuperación

Si una publicación rompe el contrato, la compilación falla y la versión pública anterior permanece disponible. Si un dato requiere corrección, se modifica el Markdown y se crea un nuevo commit; Git conserva la versión anterior.

## Límite actual

La generación desatendida del texto no forma parte de este flujo sin API. GPT puede preparar y entregar el Markdown mediante la cuenta de ChatGPT y el conector de GitHub, pero esa escritura puede estar sujeta a confirmación según los permisos del producto. La web se valida y publica automáticamente después de cada commit aceptado en `main`.

El procedimiento exacto para GPT está documentado en `docs/PROCEDIMIENTO_GPT_PUBLICACION.md`.
