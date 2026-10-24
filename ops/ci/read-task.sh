#!/usr/bin/env bash
# Decide what this workflow run does. workflow_dispatch: the `task` / `ref` inputs. push: the first line of
# ops/run.txt that is not blank or a comment, "<task> [arg]". Writes task=, arg= to $GITHUB_OUTPUT.
# Usage: read-task.sh <run.txt> [dispatch-task] [dispatch-arg]
set -euo pipefail
FILE=$1; DTASK=${2:-}; DARG=${3:-}
if [[ -n $DTASK ]]; then TASK=$DTASK; ARG=$DARG; SRC="workflow_dispatch input"
else
  LINE=$(grep -vE '^[[:space:]]*(#|$)' "$FILE" | head -1 || true)
  read -r TASK ARG _ <<<"$LINE" || true
  TASK=${TASK:-none}; SRC="ops/run.txt"
fi
case $TASK in
  none|preflight|bootstrap|postgres|deploy|rollback|backup|restore-rehearsal|monitoring|alert-test|status|check) ;;
  *) echo "::error::unknown task '$TASK' in $SRC (see ops/README.md)"; exit 1 ;;
esac
[[ -z $ARG || $ARG =~ ^[A-Za-z0-9._/-]{1,100}$ ]] || { echo "::error::argument contains characters that are not allowed"; exit 1; }
echo "task=$TASK" >> "${GITHUB_OUTPUT:-/dev/stdout}"
echo "arg=$ARG" >> "${GITHUB_OUTPUT:-/dev/stdout}"
echo "Requested by $SRC: task=$TASK${ARG:+ arg=$ARG}"
