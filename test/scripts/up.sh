#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DIR="$ROOT_DIR/test"
SUT_DIR="$ROOT_DIR/sut"
ENV_FILE="$TEST_DIR/.env"
SUT_ENV_FILE="$SUT_DIR/.env"
COMPOSE_FILE="$TEST_DIR/docker-compose.integration.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$TEST_DIR/.env.example" "$ENV_FILE"
fi

if [[ ! -f "$SUT_ENV_FILE" ]]; then
  cp "$SUT_DIR/.env.example" "$SUT_ENV_FILE"
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

bash "$TEST_DIR/scripts/wait-for.sh" "http://localhost:${MOCKSERVER_PORT:-1080}/" 90 2 any
bash "$TEST_DIR/scripts/wait-for.sh" "http://localhost:${MOCKSERVER_PORT:-1080}/platform/health" 60 2
bash "$TEST_DIR/scripts/wait-for.sh" "http://localhost:${SUT_PORT:-8080}/healthz" 180 3

MOCKSERVER_BASE_URL="http://localhost:${MOCKSERVER_PORT:-1080}" \
EXPECTATIONS_FILE="$TEST_DIR/mockserver/expectations/expectations.json" \
  bash "$TEST_DIR/mockserver/init.sh"

echo "integration stack is up"
