#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DIR="$ROOT_DIR/test"

mkdir -p "$TEST_DIR/reports"
set +e
npm --prefix "$TEST_DIR" run bdd
BDD_EXIT_CODE=$?
set -e
npm --prefix "$TEST_DIR" run report:html
exit "$BDD_EXIT_CODE"
