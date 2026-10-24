#!/usr/bin/env bash
# Local end-to-end test of the ops kit on a developer machine with Docker. Never contacts a real server; all data
# is synthetic (the app's own STAGING=1 seed: "Test Director" + 12 fake members, plus generated synthetic rows).
#   bash ops/test/local-e2e.sh            (from the repo root; needs docker, node, npm, jq, curl, openssl, python3
#                                          with aiosmtpd for the email test: pip install aiosmtpd)
# What it runs, all against a throwaway Postgres container (compose project brtest, port 55433):
#   postgres.sh -> deploy.sh (good release, broken release => auto-rollback, explicit rollback) with a fake
#   systemctl -> backup.sh while the app is writing -> restore-rehearsal.sh (expect PASS; then a tampered manifest,
#   expect FAIL) -> notify.sh (webhook + SMTP STARTTLS/AUTH to local receivers) -> monitor.sh (all ok, app down =>
#   CRIT alert after CONFIRM runs, app back => RECOVERED alert, "ws min" parsing) -> ops.sh settings whitelist.
# Generated passwords stay in the temp dir (mode 600) and are never printed. Everything is removed at the end.
set -euo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
OPSDIR=$REPO/ops
APP_REF=${APP_REF:-a795f54}
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/br-e2e.XXXXXX"); chmod 700 "$ROOT"
export BR_ROOT=$ROOT/srv BR_OPS=$OPSDIR APP_PORT=${APP_PORT:-3100} SERVICE=blindrise
export PG_CONTAINER=brtest-postgres PG_PORT=55433 PG_VOLUME=brtest-pgdata COMPOSE_PROJECT=brtest PG_IMAGE=${PG_IMAGE:-postgres:16}
export NPM_CACHE=$ROOT/npm-cache SYSTEMCTL=$ROOT/bin/systemctl REHEARSAL_CONTAINER=brtest-rehearsal-pg REHEARSAL_PG_PORT=55434
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}" no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"
. "$OPSDIR/lib.sh"
mkdir -p "$BR_RELEASES" "$BR_SHARED" "$BR_STATE" "$ROOT/bin" "$ROOT/rx"
PASSES=0; FAILS=0; RESULTS=()
ok(){ PASSES=$((PASSES + 1)); RESULTS+=("PASS  $*"); echo "  -> PASS $*"; }
bad(){ FAILS=$((FAILS + 1)); RESULTS+=("FAIL  $*"); echo "  -> FAIL $*"; }
expect(){ local name=$1; shift; if "$@"; then ok "$name"; else bad "$name"; fi; }
RX_PID=
cleanup(){
  "$SYSTEMCTL" stop blindrise >/dev/null 2>&1 || true
  [[ -n $RX_PID ]] && kill "$RX_PID" 2>/dev/null || true
  docker compose -p "$COMPOSE_PROJECT" -f "$OPSDIR/compose.postgres.yml" down -v >/dev/null 2>&1 || true
  docker rm -f -v "$REHEARSAL_CONTAINER" >/dev/null 2>&1 || true
  [[ ${KEEP_E2E:-0} == 1 ]] || rm -rf "$ROOT"
}
trap cleanup EXIT
step(){ printf '\n##### %s\n' "$*"; }

# --- synthetic secrets, as bootstrap.sh would make them (never printed) ---
umask 077
kv_set "$PG_ENV_FILE" POSTGRES_USER blindrise; kv_set "$PG_ENV_FILE" POSTGRES_DB blindrise
kv_set "$PG_ENV_FILE" POSTGRES_PASSWORD "$(openssl rand -hex 24)"
kv_set "$APP_ENV" OWNER_CODE "$(openssl rand -hex 12)"
kv_set "$APP_ENV" DATABASE_URL "postgres://blindrise:$(kv_get "$PG_ENV_FILE" POSTGRES_PASSWORD)@127.0.0.1:$PG_PORT/blindrise"
for kv in NODE_ENV=production PORT=$APP_PORT STAGING=1 UI_BOARD=1 NO_PUSH=1 NO_BEACON=1 PUBLIC_URL=http://127.0.0.1:$APP_PORT; do kv_set "$APP_ENV" "${kv%%=*}" "${kv#*=}"; done
umask 022

# --- fake systemctl: runs the app from $BR_CURRENT with the env file, logs to $ROOT/app.log (our "journal") ---
cat > "$SYSTEMCTL" <<EOF
#!/usr/bin/env bash
PIDF=$ROOT/app.pid
start(){ ( cd "$BR_CURRENT" && mapfile -t E < <(grep -h -v '^#' "$APP_ENV" .release.env 2>/dev/null) && exec env -i PATH="\$PATH" HOME="$ROOT" "\${E[@]}" node server/index.js ) >> "$ROOT/app.log" 2>&1 & echo \$! > "\$PIDF"; }
stop(){ local p; p=\$(cat "\$PIDF" 2>/dev/null) || return 0; kill -TERM "\$p" 2>/dev/null; for _ in \$(seq 1 50); do kill -0 "\$p" 2>/dev/null || break; sleep 0.5; done; kill -KILL "\$p" 2>/dev/null; rm -f "\$PIDF"; }
case \$1 in
  restart) stop; start ;; start) start ;; stop) stop ;;
  is-active) p=\$(cat "\$PIDF" 2>/dev/null) && kill -0 "\$p" 2>/dev/null && { echo active; exit 0; }; echo inactive; exit 3 ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$SYSTEMCTL"

step "1. postgres.sh (compose, 127.0.0.1 only, healthcheck)"
expect "postgres.sh healthy" bash "$OPSDIR/postgres.sh"
expect "postgres bound to 127.0.0.1 only" bash -c "docker port $PG_CONTAINER 5432/tcp | grep -qx '127.0.0.1:$PG_PORT'"

step "2. deploy.sh: good release $APP_REF"
SHA=$(git -C "$REPO" rev-parse "$APP_REF^{commit}")
mkrel(){ mkdir -p "$BR_RELEASES/$1"; git -C "$REPO" archive "$SHA" | tar -x -C "$BR_RELEASES/$1"; }
mkrel "$SHA"
expect "deploy $APP_REF" bash "$OPSDIR/deploy.sh" "$SHA"
expect "current -> $APP_REF" test "$(basename "$(readlink "$BR_CURRENT")")" = "$SHA"
expect "staging seed ran (synthetic Test Director + fake members)" grep -q 'staging: seeded Test Director and 12 fake members' "$ROOT/app.log"

step "3. deploy.sh: broken release => automatic rollback"
BAD=$(printf 'synthetic-broken-release' | sha1sum | awk '{print $1}')
mkrel "$BAD"; sed -i '1i process.exit(1); // synthetic broken release (local test only)' "$BR_RELEASES/$BAD/server/index.js"
if HEALTH_TIMEOUT=15 bash "$OPSDIR/deploy.sh" "$BAD" | tee "$ROOT/bad.out"; then bad "broken deploy must fail"; else ok "broken deploy exits non-zero"; fi
expect "summary says ROLLED BACK" grep -q 'ROLLED BACK' "$ROOT/bad.out"
expect "current back on $APP_REF" test "$(basename "$(readlink "$BR_CURRENT")")" = "$SHA"
expect "healthy after rollback" bash -c "curl -sf http://127.0.0.1:$APP_PORT/healthz | jq -e '.ok and .mode == \"postgres\"' >/dev/null"

step "4. deploy.sh: second release, then explicit rollback"
GOOD2=$(printf 'synthetic-second-release' | sha1sum | awk '{print $1}')
mkrel "$GOOD2"
expect "deploy second release" bash "$OPSDIR/deploy.sh" "$GOOD2"
expect "rollback to $APP_REF" bash "$OPSDIR/deploy.sh" --rollback
expect "current -> $APP_REF after rollback" test "$(basename "$(readlink "$BR_CURRENT")")" = "$SHA"

step "5. synthetic rows + backup.sh while the app is running"
docker exec -i "$PG_CONTAINER" psql -X -q -U blindrise -d blindrise -c \
  "insert into kv (k, v) select 'synthetic:' || g, jsonb_build_object('n', g, 'note', 'synthetic test row', 'tags', jsonb_build_array('a', 'b', g)) from generate_series(1, 300) g on conflict do nothing" >/dev/null
"$SYSTEMCTL" restart blindrise; wait_http "http://127.0.0.1:$APP_PORT/healthz" 60 >/dev/null
expect "backup.sh" bash "$OPSDIR/backup.sh"
DUMP=$(find "$BACKUP_DIR" -name '*.dump' | sort | tail -1)
expect "dump + manifest + meta exist" test -s "$DUMP" -a -s "${DUMP%.dump}.manifest.tsv" -a -s "${DUMP%.dump}.meta"
expect "backup files are private (600)" test "$(stat -c %a "$DUMP")" = 600
BACKUP_KEEP=2 bash "$OPSDIR/backup.sh" >/dev/null; sleep 1; BACKUP_KEEP=2 bash "$OPSDIR/backup.sh" >/dev/null
expect "retention keeps 2" test "$(find "$BACKUP_DIR" -name '*.dump' | wc -l)" = 2
DUMP=$(find "$BACKUP_DIR" -name '*.dump' | sort | tail -1)
printf '#!/bin/sh\nexit 3\n' > "$ROOT/hook-fail"; chmod +x "$ROOT/hook-fail"
if BACKUP_HOOK=$ROOT/hook-fail BACKUP_KEEP=5 bash "$OPSDIR/backup.sh" > "$ROOT/hook.out"; then bad "failing off-box hook must exit non-zero"; else ok "failing off-box hook => exit 2, dump kept"; fi
expect "backup.last says hook-failed" grep -q 'status=hook-failed' "$BR_STATE/backup.last"
bash "$OPSDIR/backup.sh" >/dev/null; DUMP=$(find "$BACKUP_DIR" -name '*.dump' | sort | tail -1)

step "6. restore-rehearsal.sh (app from the working tree $REPO on port 3999)"
expect "rehearsal PASS" env APP_DIR="$REPO" RUN_AS= bash "$OPSDIR/restore-rehearsal.sh" "$DUMP"
expect "scratch container removed" bash -c "! docker ps -a --format '{{.Names}}' | grep -qx $REHEARSAL_CONTAINER"
expect "rehearsal app stopped (port 3999 free)" bash -c "! curl -s --max-time 2 http://127.0.0.1:3999/healthz >/dev/null"
cp "${DUMP%.dump}.manifest.tsv" "$ROOT/manifest.bak"
awk -F'\t' 'BEGIN{OFS="\t"} NR==5{$2="00000000000000000000000000000000"} {print}' "$ROOT/manifest.bak" > "${DUMP%.dump}.manifest.tsv"
if env APP_DIR="$REPO" RUN_AS= REHEARSAL_SAMPLE=100000 bash "$OPSDIR/restore-rehearsal.sh" "$DUMP" > "$ROOT/tamper.out"; then bad "tampered manifest must FAIL"; else ok "tampered manifest => FAIL"; fi
expect "tamper detected by digest" grep -q 'full manifest digest.*FAIL' "$ROOT/tamper.out"
cp "$ROOT/manifest.bak" "${DUMP%.dump}.manifest.tsv"

step "7. notify.sh: webhook + SMTP (STARTTLS + AUTH) to local receivers"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 -keyout "$ROOT/rx/key.pem" -out "$ROOT/rx/cert.pem" >/dev/null 2>&1
SMTP_PW=$(openssl rand -hex 8)
python3 "$OPSDIR/test/receivers.py" "$ROOT/rx" 18080 18025 "$ROOT/rx/cert.pem" "$ROOT/rx/key.pem" alerts@example.test "$SMTP_PW" > "$ROOT/rx/out.log" 2>&1 &
RX_PID=$!; for _ in $(seq 1 20); do grep -q ready "$ROOT/rx/out.log" 2>/dev/null && break; sleep 0.5; done
umask 077
kv_set "$OPS_ENV" STAGING_SMTP_URL "smtp://alerts%40example.test:$SMTP_PW@127.0.0.1:18025"
kv_set "$OPS_ENV" STAGING_ALERT_TO owner@example.test
kv_set "$OPS_ENV" STAGING_ALERT_WEBHOOK "http://127.0.0.1:18080/hook"
umask 022
export CURL_CA_BUNDLE=$ROOT/rx/cert.pem
expect "notify --test: email=ok webhook=ok" bash -c "bash '$OPSDIR/notify.sh' --test | tee -a $ROOT/notify.out | grep -q 'email=ok webhook=ok'"
expect "mail delivered" test -s "$ROOT/rx/mail.1.eml"
expect "webhook delivered" test "$(wc -l < "$ROOT/rx/webhook.jsonl")" = 1
expect "notify output has no secret" bash -c "! bash '$OPSDIR/notify.sh' --test | grep -q '$SMTP_PW'"
kv_del "$OPS_ENV" STAGING_SMTP_URL; kv_del "$OPS_ENV" STAGING_ALERT_WEBHOOK
expect "no channel => logged only" bash -c "bash '$OPSDIR/notify.sh' --test | grep -q 'no channel configured'"
umask 077; kv_set "$OPS_ENV" STAGING_SMTP_URL "smtp://alerts%40example.test:$SMTP_PW@127.0.0.1:18025"; kv_set "$OPS_ENV" STAGING_ALERT_WEBHOOK "http://127.0.0.1:18080/hook"; umask 022

step "8. monitor.sh: ok -> app down (CRIT after 2 runs, alert) -> back up (RECOVERED alert); ws min parsing"
export MONITOR_SITE=http://127.0.0.1:$APP_PORT MONITOR_CONNECT='' MONITOR_SKIP="service restarts units cert cpu load" MONITOR_JOURNAL_CMD="tail -n 200 $ROOT/app.log"
printf 'ws min open=3 in=2 out=1 gone=0 kill=1 acts=40 applied=40 stale=0 rejected=0 handle_ms_p50=2 p95=9 hb_rtt_ms_p50=30 p95=80 act_rtt_ms_p50=45 p95=210\n' >> "$ROOT/app.log"
N0=$(wc -l < "$ROOT/rx/webhook.jsonl")
expect "monitor all ok (report)" bash "$OPSDIR/monitor.sh" --report
expect "ws min parsed (act p95 210 ms, 1 kill)" grep -q 'wsmin.*kills=1 act_rtt_p95_max=210ms' "$BR_STATE/monitor.checks"
expect "no alert while ok" test "$(wc -l < "$ROOT/rx/webhook.jsonl")" = "$N0"
"$SYSTEMCTL" stop blindrise
bash "$OPSDIR/monitor.sh" | tee "$ROOT/m1.out"
expect "1st failing run: not yet alerted (CONFIRM=2)" test "$(wc -l < "$ROOT/rx/webhook.jsonl")" = "$N0"
bash "$OPSDIR/monitor.sh" | tee "$ROOT/m2.out"
expect "2nd failing run: CRIT alert sent" bash -c "grep -q 'CRIT' '$ROOT/m2.out' && test \$(wc -l < '$ROOT/rx/webhook.jsonl') = $((N0 + 1))"
expect "alert names http + ws" bash -c "tail -1 '$ROOT/rx/webhook.jsonl' | jq -r .subject | grep -q 'http, .*ws'"
bash "$OPSDIR/monitor.sh" > /dev/null
expect "no repeat while unchanged" test "$(wc -l < "$ROOT/rx/webhook.jsonl")" = "$((N0 + 1))"
"$SYSTEMCTL" start blindrise; wait_http "http://127.0.0.1:$APP_PORT/healthz" 60 >/dev/null
bash "$OPSDIR/monitor.sh" | tee "$ROOT/m3.out"
expect "RECOVERED alert sent" bash -c "tail -1 '$ROOT/rx/webhook.jsonl' | jq -r .subject | grep -q RECOVERED"
expect "emails for alert + recovery" test "$(find "$ROOT/rx" -name 'mail.*.eml' | wc -l)" -ge 3

step "9. ws-check.js against the running app"
expect "ws handshake 101 (same-origin)" node "$OPSDIR/ws-check.js" "http://127.0.0.1:$APP_PORT/ws"
expect "ws-check reports a non-ws path as FAIL" bash -c "! node '$OPSDIR/ws-check.js' http://127.0.0.1:$APP_PORT/nope"

step "10. ops.sh: settings whitelist from stdin, preflight"
mkdir -p "$ROOT/kit"; cp -r "$OPSDIR/." "$ROOT/kit/"
printf 'STAGING_DOMAIN=staging.example.test\nEVIL_KEY=nope\nSTAGING_ALERT_WEBHOOK=\n__END__\n' | BR_OPS=$ROOT/srv/ops bash "$ROOT/kit/ops.sh" preflight > "$ROOT/pre.out"
expect "whitelisted key stored" grep -qx 'STAGING_DOMAIN=staging.example.test' "$OPS_ENV"
expect "unknown key ignored" bash -c "! grep -q EVIL_KEY '$OPS_ENV'"
expect "empty value clears key" bash -c "! grep -q STAGING_ALERT_WEBHOOK '$OPS_ENV'"
expect "ops.env is 600" test "$(stat -c %a "$OPS_ENV")" = 600
expect "kit installed root-owned" test -f "$ROOT/srv/ops/ops.sh"
expect "preflight shows names, not values" bash -c "grep -q 'STAGING_SMTP_URL *set' '$ROOT/pre.out' && ! grep -q '$SMTP_PW' '$ROOT/pre.out'"

step "11. CI helpers: read-task.sh, require-secrets.sh, remote.sh (through a fake ssh that runs locally)"
printf '# comment\n\n  deploy a795f54\nbootstrap\n' > "$ROOT/run.txt"
expect "run.txt: first non-comment line wins" bash -c "GITHUB_OUTPUT='$ROOT/gh.out' bash '$OPSDIR/ci/read-task.sh' '$ROOT/run.txt' >/dev/null && grep -qx task=deploy '$ROOT/gh.out' && grep -qx arg=a795f54 '$ROOT/gh.out'"
# shellcheck disable=SC2016  # a literal $(...) is the point of this test
printf 'deploy $(reboot)\n' > "$ROOT/run.txt"
expect "run.txt: unsafe argument rejected" bash -c "! GITHUB_OUTPUT=/dev/null bash '$OPSDIR/ci/read-task.sh' '$ROOT/run.txt' >/dev/null"
printf 'rm-rf\n' > "$ROOT/run.txt"
expect "run.txt: unknown task rejected" bash -c "! GITHUB_OUTPUT=/dev/null bash '$OPSDIR/ci/read-task.sh' '$ROOT/run.txt' >/dev/null"
expect "missing secret fails with a clear message" bash -c "STAGING_HOST=x bash '$OPSDIR/ci/require-secrets.sh' STAGING_HOST STAGING_SSH_KEY | grep -q 'Repository secret STAGING_SSH_KEY is not set' && ! STAGING_HOST=x bash '$OPSDIR/ci/require-secrets.sh' STAGING_HOST STAGING_SSH_KEY >/dev/null"
mkdir -p "$ROOT/fakebin" "$ROOT/fakehome"
cat > "$ROOT/fakebin/ssh" <<FAKE
#!/usr/bin/env bash
# fake ssh: drop options and the host alias, run the remote command locally (sudo stripped; we are root here)
while [[ \$1 == -* ]]; do shift 2; done; shift
cmd=\${*//sudo /}; HOME="$ROOT/fakehome" exec bash -c "\$cmd"
FAKE
chmod +x "$ROOT/fakebin/ssh"
expect "remote.sh: kit copied, settings sent, summary extracted" bash -c "PATH='$ROOT/fakebin':\$PATH GITHUB_STEP_SUMMARY='$ROOT/step.md' STAGING_DOMAIN=ci.example.test STAGING_ALERT_TO= BR_OPS='$ROOT/srv/ops2' bash '$OPSDIR/ci/remote.sh' '$OPSDIR' preflight > '$ROOT/remote.out' && grep -q '=== SUMMARY: preflight' '$ROOT/step.md' && grep -q 'preflight: OK' '$ROOT/step.md' && grep -qx STAGING_DOMAIN=ci.example.test '$OPS_ENV' && ! grep -q STAGING_ALERT_TO '$OPS_ENV' && grep -q STAGING_SMTP_URL '$OPS_ENV' && test -f '$ROOT/fakehome/blindrise-ops/ops.sh'"

step "12. nothing secret in any output"
SECRETS=("$(kv_get "$PG_ENV_FILE" POSTGRES_PASSWORD)" "$(kv_get "$APP_ENV" OWNER_CODE)" "$SMTP_PW")
LEAK=0; for s in "${SECRETS[@]}"; do grep -rqF "$s" "$ROOT"/*.out "$ROOT/app.log" 2>/dev/null && LEAK=1; done
expect "no generated secret in captured outputs or app log" test "$LEAK" = 0

printf '\n===== local e2e: %d passed, %d failed =====\n' "$PASSES" "$FAILS"
printf '%s\n' "${RESULTS[@]}"
[[ $FAILS -eq 0 ]]
