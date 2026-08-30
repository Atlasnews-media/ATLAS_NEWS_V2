# ATLAS NEWS — Clasificación DR post-contingencia — 2026-08-30

Estado: PREPARADO / NO PROMOVER AÚN

Este documento clasifica los mecanismos de contingencia existentes. No autoriza borrado, desactivación ni promoción mientras no se cierre P0.5 Return to Normal y la ventana de contingencia del 31 de agosto.

## Principio objetivo

Tras recuperar el path NORMAL, ATLAS NEWS debe conservar un DR mínimo y entendible: un mecanismo web y un mecanismo audio, con evidencia verificable, sin duplicar writers automáticos ni depender de infraestructura que no pueda acceder al repositorio privado.

## Clasificación

### 1. atlas-news-emergency-artifact.yml

Clasificación actual: KEEP — candidato a DR WEB canónico.

Razones:
- opera íntegramente desde el repositorio público;
- recibe un artefacto Astro ya validado y fijado a source_sha;
- exige Morning Package 3/3 y sourceCommit exacto;
- sincroniza sólo superficies afectadas;
- preserva audio y funds;
- verifica commit remoto, Pages y rutas públicas;
- existe evidencia real de ejecución exitosa el 2026-08-30, run 33312353972.

Condición para consolidar: revalidar después de Return to Normal y documentar el procedimiento de activación.

### 2. atlas-news-emergency-audio-synthesis.yml

Clasificación actual: KEEP — candidato a DR AUDIO canónico.

Razones:
- sintetiza Portada + Nacional + Mercados usando Kokoro canónico;
- consume bundle y generador fijados por SHA/blob;
- es idempotente si manifests ya coinciden con sourceCommit/date;
- verifica manifests y MP3 antes y después de publicar;
- publica audio en un único commit;
- existe evidencia real de ejecución exitosa el 2026-08-30, run 33312433811.

Condición para consolidar: revalidar después de Return to Normal y confirmar compatibilidad con el hardening final de Audio V2.

### 3. atlas-news-emergency-audio-artifact.yml

Clasificación actual: EVIDENCE ONLY / REDUNDANT CANDIDATE.

Razones:
- publica manifests y MP3 ya producidos fuera de GitHub;
- valida sourceCommit/date y tamaño mínimo de MP3;
- no sintetiza ni reconstruye por sí mismo;
- funcionalmente queda cubierto por el DR audio synthesis cuando existe bundle canónico y capacidad de síntesis.

No borrar aún. Mantener hasta cerrar P0.5, validar el DR audio canónico y preservar evidencia histórica.

### 4. atlas-news-emergency.yml

Clasificación actual: EVIDENCE ONLY / BROKEN AS PRIMARY DR.

Razones:
- intenta hacer checkout del repositorio privado desde el repositorio público;
- depende de ATLAS_NEWS_RECOVERY_TOKEN o de un fallback de credenciales;
- la contingencia real del 30 de agosto demostró que la ruta útil fue artifact web + audio synthesis, no este runner genérico;
- duplica responsabilidades de web + audio en un flujo de hasta 45 minutos.

No borrar aún. Conservar como evidencia hasta finalizar Return to Normal y registrar por qué fue reemplazado.

## Estado objetivo después de P0.5

- DR WEB: atlas-news-emergency-artifact.yml
- DR AUDIO: atlas-news-emergency-audio-synthesis.yml
- atlas-news-emergency-audio-artifact.yml: retirar sólo tras evidencia equivalente y preservación histórica.
- atlas-news-emergency.yml: retirar sólo tras evidencia equivalente y preservación histórica.

## Gates antes de cualquier eliminación

1. Un ciclo NORMAL completo debe ejecutarse sin intervención extraordinaria.
2. PR de CI-cost debe estar validado e integrado.
3. Audio V2 hardening debe estar validado e integrado o su compatibilidad DR demostrada.
4. DR web y DR audio deben tener una prueba controlada posterior a Return to Normal.
5. Debe registrarse evidencia de run, sourceCommit, public commit, rollback y clasificación final.
6. Sólo después se autoriza eliminar mecanismos redundantes.

## Regla de seguridad

Hasta completar los gates anteriores: NO DELETE / NO DISABLE / NO MERGE de cambios destructivos de contingencia.
