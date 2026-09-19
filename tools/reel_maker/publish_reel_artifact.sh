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

edition_number="$(jq -er '.editionNumber' "$contract")"
title="$(jq -er '.title' "$contract")"
canonical="$(jq -er '.canonicalUrl' "$contract")"
caption="$(printf 'ATLAS NEWS · EDICIÓN %s\n\n%s\n\nLee la edición completa en %s' "$edition_number" "$title" "$canonical")"

api_get() {
  local path="$1"
  curl -fsSL \
    -H "Authorization: Bearer ${INSTAGRAM_SESSION_TOKEN}" \
    -H 'User-Agent: ATLAS-NEWS-Reel/2.1' \
    "${INSTAGRAM_GRAPH_BASE}${path}"
}

find_existing_reel_once() {
  local recent
  recent="$(api_get "/${INSTAGRAM_USER_ID}/media?fields=id,permalink,media_type,timestamp,caption&limit=50")"
  printf '%s' "$recent" | python3 tools/reel_maker/reconcile_instagram_reel.py --canonical "$canonical"
}

find_existing_reel() {
  local attempts="${1:-1}"
  local candidate
  local attempt
  for attempt in $(seq 1 "$attempts"); do
    candidate="$(find_existing_reel_once)"
    if [[ -n "$candidate" ]] && [[ "$(jq -r '.permalink // empty' <<<"$candidate")" != "" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    if [[ "$attempt" -lt "$attempts" ]]; then
      sleep "$((attempt * 2))"
    fi
  done
  return 1
}

install -m 700 -d ~/.ssh
printf '%s\n' "$ATLAS_PAGES_DEPLOY_KEY" > ~/.ssh/atlas_news_pages
chmod 600 ~/.ssh/atlas_news_pages
ssh-keyscan -H github.com >> ~/.ssh/known_hosts
export GIT_SSH_COMMAND='ssh -i ~/.ssh/atlas_news_pages -o IdentitiesOnly=yes'

git clone --depth 1 --branch social-assets \
  git@github.com:Atlasnews-media/Atlasnews-media.github.io.git _social_assets
git -C _social_assets config user.name "github-actions[bot]"
git -C _social_assets config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# Git persistence is bounded to three attempts; Meta verification loops remain unchanged.\npush_social_assets_with_retry() {
  local attempt
  for attempt in 1 2 3; do
    if git -C _social_assets pull --rebase origin social-assets && \
       git -C _social_assets push origin HEAD:social-assets; then
      return 0
    fi
    git -C _social_assets rebase --abort >/dev/null 2>&1 || true
    if [[ "$attempt" -eq 3 ]]; then
      echo "No fue posible persistir social-assets tras tres intentos de conciliación." >&2
      return 1
    fi
    sleep 2
  done
}

evidence="_social_assets/instagram-reels-published/${SOURCE_COMMIT}.json"
pending="_social_assets/instagram-reels-pending/${SOURCE_COMMIT}.json"

persist_verified() {
  local media_id="$1"
  local permalink="$2"
  local published_at="$3"
  local recovery_mode="$4"

  mkdir -p _social_assets/instagram-reels-published
  jq -n \
    --arg status "PUBLISHED_VERIFIED" \
    --arg sourceCommit "$SOURCE_COMMIT" \
    --arg mediaId "$media_id" \
    --arg permalink "$permalink" \
    --arg publishedAt "$published_at" \
    --arg artifactName "$ARTIFACT_NAME" \
    --arg artifactRunId "$UPSTREAM_RUN_ID" \
    --arg mp4Sha256 "$MP4_SHA256" \
    --arg recoveryMode "$recovery_mode" \
    '{status:$status, sourceCommit:$sourceCommit, mediaId:$mediaId, permalink:$permalink, publishedAt:$publishedAt, artifactName:$artifactName, artifactRunId:$artifactRunId, mp4Sha256:$mp4Sha256, recoveryMode:$recoveryMode}' \
    > "$evidence"

  git -C _social_assets add "instagram-reels-published/${SOURCE_COMMIT}.json"
  if git -C _social_assets ls-files --error-unmatch "instagram-reels-pending/${SOURCE_COMMIT}.json" >/dev/null 2>&1; then
    rm -f "$pending"
    git -C _social_assets add -u "instagram-reels-pending/${SOURCE_COMMIT}.json"
  fi

  if ! git -C _social_assets diff --cached --quiet; then
    git -C _social_assets commit -m "instagram-reel: PUBLISHED_VERIFIED ${SOURCE_COMMIT::7}"
    push_social_assets_with_retry
  fi

  {
    echo "### F4D → F4E — PUBLISHED_VERIFIED"
    echo "Source commit: $SOURCE_COMMIT"
    echo "F4D artifact: $ARTIFACT_NAME"
    echo "F4D run: $UPSTREAM_RUN_ID"
    echo "MP4 SHA256: $MP4_SHA256"
    echo "Permalink: $permalink"
    echo "Recovery mode: $recovery_mode"
  } >> "$GITHUB_STEP_SUMMARY"
}

persist_pending() {
  local creation_id="$1"
  local video_url="$2"

  mkdir -p _social_assets/instagram-reels-pending
  jq -n \
    --arg status "PUBLISH_PENDING" \
    --arg sourceCommit "$SOURCE_COMMIT" \
    --arg canonicalUrl "$canonical" \
    --arg creationId "$creation_id" \
    --arg videoUrl "$video_url" \
    --arg artifactName "$ARTIFACT_NAME" \
    --arg artifactRunId "$UPSTREAM_RUN_ID" \
    --arg mp4Sha256 "$MP4_SHA256" \
    --arg updatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{status:$status, sourceCommit:$sourceCommit, canonicalUrl:$canonicalUrl, creationId:$creationId, videoUrl:$videoUrl, artifactName:$artifactName, artifactRunId:$artifactRunId, mp4Sha256:$mp4Sha256, updatedAt:$updatedAt}' \
    > "$pending"

  git -C _social_assets add "instagram-reels-pending/${SOURCE_COMMIT}.json"
  if ! git -C _social_assets diff --cached --quiet; then
    git -C _social_assets commit -m "instagram-reel: PUBLISH_PENDING ${SOURCE_COMMIT::7}"
    push_social_assets_with_retry
  fi
}

if [[ -f "$evidence" ]]; then
  jq -e --arg source "$SOURCE_COMMIT" \
    '.sourceCommit == $source and (.mediaId | type == "string" and length > 0) and (.permalink | type == "string" and length > 0)' \
    "$evidence" >/dev/null || {
      echo "Fail-closed: local durable evidence exists but is invalid."
      exit 74
    }
  echo "Safe no-op: Reel already published for sourceCommit=$SOURCE_COMMIT."
  exit 0
fi

# VERIFY_FIRST: recover a Meta publication even if the previous run lost its durable evidence.
if existing="$(find_existing_reel 1)"; then
  media_id="$(jq -er '.id' <<<"$existing")"
  permalink="$(jq -er '.permalink' <<<"$existing")"
  published_at="$(jq -r '.timestamp // empty' <<<"$existing")"
  [[ -n "$published_at" ]] || published_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  persist_verified "$media_id" "$permalink" "$published_at" "VERIFY_FIRST_RECOVERED"
  echo "Safe no-op: existing Instagram Reel reconciled before any Meta POST."
  exit 0
fi

creation_id=""
if [[ -f "$pending" ]]; then
  jq -e \
    --arg source "$SOURCE_COMMIT" \
    --arg canonical "$canonical" \
    --arg artifact "$ARTIFACT_NAME" \
    --arg sha "$MP4_SHA256" \
    '.status == "PUBLISH_PENDING" and .sourceCommit == $source and .canonicalUrl == $canonical and .artifactName == $artifact and .mp4Sha256 == $sha and (.creationId | type == "string" and length > 0)' \
    "$pending" >/dev/null || {
      echo "Fail-closed: PUBLISH_PENDING evidence exists but does not match the canonical F4D artifact."
      exit 75
    }

  creation_id="$(jq -er '.creationId' "$pending")"
  if state="$(api_get "/${creation_id}?fields=status_code,status")"; then
    status_code="$(jq -r '.status_code // empty' <<<"$state")"
    if [[ "$status_code" = "ERROR" || "$status_code" = "EXPIRED" ]]; then
      echo "Pending Meta container is $status_code and no published Reel was found; a replacement container is allowed."
      creation_id=""
      rm -f "$pending"
    else
      echo "Recovery: reusing pending Meta container $creation_id for sourceCommit=$SOURCE_COMMIT."
    fi
  else
    echo "Recovery: pending container status is temporarily unavailable; preserving and reusing creationId=$creation_id."
  fi
fi

stage_dir="instagram-reel-staging/${SOURCE_COMMIT}"
mkdir -p "_social_assets/${stage_dir}"
cp "$source_mp4" "_social_assets/${stage_dir}/atlas-news-reel.mp4"

git -C _social_assets add "$stage_dir/atlas-news-reel.mp4"
if ! git -C _social_assets diff --cached --quiet; then
  git -C _social_assets commit -m "social-assets: stage canonical Reel ${SOURCE_COMMIT::7}"
  push_social_assets_with_retry
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
  exit 76
}

if [[ -z "$creation_id" ]]; then
  create="$(curl -fsSL -X POST \
    -H "Authorization: Bearer ${INSTAGRAM_SESSION_TOKEN}" \
    -H 'User-Agent: ATLAS-NEWS-Reel/2.1' \
    -F 'media_type=REELS' \
    -F "video_url=${video_url}" \
    -F "caption=${caption}" \
    -F 'share_to_feed=true' \
    "${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_USER_ID}/media")"
  creation_id="$(jq -er '.id' <<<"$create")"
  persist_pending "$creation_id" "$video_url"
fi

finished=false
for attempt in $(seq 1 30); do
  if ! state="$(api_get "/${creation_id}?fields=status_code,status")"; then
    sleep 10
    continue
  fi
  status_code="$(jq -r '.status_code // empty' <<<"$state")"
  if [[ "$status_code" = "FINISHED" || -z "$status_code" ]]; then
    finished=true
    break
  fi
  if [[ "$status_code" = "ERROR" || "$status_code" = "EXPIRED" ]]; then
    if existing="$(find_existing_reel 3)"; then
      media_id="$(jq -er '.id' <<<"$existing")"
      permalink="$(jq -er '.permalink' <<<"$existing")"
      published_at="$(jq -r '.timestamp // empty' <<<"$existing")"
      [[ -n "$published_at" ]] || published_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      persist_verified "$media_id" "$permalink" "$published_at" "PENDING_CONTAINER_RECONCILED"
      exit 0
    fi
    echo "Meta Reel container failed or expired and no published Reel was found: $state"
    echo "PUBLISH_PENDING retained; next recovery must VERIFY_FIRST before replacing it."
    exit 77
  fi
  sleep 10
done
[[ "$finished" = "true" ]] || {
  echo "Meta Reel processing timeout; PUBLISH_PENDING retained for safe recovery."
  exit 78
}

publish_response="$(mktemp)"
publish_code="$(curl -sS -o "$publish_response" -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${INSTAGRAM_SESSION_TOKEN}" \
  -H 'User-Agent: ATLAS-NEWS-Reel/2.1' \
  -F "creation_id=${creation_id}" \
  "${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_USER_ID}/media_publish" || true)"

media_id=""
if [[ "$publish_code" =~ ^2[0-9][0-9]$ ]] && jq -e '.id | type == "string" and length > 0' "$publish_response" >/dev/null 2>&1; then
  media_id="$(jq -er '.id' "$publish_response")"
fi

if [[ -n "$media_id" ]]; then
  for attempt in 1 2 3 4 5 6; do
    if media="$(api_get "/${media_id}?fields=id,permalink,media_type,timestamp,caption")"; then
      permalink="$(jq -r '.permalink // empty' <<<"$media")"
      if [[ -n "$permalink" ]]; then
        published_at="$(jq -r '.timestamp // empty' <<<"$media")"
        [[ -n "$published_at" ]] || published_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        persist_verified "$media_id" "$permalink" "$published_at" "DIRECT_MEDIA_ID"
        exit 0
      fi
    fi
    sleep "$((attempt * 2))"
  done
fi

# Resultado ambiguo: never repeat media_publish blindly. Reconcile Instagram first.
if existing="$(find_existing_reel 6)"; then
  media_id="$(jq -er '.id' <<<"$existing")"
  permalink="$(jq -er '.permalink' <<<"$existing")"
  published_at="$(jq -r '.timestamp // empty' <<<"$existing")"
  [[ -n "$published_at" ]] || published_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  persist_verified "$media_id" "$permalink" "$published_at" "AMBIGUOUS_POST_RECONCILED"
  exit 0
fi

echo "Ambiguous Meta result: no verified Reel found yet."
echo "PUBLISH_PENDING retained; recovery must VERIFY_FIRST and reuse creationId=$creation_id."
exit 79
