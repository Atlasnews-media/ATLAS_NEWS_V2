# Contrato editorial del MVP

## Ediciones

Una edición diaria o semanal debe incluir los siguientes metadatos:

| Campo           | Regla                                        |
| --------------- | -------------------------------------------- |
| `title`         | Entre 8 y 140 caracteres                     |
| `summary`       | Entre 40 y 320 caracteres                    |
| `publishedAt`   | Fecha ISO 8601 con zona horaria              |
| `cutoffAt`      | Cierre informativo ISO 8601 con zona horaria |
| `type`          | `daily` o `weekly`                           |
| `status`        | `draft` o `published`                        |
| `tags`          | Al menos una etiqueta                        |
| `sources`       | Al menos una fuente con nombre y URL válida  |
| `featured`      | Indicador booleano; por defecto `false`      |
| `editionNumber` | Entero positivo opcional                     |
| `highlights`    | Entre 3 y 6 claves breves para la portada    |

En nuevas ediciones General diarias, `highlights` debe contener entre cuatro y seis claves según la densidad informativa real. La cantidad no es fija y no debe completarse con relleno. Cada clave debe derivar de la misma investigación verificada y del mismo cuerpo editorial de la edición. Las ediciones históricas y otros tipos de edición pueden conservar tres claves sin migración retroactiva.

### Comprensibilidad de “En una mirada”

En una edición General diaria, cada `highlights[].label` funciona como un microtitular de comprensión inmediata, no como una categoría, código interno ni abreviatura de mesa. Debe expresar por sí solo qué pasó o qué implica, con lenguaje común para un lector interesado en economía pero no especialista.

Regla de aceptación: **¿un lector interesado en economía, pero no especialista, entiende la idea principal del título sin leer el texto inferior?** Si la respuesta es no, se reescribe únicamente el `label` usando la misma información ya verificada en `text` y en el cuerpo de la edición. No se abre una segunda búsqueda, no se genera una pieza nueva y no se modifican titulares de artículos ni las verticales Nacional, Mercados o Internacional.

Preferir una formulación con sujeto + hecho o consecuencia. Evitar etiquetas telegráficas o verbos técnicos sin referente claro, por ejemplo `Mercado repricia` o `Chile transmite`, cuando no explican por sí solos qué cambia. Los labels de la General pueden usar hasta 72 caracteres para privilegiar comprensión sobre brevedad artificial.

El cuerpo debe respetar este orden editorial:

1. Hecho central.
2. En una mirada.
3. Por qué importa.
4. Mercados globales.
5. Chile.
6. Tasas, monedas y commodities.
7. Qué observar.

Una sección puede indicar explícitamente que no hubo cambios materiales. No debe inventarse contenido para completar una sección.

El archivo Markdown es la publicación definitiva. El cuerpo se renderiza en el sitio en el mismo orden y con el mismo texto recibido: no existe una etapa posterior de resumen, reescritura o adaptación. Los metadatos solo controlan portada, archivo, fechas, etiquetas y fuentes.

Las fuentes se declaran una sola vez en `sources` y el sitio las presenta al final de la edición. No debe repetirse una sección de metodología ni incluirse dentro del cuerpo el aviso general de inversión que ya aparece en el pie del sitio.

Cada fuente debe tener una URL pública y verificable. Los marcadores internos de ChatGPT, por ejemplo `cite...`, no son referencias válidas y bloquean la publicación.

La publicación debe escribirse para el lector. No debe mencionar el documento de preparación, el proceso interno ni expresiones como “briefing” o “brifing”.

## Nacional y Mercados

Las piezas de Nacional y Mercados comparten la colección `briefings` y deben incluir:

| Campo         | Regla                                        |
| ------------- | -------------------------------------------- |
| `title`       | Entre 8 y 160 caracteres                     |
| `summary`     | Entre 40 y 320 caracteres                    |
| `publishedAt` | Fecha ISO 8601 con zona horaria              |
| `cutoffAt`    | Cierre informativo ISO 8601 con zona horaria |
| `section`     | `national` o `markets`                       |
| `status`      | `draft` o `published`                        |
| `tags`        | Al menos una etiqueta                        |
| `sources`     | Al menos una fuente con nombre y URL válida  |
| `highlights`  | Opcional; si existe, exactamente tres claves |
| `demo`        | Debe ser `false`                             |

El cuerpo debe desarrollar análisis propio de la vertical. Los hechos y fuentes pueden coincidir con la edición General, pero el texto no debe duplicar sus párrafos. La edición General informa la señal principal; Nacional y Mercados profundizan su contexto, transmisión, consecuencias, riesgos y variables de seguimiento.

Los nombres deben respetar la sección declarada:

```text
AAAA-MM-DD-national-titulo-breve.md
AAAA-MM-DD-markets-titulo-breve.md
```

Un archivo Nacional no puede declarar `section: markets`, ni viceversa.

## Paquete editorial matutino

El paquete matutino diario utiliza una sola rama y un solo Pull Request:

```text
Rama: editorial/AAAA-MM-DD-morning
PR: Paquete editorial matutino — AAAA-MM-DD
```

Debe contener exactamente una edición General diaria para esa fecha. Puede contener además una pieza Nacional y una pieza Mercados. Nacional y Mercados son opcionales en la composición técnica del paquete y nunca crean un segundo paquete, merge o despliegue.

Los tres archivos comienzan como `draft`. La promoción a `published`, cuando corresponda, se realiza en la misma rama y sin reescribir el cuerpo.

La memoria editorial `data/editorial_state.json` puede ser leída por las tres piezas, pero dentro del paquete matutino solo la edición General puede modificarla. Nacional y Mercados no escriben memoria editorial de forma independiente.

## Lecturas seleccionadas

Cada lectura debe tener título, resumen, fecha, estado, etiquetas y una fuente principal. El autor es opcional.

## Convención de archivos

```text
AAAA-MM-DD-daily-titulo-breve.md
AAAA-MM-DD-weekly-titulo-breve.md
AAAA-MM-DD-national-titulo-breve.md
AAAA-MM-DD-markets-titulo-breve.md
AAAA-MM-DD-reading-titulo-breve.md
```

Los nombres usan minúsculas, caracteres ASCII y guiones. No se reemplaza un archivo existente salvo que se esté corrigiendo expresamente esa misma publicación.

## Estados

- `draft`: se conserva y valida, pero no debe aparecer públicamente.
- `published`: puede aparecer en portada, índices, archivo, RSS y sitemap.

La automatización comenzará siempre en modo `draft` durante el periodo de calibración.
