#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DIR="$ROOT_DIR/test"
ENV_FILE="$TEST_DIR/.env"
COMPOSE_FILE="$TEST_DIR/docker-compose.integration.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$TEST_DIR/.env.example" "$ENV_FILE"
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

bash "$TEST_DIR/scripts/wait-for.sh" "http://localhost:${MOCKSERVER_PORT:-1080}/mockserver/status" 90 2
bash "$TEST_DIR/scripts/wait-for.sh" "http://localhost:${OPENPROJECT_PORT:-8081}/health_checks/default" 300 5
bash "$TEST_DIR/scripts/wait-for.sh" "http://localhost:${SUT_PORT:-8080}/healthz" 180 3

MOCKSERVER_BASE_URL="http://localhost:${MOCKSERVER_PORT:-1080}" \
EXPECTATIONS_FILE="$TEST_DIR/mockserver/expectations/expectations.json" \
  bash "$TEST_DIR/mockserver/init.sh"

echo "integration stack is up"
