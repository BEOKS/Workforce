#!/bin/sh
set -eu

CODEX_BASE_URL="${CODEX_BASE_URL:-https://dev-openai-proxy.gabia.app/v1}"
CODEX_ENV_KEY="${CODEX_ENV_KEY:-OPENAI_API_KEY}"

mkdir -p /root/.codex
cat > /root/.codex/config.toml <<EOF
model = "gpt-5.3-codex"
model_provider = "dev-openai-proxy"
model_reasoning_effort = "high"

[model_providers.dev-openai-proxy]
name = "Dev OpenAI Proxy"
base_url = "${CODEX_BASE_URL}"
env_key = "${CODEX_ENV_KEY}"
wire_api = "responses"
requires_openai_auth = false

[notice.model_migrations]
"gpt-5.2" = "gpt-5.3-codex"
EOF

exec node src/server.js
