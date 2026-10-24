#!/usr/bin/env bash
# Copy ops/ to the box and run one task there. Settings from the secrets go over ssh stdin (never in argv, never
# echoed). The remote output is shown in the log; the === SUMMARY === blocks are also copied to the job summary.
# Usage: remote.sh <ops-dir> <task> [arg]
set -euo pipefail
OPS=$1; TASK=$2; ARG=${3:-}
tar -C "$OPS" -czf - --exclude ./test . | ssh -o BatchMode=yes staging 'rm -rf ~/blindrise-ops && mkdir -p ~/blindrise-ops && tar -xzf - -C ~/blindrise-ops'
LOG=$(mktemp)
set +e
{
  # only variables the workflow defines are sent (an empty one clears the setting on the box; an undefined one,
  # as in the check workflow, leaves it alone)
  for k in STAGING_DOMAIN STAGING_SMTP_URL STAGING_ALERT_TO STAGING_ALERT_FROM STAGING_ALERT_WEBHOOK; do
    [[ -v $k ]] && printf '%s=%s\n' "$k" "${!k}"
  done
  echo __END__
} | ssh -o BatchMode=yes staging "sudo bash ~/blindrise-ops/ops.sh $TASK $ARG" 2>&1 | tee "$LOG"
RC=${PIPESTATUS[1]}
set -e
if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
  { echo "### $TASK${ARG:+ $ARG}: $([[ $RC -eq 0 ]] && echo OK || echo "FAILED (exit $RC)")"; echo '```'
    sed -n '/^=== SUMMARY/,/^=== END SUMMARY/p' "$LOG" | grep -v '^=== END SUMMARY'; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
fi
rm -f "$LOG"
exit "$RC"
