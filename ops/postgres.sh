#!/usr/bin/env bash
# Start (or update) the Postgres 16 container and wait until it is healthy. Idempotent.
#   sudo bash ops.sh postgres
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
COMPOSE_FILE=${COMPOSE_FILE:-$BR_OPS/compose.postgres.yml}
COMPOSE_PROJECT=${COMPOSE_PROJECT:-blindrise}
T0=$(now_ms)
[[ -s $PG_ENV_FILE ]] || die "$PG_ENV_FILE is missing: run the bootstrap task first"
[[ -n $(pg_user) && -n $(pg_db) && -n $(kv_get "$PG_ENV_FILE" POSTGRES_PASSWORD) ]] || die "$PG_ENV_FILE is incomplete"
export PG_ENV_FILE PG_CONTAINER
log "docker compose up (project $COMPOSE_PROJECT)"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --quiet-pull 2>&1 | grep -v -i password || true
log "waiting for the healthcheck"
health=starting
for _ in $(seq 1 60); do
  health=$(docker inspect -f '{{.State.Health.Status}}' "$PG_CONTAINER" 2>/dev/null || echo missing)
  [[ $health == healthy ]] && break
  sleep 2
done
BIND=$(docker port "$PG_CONTAINER" 5432/tcp 2>/dev/null | tr '\n' ' ')
summary_begin "postgres"
row "container" "$PG_CONTAINER ($(docker inspect -f '{{.Config.Image}}' "$PG_CONTAINER" 2>/dev/null))"
row "health" "$health"
row "published on" "${BIND:-none}"
if [[ $health == healthy ]]; then
  row "server version" "$(pg_q 'show server_version')"
  row "database size" "$(pg_q "select pg_size_pretty(pg_database_size(current_database()))")"
  if [[ $(pg_q "select to_regclass('public.kv') is not null") == t ]]; then row "kv rows" "$(pg_q 'select count(*) from kv')"
  else row "kv rows" "table not created yet (the app creates it on first boot)"; fi
fi
row "took" "$(( ($(now_ms) - T0) / 1000 )) s"
summary_end
[[ $health == healthy ]] || die "postgres did not become healthy"
[[ $BIND != *0.0.0.0* && $BIND != *'[::]'* ]] || die "postgres is published on a public address: refusing"
