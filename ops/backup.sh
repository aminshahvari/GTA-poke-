#!/usr/bin/env bash
# Back up the staging database: pg_dump custom format, timestamped, keep the newest $BACKUP_KEEP.
#   sudo bash /srv/blindrise/ops/backup.sh          (also run daily by blindrise-backup.timer)
# The dump is taken from an exported snapshot, and in that SAME snapshot the kv row count and a manifest of
# (key, md5(value)) are recorded next to it. restore-rehearsal.sh compares a restore against that manifest, so the
# check is exact even while the app keeps writing.
# Files (dir mode 700, files 600): blindrise-<UTC stamp>.dump, .manifest.tsv, .meta
# Off-box copy hook: if $BACKUP_HOOK (default /srv/blindrise/shared/backup-hook) is executable it is run with the
# dump path as $1 (e.g. rclone/scp/aws s3 cp to object storage). A failing hook keeps the local dump but makes this
# script exit 2, so the timer unit shows failed and the monitor alerts.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
BACKUP_KEEP=${BACKUP_KEEP:-14}
BACKUP_HOOK=${BACKUP_HOOK:-$BR_SHARED/backup-hook}
T0=$(now_ms)
umask 077
install -d -m 700 "$BACKUP_DIR" "$BR_STATE"
PGU=$(pg_user); PGD=$(pg_db)
[[ -n $PGU && -n $PGD ]] || die "$PG_ENV_FILE has no POSTGRES_USER/POSTGRES_DB"
[[ $(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null) == true ]] || die "container $PG_CONTAINER is not running"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BASE=$BACKUP_DIR/blindrise-$STAMP
TMP=$BASE.partial
# shellcheck disable=SC2329  # called by the EXIT trap
cleanup(){ rm -f "$TMP" "$BASE.manifest.partial"; [[ -n ${PIN:-} ]] && exec {PIN}>&- 2>/dev/null; return 0; }
trap cleanup EXIT

# One read-only repeatable-read transaction stays open (coprocess) while pg_dump reuses its snapshot.
coproc PSQL { docker exec -i "$PG_CONTAINER" psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$PGU" -d "$PGD" 2>&1; }
PIN=${PSQL[1]}; POUT=${PSQL[0]}   # closing PIN (below) ends psql
ask(){ printf '%s\n' "$1" >&"$PIN"; }
answer(){ local l; IFS= read -r -t 60 l <&"$POUT" || die "no answer from psql"; printf '%s' "$l"; }
ask "begin transaction isolation level repeatable read read only;"
ask "select pg_export_snapshot();"
SNAP=$(answer)
[[ $SNAP =~ ^[0-9A-F-]+$ ]] || die "could not export a snapshot"
ask "select to_regclass('public.kv') is not null;"
HAS_KV=$(answer)
ROWS=0
if [[ $HAS_KV == t ]]; then
  ask "select count(*) from kv;"; ROWS=$(answer)
  ask "copy (select k, md5(v::text) from kv order by k) to stdout;"
  ask "select '__END_OF_MANIFEST__';"
  while IFS= read -r -t 60 line <&"$POUT"; do
    [[ $line == __END_OF_MANIFEST__ ]] && break
    printf '%s\n' "$line"
  done > "$BASE.manifest.partial"
fi

log "pg_dump (custom format) from snapshot"
D0=$(now_ms)
docker exec "$PG_CONTAINER" pg_dump -U "$PGU" -d "$PGD" -Fc -Z 6 --snapshot="$SNAP" > "$TMP"
DUMP_MS=$(( $(now_ms) - D0 ))
ask "commit;"; exec {PIN}>&-; PIN=
wait "$PSQL_PID" 2>/dev/null || true

# sanity: the archive's table of contents must list the kv table data
TOC=$(docker exec -i "$PG_CONTAINER" pg_restore -l < "$TMP" | grep -c 'TABLE DATA public kv' || true)
[[ $HAS_KV != t || $TOC -ge 1 ]] || die "dump has no kv table data"
MROWS=$( [[ -f $BASE.manifest.partial ]] && wc -l < "$BASE.manifest.partial" || echo 0)
[[ $MROWS -eq $ROWS ]] || die "manifest has $MROWS rows, count said $ROWS"

mv -f "$TMP" "$BASE.dump"
[[ -f $BASE.manifest.partial ]] && mv -f "$BASE.manifest.partial" "$BASE.manifest.tsv"
SHA=$(sha256sum "$BASE.dump" | awk '{print $1}')
SIZE=$(stat -c %s "$BASE.dump")
{
  echo "created=$STAMP"; echo "rows=$ROWS"; echo "snapshot_consistent=1"; echo "sha256=$SHA"; echo "bytes=$SIZE"
  echo "pg_version=$(pg_q 'show server_version')"; echo "image=$(docker inspect -f '{{.Config.Image}}' "$PG_CONTAINER")"
} > "$BASE.meta"

# retention: keep the newest $BACKUP_KEEP dumps (and their side files)
mapfile -t ALL < <(find "$BACKUP_DIR" -maxdepth 1 -name 'blindrise-*.dump' -printf '%f\n' | sort -r)
PRUNED=0
for f in "${ALL[@]:$BACKUP_KEEP}"; do
  b=${f%.dump}; rm -f "$BACKUP_DIR/$b.dump" "$BACKUP_DIR/$b.manifest.tsv" "$BACKUP_DIR/$b.meta"; PRUNED=$((PRUNED + 1))
done
KEPT=$(( ${#ALL[@]} - PRUNED ))

HOOK=none; RC=0
if [[ -x $BACKUP_HOOK ]]; then
  if "$BACKUP_HOOK" "$BASE.dump" >/dev/null 2>&1; then HOOK=ok; else HOOK=FAILED; RC=2; fi
fi
STATUS=ok; [[ $RC -eq 0 ]] || STATUS=hook-failed
printf 'at=%s\nstatus=%s\nfile=%s\nrows=%s\nbytes=%s\nhook=%s\n' "$(date +%s)" "$STATUS" "$(basename "$BASE.dump")" "$ROWS" "$SIZE" "$HOOK" > "$BR_STATE/backup.last"

summary_begin "backup"
row "file" "$(basename "$BASE.dump")"
row "size" "$(numfmt --to=iec "$SIZE")"
row "kv rows (same snapshot)" "$ROWS"
row "sha256" "${SHA:0:16}..."
row "pg_dump took" "$DUMP_MS ms"
row "kept / pruned" "$KEPT / $PRUNED (keep $BACKUP_KEEP)"
row "off-box hook" "$HOOK"
row "total" "$(( $(now_ms) - T0 )) ms"
summary_end
exit "$RC"
