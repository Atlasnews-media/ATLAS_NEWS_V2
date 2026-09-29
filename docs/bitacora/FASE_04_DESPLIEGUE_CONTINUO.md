# ATLAS NEWS — Bitácora de construcción

## Fase 4: Despliegue continuo y operación sin API

**Fecha:** 3 de agosto de 2026

**Estado:** Completada

## Objetivo de la fase

Publicar una versión visible de ATLAS NEWS, mantener privado el repositorio de construcción y automatizar la actualización del sitio después de cada cambio editorial válido, sin incorporar consumo adicional de la API de OpenAI.

## Decisión sobre OpenAI

Se revisaron de forma segura los proyectos locales de Atlas Partner. No se encontró una variable `OPENAI_API_KEY`. La integración existente utiliza autorización de ChatGPT/OpenClaw mediante OAuth, que no equivale a una clave de la API reutilizable.

La API de OpenAI y la suscripción de ChatGPT tienen facturación separada. Para respetar el requisito de no agregar gastos, la Fase 4 se implementó sin llamadas a la API.

## Arquitectura construida

- `ATLAS_NEWS`: repositorio privado con código, Markdown e historial editorial.
- GitHub Actions: instalación, validación del contrato, comprobación de Astro y construcción estática.
- `EldeSiempre100.github.io`: repositorio público que recibe exclusivamente HTML, CSS y activos generados.
- GitHub Pages: alojamiento público con HTTPS.
- Clave SSH exclusiva de despliegue: el valor privado está almacenado como secreto de GitHub Actions y nunca se incorporó al repositorio.

## Flujo operativo

1. GPT prepara un Markdown y lo incorpora como borrador.
2. La revisión completa fuentes y promueve el contenido a publicado.
3. El commit llega a `main`.
4. GitHub Actions valida el contenido y construye las siete páginas.
5. Solo si todo es correcto, la salida reemplaza la versión pública.
6. GitHub Pages publica la actualización automáticamente.

Si la validación falla, la versión pública anterior permanece disponible.

## URL pública

`https://eldesiempre100.github.io/`

## Verificaciones realizadas

- Build local: 0 errores, 0 advertencias y 0 indicaciones.
- Contenido: cuatro ediciones y una lectura validadas.
- Publicación: siete páginas públicas y dos borradores excluidos.
- Primer workflow privado: completado correctamente.
- GitHub Pages: estado `built` y HTTPS forzado.
- Navegación real: portada y archivo comprobados sobre la URL de producción.
- Portada de producción: contenido visible, identidad editorial correcta y sin desplazamiento horizontal en escritorio.
- Acciones oficiales actualizadas a runtimes Node.js 24 para eliminar la advertencia de obsolescencia.

## Acción requerida del propietario

No es necesario crear cuentas nuevas ni contratar un servicio adicional para mantener este flujo. La generación completamente desatendida del texto permanece fuera de esta fase porque requeriría la API de pago o confirmar que el conector de GitHub de ChatGPT puede escribir sin aprobación cotidiana.

## Resultado

ATLAS NEWS dispone de una URL pública y un despliegue reproducible. El contenido fuente sigue protegido, la publicación es automática después de cada commit válido y el sistema no depende de una credencial facturable de OpenAI.
