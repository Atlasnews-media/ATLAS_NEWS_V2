# ATLAS NEWS Reel Maker V2

Reel Maker V2 es un consumidor final e independiente de una edición diaria de ATLAS NEWS **ya publicada y verificada**. Pertenece al extremo final de Fase 4 (Distribución). No publica en Instagram ni modifica Morning Package, validación editorial, publicación web, Audio V2 o el carrusel automático.

## Entrada canónica

La herramienta consume el contrato real generado por:

```bash
ATLAS_SOURCE_COMMIT=<sha-de-la-edicion> \
node tools/social-renderer/prepare-daily-contract.mjs
```

El contrato esperado vive temporalmente en:

```text
tools/social-renderer/.generated/daily-contract.json
```

Reel Maker no mantiene un segundo contrato editorial. Usa `sourceCommit`, `canonicalUrl`, `publishedDate`, `title`, `dek`, `ideaCentral`, `ideaSupport`, `keyPoints[3]` e `impactItems[3]` del contrato social canónico.

## Uso

Desde la raíz del repositorio:

```bash
python3 tools/reel_maker/reel_maker.py \
  tools/social-renderer/.generated/daily-contract.json \
  --output-dir tools/reel_maker/output \
  --keep-plates
```

Salida determinista:

```text
tools/reel_maker/output/atlas-news-reel-<sourceCommit>.mp4
```

`--keep-plates` conserva las siete láminas en SVG y PNG para revisión visual. Los archivos generados son artefactos de ejecución y no se suben a `main`.

## Estructura de 7 escenas

1. Titular + bajada.
2. Idea central + apoyo.
3. Clave 1.
4. Clave 2.
5. Clave 3.
6. Por qué importa.
7. Cierre ATLAS NEWS + CTA corto derivado del host de `canonicalUrl`.

La URL canónica completa permanece intacta en el contrato y en el reporte de validación. Su representación visual se abrevia al host para evitar que una URL larga rompa la composición.

## Barandas visuales

El V2 integrado no decide el ajuste por cantidad de caracteres solamente. Cada escena aplica:

- wrapping por palabras con estimación de ancho tipográfico;
- reducción progresiva de tamaño dentro de mínimos definidos;
- límites verticales explícitos;
- cero truncación y cero elipsis;
- render de prueba con el mismo FFmpeg usado para producir la lámina;
- medición sobre píxeles rasterizados del resultado real;
- segundo control sobre un frame del clip ya animado para comprobar que el zoom no expulse contenido del área segura.

Si un bloque no cabe, la ejecución falla indicando escena y causa. `visual-validation.json` conserva la evidencia de las siete escenas.

## Validación técnica

El MP4 final falla si no cumple:

- H.264;
- 1080 × 1920;
- 30 fps;
- `yuv420p`;
- duración aproximada de `7 × --duration`.

Por defecto cada escena dura 2,8 s y el Reel dura aproximadamente 19,6 s.

## Proceso GitHub Actions

`.github/workflows/reel-maker-v2.yml` se ejecuta como consumidor independiente después de un `Publicar ATLAS NEWS` exitoso correspondiente al paquete editorial matutino. Reel Maker vuelve a comprobar que la edición pública correcta está disponible y regenera el contrato con `prepare-daily-contract.mjs` antes de renderizar.

Instagram Carrusel y Reel Maker comparten la misma edición web verificada como origen, pero no dependen entre sí. Un fallo de Reel Maker sólo puede dejar rojo **su propio workflow**; no revierte ni bloquea web, Audio V2 o Instagram.

En Pull Requests que modifican exclusivamente Reel Maker, el mismo workflow prueba la herramienta contra la última edición diaria ya publicada. Esto permite exigir evidencia visual y técnica antes de fusionar sin usar la edición del día como experimento.

## Dependencias

- Python 3.10+
- FFmpeg + ffprobe
- fuentes del sistema con fallback `DejaVu Serif`

No usa tokens, credenciales ni API de Meta.
