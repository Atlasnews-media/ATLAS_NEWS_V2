#!/usr/bin/env bash
set -euo pipefail

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
remote="$tmp/remote.git"
git init --bare --initial-branch=main "$remote" >/dev/null

git clone "$remote" "$tmp/seed" >/dev/null 2>&1
cd "$tmp/seed"
git config user.name seed
git config user.email seed@example.invalid
mkdir -p audio lab/radar-editorial
printf 'keep\n' > audio/keep.txt
printf '{"base":true}\n' > lab/radar-editorial/latest.json
git add audio/keep.txt lab/radar-editorial/latest.json
git commit -m base >/dev/null
git push origin main >/dev/null 2>&1

cd "$tmp"
git clone "$remote" radar >/dev/null 2>&1
git clone "$remote" other >/dev/null 2>&1

cd "$tmp/other"
git config user.name other
git config user.email other@example.invalid
printf 'concurrent\n' > audio/concurrent.txt
git add -- audio/concurrent.txt
git commit -m concurrent >/dev/null
git push origin main >/dev/null 2>&1

cd "$tmp/radar"
git config user.name radar
git config user.email radar@example.invalid
printf '{"radar":true}\n' > lab/radar-editorial/latest.json
git add -- lab/radar-editorial/latest.json
git commit -m radar >/dev/null

for attempt in 1 2 3; do
  if git pull --rebase origin main >/dev/null 2>&1 && git push origin main >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 3 ]]; then
    echo "CASE E FAIL: no convergence after 3 attempts" >&2
    exit 1
  fi
done

git fetch origin main >/dev/null 2>&1
test "$(git show origin/main:audio/concurrent.txt)" = "concurrent"
test "$(git show origin/main:lab/radar-editorial/latest.json)" = '{"radar":true}'
echo "CASE E CONCURRENCY: PASS"
