#!/usr/bin/env bash
set -euo pipefail

URL="${1:-}"
TIMEOUT_SECONDS="${2:-120}"
SLEEP_SECONDS="${3:-2}"
MODE="${4:-strict}"

if [[ -z "$URL" ]]; then
  echo "usage: wait-for.sh <url> [timeout_seconds] [sleep_seconds] [strict|any]"
  exit 2
fi

start_ts="$(date +%s)"

parse_host_port() {
  local raw_url="$1"
  local scheme rest host_port host port

  scheme="${raw_url%%://*}"
  rest="${raw_url#*://}"
  host_port="${rest%%/*}"
  host="${host_port%%:*}"
  port="${host_port##*:}"

  if [[ "$host_port" == "$host" ]]; then
    if [[ "$scheme" == "https" ]]; then
      port="443"
    else
      port="80"
    fi
  fi

  echo "$host" "$port"
}

while true; do
  if [[ "$MODE" == "any" ]]; then
    if curl -sS --max-time 2 "$URL" >/dev/null 2>&1; then
      echo "ready: $URL"
      exit 0
    fi

    read -r host port <<<"$(parse_host_port "$URL")"
    if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      echo "ready: $URL"
      exit 0
    fi
  elif curl -fsS "$URL" >/dev/null 2>&1; then
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
