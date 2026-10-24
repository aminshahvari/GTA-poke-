#!/usr/bin/env bash
# shellcheck disable=SC2015  # `test && add ok || add fail`: add() always succeeds, so this is a safe if/else
# Health probe, run every 2 minutes by blindrise-monitor.timer. Sends an alert (notify.sh) only when the set of
# failing checks changes (new problem, problem gone, all clear), plus a reminder every REMIND_HOURS while failing.
# Checks (thresholds in /srv/blindrise/shared/monitor.conf, KEY=VALUE, defaults below):
#   CRIT  service    systemd unit active             http   https://DOMAIN/ 200 via Caddy + /healthz ok
#         ws         WebSocket handshake 101 on /ws   pg     postgres container healthy
#         lease      no "lease lost" in the journal
#   WARN  restarts   automatic restarts since last run   errors  journal error lines in the last 5 min
#         wsmin      the app's "ws min" summaries: act/handle p95 and kills (builds that log them)
#         disk mem cpu load   backup (age of last good backup)   cert (days left)   units (failed blindrise-* units)
# A check has to fail CONFIRM runs in a row (default 2) before it counts, so one blip does not page anyone.
#   monitor.sh            normal run (quiet unless state changes; one status line)
#   monitor.sh --report   print every check (used by the monitoring and status tasks)
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CONF=${MONITOR_CONF:-$BR_SHARED/monitor.conf}
MSTATE=${MONITOR_STATE:-$BR_STATE/monitor}
c(){ local v; v=$(kv_get "$CONF" "$1"); echo "${v:-$2}"; }
DISK_MAX_PCT=$(c DISK_MAX_PCT 85); MEM_MIN_AVAIL_PCT=$(c MEM_MIN_AVAIL_PCT 10); CPU_MAX_PCT=$(c CPU_MAX_PCT 90)
LOAD_MAX_PER_CPU=$(c LOAD_MAX_PER_CPU 2.0); ERRORS_MAX_5MIN=$(c ERRORS_MAX_5MIN 20); WS_ACT_P95_MAX_MS=$(c WS_ACT_P95_MAX_MS 1500)
WS_KILLS_MAX_5MIN=$(c WS_KILLS_MAX_5MIN 30); BACKUP_MAX_AGE_H=$(c BACKUP_MAX_AGE_H 26); CERT_MIN_DAYS=$(c CERT_MIN_DAYS 14)
CONFIRM=$(c CONFIRM 2); REMIND_HOURS=$(c REMIND_HOURS 6); SKIP=" $(c SKIP "${MONITOR_SKIP:-}") "
DOMAIN=${MONITOR_DOMAIN:-$(cfg STAGING_DOMAIN)}
SITE=${MONITOR_SITE:-https://$DOMAIN}            # local tests: http://127.0.0.1:3000
CONNECT=${MONITOR_CONNECT-127.0.0.1}             # dial Caddy on this box, still checking the real certificate
JOURNAL=${MONITOR_JOURNAL_CMD:-journalctl -u $SERVICE --since -5min --no-pager -o cat}
REPORT=0; [[ ${1:-} == --report ]] && REPORT=1
install -d -m 750 "$MSTATE"
declare -a N=() S=() L=() D=()   # name, status ok|fail|skip, level CRIT|WARN, detail
add(){ N+=("$1"); S+=("$2"); L+=("$3"); D+=("$4"); }
skip(){ [[ $SKIP == *" $1 "* ]]; }
curl_site(){ # path -> http code (through Caddy on this box when CONNECT is set)
  local host=${SITE#*://}; host=${host%%/*}
  if [[ -n $CONNECT && $SITE == https://* ]]; then curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "${host%%:*}:443:$CONNECT" "$SITE$1"
  else curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$SITE$1"; fi
}

# --- service ---
if ! skip service; then
  st=$(systemctl is-active "$SERVICE" 2>/dev/null); [[ $st == active ]] && add service ok CRIT active || add service fail CRIT "${st:-unknown}"
  nr=$(systemctl show "$SERVICE" -p NRestarts --value 2>/dev/null || echo 0); last=$(cat "$MSTATE/nrestarts" 2>/dev/null || echo "$nr")
  echo "$nr" > "$MSTATE/nrestarts"
  (( nr > last )) && add restarts fail WARN "$((nr - last)) automatic restart(s) since last run" || add restarts ok WARN "0 since last run"
fi
# --- http ---
if ! skip http; then
  root=$(curl_site /); hz=$(curl_site /healthz)
  [[ $root == 200 && $hz == 200 ]] && add http ok CRIT "/ 200, /healthz 200" || add http fail CRIT "/ ${root:-000}, /healthz ${hz:-000}"
  if body=$(curl -s --max-time 5 "http://127.0.0.1:$APP_PORT/healthz"); then
    if [[ $(jq -r '.leaseLost' <<<"$body" 2>/dev/null) == true ]]; then add lease fail CRIT "store reports leaseLost"; else add lease ok CRIT "held (epoch $(jq -r '.epoch' <<<"$body" 2>/dev/null))"; fi
    we=$(jq -r '.lastWriteError.ageMs // empty' <<<"$body" 2>/dev/null)
    [[ -n $we && $we -lt 300000 ]] && add dbwrite fail CRIT "a store write failed $((we / 1000)) s ago" || add dbwrite ok CRIT "no recent write error"
  fi
fi
# --- websocket ---
if ! skip ws; then
  WSURL=${SITE/#http/ws}/ws
  out=$(node "$BR_OPS/ws-check.js" "$WSURL" ${CONNECT:+--connect "$CONNECT"} --timeout 8000 2>&1); rc=$?
  [[ $rc == 0 ]] && add ws ok CRIT "$out" || add ws fail CRIT "$out"
fi
# --- postgres ---
if ! skip pg; then
  h=$(docker inspect -f '{{.State.Health.Status}}' "$PG_CONTAINER" 2>/dev/null || echo missing)
  [[ $h == healthy ]] && add pg ok CRIT healthy || add pg fail CRIT "$h"
fi
# --- journal: error rate, lease, ws min ---
if ! skip errors; then
  J=$($JOURNAL 2>/dev/null || true)
  errs=$(grep -ciE 'error|failed|refusing|unhandled|uncaught|ECONNREFUSED|ETIMEDOUT|FATAL' <<<"$J" || true)
  (( errs > ERRORS_MAX_5MIN )) && add errors fail WARN "$errs error lines in 5 min (max $ERRORS_MAX_5MIN)" || add errors ok WARN "$errs error lines in 5 min"
  grep -qi 'lease lost' <<<"$J" && add lease fail CRIT "'lease lost' in the journal (another writer took the lease)"
  WSM=$(grep -E '(^| )ws min ' <<<"$J" || true)
  if [[ -n $WSM ]]; then
    read -r kills p95 hp95 n < <(awk '{for(i=1;i<=NF;i++){split($i,a,"="); if(a[1]=="kill")k+=a[2]; if(a[1]=="act_rtt_ms_p50"){split($(i+1),b,"="); if(b[2]+0>p)p=b[2]+0} if(a[1]=="handle_ms_p50"){split($(i+1),b,"="); if(b[2]+0>h)h=b[2]+0}} n++} END{print k+0, p+0, h+0, n+0}' <<<"$WSM")
    last=$(tail -1 <<<"$WSM" | sed -E 's/.*ws min //' | cut -c1-160)
    if (( kills > WS_KILLS_MAX_5MIN )) || (( p95 > WS_ACT_P95_MAX_MS )); then add wsmin fail WARN "5 min: kills=$kills act_rtt_p95_max=${p95}ms handle_p95_max=${hp95}ms ($n lines)"
    else add wsmin ok WARN "5 min: kills=$kills act_rtt_p95_max=${p95}ms handle_p95_max=${hp95}ms; last: $last"; fi
  else add wsmin skip WARN "no 'ws min' lines in 5 min (idle, or a build without the connection log)"; fi
fi
# --- resources ---
if ! skip disk; then
  d=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')
  (( d > DISK_MAX_PCT )) && add disk fail WARN "/ ${d}% used (max $DISK_MAX_PCT%)" || add disk ok WARN "/ ${d}% used"
fi
if ! skip mem; then
  m=$(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{printf "%d", a*100/t}' /proc/meminfo)
  (( m < MEM_MIN_AVAIL_PCT )) && add mem fail WARN "${m}% available (min $MEM_MIN_AVAIL_PCT%)" || add mem ok WARN "${m}% available"
fi
if ! skip cpu; then
  read -r _ a1 b1 c1 d1 e1 f1 g1 _ < /proc/stat; sleep 2; read -r _ a2 b2 c2 d2 e2 f2 g2 _ < /proc/stat
  busy=$(( (a2+b2+c2+f2+g2) - (a1+b1+c1+f1+g1) )); tot=$(( busy + (d2+e2) - (d1+e1) )); cpu=$(( tot > 0 ? busy * 100 / tot : 0 ))
  (( cpu > CPU_MAX_PCT )) && add cpu fail WARN "${cpu}% busy (max $CPU_MAX_PCT%)" || add cpu ok WARN "${cpu}% busy"
fi
if ! skip load; then
  l1=$(cut -d' ' -f1 /proc/loadavg); ncpu=$(nproc)
  awk -v l="$l1" -v n="$ncpu" -v m="$LOAD_MAX_PER_CPU" 'BEGIN{exit !(l/n > m)}' && add load fail WARN "load1 $l1 on $ncpu cpus (max $LOAD_MAX_PER_CPU per cpu)" || add load ok WARN "load1 $l1 on $ncpu cpus"
fi
# --- backups, certificate, failed units ---
if ! skip backup; then
  if systemctl is-enabled blindrise-backup.timer >/dev/null 2>&1 || [[ -f $BR_STATE/backup.last ]]; then
    at=$(kv_get "$BR_STATE/backup.last" at); bs=$(kv_get "$BR_STATE/backup.last" status)
    age=$(( ($(date +%s) - ${at:-0}) / 3600 ))
    if [[ -z $at ]]; then add backup fail WARN "no backup yet"
    elif [[ $bs != ok ]]; then add backup fail WARN "last backup status: $bs"
    elif (( age > BACKUP_MAX_AGE_H )); then add backup fail WARN "last good backup ${age} h ago (max $BACKUP_MAX_AGE_H h)"
    else add backup ok WARN "last backup ${age} h ago"; fi
  else add backup skip WARN "backups not set up yet"; fi
fi
if ! skip cert && [[ $SITE == https://* ]]; then
  host=${SITE#https://}; host=${host%%/*}
  end=$(echo | timeout 10 openssl s_client -connect "${CONNECT:-$host}:443" -servername "$host" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [[ -n $end ]]; then days=$(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 ))
    (( days < CERT_MIN_DAYS )) && add cert fail WARN "certificate expires in $days days" || add cert ok WARN "certificate valid $days more days"
  else add cert fail WARN "could not read the certificate"; fi
fi
if ! skip units; then
  fu=$(systemctl list-units --failed --no-legend --plain 'blindrise*' 2>/dev/null | awk '$1 != "blindrise-monitor.service" {print $1}' | tr '\n' ' ')
  [[ -z ${fu// /} ]] && add units ok WARN "no failed blindrise units" || add units fail WARN "failed: $fu"
fi

# --- confirm (CONFIRM consecutive failures), state change, notify ---
FAILING=(); PENDING=(); WORST=OK
for i in "${!N[@]}"; do
  f=$MSTATE/streak.${N[$i]}
  if [[ ${S[$i]} == fail ]]; then s=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 )); echo "$s" > "$f"
    (( s < CONFIRM )) && PENDING+=("${N[$i]}")
    if (( s >= CONFIRM )); then FAILING+=("${N[$i]}"); [[ ${L[$i]} == CRIT ]] && WORST=CRIT || { [[ $WORST == OK ]] && WORST=WARN; }; fi
  else rm -f "$f"; fi
done
mapfile -t FAILING < <(printf '%s\n' "${FAILING[@]}" | awk 'NF && !seen[$0]++' | sort)
SIG="${FAILING[*]}"
PREV_SIG=$(cat "$MSTATE/signature" 2>/dev/null || echo "__first_run__")
LAST_SENT=$(cat "$MSTATE/last_alert_at" 2>/dev/null || echo 0)
REASON=
if [[ $PREV_SIG == __first_run__ ]]; then [[ -n $SIG ]] && REASON=new
elif [[ $SIG != "$PREV_SIG" ]]; then REASON=$([[ -z $SIG ]] && echo recovered || echo changed)
elif [[ -n $SIG ]] && (( $(date +%s) - LAST_SENT > REMIND_HOURS * 3600 )); then REASON=reminder; fi
echo "$SIG" > "$MSTATE/signature"

render(){ for i in "${!N[@]}"; do printf '%-9s %-4s %-4s %s\n' "${N[$i]}" "${S[$i]}" "${L[$i]}" "${D[$i]}"; done; }
NOTIFY=none
if [[ -n $REASON ]]; then
  if [[ $REASON == recovered ]]; then SUBJ="[blindrise staging] RECOVERED: all checks ok (was: ${PREV_SIG})"
  else SUBJ="[blindrise staging] $WORST: ${SIG// /, } ($REASON)"; fi
  NOTIFY=$( { echo "Checks at $(date -u '+%F %T') UTC:"; render; echo; echo "Thresholds: $CONF. Logs: journalctl -u $SERVICE --since -15min"; } \
           | bash "$(dirname "${BASH_SOURCE[0]}")/notify.sh" "$SUBJ" - 2>&1 | tail -1)
  date +%s > "$MSTATE/last_alert_at"
fi
{ echo "at=$(date +%s)"; echo "worst=$WORST"; echo "failing=$SIG"; echo "notify=$NOTIFY"; } > "$BR_STATE/monitor.last"
render > "$BR_STATE/monitor.checks"
STATUS="monitor: $WORST${SIG:+ (failing: $SIG)}${PENDING[*]:+ (unconfirmed: ${PENDING[*]})}; alert: ${REASON:-not needed}${REASON:+ -> $NOTIFY}"
if [[ $REPORT == 1 ]]; then summary_begin "monitor: $WORST"; render; row "alert" "${REASON:-none (no state change)}${REASON:+ -> $NOTIFY}"; summary_end
  [[ $WORST != CRIT ]]; exit   # the monitoring/status tasks go red on CRIT
fi
echo "$STATUS"   # timer runs always exit 0, so the monitor unit itself never shows as failed
