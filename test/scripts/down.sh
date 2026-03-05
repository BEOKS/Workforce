#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DIR="$ROOT_DIR/test"
ENV_FILE="$TEST_DIR/.env"
COMPOSE_FILE="$TEST_DIR/docker-compose.integration.yml"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down -v --remove-orphans
