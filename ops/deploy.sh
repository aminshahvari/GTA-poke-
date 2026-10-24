#!/usr/bin/env bash
# Activate a release that the deploy workflow has rsynced to /srv/blindrise/releases/<sha>.
#   sudo bash ops.sh deploy <sha>      npm ci, switch `current`, restart, wait for health; on failure roll back
#   sudo bash ops.sh rollback          switch back to the release recorded as previous
# Exit 0 only when the requested release is live and healthy. A failed deploy that rolled back exits 1 too.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:$APP_PORT/healthz}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-90}
KEEP_RELEASES=${KEEP_RELEASES:-5}
SYSTEMCTL=${SYSTEMCTL:-systemctl}     # ops/test/local-e2e.sh swaps in a fake for local runs
NPM_CACHE=${NPM_CACHE:-/var/cache/blindrise-npm}
T0=$(now_ms)
install -d -m 750 "$BR_STATE"

current_sha(){ [[ -L $BR_CURRENT ]] && basename "$(readlink "$BR_CURRENT")" || true; }
switch_to(){ # sha: atomic symlink swap
  ln -sfn "$BR_RELEASES/$1" "$BR_CURRENT.tmp"; mv -fT "$BR_CURRENT.tmp" "$BR_CURRENT"
}
healthy(){ # -> prints "ms" ; checks /healthz 200 + ok:true + postgres mode, then the root page
  local t body
  t=$(wait_http "$HEALTH_URL" "$HEALTH_TIMEOUT") || { echo "$t"; return 1; }
  body=$(curl -s --max-time 5 "$HEALTH_URL")
  [[ $(jq -r '.ok' <<<"$body" 2>/dev/null) == true ]] || { echo "$t"; return 1; }
  [[ ${EXPECT_MODE:-postgres} == any || $(jq -r '.mode' <<<"$body") == "${EXPECT_MODE:-postgres}" ]] || { echo "$t"; return 1; }
  [[ $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${HEALTH_URL%/healthz}/") == 200 ]] || { echo "$t"; return 1; }
  echo "$t"
}
health_line(){ curl -s --max-time 5 "$HEALTH_URL" | jq -c '{ok, mode, epoch, leaseLost, dirty, lastWriteError: (.lastWriteError != null)}' 2>/dev/null || echo unreachable; }
restart(){ "$SYSTEMCTL" restart "$SERVICE"; }

MODE=${1:-}
if [[ $MODE == --rollback ]]; then
  PREV=$(kv_get "$BR_STATE/releases" previous)
  [[ -n $PREV && -d $BR_RELEASES/$PREV ]] || die "no previous release recorded"
  FROM=$(current_sha)
  log "rollback: ${FROM:0:12} -> ${PREV:0:12}"
  switch_to "$PREV"; restart
  if HMS=$(healthy); then OK=1; else OK=0; fi
  [[ $OK == 1 ]] && { kv_set "$BR_STATE/releases" current "$PREV"; kv_set "$BR_STATE/releases" previous "$FROM"; }
  summary_begin "rollback: $([[ $OK == 1 ]] && echo OK || echo FAILED)"
  row "now live" "${PREV:0:12}"; row "was" "${FROM:0:12}"; row "healthy after" "$HMS ms"; row "health" "$(health_line)"
  summary_end
  [[ $OK == 1 ]]; exit
fi

SHA=$MODE
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || die "usage: deploy.sh <40-char sha> | --rollback"
REL=$BR_RELEASES/$SHA
[[ -f $REL/server/index.js && -f $REL/package-lock.json ]] || die "release $SHA is not uploaded (no server/index.js or package-lock.json)"
PREV=$(current_sha)

log "npm ci --omit=dev in releases/${SHA:0:12}"
N0=$(now_ms)
( cd "$REL" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error --cache "$NPM_CACHE" ) >/dev/null
NPM_MS=$(( $(now_ms) - N0 ))
echo "RENDER_GIT_COMMIT=$SHA" > "$REL/.release.env"
printf 'sha=%s\ndeployed_at=%s\n' "$SHA" "$(date -u +%FT%TZ)" > "$REL/RELEASE"
[[ $(id -u) -eq 0 ]] && chown -R root:root "$REL" && chmod -R go-w "$REL"

log "switch current -> ${SHA:0:12} (previous ${PREV:-none})"
switch_to "$SHA"
restart
if HMS=$(healthy); then
  RESULT=deployed
  kv_set "$BR_STATE/releases" current "$SHA"
  [[ -n $PREV && $PREV != "$SHA" ]] && kv_set "$BR_STATE/releases" previous "$PREV"
else
  RESULT="FAILED (no healthy answer within ${HEALTH_TIMEOUT} s)"
  if [[ -n $PREV && $PREV != "$SHA" && -d $BR_RELEASES/$PREV ]]; then
    warn "health check failed: rolling back to ${PREV:0:12}"
    switch_to "$PREV"; restart
    if RB=$(healthy); then RESULT="$RESULT; ROLLED BACK to ${PREV:0:12}, healthy after $RB ms"
    else RESULT="$RESULT; ROLLBACK to ${PREV:0:12} ALSO UNHEALTHY"; fi
  else
    RESULT="$RESULT; nothing to roll back to"
  fi
fi

# keep the newest $KEEP_RELEASES releases, never the live or the previous one
LIVE=$(current_sha); PREVREC=$(kv_get "$BR_STATE/releases" previous)
mapfile -t OLD < <(find "$BR_RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' | sort -rn | awk '{print $2}' | tail -n +$((KEEP_RELEASES + 1)))
PRUNED=0
for r in "${OLD[@]}"; do [[ $r == "$LIVE" || $r == "$PREVREC" ]] && continue; rm -rf "${BR_RELEASES:?}/$r"; PRUNED=$((PRUNED + 1)); done

summary_begin "deploy: ${RESULT%% *}"
row "requested" "${SHA:0:12}"
row "result" "$RESULT"
row "live release" "$(c=$(current_sha); echo "${c:0:12}")"
row "previous release" "$(p=$(kv_get "$BR_STATE/releases" previous); echo "${p:0:12}")"
row "npm ci" "$NPM_MS ms"
row "healthy after" "${HMS:-?} ms"
row "health" "$(health_line)"
row "service" "$("$SYSTEMCTL" is-active "$SERVICE" 2>/dev/null || true)"
row "releases kept / pruned" "$(find "$BR_RELEASES" -mindepth 1 -maxdepth 1 -type d | wc -l) / $PRUNED"
row "took" "$(( $(now_ms) - T0 )) ms"
summary_end
[[ $RESULT == deployed ]]
