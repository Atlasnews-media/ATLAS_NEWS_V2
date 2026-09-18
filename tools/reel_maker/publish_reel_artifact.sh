#!/usr/bin/env bash
set -euo pipefail

: "${SOURCE_COMMIT:?SOURCE_COMMIT required}"
: "${REEL_DIR:?REEL_DIR required}"
: "${MP4_FILE:?MP4_FILE required}"
: "${MP4_SHA256:?MP4_SHA256 required}"
: "${UPSTREAM_RUN_ID:?UPSTREAM_RUN_ID required}"
: "${ARTIFACT_NAME:?ARTIFACT_NAME required}"
: "${ATLAS_PAGES_DEPLOY_KEY:?ATLAS_PAGES_DEPLOY_KEY required}"
: "${INSTAGRAM_SESSION_TOKEN:?INSTAGRAM_SESSION_TOKEN required}"
: "${INSTAGRAM_GRAPH_BASE:?INSTAGRAM_GRAPH_BASE required}"
: "${INSTAGRAM_USER_ID:?INSTAGRAM_USER_ID required}"
: "${INSTAGRAM_USERNAME:?INSTAGRAM_USERNAME required}"
: "${INSTAGRAM_EXPECTED_USERNAME:?INSTAGRAM_EXPECTED_USERNAME required}"

[[ "$INSTAGRAM_USERNAME" = "$INSTAGRAM_EXPECTED_USERNAME" ]] || {
  echo "BLOCKED_EXTERNAL: wrong Instagram account $INSTAGRAM_USERNAME."
  exit 70
}

source_mp4="${REEL_DIR}/${MP4_FILE}"
contract="${REEL_DIR}/reel-contract.json"
test -s "$source_mp4" || { echo "Fail-closed: canonical MP4 missing."; exit 71; }
test -f "$contract" || { echo "Fail-closed: canonical Reel contract missing."; exit 72; }
[[ "$(sha256sum "$source_mp4" | awk '{print $1}')" = "$MP4_SHA256" ]] || {
  echo "Fail-closed: artifact MP4 changed before F4E staging."
  exit 73
}

install -m 700 -d ~/.ssh
printf '%s\n' "$ATLAS_PAGES_DEPLOY_KEY" > ~/.ssh/atlas_news_pages
chmod 600 ~/.ssh/atlas_news_pages
ssh-keyscan -H github.com >> ~/.ssh/known_hosts
export GIT_SSH_COMMAND='ssh -i ~/.ssh/atlas_news_pages -o IdentitiesOnly=yes'

git clone --depth 1 --branch social-assets   git@github.com:Atlasnews-media/Atlasnews-media.github.io.git _social_assets
git -C _social_assets config user.name "github-actions[bot]"
git -C _social_assets config user.email "41898282+github-actions[bot]@users.noreply.github.com"

evidence="_social_assets/instagram-reels-published/${SOURCE_COMMIT}.json"
if [[ -f "$evidence" ]]; then
  jq -e --arg source "$SOURCE_COMMIT"     '.sourceCommit == $source and (.mediaId | type == "string" and length > 0) and (.permalink | type == "string" and length > 0)'     "$evidence" >/dev/null || {
      echo "Fail-closed: local durable evidence exists but is invalid."
      exit 74
    }
  echo "Safe no-op: Reel already published for sourceCommit=$SOURCE_COMMIT."
  exit 0
fi

stage_dir="instagram-reel-staging/${SOURCE_COMMIT}"
mkdir -p "_social_assets/${stage_dir}"
cp "$source_mp4" "_social_assets/${stage_dir}/atlas-news-reel.mp4"

git -C _social_assets add "$stage_dir/atlas-news-reel.mp4"
if ! git -C _social_assets diff --cached --quiet; then
  git -C _social_assets commit -m "social-assets: stage canonical Reel ${SOURCE_COMMIT::7}"
  git -C _social_assets push origin HEAD:social-assets
fi

video_url="https://raw.githubusercontent.com/Atlasnews-media/Atlasnews-media.github.io/social-assets/${stage_dir}/atlas-news-reel.mp4"
ready=false
for attempt in 1 2 3 4 5 6; do
  tmp="$(mktemp --suffix=.mp4)"
  code="$(curl -L -sS -o "$tmp" -w '%{http_code}' "$video_url" || true)"
  mime="$(file -b --mime-type "$tmp" 2>/dev/null || true)"
  staged_sha="$(sha256sum "$tmp" 2>/dev/null | awk '{print $1}' || true)"
  if [[ "$code" = "200" && "$mime" = "video/mp4" && "$staged_sha" = "$MP4_SHA256" ]]; then
    ready=true
    break
  fi
  sleep $((attempt * 2))
done
[[ "$ready" = "true" ]] || {
  echo "Fail-closed: staged MP4 is not fetchable with exact F4D SHA256."
  exit 75
}

api_get() {
  local path="$1"
  curl -fsSL     -H "Authorization: Bearer ${INSTAGRAM_SESSION_TOKEN}"     -H 'User-Agent: ATLAS-NEWS-Reel/2.0'     "${INSTAGRAM_GRAPH_BASE}${path}"
}

edition_number="$(jq -er '.editionNumber' "$contract")"
title="$(jq -er '.title' "$contract")"
canonical="$(jq -er '.canonicalUrl' "$contract")"
caption="$(printf 'ATLAS NEWS · EDICIÓN %s\n\n%s\n\nLee la edición completa en %s' "$edition_number" "$title" "$canonical")"

create="$(curl -fsSL -X POST   -H "Authorization: Bearer ${INSTAGRAM_SESSION_TOKEN}"   -H 'User-Agent: ATLAS-NEWS-Reel/2.0'   -F 'media_type=REELS'   -F "video_url=${video_url}"   -F "caption=${caption}"   -F 'share_to_feed=true'   "${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_USER_ID}/media")"
creation_id="$(jq -er '.id' <<<"$create")"

finished=false
for attempt in $(seq 1 30); do
  state="$(api_get "/${creation_id}?fields=status_code,status")"
  status_code="$(jq -r '.status_code // empty' <<<"$state")"
  if [[ "$status_code" = "FINISHED" ]]; then
    finished=true
    break
  fi
  if [[ "$status_code" = "ERROR" || "$status_code" = "EXPIRED" ]]; then
    echo "Meta Reel container failed: $state"
    exit 76
  fi
  sleep 10
done
[[ "$finished" = "true" ]] || { echo "Meta Reel processing timeout"; exit 77; }

published="$(curl -fsSL -X POST   -H "Authorization: Bearer ${INSTAGRAM_SESSION_TOKEN}"   -H 'User-Agent: ATLAS-NEWS-Reel/2.0'   -F "creation_id=${creation_id}"   "${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_USER_ID}/media_publish")"
media_id="$(jq -er '.id' <<<"$published")"
media="$(api_get "/${media_id}?fields=id,permalink,media_type,timestamp,caption")"
permalink="$(jq -er '.permalink' <<<"$media")"

mkdir -p _social_assets/instagram-reels-published
jq -n   --arg status "PUBLISHED_VERIFIED"   --arg sourceCommit "$SOURCE_COMMIT"   --arg mediaId "$media_id"   --arg permalink "$permalink"   --arg publishedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)"   --arg artifactName "$ARTIFACT_NAME"   --arg artifactRunId "$UPSTREAM_RUN_ID"   --arg mp4Sha256 "$MP4_SHA256"   '{status:$status, sourceCommit:$sourceCommit, mediaId:$mediaId, permalink:$permalink, publishedAt:$publishedAt, artifactName:$artifactName, artifactRunId:$artifactRunId, mp4Sha256:$mp4Sha256}'   > "_social_assets/instagram-reels-published/${SOURCE_COMMIT}.json"

git -C _social_assets add "instagram-reels-published/${SOURCE_COMMIT}.json"
git -C _social_assets commit -m "instagram-reel: PUBLISHED_VERIFIED ${SOURCE_COMMIT::7}"
git -C _social_assets push origin HEAD:social-assets

{
  echo "### F4D → F4E — PUBLISHED_VERIFIED"
  echo "Source commit: $SOURCE_COMMIT"
  echo "F4D artifact: $ARTIFACT_NAME"
  echo "F4D run: $UPSTREAM_RUN_ID"
  echo "MP4 SHA256: $MP4_SHA256"
  echo "Permalink: $permalink"
} >> "$GITHUB_STEP_SUMMARY"
