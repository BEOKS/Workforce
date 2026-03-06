# Ticket Contract Reference

Use this reference when the ticket schema or state transition is ambiguous.

## Required fields

- `id`
- `source.system`
- `source.url`
- `title`
- `summary` or `description`
- `status`
- `acceptance_criteria`
- `permissions`

## Recommended fields

- `labels`
- `knowledge_hints.skills`
- `knowledge_hints.confluence_queries`
- `approval.required`
- `approval.reviewers`
- `artifacts`
- `related_repos`
- `linked_pages`

## Standard states

- `new`
- `triage`
- `needs-info`
- `planned`
- `executing`
- `waiting-approval`
- `done`
- `blocked`
- `human-only`

## Suggested transition rules

- `new -> triage`
  - Codex has picked up the ticket
- `triage -> needs-info`
  - missing information blocks safe execution
- `triage -> planned`
  - enough information exists to proceed
- `planned -> executing`
  - Codex has published the plan and started work
- `executing -> waiting-approval`
  - work is finished but explicit approval is required
- `executing -> done`
  - work is complete and no approval gate remains
- `any -> blocked`
  - permissions or systems prevent progress
- `triage -> human-only`
  - Codex should not execute this work

## Minimal comment expectations

- `[triage]`
  - classification and one-line reason
- `[questions]`
  - missing information and why it matters
- `[plan]`
  - scope, outputs, systems touched
- `[result]`
  - completed actions, artifacts, verification
- `[blocked]`
  - blocking dependency or permission problem

## Artifact examples

- repository branch or merge request link
- generated spreadsheet
- slide deck
- exported report
- updated document link
- uploaded attachment list
