#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT_DIR / ".runtime" / "jira-codex-ticket-runner.launchd-env.json"
PREFIXES = (
    "ANTHROPIC_",
    "ATLASSIAN_",
    "CODEX_",
    "CONFLUENCE_",
    "GITLAB_",
    "HIWORKS_",
    "JIRA_",
    "MATTERMOST_",
    "NOTION_",
    "OPENAI_",
    "SLACK_",
)
EXACT_NAMES = (
    "ALL_PROXY",
    "CURL_CA_BUNDLE",
    "HOME",
    "PATH",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "NO_PROXY",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "PYTHONPATH",
    "REQUESTS_CA_BUNDLE",
    "RES_OPTIONS",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "SSH_AUTH_SOCK",
    "TMPDIR",
)


def should_capture(name: str) -> bool:
    if name in EXACT_NAMES:
        return True
    return any(name.startswith(prefix) for prefix in PREFIXES)


def main() -> int:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        key: value
        for key, value in sorted(os.environ.items())
        if should_capture(key) and value
    }
    OUTPUT_PATH.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(payload)} env vars to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
