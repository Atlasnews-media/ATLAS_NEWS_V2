# ATLAS NEWS — Bitácora de construcción

## Fase 6: Publicación íntegra desde Markdown

**Fecha:** 3 de agosto de 2026

**Estado:** Completada

## Objetivo de la fase

Eliminar del contenido público las referencias al proceso interno de preparación y los avisos generales repetidos, y establecer que el Markdown entregado por GPT sea la publicación definitiva que muestra el sitio.

## Decisión editorial

El Markdown terminado es la unidad de publicación. GPT debe escribirlo directamente para el lector final y entregarlo en `src/content/editions/`. Astro renderiza su cuerpo sin una segunda etapa de resumen, adaptación o reescritura.

Los metadatos controlan el titular, resumen, fechas, destacados, etiquetas y fuentes. El cuerpo conserva el texto y el orden recibidos.

## Ajustes realizados

- Eliminadas de la edición vigente las referencias al documento interno de preparación.
- Retirados el bloque inicial de advertencias y dos avisos adicionales dentro del análisis.
- Eliminada la sección duplicada de fuentes y metodología.
- Fuentes conservadas en los metadatos y presentadas una sola vez al final del artículo.
- Etiqueta pública cambiada de “Briefing diario” a “Edición diaria”.
- Textos de portada e índice reescritos con lenguaje dirigido al lector.
- Aviso general de inversión mantenido únicamente en el pie del sitio.
- Copia intermedia eliminada del repositorio para evitar dos versiones editoriales.

## Protección incorporada

- Una publicación no puede pasar la validación si expone terminología interna de preparación.
- Una publicación no puede repetir dentro del Markdown el aviso general del sitio.
- La construcción comprueba que pasajes representativos del Markdown estén presentes en el HTML generado.
- La construcción exige exactamente una aparición del aviso general en la página completa.
- Las fuentes continúan siendo obligatorias.

## Procedimiento para GPT

Se creó `docs/PROCEDIMIENTO_GPT_PUBLICACION.md` y se copió a la carpeta principal de ATLAS NEWS en Drive.

El procedimiento define:

- estructura y destino del archivo;
- criterios de redacción pública;
- entrega directa mediante GitHub;
- uso de `draft` y `published`;
- comportamiento ante fallos;
- forma de corregir una edición sin perder historial.

## Sincronización con Drive

El archivo existente conservó su identificador y enlace, fue renombrado como `ATLAS NEWS — Edición 2026-08-03.md` y recibió exactamente el Markdown publicable.

La lectura posterior confirmó:

- 4.559 caracteres;
- 4.650 bytes;
- frontmatter completo;
- texto limpio;
- ausencia de terminología interna y avisos repetidos.

## Verificaciones

- Contenido: cuatro ediciones y una lectura validadas.
- Astro y TypeScript: 0 errores, 0 advertencias y 0 indicaciones.
- Construcción: cinco páginas públicas y cuatro borradores excluidos.
- GitHub Actions: construcción y publicación completadas correctamente.
- GitHub Pages: despliegue completado correctamente.
- Portada pública: respuesta 200 y lenguaje limpio confirmado.
- Edición pública: respuesta 200.
- Pasajes del Markdown: tres de tres presentes en el HTML.
- Referencias internas: cero.
- Secciones duplicadas de metodología: cero.
- Bloque de fuentes: una aparición.
- Aviso general: una aparición, únicamente en el pie.
- Revisión visual en navegador completada sin página en blanco ni errores superpuestos.

## URLs

- Sitio: `https://eldesiempre100.github.io/`
- Edición: `https://eldesiempre100.github.io/ediciones/2026-08-03-daily-alivio-petrolero-y-peso-chileno/`
- Markdown en Drive: `https://drive.google.com/file/d/14HQXiOfrsPa2hxkZ48zwpZTqjPZIDbzK/view`
- Procedimiento para GPT: `https://drive.google.com/file/d/14CDty9qgs0gPWKsg90GXaGQesvyW9Zch/view`

## Resultado

ATLAS NEWS publica ahora un único texto editorial limpio. El contenido se genera una vez, se entrega como Markdown y llega íntegro al sitio; la plataforma añade únicamente la presentación, navegación, fuentes estructuradas y el aviso general del pie.
