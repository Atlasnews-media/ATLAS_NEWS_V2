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

## Audio — rotación determinista

El catálogo autorizado vive en `reference-assets` y contiene cinco pistas:

```text
primary_assessment.mp3
architect_of_momentum.mp3
market_intelligence.mp3
midnight_exchange.mp3
the_morning_brief.mp3
```

La regla canónica es `audio-rotation-v1`. La selección no es aleatoria ni depende de ejecuciones previas: se calcula por `editionNumber` con `(editionNumber - 41) mod 5`.

```text
041 → primary_assessment.mp3
042 → architect_of_momentum.mp3
043 → market_intelligence.mp3
044 → midnight_exchange.mp3
045 → the_morning_brief.mp3
046 → primary_assessment.mp3
```

Por lo tanto, una misma edición siempre selecciona la misma pista y las ediciones consecutivas no repiten mientras la numeración sea consecutiva. La edición 041 conserva `primary_assessment.mp3`, preservando el comportamiento validado previamente.

Antes de renderizar, Reel Maker valida la pista seleccionada con `ffprobe`. Si falta o no es decodificable, usa `primary_assessment.mp3` como fallback técnico. Si el fallback también falla, el Reel falla cerrado. El parámetro `--music` queda reservado como override explícito de operador/prueba y no participa en la rotación automática.

Si la pista es más corta que el Reel, el renderer repite la canción completa y une cada repetición con crossfade de 0,9 s; no usa micro-loops. El audio se remuestrea a 48 kHz, se ajusta a volumen 0,84, se recorta a la duración exacta, incorpora fade-in/fade-out y se codifica a AAC.

La evidencia `visual-validation.json` registra la identidad sonora exacta:

```text
audio.selectorVersion
audio.selectedTrack
audio.resolvedTrack
audio.trackSha256
audio.selectionEdition
audio.fallbackUsed
audio.sourceDuration
audio.crossfadeSeconds
audio.outputCodec
```

`selectedTrack` registra lo que decidió la regla; `resolvedTrack` registra lo que finalmente se utilizó. Así un fallback queda auditable sin perder la decisión original.

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
- duración compatible con 5/6/6/6/6/6/5;
- pista resuelta válida y trazable mediante SHA-256;
- metadata `audio-rotation-v1` coherente con la edición.

## Aislamiento

`.github/workflows/reel-maker-v2.yml` corre como consumidor post-publicación y también en PR para validación. Un fallo del Reel deja rojo únicamente su workflow. No revierte ni bloquea web, Audio V2, carrusel ni Instagram.

## Dependencias

- Python 3.10+
- Pillow
- FFmpeg + ffprobe
- Fontconfig + Liberation Serif

No usa tokens ni API de Meta.
