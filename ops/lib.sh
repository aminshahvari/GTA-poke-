# shellcheck shell=bash
# Shared helpers for the Blindrise staging ops kit. Sourced, never run.
# Everything is overridable through the environment so ops/test/local-e2e.sh can run the same scripts in a temp dir.
# Rule for every script: never print a secret (passwords, OWNER_CODE, SMTP/webhook URLs, DATABASE_URL). Print only
# names, counts, states and timings: the GitHub Actions logs of this public repo are public.

BR_ROOT=${BR_ROOT:-/srv/blindrise}
BR_SHARED=${BR_SHARED:-$BR_ROOT/shared}
BR_STATE=${BR_STATE:-$BR_ROOT/state}
BR_OPS=${BR_OPS:-$BR_ROOT/ops}
BR_RELEASES=${BR_RELEASES:-$BR_ROOT/releases}
BR_CURRENT=${BR_CURRENT:-$BR_ROOT/current}
BACKUP_DIR=${BACKUP_DIR:-$BR_ROOT/backups}
APP_ENV=${APP_ENV:-$BR_SHARED/env}            # the app's env file (mode 600): OWNER_CODE, DATABASE_URL, STAGING=1 ...
PG_ENV_FILE=${PG_ENV_FILE:-$BR_SHARED/pg.env}  # POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB for the container (600)
OPS_ENV=${OPS_ENV:-$BR_SHARED/ops.env}         # domain + alert settings pushed from GitHub secrets (600)
PG_CONTAINER=${PG_CONTAINER:-blindrise-postgres}
APP_PORT=${APP_PORT:-3000}
SERVICE=${SERVICE:-blindrise}

log(){ printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
warn(){ printf '[%s] WARN: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die(){ printf '[%s] ERROR: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; exit 1; }
now_ms(){ date +%s%3N; }
need_root(){ [[ $(id -u) -eq 0 ]] || die "run as root (sudo)"; }
have(){ command -v "$1" >/dev/null 2>&1; }

# KEY=VALUE files are read with awk, never sourced, so a value can hold any character but a newline.
kv_get(){ # file key -> value (empty when missing)
  [[ -r $1 ]] || return 0
  K="$2" awk 'index($0, ENVIRON["K"] "=") == 1 { print substr($0, length(ENVIRON["K"]) + 2); exit }' "$1"
}
kv_set(){ # file key value: replace or append, atomically, keeping the file at mode 600
  local f=$1 tmp; tmp=$(mktemp "$(dirname "$f")/.kv.XXXXXX")
  { [[ -f $f ]] && K="$2" awk 'index($0, ENVIRON["K"] "=") != 1' "$f"; printf '%s=%s\n' "$2" "$3"; } > "$tmp"
  chmod 600 "$tmp"; mv -f "$tmp" "$f"
}
kv_del(){ # file key
  local f=$1 tmp; [[ -f $f ]] || return 0; tmp=$(mktemp "$(dirname "$f")/.kv.XXXXXX")
  K="$2" awk 'index($0, ENVIRON["K"] "=") != 1' "$f" > "$tmp"; chmod 600 "$tmp"; mv -f "$tmp" "$f"
}
cfg(){ kv_get "$OPS_ENV" "$1"; }   # a setting pushed from GitHub secrets

# Summary blocks: the workflows copy everything between these markers into the job summary page.
summary_begin(){ printf '\n=== SUMMARY: %s ===\n' "$*"; }
summary_end(){ printf '=== END SUMMARY ===\n'; }
row(){ printf '%-26s %s\n' "$1" "$2"; }

# A Postgres container helper: psql inside the container, as the configured user (local socket, no password needed).
pg_user(){ kv_get "$PG_ENV_FILE" POSTGRES_USER; }
pg_db(){ kv_get "$PG_ENV_FILE" POSTGRES_DB; }
pg_q(){ docker exec -i "$PG_CONTAINER" psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$(pg_user)" -d "$(pg_db)" -c "$1"; }

# Wait for an HTTP status from a URL. Prints the elapsed ms; returns 1 on timeout.
wait_http(){ # url timeout_s [expect=200]
  local url=$1 t=$2 want=${3:-200} start code; start=$(now_ms)
  while :; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" || true)
    [[ $code == "$want" ]] && { echo $(( $(now_ms) - start )); return 0; }
    (( $(now_ms) - start > t * 1000 )) && { echo $(( $(now_ms) - start )); return 1; }
    sleep 1
  done
}
