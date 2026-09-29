# ATLAS NEWS — Social Carousel V2

## Estado

Implementación del carrusel editorial diario de 7 láminas para Instagram.

## Estructura fija

1. Portada editorial.
2. En una mirada 01.
3. En una mirada 02.
4. En una mirada 03.
5. En una mirada 04.
6. En una mirada 05.
7. Cierre de edición / CTA hacia Atlas News.

## Fuente editorial

Las cinco fichas centrales consumen contenido ya validado de la edición diaria. Cada ficha usa un `highlight` publicado (`label` + `text`). La capa social no abre una nueva investigación ni crea nuevos claims editoriales.

## Identidad visual

- Formato: 1080 × 1350 px (4:5).
- Fondo: papel crema.
- Tinta principal: negra.
- Acento: rojo ladrillo.
- Fotografías editoriales desaturadas y degradadas.
- Reglas finas, cabecera Atlas News y contador fijo.
- La portada concentra mayor riqueza visual; las cinco fichas privilegian legibilidad y jerarquía.

## Guardrails

- Exactamente cinco fichas de contenido para el carrusel diario V2.
- `label`: máximo 72 caracteres.
- `text`: presupuesto social máximo de 180 caracteres después de compactación determinista.
- Validación de 7 PNG antes de staging y publicación.
- Validación de 1080 × 1350 por lámina.
- Control de overflow del canvas y de la zona editorial reservada para texto.
- La falla del renderer o de Instagram no altera la edición publicada de Atlas News.

## Arquitectura

La implementación conserva el pipeline social existente y no crea un workflow diario adicional:

`edición publicada → contrato social → upgrade V2 → renderer V2 → 7 PNG → staging HTTPS → Instagram`

El Rich Preview / Open Graph continúa generándose junto al renderer social.

## Consumo de GitHub Actions

No se agrega una automatización recurrente nueva. La V2 reemplaza el render/publish del carrusel dentro del workflow social automático ya existente. El costo incremental esperado proviene únicamente del render de dos láminas adicionales y debe observarse en `benchmark.json` durante operación.
