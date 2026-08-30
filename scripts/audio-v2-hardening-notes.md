# Audio V2 hardening — alcance técnico

Rama: `technical/audio-v2-hardening`
Base canónica: `37634823ce29e247db6ac9351033d213f196f5b2`

Objetivo: endurecer Audio V2 sin cambiar TTS, voces, speech normalization ni contenido editorial.

Cambios:
- Trigger automático limitado a cambios editoriales y guiones de audio; cambios técnicos del workflow/generador no se interpretan como una nueva edición sonora.
- Guard fail-closed para diálogos: cada línea útil debe comenzar con `VOZ 1:` o `VOZ 2:` y ambas voces deben participar.
- Si los MP3 siguen vigentes pero cambia el `sourceCommit` autorizado, se refrescan sólo los manifests sin ejecutar Kokoro.
- Portada y análisis verifican fecha + `sourceCommit`; Portada además verifica existencia remota del MP3.
- Writer único, lock compartido, staging, commit único y retry controlado se conservan.

Estado: implementación lógica en rama técnica. Runtime pendiente mientras GitHub Actions privadas no ejecuten runners.
