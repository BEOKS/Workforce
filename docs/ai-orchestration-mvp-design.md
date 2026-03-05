# Enterprise Multi-Agent Ticket Orchestration MVP Design

- Date: 2026-03-05
- Scope: MVP
- Ticket Platforms: Multi-board support (GitLab, GitHub, Jira, Focalboard)
- Integration Model: Platform APIs through adapter interfaces

## 1. Background and Problem
Current AI agent operations are often optimized for a single task or a single team, which is not enough to reflect enterprise-level collaboration structures that involve multi-party communication, negotiation, and coordination.
This design keeps the existing human ticket workflow intact while increasing automation for tasks that are suitable for AI execution.
Use the [architecture document](./ai-orchestration-architecture.md) for system structure and flow, [eligibility criteria](./ai-eligibility-criteria.md) for AI-processable decisions, and [Ticket Platform Interface](./ticket-platform-interface.md) for integration contracts.

## 2. Goals
1. Introduce an automated loop for AI-processable work while preserving the existing ticket collaboration model.
2. Ensure safe automation with inspection Q/A and a human approval gate.
3. Maximize completion rate for AI-processable tasks.
4. Enable new platform integrations by implementing adapters only.

## 3. Non-Goals
1. Replacing company-level decision or organizational structures.
2. Removing human approval entirely.
3. Hardcoding platform-specific behavior in orchestration core logic.

## 4. Key Decisions
1. Inspection ownership: AI leader-driven with final human approval.
2. AI eligibility decision: Hybrid rule-based + LLM (details in [eligibility criteria](./ai-eligibility-criteria.md)).
3. Platform integration: `TicketPlatformAdapter` interface-based.
4. Execution isolation: Docker containers (see [Sandbox Runtime Architecture](./sandbox-runtime-architecture.md)).
5. Secrets management: Central secret manager (ticket stores references only).
6. Large task handling: DAG decomposition + topological ordering.
7. Failure handling: Automatic retries followed by escalation.
8. Primary KPI: Completion rate of AI-processable tasks.

## 5. System Components
1. Ingestor: Collects new/updated tickets through adapters.
2. Platform Router: Selects adapter based on platform type.
3. Eligibility Evaluator: Determines AI-processable status.
4. Leader Agent: Generates inspection questions, validates answers, requests approval.
5. Dispatcher: Worker assignment, queueing, prioritization.
6. Worker Runtime: Executes tasks in Docker sandbox (details: [Sandbox Runtime Architecture](./sandbox-runtime-architecture.md)); worker startup prompt must follow [Worker System Prompt Contract](./worker-system-prompt-contract.md).
7. Decomposer: Splits large tasks into DAG work units.
8. Result Publisher: Publishes comments, attachments, and status updates.
9. Secret Broker: Resolves credential references (details: [Secret Broker Architecture](./secret-broker-architecture.md)).
10. Audit/Telemetry: Captures state changes, failures, cost, and access events.

## 6. Ticket State Machine
1. NEW
2. TRIAGE_PENDING
3. TRIAGE_DONE
4. INSPECTION_QA
5. INSPECTION_APPROVAL
6. READY_TO_ASSIGN
7. DECOMPOSING (optional)
8. QUEUED
9. RUNNING
10. RETRYING
11. ESCALATED
12. DONE

## 7. Ticket Platform Interface
See [Ticket Platform Interface](./ticket-platform-interface.md) for full signatures.

Core methods:
1. `listUpdatedTickets(...)`
2. `getTicket(...)`
3. `listComments(...)`
4. `postComment(...)`
5. `addAttachments(...)`
6. `updateLabels(...)`
7. `transitionState(...)`
8. `capabilities()`

Supported adapters:
1. GitLab Adapter
2. GitHub Adapter
3. Jira Adapter
4. Focalboard Adapter

## 8. Execution Flow
1. Ingestor fetches new tickets through the selected adapter.
2. Eligibility evaluator calculates and stores `ai-processable` outcomes.
3. Leader posts inspection questions and collects user responses.
4. Human approval is requested when inspection criteria are met.
5. Dispatcher assigns worker(s) after approval.
6. Large tasks are decomposed into DAG work units and scheduled topologically.
7. Worker executes task in Docker sandbox.
8. Publisher writes comments, attachments, and state updates through the adapter.
9. Failures are retried; terminal failures are escalated.

## 9. Security and Access Control
1. No raw secrets in tickets.
2. Tickets store `grant_ref_ids`; real credentials remain in central secret manager (see [Secret Broker Architecture](./secret-broker-architecture.md)).
3. `grant_ref_ids` are registered by platform/security admins in the secret manager, and only references are attached during inspection/approval.
4. Workers receive only short-lived, least-privilege tokens.
5. All access events are written to audit logs.
6. Platform token scopes are separated per adapter.

## 10. Failure Policy
1. Default retry count: 3 with exponential backoff.
2. Immediate escalation on repeated same-cause failures.
3. Escalation payload must include:
   - Failure summary
   - Execution log reference
   - Reproduction steps
   - Human action guidance

## 11. Acceptance Criteria
1. AI-processable task completion rate >= 60%.
2. Result publishing accuracy >= 95%.
3. Zero executions without human approval.
4. Zero credential leak incidents.
5. Zero missing audit events.
6. Consistent state-machine behavior validated on at least 2 platforms.

## 12. Test Scenarios
1. End-to-end normal completion (per platform).
2. Inspection Q/A iteration loop.
3. Execution blocked without approval.
4. DAG dependency order enforcement.
5. Safe failure on insufficient token scope.
6. Publishing consistency checks.
7. Retry and escalation path validation.
8. Blocking bypass attempts when `ai-processable=false`.
9. Capability fallback behavior validation.

## 13. Implementation Order
1. Lock `TicketPlatformAdapter` interface and unified domain model.
2. Implement GitLab adapter as baseline.
3. Build state machine and ingestion pipeline.
4. Add eligibility and labeling automation.
5. Add inspection Q/A and approval gate.
6. Add worker runtime and secret broker integration.
7. Generalize result publishing.
8. Add GitHub, Jira, Focalboard adapters.
9. Build cross-platform regression suite and monitoring.

## 14. Explicit Assumptions
1. Service/app tokens are available for each platform API.
2. Platform-specific least-privilege token policies exist.
3. Central secret manager and audit storage are available.
4. Platform-specific status/field mappings are maintained at adapter level.
