#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
RUNTIME_DIR = ROOT_DIR / ".runtime"
LOG_DIR = RUNTIME_DIR / "logs"
LAUNCH_SCRIPT_PATH = ROOT_DIR / "scripts" / "launch_jira_codex_ticket_runner.py"
SYNC_ENV_PATH = ROOT_DIR / "scripts" / "sync_jira_codex_launchd_env.py"
PLIST_PATH = Path.home() / "Library" / "LaunchAgents" / "com.leejs.jira-codex-ticket-runner.plist"
LABEL = "com.leejs.jira-codex-ticket-runner"
DEFAULT_PATH = (
    "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:"
    f"{Path.home() / '.pyenv/shims'}:{Path.home() / '.pyenv/bin'}:{Path.home() / '.bun/bin'}:"
    f"{Path.home() / '.opencode/bin'}:{Path.home() / '.antigravity/antigravity/bin'}:"
    f"{Path.home() / '.nvm/versions/node/v20.11.0/bin'}:{Path.home() / '.cargo/bin'}:"
    f"{Path.home() / '.local/bin'}"
)
REQUIRED_ENV_VARS = (
    "JIRA_BASE_URL",
    "JIRA_USER_EMAIL",
    "JIRA_API_TOKEN",
    "OPENAI_API_KEY",
)


def load_dotenv(path: Path, *, override: bool = False) -> None:
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


def resolve_python() -> str:
    env_python = os.environ.get("JIRA_CODEX_PYTHON")
    if env_python:
        return env_python
    for candidate in ("python3.12", "python3.11", "python3"):
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return sys.executable


def resolve_codex() -> str:
    env_codex = os.environ.get("CODEX_BIN")
    if env_codex:
        return env_codex
    resolved = shutil.which("codex")
    if resolved:
        return resolved
    raise RuntimeError("Could not find `codex` in PATH. Set CODEX_BIN or update PATH.")


def ensure_required_env() -> None:
    missing = [name for name in REQUIRED_ENV_VARS if not os.environ.get(name)]
    if missing:
        names = ", ".join(missing)
        raise RuntimeError(
            f"Missing required environment variables for background registration: {names}"
        )


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=ROOT_DIR,
        check=check,
        text=True,
        capture_output=True,
        env=os.environ.copy(),
    )


def write_plist(python_bin: str, codex_bin: str) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    PLIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "Label": LABEL,
        "ProgramArguments": [
            python_bin,
            str(LAUNCH_SCRIPT_PATH),
            "--codex-binary",
            codex_bin,
        ],
        "WorkingDirectory": str(ROOT_DIR),
        "RunAtLoad": True,
        "KeepAlive": True,
        "EnvironmentVariables": {
            "HOME": str(Path.home()),
            "JIRA_CODEX_PYTHON": python_bin,
            "PATH": os.environ.get("PATH", DEFAULT_PATH),
        },
        "StandardOutPath": str(LOG_DIR / "jira-codex-ticket-runner.launchd.out.log"),
        "StandardErrorPath": str(LOG_DIR / "jira-codex-ticket-runner.launchd.err.log"),
    }
    with PLIST_PATH.open("wb") as fh:
        plistlib.dump(payload, fh, sort_keys=False)


def load_agent() -> None:
    domain = f"gui/{os.getuid()}"
    service = f"{domain}/{LABEL}"
    run(["launchctl", "bootout", domain, str(PLIST_PATH)], check=False)
    run(["launchctl", "bootstrap", domain, str(PLIST_PATH)])
    run(["launchctl", "enable", service], check=False)
    run(["launchctl", "kickstart", "-k", service])


def print_status() -> None:
    domain = f"gui/{os.getuid()}"
    result = run(["launchctl", "print", f"{domain}/{LABEL}"])
    print(result.stdout.strip())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Register the Jira Codex ticket runner as a launchd background agent."
    )
    parser.add_argument(
        "--status-only",
        action="store_true",
        help="Print the current launchd service status without rewriting files.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    os.chdir(ROOT_DIR)
    load_dotenv(ROOT_DIR / ".env", override=False)

    if args.status_only:
        print_status()
        return 0

    ensure_required_env()
    python_bin = resolve_python()
    codex_bin = resolve_codex()

    run([python_bin, str(SYNC_ENV_PATH)])
    write_plist(python_bin, codex_bin)
    run(["plutil", "-lint", str(PLIST_PATH)])
    load_agent()
    print_status()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
