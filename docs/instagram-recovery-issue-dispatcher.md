# Instagram Recovery — Issue Dispatcher Bridge

## Estado

Diseño implementado en PR DRAFT para revisión de Integridad. No habilita ni ejecuta una recuperación hasta que el workflow sea fusionado a `main` y exista una orden humana válida.

## Objetivo

Eliminar el formulario manual de `workflow_dispatch` únicamente del camino de **RECUPERACIÓN** de Instagram, manteniendo intacto el flujo diario automático y manteniendo intacto `instagram-carousel-publish-controlled.yml`.

La orden humana mínima es un Issue nuevo, creado por el owner del repositorio, con título exacto:

`ATLAS INSTAGRAM RECOVERY YYYY-MM-DD`

El body debe estar vacío.

## Flujo

`Issue owner-only` → validación estricta → derivación de branch/contract → pre-dispatch → `workflow_dispatch` allowlisted → run controlado existente → validación posterior por Ejecutor/Control → `PUBLISHED_VERIFIED` o STOP.

## Guards obligatorios

1. **Sólo recuperación.** El bridge no modifica ni sustituye `Instagram Carousel — Automatic post-publish`.
2. **Trigger cerrado.** Sólo `issues: opened`; el job corre únicamente si `github.event.issue.user.login == github.repository_owner`.
3. **Workflow fijo.** El Issue no puede elegir workflow. El único destino es `instagram-carousel-publish-controlled.yml`.
4. **Input no confiable.** El body debe estar vacío. El título sólo se lee desde una variable de entorno y debe coincidir exactamente con la regex de fecha; no se usa `eval` ni se interpola contenido libre en comandos.
5. **Orden humana mínima.** Sólo fecha. El branch se deriva como `run/instagram-YYYY-MM-DD`; el contrato se deriva buscando exactamente un `tools/social-renderer/contracts/YYYY-MM-DD-daily-*.json` en esa rama. `publication_status`, `publish_confirmation` y `api_version` están hardcoded/allowlisted.
6. **Sin secretos de publicación.** El bridge no recibe `INSTAGRAM_ACCESS_TOKEN` ni `ATLAS_PAGES_DEPLOY_KEY`. Permisos: `actions: write` + `contents: read` únicamente.
7. **Pre-dispatch completo.** Confirma rama, contrato único, sourceCommit/sourceId coherentes, canonical HTTPS de la edición con HTTP 200, ausencia de evidencia `PUBLISHED_VERIFIED` para la canonical y ausencia de otro run controlado queued/in_progress/waiting/requested para la misma rama.
8. **Idempotencia.** `GITHUB_RUN_ATTEMPT != 1` falla cerrado. Un bridge previo exitoso con la misma fecha bloquea una nueva orden. Concurrency se fija por número de Issue. No existe rerun automático.
9. **Workflow controlado intacto.** El bridge sólo lo invoca con sus cuatro inputs existentes; no modifica sus gates, secrets, renderer, staging, validación 5/5 ni publicación Meta.
10. **Trazabilidad.** El bridge resuelve y deja en Step Summary: Issue, actor, fecha, branch, contrato y controlled run ID. El cierre operacional posterior debe enlazar ese run con permalink + `PUBLISHED_VERIFIED`, o registrar STOP.

## Fail-closed

El bridge termina sin dispatch ante cualquiera de estas condiciones:

- actor distinto del owner;
- body no vacío;
- título fuera del schema exacto;
- fecha inválida;
- rerun del bridge;
- branch inexistente;
- cero o más de un contrato diario para la fecha;
- canonical/sourceId/sourceCommit incoherentes;
- canonical no pública con HTTP 200;
- evidencia previa `PUBLISHED_VERIFIED` para la canonical;
- otro controlled run activo para la rama;
- orden previa de bridge ya despachada con éxito;
- imposibilidad de resolver el controlled run ID luego de que GitHub acepte el dispatch.

## Evidencia de publicación previa

Se inspecciona el branch público `social-assets` de `EldeSiempre100/EldeSiempre100.github.io` y se buscan `instagram-publish.json`. Se considera publicación existente sólo si el JSON tiene simultáneamente:

- `status == "PUBLISHED_VERIFIED"`;
- `canonicalUrl` igual a la canonical del contrato;
- `permalink` de `https://www.instagram.com/...`.

El bridge no consulta Meta y no necesita credenciales de Meta.

## Límites

- No publica por sí mismo.
- No hace retry del controlled workflow.
- No crea assets.
- No toca el flujo diario automático.
- No tiene acceso a secretos Meta/deploy.
- No cierra el Issue ni escribe comentarios porque deliberadamente no tiene `issues: write`.
- El resultado final `PUBLISHED_VERIFIED`/STOP sigue siendo certificado por el workflow controlado y por el Ejecutor/Control.

## Prueba prevista tras GO de Integridad

Después de merge y sólo con autorización explícita:

1. crear un único Issue válido para una recuperación preparada;
2. comprobar que el bridge produce un solo dispatch;
3. comprobar run ID y rama correctos;
4. verificar que los cuatro inputs coinciden con los valores allowlisted;
5. seguir el controlled workflow hasta 5/5 → Meta → permalink → `PUBLISHED_VERIFIED`, o STOP;
6. confirmar que no existe segundo dispatch ni rerun.

No ejecutar esta prueba desde el PR DRAFT.
