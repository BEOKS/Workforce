#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${MOCKSERVER_BASE_URL:-http://localhost:1080}"
EXPECTATIONS_FILE="${EXPECTATIONS_FILE:-$(dirname "$0")/expectations/expectations.json}"

curl -sS -X PUT "${BASE_URL}/mockserver/reset" >/dev/null
curl -sS -X PUT "${BASE_URL}/mockserver/expectation" \
  -H "Content-Type: application/json" \
  -d @"${EXPECTATIONS_FILE}" >/dev/null

echo "MockServer expectations loaded from ${EXPECTATIONS_FILE}"
