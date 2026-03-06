---
name: ticket-operator
description: Process board tickets with Codex from feasibility triage through planning, sandboxed execution, and ticket update. Use when a ticket needs knowledge gathering from skills, local docs, internal memory, or Confluence before Codex can execute the work and report the result back to the original board item.
metadata:
  short-description: Operate ticket-driven work with Codex
---

# Ticket Operator

Use this skill when Codex is acting as the single execution agent for a ticket.

## Objective

Move a ticket from intake to outcome through one consistent loop:

1. read the ticket
2. decide whether AI can handle it safely
3. resolve missing context from structured knowledge
4. ask follow-up questions only when unresolved
5. plan the work
6. execute inside the allowed sandbox
7. update the ticket with results

## Inputs

Expect the ticket to provide or link:

- ticket ID and source URL
- description and acceptance criteria
- labels or AI eligibility markers
- permissions
- attachments
- related repository or document links

Read `references/ticket-contract.md` when ticket fields or state handling are unclear.

## Core Workflow

### 1. Triage

Classify the ticket as one of:

- `executable`
- `needs-info`
- `blocked`
- `human-only`

Use `human-only` when the ticket requires authority, policy judgment, or sensitive decisions that should not be delegated.

### 2. Knowledge resolution

Before asking a human, gather context in this order:

1. repository or workspace `AGENTS.md`
2. relevant `SKILL.md`
3. local docs, scripts, and templates
4. internal memory or structured DB
5. Confluence search and page retrieval
6. ticket attachments

If multiple sources conflict, prefer the most specific and newest approved source.

### 3. Questions

Only ask follow-up questions when the answer changes:

- execution feasibility
- permission scope
- output destination
- branch or environment target
- approval path

When asking questions:

- keep them concise
- explain why the answer matters
- batch related questions in one comment

### 4. Planning

Before substantive execution, publish a short plan containing:

- scope Codex will handle
- expected artifacts
- systems to be touched
- verification steps
- stop condition if the task grows beyond safe bounds

### 5. Execution

Execute only within the authorized sandbox and credential scope.

Typical work includes:

- code changes
- documentation updates
- report generation
- spreadsheet or slide creation
- merge request preparation
- attachment upload

If the work expands materially, stop and split it into child tickets or report the new scope.

### 6. Result update

When work completes or stops, update the ticket with:

- final status
- result summary
- artifact links or attachments
- verification performed
- remaining risks or follow-up actions

## Comment format

Use stable prefixes:

- `[triage]`
- `[questions]`
- `[plan]`
- `[result]`
- `[blocked]`

## Stop conditions

Stop and update the ticket when:

- the ticket is complete
- required approval is pending
- permission scope is insufficient
- the task must be split
- the task is human-only
- a required upstream system is unavailable

## References

- `references/ticket-contract.md`
