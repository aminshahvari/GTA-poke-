#!/usr/bin/env bash
# Fail the job with a clear message for every required secret that is empty. Pass the NAMES; the values come in
# through the step's env. Never prints a value.
set -uo pipefail
missing=0
for n in "$@"; do
  if [[ -z ${!n:-} ]]; then
    echo "::error title=Missing secret::Repository secret $n is not set. Add it under Settings > Secrets and variables > Actions > New repository secret (see ops/README.md)."
    missing=$((missing + 1))
  fi
done
[[ $missing -eq 0 ]] || { echo "$missing required secret(s) missing: stopping before contacting the server."; exit 1; }
echo "required secrets present: $*"
