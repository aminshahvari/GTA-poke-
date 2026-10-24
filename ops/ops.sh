#!/usr/bin/env bash
# On-box entry point. The GitHub workflows copy ops/ to ~/blindrise-ops on the box and run:
#   printf 'KEY=VALUE\n...__END__\n' | sudo bash ~/blindrise-ops/ops.sh <task> [arg]
# stdin carries the settings from GitHub secrets (only the whitelisted keys below); they are stored in
# /srv/blindrise/shared/ops.env (mode 600) and never printed. The kit itself is installed to /srv/blindrise/ops.
# Tasks: preflight | bootstrap | postgres | deploy <sha> | rollback | backup | restore-rehearsal | monitoring |
#        alert-test | status
set -euo pipefail
SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
. "$SRC/lib.sh"
need_root
TASK=${1:-}; ARG=${2:-}
KEYS=(STAGING_DOMAIN STAGING_SMTP_URL STAGING_ALERT_TO STAGING_ALERT_FROM STAGING_ALERT_WEBHOOK)

# 1. install the kit (root-owned, so the timers never run anything the login user can edit)
install -d -m 755 "$BR_ROOT" "$BR_OPS"
install -d -m 750 "$BR_SHARED" "$BR_STATE"
if [[ $SRC != "$BR_OPS" ]]; then
  rm -rf "${BR_OPS:?}.new"; cp -r "$SRC" "$BR_OPS.new"; chown -R root:root "$BR_OPS.new"; chmod -R go-w "$BR_OPS.new"
  rm -rf "${BR_OPS:?}.old"; mv -T "$BR_OPS" "$BR_OPS.old"; mv -T "$BR_OPS.new" "$BR_OPS"; rm -rf "${BR_OPS:?}.old"
fi

# 2. settings from stdin (KEY=VALUE lines up to __END__); an empty value removes the key
if [[ ! -t 0 ]]; then
  umask 077; [[ -f $OPS_ENV ]] || : > "$OPS_ENV"; chmod 600 "$OPS_ENV"
  CHANGED=0
  while IFS= read -r line; do
    [[ $line == __END__ ]] && break
    k=${line%%=*}; v=${line#*=}
    [[ " ${KEYS[*]} " == *" $k "* ]] || continue
    if [[ $v != "$(kv_get "$OPS_ENV" "$k")" ]]; then CHANGED=$((CHANGED + 1)); if [[ -n $v ]]; then kv_set "$OPS_ENV" "$k" "$v"; else kv_del "$OPS_ENV" "$k"; fi; fi
  done
  umask 022
  log "settings: $CHANGED changed; set: $(for k in "${KEYS[@]}"; do [[ -n $(cfg "$k") ]] && printf '%s ' "$k"; done)"
fi
exec </dev/null

unit(){ install -m 644 "$BR_OPS/systemd/$1" "/etc/systemd/system/$1"; }

case $TASK in
  preflight)
    summary_begin "preflight"
    . /etc/os-release; row "os" "$PRETTY_NAME"
    row "cpus / memory" "$(nproc) / $(free -m | awk '/^Mem:/{print $2" MB"}')"
    row "disk /" "$(df -h / | awk 'NR==2{print $2" total, "$4" free"}')"
    row "sudo" "ok"
    for t in docker node caddy ufw fail2ban-client rsync jq; do row "$t" "$(have "$t" && echo installed || echo missing)"; done
    for k in "${KEYS[@]}"; do row "$k" "$([[ -n $(cfg "$k") ]] && echo set || echo '-')"; done
    summary_end ;;
  bootstrap) bash "$BR_OPS/bootstrap.sh" ;;
  postgres) bash "$BR_OPS/postgres.sh" ;;
  deploy) bash "$BR_OPS/deploy.sh" "$ARG" ;;
  rollback) bash "$BR_OPS/deploy.sh" --rollback ;;
  backup)
    unit blindrise-backup.service; unit blindrise-backup.timer; systemctl daemon-reload
    systemctl enable --now blindrise-backup.timer >/dev/null
    bash "$BR_OPS/backup.sh"
    echo "next scheduled backup: $(systemctl list-timers blindrise-backup.timer --no-legend | awk '{print $1, $2, $3}')" ;;
  restore-rehearsal) bash "$BR_OPS/restore-rehearsal.sh" ;;
  monitoring)
    [[ -f $BR_SHARED/monitor.conf ]] || install -m 640 "$BR_OPS/monitor.conf.default" "$BR_SHARED/monitor.conf"
    unit blindrise-monitor.service; unit blindrise-monitor.timer; systemctl daemon-reload
    systemctl enable --now blindrise-monitor.timer >/dev/null
    bash "$BR_OPS/monitor.sh" --report ;;
  alert-test) bash "$BR_OPS/notify.sh" --test ;;
  status)
    summary_begin "status"
    row "service" "$(systemctl is-active "$SERVICE" 2>/dev/null || true) (auto restarts: $(systemctl show "$SERVICE" -p NRestarts --value 2>/dev/null))"
    cur=$(kv_get "$BR_STATE/releases" current); prev=$(kv_get "$BR_STATE/releases" previous)
    row "live / previous" "${cur:0:12} / ${prev:0:12}"
    row "health" "$(curl -s --max-time 5 "http://127.0.0.1:$APP_PORT/healthz" | jq -c '{ok, mode, epoch, leaseLost, dirty}' 2>/dev/null || echo unreachable)"
    row "postgres" "$(docker inspect -f '{{.State.Health.Status}}' "$PG_CONTAINER" 2>/dev/null || echo missing)"
    row "caddy" "$(systemctl is-active caddy 2>/dev/null || true)"
    row "last backup" "$(f=$BR_STATE/backup.last; [[ -f $f ]] && echo "$(kv_get "$f" status) $(kv_get "$f" file), $(( ($(date +%s) - $(kv_get "$f" at)) / 3600 )) h ago" || echo none)"
    row "last rehearsal" "$(f=$BR_STATE/rehearsal.last; [[ -f $f ]] && echo "$(kv_get "$f" verdict) $(kv_get "$f" dump), $(( ($(date +%s) - $(kv_get "$f" at)) / 3600 )) h ago" || echo none)"
    row "monitor" "$(f=$BR_STATE/monitor.last; [[ -f $f ]] && echo "$(kv_get "$f" worst) $(kv_get "$f" failing), $(( ($(date +%s) - $(kv_get "$f" at)) / 60 )) min ago" || echo 'not set up')"
    row "timers" "$(systemctl list-timers 'blindrise*' --no-legend 2>/dev/null | awk '{print $NF}' | tr '\n' ' ')"
    row "disk / mem / load" "$(df -P / | awk 'NR==2{print $5}') / $(awk '/MemAvailable/{a=$2} /MemTotal/{t=$2} END{printf "%d%% avail", a*100/t}' /proc/meminfo) / $(cut -d' ' -f1-3 /proc/loadavg)"
    row "journal errors (1 h)" "$(journalctl -u "$SERVICE" --since -1h --no-pager -o cat 2>/dev/null | grep -ciE 'error|failed' || true)"
    row "fail2ban banned" "$(fail2ban-client status sshd 2>/dev/null | awk -F: '/Currently banned/{gsub(/ /,"",$2); print $2}')"
    summary_end
    [[ -f $BR_STATE/monitor.checks ]] && { echo "last monitor checks:"; cat "$BR_STATE/monitor.checks"; } ;;
  *) die "unknown task '$TASK' (preflight|bootstrap|postgres|deploy <sha>|rollback|backup|restore-rehearsal|monitoring|alert-test|status)" ;;
esac
