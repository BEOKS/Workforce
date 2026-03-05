# Worker System Prompt Contract

- Version: 1.0
- Date: 2026-03-05
- Scope: Required system-prompt fields for worker startup

## 1. Purpose
When a worker starts, its system prompt must explicitly define platform-specific environment variable names and API header usage.
This prevents token misuse, naming drift, and unsafe logging.

## 2. Mandatory Prompt Sections
Every worker system prompt must include:
1. Execution context (`ticketId`, `workUnitId`, `platform`, `workspace`).
2. Allowed environment variable names (platform-specific).
3. Header mapping rules for each platform API call.
4. Secret handling rules (no logging, no artifact persistence).
5. Failure behavior when required variables are missing.

## 3. Canonical Environment Variable Names
### 3.1 Common
1. `TICKET_ID`
2. `WORK_UNIT_ID`
3. `TARGET_PLATFORM`
4. `WORKSPACE_ID`

### 3.2 GitLab
1. `GITLAB_BASE_URL`
2. `GITLAB_TOKEN`

### 3.3 GitHub
1. `GITHUB_API_URL`
2. `GITHUB_TOKEN`

### 3.4 Jira
1. `JIRA_BASE_URL`
2. `JIRA_TOKEN`

### 3.5 Confluence
1. `CONFLUENCE_BASE_URL`
2. `CONFLUENCE_TOKEN`

### 3.6 Focalboard
1. `FOCALBOARD_BASE_URL`
2. `FOCALBOARD_TOKEN`

## 4. API Header Mapping
1. GitLab: `PRIVATE-TOKEN: ${GITLAB_TOKEN}` (default)
2. GitHub: `Authorization: Bearer ${GITHUB_TOKEN}`
3. Jira: `Authorization: Bearer ${JIRA_TOKEN}`
4. Confluence: `Authorization: Bearer ${CONFLUENCE_TOKEN}`
5. Focalboard: `Authorization: Bearer ${FOCALBOARD_TOKEN}`

## 5. Secret Safety Rules
1. Never print token values in logs.
2. Never write token values to artifacts, comments, or commit history.
3. Keep tokens only in memory/env during runtime.
4. Fail fast if a required variable is missing.

## 6. Required Startup Validation
Worker must validate:
1. Required env vars for the target platform exist.
2. Token format is non-empty.
3. Base URL is present for the target platform.
4. Execution halts with explicit error code if validation fails.

## 7. Recommended System Prompt Snippet
```text
You are a worker runtime process.
Use only the environment variables defined below.
Do not log or persist any token values.
If required variables are missing, stop immediately with WORKER_ENV_VALIDATION_FAILED.

Platform variable contract:
- GitLab: GITLAB_BASE_URL, GITLAB_TOKEN
- GitHub: GITHUB_API_URL, GITHUB_TOKEN
- Jira: JIRA_BASE_URL, JIRA_TOKEN
- Confluence: CONFLUENCE_BASE_URL, CONFLUENCE_TOKEN
- Focalboard: FOCALBOARD_BASE_URL, FOCALBOARD_TOKEN
```

## 8. Ownership
1. Platform/security admins define variable naming standards.
2. Runtime/orchestrator team enforces injection and validation.
3. Worker implementations must comply with this contract.
