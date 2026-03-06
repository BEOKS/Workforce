#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_ENV_FILE = ".env"
DEFAULT_SEARCH_LIMIT = 10
DEFAULT_GET_EXPAND = "body.storage,body.view,version,space,history,metadata.labels,ancestors"


def load_dotenv(path: Path) -> None:
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
        os.environ.setdefault(key, value)


def env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def require_env(name: str) -> str:
    value = env(name)
    if value:
        return value
    raise SystemExit(f"[ERROR] Missing required env: {name}")


def looks_like_basic_token(token: str) -> bool:
    try:
        decoded = base64.b64decode(token, validate=True).decode(
            "utf-8", errors="replace"
        )
    except Exception:
        return False
    return ":" in decoded


def build_auth_header() -> str:
    explicit = env("CONFLUENCE_AUTH_HEADER")
    if explicit:
        return explicit

    bearer = env("ATLASSIAN_OAUTH_ACCESS_TOKEN")
    if bearer:
        return f"Bearer {bearer}"

    username = env("CONFLUENCE_USERNAME") or env("ATLASSIAN_EMAIL")
    token = env("CONFLUENCE_API_TOKEN") or env("ATLASSIAN_API_TOKEN")
    if username and token:
        raw = f"{username}:{token}".encode("utf-8")
        return "Basic " + base64.b64encode(raw).decode("ascii")

    if token:
        if token.startswith("Basic ") or token.startswith("Bearer "):
            return token
        if looks_like_basic_token(token):
            return "Basic " + token
        return f"Bearer {token}"

    raise SystemExit(
        "[ERROR] Missing Confluence auth. Set one of:\n"
        "  - CONFLUENCE_AUTH_HEADER\n"
        "  - ATLASSIAN_OAUTH_ACCESS_TOKEN\n"
        "  - CONFLUENCE_USERNAME + CONFLUENCE_API_TOKEN\n"
        "  - ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN\n"
        "  - CONFLUENCE_API_TOKEN"
    )


def base_url() -> str:
    return require_env("CONFLUENCE_BASE_URL").rstrip("/")


def request_json(
    method: str,
    path: str,
    *,
    params: dict[str, str] | None = None,
    body: dict | list | None = None,
) -> dict:
    url = f"{base_url()}{path}"
    if params:
        qs = urllib.parse.urlencode(params, doseq=True)
        url = f"{url}?{qs}"

    headers = {
        "Accept": "application/json",
        "Authorization": build_auth_header(),
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            raw = response.read().decode("utf-8")
            if not raw:
                return {}
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(
            f"[ERROR] Confluence API error: {exc.code} {exc.reason}\n{raw}"
        ) from None
    except urllib.error.URLError as exc:
        raise SystemExit(f"[ERROR] Network error: {exc}") from None


def request_no_content(
    method: str,
    path: str,
    *,
    params: dict[str, str] | None = None,
) -> None:
    request_json(method, path, params=params)


def read_text_argument(value: str | None, file_path: str | None) -> str:
    if value is not None:
        return value
    if file_path is not None:
        return Path(file_path).read_text(encoding="utf-8")
    if not sys.stdin.isatty():
        return sys.stdin.read()
    raise SystemExit("[ERROR] Provide --content, --content-file, or pipe content via stdin.")


def resolve_page_id(raw: str) -> str:
    if raw.isdigit():
        return raw
    match = re.search(r"/pages/(\d+)", raw)
    if match:
        return match.group(1)
    return raw


def wrap_query_as_cql(query: str) -> str:
    if any(
        token in query
        for token in ["=", "~", ">", "<", " AND ", " OR ", "currentUser()", "label ="]
    ):
        return query
    term = query.replace('"', '\\"')
    return f'(title ~ "{term}" OR text ~ "{term}")'


def parse_labels(raw_labels: list[str], csv_labels: str | None) -> list[str]:
    items: list[str] = []
    for label in raw_labels:
        value = label.strip()
        if value:
            items.append(value)
    if csv_labels:
        for label in csv_labels.split(","):
            value = label.strip()
            if value:
                items.append(value)
    seen: set[str] = set()
    ordered: list[str] = []
    for label in items:
        if label not in seen:
            seen.add(label)
            ordered.append(label)
    return ordered


def get_page(page_id: str, expand: str = DEFAULT_GET_EXPAND) -> dict:
    return request_json(
        "GET",
        f"/rest/api/content/{resolve_page_id(page_id)}",
        params={"expand": expand},
    )


def get_page_by_title(space_key: str, title: str, expand: str = DEFAULT_GET_EXPAND) -> dict:
    payload = request_json(
        "GET",
        "/rest/api/content",
        params={"spaceKey": space_key, "title": title, "expand": expand},
    )
    results = payload.get("results") or []
    if not results:
        raise SystemExit("[ERROR] Page not found by title + space key.")
    return results[0]


def get_page_labels(page_id: str) -> list[str]:
    payload = request_json("GET", f"/rest/api/content/{resolve_page_id(page_id)}/label")
    labels: list[str] = []
    for item in payload.get("results") or []:
        name = item.get("name")
        if name:
            labels.append(name)
    return labels


def add_labels(page_id: str, labels: list[str]) -> None:
    if not labels:
        return
    body = [{"prefix": "global", "name": label} for label in labels]
    request_json("POST", f"/rest/api/content/{resolve_page_id(page_id)}/label", body=body)


def remove_label(page_id: str, label: str) -> None:
    request_no_content(
        "DELETE",
        f"/rest/api/content/{resolve_page_id(page_id)}/label",
        params={"name": label},
    )


def sync_labels(page_id: str, labels: list[str], replace: bool) -> list[str]:
    current = set(get_page_labels(page_id))
    desired = set(labels)

    if replace:
        for label in sorted(current - desired):
            remove_label(page_id, label)
        to_add = sorted(desired - current)
        add_labels(page_id, to_add)
        return sorted(desired)

    to_add = sorted(desired - current)
    add_labels(page_id, to_add)
    return sorted(current | desired)


def build_page_url(page: dict) -> str | None:
    page_id = page.get("id")
    space_key = ((page.get("space") or {}) if isinstance(page.get("space"), dict) else {}).get("key")
    if not page_id or not space_key:
        return None
    return f"{base_url()}/spaces/{space_key}/pages/{page_id}"


def page_summary(page: dict, *, include_body: bool) -> dict:
    body = page.get("body") or {}
    storage = ((body.get("storage") or {}) if isinstance(body, dict) else {}).get("value")
    view = ((body.get("view") or {}) if isinstance(body, dict) else {}).get("value")
    version = page.get("version") or {}
    history = page.get("history") or {}
    metadata = page.get("metadata") or {}
    label_results = ((metadata.get("labels") or {}) if isinstance(metadata, dict) else {}).get("results") or []
    ancestors = page.get("ancestors") or []

    return {
        "id": page.get("id"),
        "type": page.get("type"),
        "status": page.get("status"),
        "title": page.get("title"),
        "spaceKey": ((page.get("space") or {}) if isinstance(page.get("space"), dict) else {}).get("key"),
        "url": build_page_url(page),
        "version": {
            "number": version.get("number"),
            "when": version.get("when"),
            "message": version.get("message"),
            "by": ((version.get("by") or {}) if isinstance(version, dict) else {}).get("displayName"),
        },
        "createdAt": history.get("createdDate"),
        "labels": [item.get("name") for item in label_results if item.get("name")],
        "ancestorIds": [item.get("id") for item in ancestors if item.get("id")],
        "body": {
            "storage": storage if include_body else None,
            "view": view if include_body else None,
        },
    }


def normalize_body(content: str, fmt: str) -> tuple[str, str]:
    normalized = (fmt or "storage").lower()
    if normalized in {"storage", "html"}:
        return content, "storage"
    raise SystemExit("[ERROR] Only --format storage or --format html is supported.")


def cmd_search(args: argparse.Namespace) -> None:
    cql = args.cql or wrap_query_as_cql(args.query)
    payload = request_json(
        "GET",
        "/rest/api/search",
        params={
            "cql": cql,
            "limit": str(max(1, min(100, args.limit))),
            "start": str(max(0, args.start)),
        },
    )
    results: list[dict] = []
    for item in payload.get("results") or []:
        content = item.get("content") or {}
        results.append(
            {
                "id": item.get("id") or content.get("id"),
                "title": item.get("title") or content.get("title"),
                "type": item.get("type") or content.get("type"),
                "spaceKey": ((item.get("space") or {}) if isinstance(item.get("space"), dict) else {}).get("key")
                or ((content.get("space") or {}) if isinstance(content.get("space"), dict) else {}).get("key"),
                "url": build_page_url(content or item),
                "excerpt": item.get("excerpt"),
                "lastModified": (((content.get("version") or {}) if isinstance(content, dict) else {}).get("when")),
            }
        )
    print(json.dumps(results, ensure_ascii=False, indent=2))


def cmd_get(args: argparse.Namespace) -> None:
    if args.page_id:
        page = get_page(args.page_id)
    else:
        page = get_page_by_title(args.space_key, args.title)
    print(json.dumps(page_summary(page, include_body=not args.metadata_only), ensure_ascii=False, indent=2))


def cmd_create(args: argparse.Namespace) -> None:
    content = read_text_argument(args.content, args.content_file)
    body_value, representation = normalize_body(content, args.format)
    payload = {
        "type": "page",
        "title": args.title,
        "space": {"key": args.space_key},
        "body": {"storage": {"value": body_value, "representation": representation}},
    }
    if args.parent_id:
        payload["ancestors"] = [{"id": resolve_page_id(args.parent_id)}]

    page = request_json("POST", "/rest/api/content", body=payload)
    labels = parse_labels(args.label, args.labels)
    if labels:
        sync_labels(str(page["id"]), labels, replace=False)
        page = get_page(str(page["id"]))
    print(json.dumps(page_summary(page, include_body=False), ensure_ascii=False, indent=2))


def cmd_update(args: argparse.Namespace) -> None:
    page_id = resolve_page_id(args.page_id)
    current = get_page(page_id, expand="version,space,metadata.labels,ancestors")
    current_version = ((current.get("version") or {}) if isinstance(current.get("version"), dict) else {}).get("number") or 1
    content = read_text_argument(args.content, args.content_file)
    body_value, representation = normalize_body(content, args.format)
    payload = {
        "id": page_id,
        "type": "page",
        "title": args.title or current.get("title"),
        "body": {"storage": {"value": body_value, "representation": representation}},
        "version": {
            "number": int(current_version) + 1,
            "minorEdit": bool(args.minor_edit),
        },
    }
    if args.version_comment:
        payload["version"]["message"] = args.version_comment
    if args.parent_id:
        payload["ancestors"] = [{"id": resolve_page_id(args.parent_id)}]

    request_json("PUT", f"/rest/api/content/{page_id}", body=payload)

    labels = parse_labels(args.label, args.labels)
    if labels or args.replace_labels:
        sync_labels(page_id, labels, replace=args.replace_labels)

    page = get_page(page_id)
    print(json.dumps(page_summary(page, include_body=False), ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Search, inspect, create, and update Confluence pages with CQL and storage HTML."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    search = sub.add_parser("search", help="Search pages with CQL or a simple query.")
    search_group = search.add_mutually_exclusive_group(required=True)
    search_group.add_argument("--cql", help="Raw Confluence CQL.")
    search_group.add_argument("--query", help="Simple text query; wrapped into CQL automatically.")
    search.add_argument("--limit", type=int, default=DEFAULT_SEARCH_LIMIT)
    search.add_argument("--start", type=int, default=0)
    search.set_defaults(func=cmd_search)

    get = sub.add_parser("get", help="Get page metadata and body.")
    get_group = get.add_mutually_exclusive_group(required=True)
    get_group.add_argument("--page-id", help="Page ID or Confluence page URL.")
    get_group.add_argument("--title", help="Page title. Requires --space-key.")
    get.add_argument("--space-key", help="Space key for title lookup.")
    get.add_argument("--metadata-only", action="store_true")
    get.set_defaults(func=cmd_get)

    create = sub.add_parser("create", help="Create a new page with storage HTML.")
    create.add_argument("--space-key", required=True)
    create.add_argument("--title", required=True)
    create.add_argument("--parent-id", help="Optional parent page ID or URL.")
    create.add_argument("--format", default="storage", choices=["storage", "html"])
    create.add_argument("--content")
    create.add_argument("--content-file")
    create.add_argument("--label", action="append", default=[])
    create.add_argument("--labels", help="Comma-separated labels.")
    create.set_defaults(func=cmd_create)

    update = sub.add_parser("update", help="Update an existing page with storage HTML.")
    update.add_argument("--page-id", required=True, help="Page ID or Confluence page URL.")
    update.add_argument("--title", help="Optional new title. Defaults to the current title.")
    update.add_argument("--parent-id", help="Optional new parent page ID or URL.")
    update.add_argument("--format", default="storage", choices=["storage", "html"])
    update.add_argument("--content")
    update.add_argument("--content-file")
    update.add_argument("--label", action="append", default=[])
    update.add_argument("--labels", help="Comma-separated labels.")
    update.add_argument("--replace-labels", action="store_true")
    update.add_argument("--minor-edit", action="store_true")
    update.add_argument("--version-comment")
    update.set_defaults(func=cmd_update)

    return parser


def main() -> int:
    load_dotenv(Path.cwd() / DEFAULT_ENV_FILE)
    parser = build_parser()
    args = parser.parse_args()
    if args.command == "get" and args.title and not args.space_key:
        parser.error("--title requires --space-key")
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
