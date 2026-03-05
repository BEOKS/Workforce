#!/usr/bin/env bash
set -euo pipefail

URL="${1:-}"
TIMEOUT_SECONDS="${2:-120}"
SLEEP_SECONDS="${3:-2}"

if [[ -z "$URL" ]]; then
  echo "usage: wait-for.sh <url> [timeout_seconds] [sleep_seconds]"
  exit 2
fi

start_ts="$(date +%s)"

while true; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    echo "ready: $URL"
    exit 0
  fi

  now_ts="$(date +%s)"
  elapsed=$(( now_ts - start_ts ))
  if (( elapsed > TIMEOUT_SECONDS )); then
    echo "timeout waiting for $URL (${TIMEOUT_SECONDS}s)"
    exit 1
  fi

  sleep "$SLEEP_SECONDS"
done
