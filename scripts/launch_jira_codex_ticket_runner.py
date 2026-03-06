#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
RUNNER_PATH = ROOT_DIR / "scripts" / "jira_codex_ticket_runner.py"
LAUNCHD_ENV_PATH = ROOT_DIR / ".runtime" / "jira-codex-ticket-runner.launchd-env.json"


def load_dotenv(path: Path, *, override: bool) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if override or key not in os.environ:
            os.environ[key] = value


def load_json_env(path: Path, *, override: bool) -> None:
    if not path.exists():
        return
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"Expected env object in {path}")
    for raw_key, raw_value in payload.items():
        key = str(raw_key).strip()
        if not key:
            continue
        value = str(raw_value)
        if override or key not in os.environ:
            os.environ[key] = value


def main() -> int:
    os.chdir(ROOT_DIR)
    load_dotenv(ROOT_DIR / ".env", override=False)
    load_json_env(LAUNCHD_ENV_PATH, override=True)

    python_bin = os.environ.get("JIRA_CODEX_PYTHON", sys.executable)
    cmd = [python_bin, str(RUNNER_PATH), *sys.argv[1:]]
    os.execvpe(python_bin, cmd, os.environ)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
