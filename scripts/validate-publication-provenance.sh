#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "[publication-integrity] Entorno local: gate de procedencia omitido."
  exit 0
fi

event_name="${GITHUB_EVENT_NAME:-}"
ref="${GITHUB_REF:-}"

if [[ "$event_name" == "pull_request" ]]; then
  echo "[publication-integrity] PR: la procedencia se valida antes del merge; no hay publicación."
  exit 0
fi

if [[ "$event_name" != "push" && "$event_name" != "workflow_dispatch" ]]; then
  echo "::error title=Publicación bloqueada::Evento no autorizado para publicación: ${event_name:-desconocido}." >&2
  exit 1
fi

if [[ "$ref" != "refs/heads/main" ]]; then
  echo "::error title=Publicación bloqueada::La publicación solo puede originarse desde main; ref recibida: ${ref:-vacía}." >&2
  exit 1
fi

committer_name="$(git log -1 --format=%cn)"
committer_email="$(git log -1 --format=%ce)"

if [[ "$committer_name" != "GitHub" || "$committer_email" != "noreply@github.com" ]]; then
  echo "::error title=Publicación bloqueada::El HEAD de main no proviene de un merge ejecutado por GitHub. Committer: ${committer_name:-desconocido} <${committer_email:-sin-email}>. Los pushes directos pueden existir temporalmente mientras no haya Ruleset administrativo, pero no pueden desplegar ATLAS NEWS; deben quedar cubiertos por un PR validado y fusionado." >&2
  exit 1
fi

echo "[publication-integrity] Procedencia autorizada: $committer_name <$committer_email> sobre main."
