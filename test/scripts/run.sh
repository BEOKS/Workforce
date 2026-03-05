#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DIR="$ROOT_DIR/test"

mkdir -p "$TEST_DIR/reports"
npm --prefix "$TEST_DIR" run bdd
