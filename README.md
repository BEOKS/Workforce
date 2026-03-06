# Workforce

This repository contains a Codex-based operating model for handling ticket-driven work inside a company.

## Included artifacts

- `docs/codex-ticket-operating-model.md`
  - proposal and system design for a single-agent Codex operating model
- `templates/AGENTS.md`
  - repository or workspace policy template for Codex
- `templates/skills/ticket-operator/SKILL.md`
  - reusable skill template for ticket triage, planning, execution, and reporting
- `templates/skills/ticket-operator/agents/openai.yaml`
  - optional UI metadata for Codex skill lists
- `templates/skills/ticket-operator/references/ticket-contract.md`
  - reference contract for ticket fields, states, and comment conventions
- `templates/ticket-example.yaml`
  - example ticket payload aligned with the proposal
- `.skills/ticket-operator/`
  - local installed copy of the ticket operator skill
- `.agents/skills/ticket-operator/`
  - Codex-discoverable wrapper for the local ticket operator skill
- `scripts/jira_codex_ticket_runner.py`
  - 3-second Jira poller that dispatches TODO tickets to Codex

## Suggested usage

1. Adapt `templates/AGENTS.md` to your repository or workspace policy.
2. Use the local `.skills/ticket-operator/` skill directly, or copy it into your Codex skills directory if needed.
3. Align your board fields with `templates/ticket-example.yaml`.
4. Connect board, Confluence, credential vault, and artifact storage around the same ticket contract.

## Jira runner

Run the Jira poller with Jira Cloud credentials and a target workspace for Codex:

```bash
python3 scripts/jira_codex_ticket_runner.py \
  --jira-base-url "https://your-domain.atlassian.net" \
  --jira-user-email "you@example.com" \
  --jira-api-token "$JIRA_API_TOKEN" \
  --jql 'statusCategory = "To Do" ORDER BY updated ASC' \
  --workdir "/Users/leejs/Project/workforce"
```

Useful flags:

- `--poll-interval-sec 3`
  - poll Jira every 3 seconds
- `--post-comment`
  - write the Codex summary back to Jira as a comment
- `--project-knowledge-dir .runtime/jira-project-knowledge`
  - store per-project Jira knowledge files that are injected into future ticket runs
- `--project-knowledge-max-chars 12000`
  - cap how much project knowledge is embedded into the Codex prompt
- `--once`
  - fetch matching issues once, process the queue, and exit
- `--codex-global-arg=--search`
  - allow Codex web search during execution

When the nested Codex run truly needs extra external API access, define additional allowed hosts with `CODEX_ALLOWED_API_HOSTS`. The runner also auto-adds the hosts from `CONFLUENCE_BASE_URL` and `GITLAB_BASE_URL` to the child allowlist that is embedded in the prompt.

Environment variables are also supported:

- `JIRA_BASE_URL`
- `JIRA_USER_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_JQL`
- `JIRA_POLL_INTERVAL_SEC`
- `JIRA_MAX_RESULTS`
- `JIRA_POST_COMMENT`
- `JIRA_PROJECT_KNOWLEDGE_DIR`
- `JIRA_PROJECT_KNOWLEDGE_MAX_CHARS`
- `CODEX_WORKDIR`
- `CODEX_MODEL`
- `CODEX_SANDBOX`
- `CODEX_GLOBAL_ARGS`
- `CODEX_EXEC_ARGS`
- `CODEX_ALLOWED_API_HOSTS`
- `JIRA_STATE_FILE`

Register the runner as a macOS background agent with env capture from `.env` plus the current shell:

```bash
python3 scripts/register_jira_codex_launch_agent.py
```

This writes the launchd plist, snapshots the current shell's relevant API/token env vars into `.runtime/jira-codex-ticket-runner.launchd-env.json`, and restarts the agent.

## Project knowledge accumulation

The Jira runner now keeps a per-project knowledge store under `.runtime/jira-project-knowledge/`.

- Each Jira project gets a `.json` file for machine-readable facts and a `.md` file for the prompt snapshot.
- Before Codex handles a ticket, the runner injects that project's stored knowledge into the prompt.
- When Codex detects durable project-specific facts or corrections in the ticket, especially from human comments, it returns them as `project_context_updates`.
- The runner merges those updates into the project's knowledge files so future tickets in the same Jira project can use them.
- Jira comments posted by the runner are tracked and excluded from future learning so Codex does not learn back from its own output.
