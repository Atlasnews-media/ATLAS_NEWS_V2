# ATLAS NEWS Reel Maker V2

Reel Maker V2 es un consumidor final e independiente de una edición diaria de ATLAS NEWS **ya publicada y verificada**. Pertenece al extremo final de Fase 4 (Distribución). No publica en Instagram ni modifica Morning Package, publicación web, Audio V2 ni el carrusel automático.

## Entrada canónica

El Reel tiene un adaptador propio: `prepare_reel_contract.py`. Lee exclusivamente el frontmatter de la edición General publicada y recibe desde `status.json` el `issueNumber` ya verificado por el workflow. No consume ni modifica `tools/social-renderer`.

Contrato temporal:

```text
tools/reel_maker/.generated/reel-contract.json
```

Campos esenciales: `sourceCommit`, `sourceId`, `canonicalUrl`, `publishedDate`, `editionNumber` y exactamente cinco `highlights` (`label` + `text`).

## Plantillas oficiales

El renderer usa como bases gráficas fijas:

```text
reference-assets/01_portada_base.png
reference-assets/02_noticia_base.png
reference-assets/03_cierre_base.png
```

No rediseña la identidad. Completa únicamente los campos dinámicos previstos: edición, fecha, número 1–5, titular, texto e imagen editorial.

## Estructura fija — 7 escenas

1. Portada oficial + edición + fecha.
2. Highlight 1.
3. Highlight 2.
4. Highlight 3.
5. Highlight 4.
6. Highlight 5.
7. Cierre oficial + edición + fecha.

Las cinco noticias son exactamente los cinco `highlights` publicados. Reel Maker no investiga, completa ni sustituye contenido editorial.

## Banco visual

Para las escenas 2–6, Reel Maker reutiliza `src/lib/front-page-visuals.ts` como catálogo. Lee sus archivos y keywords, selecciona una imagen compatible con cada highlight y descarga la versión de Wikimedia Commons. Si una descarga externa falla, conserva la plantilla sin fotografía dinámica y deja evidencia en `visual-sources.json`; nunca altera la edición publicada.

## Audio

La composición usada por el artifact vive en:

```text
reference-assets/primary_assessment.mp3
```

El Reel usa el tema completo y, si la pista es más corta que el video, concatena repeticiones completas con crossfade. No usa micro-loops. La salida final exige audio AAC.

## Ritmo

Por defecto:

- portada: 5 s;
- cada noticia: 6 s;
- cierre: 5 s.

Duración total para 7 escenas: aproximadamente **40 segundos**.

## Salida

```bash
python3 tools/reel_maker/reel_maker.py \
  tools/reel_maker/.generated/reel-contract.json \
  --output-dir tools/reel_maker/output \
  --keep-plates
```

Genera:

```text
tools/reel_maker/output/atlas-news-reel-<sourceCommit>.mp4
tools/reel_maker/output/visual-validation.json
tools/reel_maker/output/visual-sources.json
tools/reel_maker/output/atlas-news-plates-<sourceCommit>/scene-01.png ... scene-07.png
```

## Validación técnica

El artifact falla si no cumple:

- exactamente 7 PNG;
- 1080 × 1920;
- H.264;
- 30 fps;
- `yuv420p`;
- audio AAC;
- edición positiva;
- cinco highlights;
- duración compatible con 5/6/6/6/6/6/5.

## Aislamiento

`.github/workflows/reel-maker-v2.yml` corre como consumidor post-publicación y también en PR para validación. Un fallo del Reel deja rojo únicamente su workflow. No revierte ni bloquea web, Audio V2, carrusel ni Instagram.

## Dependencias

- Python 3.10+
- Pillow
- FFmpeg + ffprobe
- Fontconfig + Liberation Serif

No usa tokens ni API de Meta.
