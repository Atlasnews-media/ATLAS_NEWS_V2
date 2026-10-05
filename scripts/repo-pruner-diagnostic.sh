#!/usr/bin/env bash
set -euo pipefail

inactive_days="${1:-30}"
if ! [[ "$inactive_days" =~ ^[0-9]+$ ]] || [ "$inactive_days" -le 0 ]; then
  echo "inactive_days must be a positive integer" >&2
  exit 2
fi

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"

repo="$GITHUB_REPOSITORY"
now_epoch="$(date -u +%s)"
threshold_epoch="$(date -u -d "$inactive_days days ago" +%s)"
run_url="${GITHUB_SERVER_URL:-https://github.com}/$repo/actions/runs/${GITHUB_RUN_ID:-unknown}"

echo "Collecting every branch with GitHub pagination..."
gh api --paginate "repos/$repo/branches?per_page=100" | jq -c '.[]' > /tmp/branches.jsonl
branch_count="$(wc -l < /tmp/branches.jsonl | tr -d ' ')"
echo "Branches discovered: $branch_count"

echo "Collecting pull requests for branch references..."
gh api --paginate "repos/$repo/pulls?state=all&per_page=100&sort=updated&direction=desc" | jq -c '.[]' > /tmp/pulls.jsonl
jq -s '
  sort_by(.updated_at) | reverse |
  reduce .[] as $pr ({};
    if has($pr.head.ref) then .
    else .[$pr.head.ref] = {
      number: $pr.number,
      state: $pr.state,
      merged_at: $pr.merged_at,
      html_url: $pr.html_url,
      updated_at: $pr.updated_at
    }
    end
  )
' /tmp/pulls.jsonl > /tmp/pr-map.json

printf '[]\n' > /tmp/inactive.json
protected_count=0
inactive_count=0
merged_count=0
unmerged_count=0

while IFS= read -r branch_json; do
  name="$(jq -r '.name' <<<"$branch_json")"
  sha="$(jq -r '.commit.sha' <<<"$branch_json")"
  protected="$(jq -r '.protected' <<<"$branch_json")"

  if [ "$protected" = "true" ]; then
    protected_count=$((protected_count + 1))
    continue
  fi

  if ! git cat-file -e "$sha^{commit}" 2>/dev/null; then
    echo "Fetching missing commit for $name ($sha)"
    git fetch --quiet origin "$sha" || true
  fi

  last_iso="$(git show -s --format=%aI "$sha" 2>/dev/null || true)"
  if [ -z "$last_iso" ]; then
    echo "WARNING: no commit date for $name; skipping"
    continue
  fi

  last_epoch="$(date -u -d "$last_iso" +%s)"
  if [ "$last_epoch" -ge "$threshold_epoch" ]; then
    continue
  fi

  age_days=$(( (now_epoch - last_epoch) / 86400 ))
  author="$(git show -s --format='%an <%ae>' "$sha" 2>/dev/null || echo unknown)"

  if git merge-base --is-ancestor "$sha" origin/main 2>/dev/null; then
    merged_into_main=true
    merged_count=$((merged_count + 1))
  else
    merged_into_main=false
    unmerged_count=$((unmerged_count + 1))
  fi

  pr_json="$(jq -c --arg name "$name" '.[$name] // null' /tmp/pr-map.json)"
  pr_number="$(jq -r 'if . == null then "" else (.number|tostring) end' <<<"$pr_json")"
  pr_url="$(jq -r 'if . == null then "" else (.html_url // "") end' <<<"$pr_json")"
  pr_state="$(jq -r 'if . == null then "" else (.state // "") end' <<<"$pr_json")"
  pr_merged="$(jq -r 'if . == null then false else (.merged_at != null) end' <<<"$pr_json")"

  row="$(jq -n \
    --arg name "$name" \
    --arg sha "$sha" \
    --arg last_commit "$last_iso" \
    --argjson age_days "$age_days" \
    --arg author "$author" \
    --argjson merged_into_main "$merged_into_main" \
    --arg pr_number "$pr_number" \
    --arg pr_url "$pr_url" \
    --arg pr_state "$pr_state" \
    --argjson pr_merged "$pr_merged" \
    '{name:$name,sha:$sha,last_commit:$last_commit,age_days:$age_days,author:$author,merged_into_main:$merged_into_main,pr_number:$pr_number,pr_url:$pr_url,pr_state:$pr_state,pr_merged:$pr_merged}')"

  jq --argjson row "$row" '. + [$row]' /tmp/inactive.json > /tmp/inactive.next.json
  mv /tmp/inactive.next.json /tmp/inactive.json
  inactive_count=$((inactive_count + 1))
done < /tmp/branches.jsonl

jq 'sort_by(.age_days) | reverse' /tmp/inactive.json > /tmp/inactive.sorted.json
mv /tmp/inactive.sorted.json /tmp/inactive.json

{
  echo "# Repo Pruner — diagnóstico paginado de ramas"
  echo
  echo "- Repositorio: \`$repo\`"
  echo "- Umbral de inactividad: **$inactive_days días**"
  echo "- Ramas detectadas: **$branch_count**"
  echo "- Ramas protegidas omitidas: **$protected_count**"
  echo "- Ramas inactivas: **$inactive_count**"
  echo "- Inactivas ya integradas en \`main\`: **$merged_count**"
  echo "- Inactivas con cambios no contenidos en \`main\`: **$unmerged_count**"
  echo "- Run: $run_url"
  echo
  echo "> Diagnóstico solamente: este workflow no elimina ramas ni modifica código de producción."
  echo
  echo "| Rama | Días | Último commit | En main | PR más reciente |"
  echo "|---|---:|---|:---:|---|"

  jq -r '.[] | [
    ("`" + .name + "`"),
    (.age_days|tostring),
    (.last_commit[0:10]),
    (if .merged_into_main then "Sí" else "No" end),
    (if .pr_number == "" then "—" else ("[#" + .pr_number + "](" + .pr_url + ")" + (if .pr_merged then " · merged" else " · " + .pr_state end)) end)
  ] | "| " + join(" | ") + " |"' /tmp/inactive.json
} > /tmp/repo-pruner-body.md

gh label create "Repo Pruner Summary" --repo "$repo" --color "ededed" --description "Resumen de diagnóstico de ramas inactivas" --force >/dev/null 2>&1 || true
while IFS= read -r issue_number; do
  [ -n "$issue_number" ] || continue
  gh issue close "$issue_number" --repo "$repo" --comment "Superseded by a newer paginated Repo Pruner diagnostic run." >/dev/null || true
done < <(gh issue list --repo "$repo" --state open --label "Repo Pruner Summary" --limit 100 --json number --jq '.[].number')

issue_url="$(gh issue create \
  --repo "$repo" \
  --title "Repo Pruner: Inactive Branches Summary (paginated)" \
  --label "Repo Pruner Summary" \
  --body-file /tmp/repo-pruner-body.md)"
issue_number="${issue_url##*/}"

{
  echo "# Diagnóstico de ramas"
  echo
  echo "- Repositorio: \`$repo\`"
  echo "- Issue resumen: [#$issue_number]($issue_url)"
  echo "- GitHub Actions run: $run_url"
  echo "- Generado: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "---"
  echo
  cat /tmp/repo-pruner-body.md
} > diagnostico-ramas.md

echo "Diagnostic completed: $branch_count branches scanned, $inactive_count inactive."
echo "Issue: $issue_url"
