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

El cuerpo debe respetar este orden editorial:

1. Hecho central.
2. En una mirada.
3. Por qué importa.
4. Mercados globales.
5. Chile.
6. Tasas, monedas y commodities.
7. Qué observar.
8. Fuentes y metodología.

Una sección puede indicar explícitamente que no hubo cambios materiales. No debe inventarse contenido para completar una sección.

## Lecturas seleccionadas

Cada lectura debe tener título, resumen, fecha, estado, etiquetas y una fuente principal. El autor es opcional.

## Convención de archivos

```text
AAAA-MM-DD-daily-titulo-breve.md
AAAA-MM-DD-weekly-titulo-breve.md
AAAA-MM-DD-reading-titulo-breve.md
```

Los nombres usan minúsculas, caracteres ASCII y guiones. No se reemplaza un archivo existente salvo que se esté corrigiendo expresamente esa misma publicación.

## Estados

- `draft`: se conserva y valida, pero no debe aparecer públicamente.
- `published`: puede aparecer en portada, índices, archivo, RSS y sitemap.

La automatización comenzará siempre en modo `draft` durante el periodo de calibración.
