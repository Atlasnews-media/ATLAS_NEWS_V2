# Índices de mercado — históricos 30D

## Objetivo

Incorporar una segunda capa de lectura bajo la tabla de **Índices de mercado**, manteniendo la identidad editorial de ATLAS NEWS y sin convertir la página en un dashboard de trading.

## Series incorporadas

- **USD/CLP** — Mi Indicador (`dolar`).
- **Cobre** — Mi Indicador (`libra_cobre`).
- **S&P 500** — Stooq (`^spx`) con Yahoo Finance (`^GSPC`) como respaldo.
- **Brent** — Yahoo Finance (`BZ=F`).

La ventana visual corresponde a los **últimos 30 días calendario**, conservando todos los cierres diarios disponibles dentro del período. Fines de semana y jornadas sin cotización no se rellenan artificialmente.

## Arquitectura

La captura histórica se ejecuta dentro del flujo existente de actualización de indicadores y enriquece `market-pulse.json` con las series temporales. La obtención es **fail-open**: si una serie externa no está disponible, el resto del pulso y la publicación pueden continuar y la vista informa que esa serie temporal no está disponible en el corte.

Los gráficos se renderizan como **SVG estático desde Astro**, sin hidratación en cliente, sin JavaScript adicional en navegador y sin agregar una librería de gráficos. Esto mantiene bajo el costo de runtime y permite controlar de forma estricta tipografía, líneas, espaciado y jerarquía visual.

## Criterio visual

Los cuatro gráficos se presentan como continuidad del módulo editorial: fondo papel, tinta dominante, grilla tenue, una sola línea por activo, relleno mínimo y uso de verde/rojo únicamente para la variación resumida. Se evitan velas, widgets, controles de trading, animaciones y elementos ajenos al lenguaje visual de ATLAS NEWS.
