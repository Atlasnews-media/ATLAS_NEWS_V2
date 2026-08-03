# ATLAS NEWS — Bitácora de construcción

## Fase 2: Sistema de contenido y muestras editoriales

**Fecha:** 3 de agosto de 2026

**Estado:** Completada

## Objetivo de la fase

Convertir el contrato editorial de la Fase 1 en un sistema navegable, demostrar la convivencia entre publicaciones diarias, semanales y lecturas seleccionadas, y garantizar que los borradores permanezcan fuera del sitio público.

## Construcción realizada

- Servicio central de consulta y orden cronológico del contenido.
- Filtrado único de publicaciones con estado `published`.
- Selección automática del briefing diario más reciente para la portada.
- Portada alimentada desde las colecciones, sin contenido duplicado en componentes.
- Índice general de ediciones.
- Índice de lecturas seleccionadas.
- Archivo cronológico combinado.
- Rutas estáticas individuales para cada publicación visible.
- Cabecera, navegación principal, pie editorial y tarjetas reutilizables.
- Presentación de metadatos, etiquetas, fecha de cierre y fuentes.
- Identificación visual obligatoria del contenido de demostración.
- Campo `demo` incorporado al contrato editorial.

## Contenido de prueba

- Un briefing diario publicado.
- Un panorama semanal publicado.
- Una lectura seleccionada publicada.
- Un briefing interno en estado `draft`.

Todas las muestras se identifican expresamente como ficticias y utilizan únicamente URLs de `example.com`. No contienen datos financieros reales.

## Controles automáticos incorporados

- Convención de nombres de archivos.
- Presencia de todas las secciones editoriales obligatorias.
- Validez básica de fechas y estados.
- Coherencia entre cierre informativo y publicación.
- Advertencia visible en contenido de demostración.
- Existencia de las siete páginas públicas esperadas después de construir.
- Ausencia de una ruta pública para el borrador interno.

## Verificaciones realizadas

- Contenido validado: tres ediciones y una lectura.
- Astro y TypeScript: 0 errores, 0 advertencias y 0 indicaciones.
- Construcción estática: siete páginas generadas.
- Formato: correcto.
- Navegación en navegador: portada y enlace a Ediciones comprobados.
- Portada: contenido significativo, sin superposición de error y sin desplazamiento horizontal.
- Ruta del borrador: respuesta 404 confirmada.

## Nota del entorno de prueba

El proceso `astro dev` quedó bloqueado antes de abrir el puerto en el runtime local de Windows. La salida de producción sí se construyó sin errores y fue servida estáticamente para la verificación real en navegador. Este comportamiento corresponde al proceso local de desarrollo y no a los archivos finales del sitio.

## Contenido real pendiente

El propietario solicitó a GPT un archivo `Briefing de mercado - AAAA-MM-DD.md` en la carpeta Drive del proyecto. Al cierre de esta fase todavía no estaba disponible. Cuando aparezca se validará y se incorporará inicialmente como borrador real, separado de las muestras ficticias.

## Resultado

ATLAS NEWS ya puede convertir archivos Markdown válidos en portada, índices, archivo y páginas individuales. El sistema preserva borradores dentro del repositorio sin publicarlos y falla la construcción si detecta una ruptura del contrato editorial.
