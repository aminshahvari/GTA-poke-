#!/usr/bin/env bash
# Restore rehearsal: prove the newest backup can be restored and the app runs on it, without touching the live DB.
#   sudo bash ops.sh restore-rehearsal            (REHEARSAL_FRESH=1 takes a new backup first)
# 1. restore the newest dump into a SEPARATE scratch container (own random password, data on tmpfs, 127.0.0.1 only)
# 2. verify: kv row count equals the source's count at dump time (recorded in the same snapshot by backup.sh);
#    a random sample of keys matches by md5 of the value; the full (key, hash) manifest digest matches
# 3. boot the app from /srv/blindrise/current against the restored DB on another port (no push, no beacon), wait
#    for /healthz 200 and the root page 200, and check it loaded the same number of keys
# 4. print PASS/FAIL with timings, then tear everything down (always, also on failure)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
SCRATCH=${REHEARSAL_CONTAINER:-blindrise-rehearsal-pg}
SCRATCH_PORT=${REHEARSAL_PG_PORT:-55432}
APP_TEST_PORT=${REHEARSAL_APP_PORT:-3999}
APP_DIR=${APP_DIR:-$BR_CURRENT}
RUN_AS=${RUN_AS-blindrise}          # empty: run the app as the current user (local tests)
SAMPLE=${REHEARSAL_SAMPLE:-50}
DUMP=${1:-}
T0=$(now_ms)
WORK=$(mktemp -d); chmod 700 "$WORK"
APP_PID=
declare -a NAMES=() RESULTS=() NOTES=()
check(){ NAMES+=("$1"); RESULTS+=("$2"); NOTES+=("$3"); }
teardown(){
  local rc=$?
  if [[ -n $APP_PID ]] && kill -0 "$APP_PID" 2>/dev/null; then kill -TERM "$APP_PID" 2>/dev/null || true; for _ in $(seq 1 30); do kill -0 "$APP_PID" 2>/dev/null || break; sleep 0.5; done; kill -KILL "$APP_PID" 2>/dev/null || true; fi
  if [[ ${KEEP_SCRATCH:-0} != 1 ]]; then docker rm -f -v "$SCRATCH" >/dev/null 2>&1 || true; fi
  rm -rf "$WORK"
  return "$rc"
}
trap teardown EXIT
ms(){ echo $(( $(now_ms) - $1 )); }

[[ ${REHEARSAL_FRESH:-0} == 1 ]] && bash "$(dirname "${BASH_SOURCE[0]}")/backup.sh" >/dev/null
if [[ -z $DUMP ]]; then
  DUMP=$(find "$BACKUP_DIR" -maxdepth 1 -name 'blindrise-*.dump' -printf '%p\n' 2>/dev/null | sort | tail -1)
  [[ -n $DUMP ]] || { log "no dump yet: taking one now"; bash "$(dirname "${BASH_SOURCE[0]}")/backup.sh" >/dev/null; DUMP=$(find "$BACKUP_DIR" -maxdepth 1 -name 'blindrise-*.dump' | sort | tail -1); }
fi
[[ -f $DUMP ]] || die "no dump found in $BACKUP_DIR"
BASE=${DUMP%.dump}
log "dump: $(basename "$DUMP") ($(numfmt --to=iec "$(stat -c %s "$DUMP")"))"
SRC_ROWS=$(kv_get "$BASE.meta" rows)
SRC_SHA=$(kv_get "$BASE.meta" sha256)
IMAGE=$(kv_get "$BASE.meta" image); IMAGE=${IMAGE:-$(docker inspect -f '{{.Config.Image}}' "$PG_CONTAINER" 2>/dev/null || echo postgres:16)}

# 0. integrity of the file itself
if [[ -n $SRC_SHA ]]; then
  if [[ $(sha256sum "$DUMP" | awk '{print $1}') == "$SRC_SHA" ]]; then check "dump checksum" PASS "sha256 matches .meta"; else check "dump checksum" FAIL "sha256 differs from .meta"; fi
else check "dump checksum" SKIP "no .meta next to the dump"; fi

# 1. scratch Postgres (never the live container, never its volume)
[[ $SCRATCH != "$PG_CONTAINER" ]] || die "scratch container name equals the live one"
docker rm -f -v "$SCRATCH" >/dev/null 2>&1 || true
SPW=$(openssl rand -hex 16)
S0=$(now_ms)
docker run -d --name "$SCRATCH" --label blindrise.role=rehearsal -e POSTGRES_PASSWORD="$SPW" -e POSTGRES_DB=rehearsal \
  -p "127.0.0.1:$SCRATCH_PORT:5432" --tmpfs /var/lib/postgresql/data:rw,size="${REHEARSAL_TMPFS:-1g}" "$IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec "$SCRATCH" pg_isready -U postgres -d rehearsal -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 1; done
docker exec "$SCRATCH" pg_isready -U postgres -d rehearsal -h 127.0.0.1 >/dev/null 2>&1 || die "scratch postgres did not start"
START_MS=$(ms "$S0")
sq(){ docker exec -i "$SCRATCH" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d rehearsal -c "$1"; }

R0=$(now_ms)
if docker exec -i "$SCRATCH" pg_restore -U postgres -d rehearsal --no-owner --no-privileges --exit-on-error < "$DUMP" > "$WORK/restore.log" 2>&1; then
  check "pg_restore" PASS "$(ms "$R0") ms"
else
  check "pg_restore" FAIL "exit $? ($(grep -c . "$WORK/restore.log") lines of errors)"
fi
RESTORE_MS=$(ms "$R0")

# 2. data checks
V0=$(now_ms)
DST_ROWS=$(sq "select count(*) from kv" 2>/dev/null || echo "?")
if [[ -z $SRC_ROWS ]]; then
  LIVE=$(pg_q "select count(*) from kv" 2>/dev/null || echo "?")
  if [[ $DST_ROWS == "$LIVE" ]]; then check "kv row count" PASS "$DST_ROWS = live source (no manifest)"; else check "kv row count" WARN "$DST_ROWS vs live $LIVE (no manifest; the live DB may have changed)"; fi
elif [[ $DST_ROWS == "$SRC_ROWS" ]]; then check "kv row count" PASS "$DST_ROWS = source at dump time"
else check "kv row count" FAIL "restored $DST_ROWS, source had $SRC_ROWS"; fi

if [[ -f $BASE.manifest.tsv ]]; then
  sq "copy (select k, md5(v::text) from kv order by k) to stdout" > "$WORK/restored.tsv" 2>/dev/null || true
  LC_ALL=C sort "$BASE.manifest.tsv" > "$WORK/src.sorted"; LC_ALL=C sort "$WORK/restored.tsv" > "$WORK/dst.sorted"
  N=$(wc -l < "$WORK/src.sorted")
  shuf -n "$SAMPLE" "$WORK/src.sorted" > "$WORK/sample.tsv" || true
  S=$(wc -l < "$WORK/sample.tsv")
  BAD=$(LC_ALL=C sort "$WORK/sample.tsv" | LC_ALL=C comm -23 - "$WORK/dst.sorted" | wc -l)
  if [[ $S -gt 0 && $BAD -eq 0 ]]; then check "sampled keys (md5)" PASS "$S of $N keys match"
  elif [[ $S -eq 0 ]]; then check "sampled keys (md5)" WARN "source had no keys"
  else check "sampled keys (md5)" FAIL "$BAD of $S sampled keys differ or are missing"; fi
  if cmp -s "$WORK/src.sorted" "$WORK/dst.sorted"; then check "full manifest digest" PASS "all $N (key, md5) pairs identical"
  else check "full manifest digest" FAIL "$(LC_ALL=C comm -3 "$WORK/src.sorted" "$WORK/dst.sorted" | wc -l) pairs differ"; fi
else
  check "sampled keys (md5)" SKIP "no manifest next to the dump"
fi
VERIFY_MS=$(ms "$V0")

# 3. the app boots against the restored DB
B0=$(now_ms)
if [[ ! -f $APP_DIR/server/index.js ]]; then
  check "app boot" FAIL "no app at $APP_DIR (deploy first)"
else
  ENVV=(PATH=/usr/local/bin:/usr/bin:/bin HOME="$WORK" NODE_ENV=production PORT="$APP_TEST_PORT" STAGING=1 UI_BOARD=1
        NO_PUSH=1 NO_BEACON=1 DATABASE_URL="postgres://postgres:$SPW@127.0.0.1:$SCRATCH_PORT/rehearsal")
  if [[ -n $RUN_AS ]]; then
    chown "$RUN_AS" "$WORK"
    (cd "$APP_DIR" && exec runuser -u "$RUN_AS" -- env -i "${ENVV[@]}" node server/index.js) > "$WORK/app.log" 2>&1 &
  else
    (cd "$APP_DIR" && exec env -i "${ENVV[@]}" "$(command -v node)" server/index.js) > "$WORK/app.log" 2>&1 &
  fi
  APP_PID=$!
  if HMS=$(wait_http "http://127.0.0.1:$APP_TEST_PORT/healthz" "${REHEARSAL_BOOT_TIMEOUT:-60}"); then
    check "app /healthz" PASS "200 after $HMS ms on :$APP_TEST_PORT"
    ROOT=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$APP_TEST_PORT/")
    if [[ $ROOT == 200 ]]; then check "app root page" PASS "200"; else check "app root page" FAIL "HTTP $ROOT"; fi
    MODE=$(curl -s --max-time 5 "http://127.0.0.1:$APP_TEST_PORT/healthz" | jq -r '.mode // "?"' 2>/dev/null || echo "?")
    LOADED=$(grep -o 'store: postgres, [0-9]* keys' "$WORK/app.log" | grep -o '[0-9]*' | head -1 || true)
    # the app keeps every row but the lease row in memory
    if [[ $MODE == postgres && -n $LOADED && $DST_ROWS =~ ^[0-9]+$ && $LOADED -eq $(( DST_ROWS > 0 ? DST_ROWS - 1 : 0 )) ]]; then
      check "app loaded keys" PASS "$LOADED keys (+1 lease row), mode $MODE"
    else check "app loaded keys" FAIL "mode $MODE, loaded ${LOADED:-?} keys, restored rows $DST_ROWS"; fi
  else
    check "app /healthz" FAIL "no 200 within ${REHEARSAL_BOOT_TIMEOUT:-60} s; last log lines: $(tail -3 "$WORK/app.log" | tr '\n' ' ' | sed -E 's#[a-z]+://[^ ]+#<url>#g' | cut -c1-300)"
  fi
fi
BOOT_MS=$(ms "$B0")

VERDICT=PASS
for r in "${RESULTS[@]}"; do [[ $r == FAIL ]] && VERDICT=FAIL; done
TOTAL=$(ms "$T0")
printf 'at=%s\nverdict=%s\ndump=%s\ntotal_ms=%s\n' "$(date +%s)" "$VERDICT" "$(basename "$DUMP")" "$TOTAL" > "$BR_STATE/rehearsal.last" 2>/dev/null || true

summary_begin "restore rehearsal: $VERDICT"
row "dump" "$(basename "$DUMP")"
for i in "${!NAMES[@]}"; do printf '%-26s %-5s %s\n' "${NAMES[$i]}" "${RESULTS[$i]}" "${NOTES[$i]}"; done
row "timings (ms)" "scratch start $START_MS, restore $RESTORE_MS, verify $VERIFY_MS, app boot $BOOT_MS, total $TOTAL"
row "teardown" "$( [[ ${KEEP_SCRATCH:-0} == 1 ]] && echo "KEPT (KEEP_SCRATCH=1)" || echo "scratch container + app removed")"
row "VERDICT" "$VERDICT"
summary_end
[[ $VERDICT == PASS ]]
