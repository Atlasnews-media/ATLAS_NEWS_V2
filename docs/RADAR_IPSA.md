# Radar IPSA

## Objetivo

Radar IPSA detecta publicaciones potencialmente relevantes para empresas seleccionadas del índice y las convierte en candidatos editoriales revisables.

No es un sistema de recomendación de inversión, una fuente de precios ni un publicador automático.

## Arquitectura

```text
GDELT DOC 2.0
→ normalización
→ control de dominio y fecha
→ deduplicación por URL y título
→ priorización de fuentes
→ Markdown en draft
→ Pull Request editorial
→ revisión humana
→ publicación opcional
```

La colección canónica sigue siendo `src/content/readings/`.

## Estado obligatorio de un candidato

Todo candidato automático debe contener:

```yaml
status: draft
tags:
  - radar-ipsa
  - pendiente-verificacion
```

El validador impide publicar un archivo que conserve `pendiente-verificacion`.

## Revisión editorial requerida

Antes de publicar una ficha:

1. Abrir la URL original.
2. Confirmar que la página sigue disponible.
3. Confirmar título, autoría y fecha.
4. Identificar el hecho central sin depender del titular.
5. Buscar una fuente primaria cuando el hecho sea societario, financiero o regulatorio.
6. Diferenciar hechos confirmados de inferencias editoriales.
7. Reescribir la tesis, la selección y los límites con criterio humano.
8. Retirar `pendiente-verificacion` solo cuando la comprobación esté completa.
9. Cambiar `status` a `published` en un Pull Request separado o claramente revisable.

## Fuentes prioritarias

La priorización técnica favorece:

- sitios de relaciones con inversionistas del emisor;
- Comisión para el Mercado Financiero;
- Bolsa de Santiago;
- documentos regulatorios y comunicados corporativos originales.

Una fuente prioritaria mejora el orden de revisión, pero no sustituye la lectura humana.

## Fuente secundaria

Una noticia periodística puede servir para descubrir un hecho. Antes de publicar se debe contrastar con una fuente primaria cuando exista.

No se copia el cuerpo de los artículos. El candidato conserva solamente metadatos, URL y una descripción técnica de descubrimiento.

## Deduplicación

Se normalizan las URLs mediante:

- eliminación de fragmentos;
- eliminación de parámetros de seguimiento conocidos;
- normalización del dominio;
- ordenamiento de parámetros restantes;
- eliminación de barras finales innecesarias.

También se normalizan los títulos para evitar candidatos equivalentes con pequeñas diferencias tipográficas.

## Operación durante la calibración

El workflow se ejecuta manualmente. Permite elegir ventana de búsqueda y cantidad máxima de candidatos.

Si el proveedor no responde:

- se registra el error por emisor;
- no se crean archivos;
- no se abre Pull Request editorial;
- `main` y producción permanecen intactos.

No se activa horario automático hasta reunir evidencia suficiente sobre precisión, cobertura y tasa de duplicados.

## Límites expresos

Radar IPSA no incorpora:

- precios o variaciones de acciones;
- volúmenes de negociación;
- valorizaciones;
- señales de compra o venta;
- publicación sin revisión;
- redistribución del cuerpo de noticias.

Los datos de mercado solo podrán añadirse después de confirmar una fuente y licencia compatibles con exhibición pública.
