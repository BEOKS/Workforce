# AI Ticket Orchestration MVP Architecture (Multi-Platform)

- Version: 2.1
- Date: 2026-03-05
- Scope: Enterprise-wide ticket workflow automation MVP
- Supported Platforms: GitLab, GitHub, Jira, Focalboard

## 1. Architecture Intent
This document describes a multi-agent architecture that automates AI-processable ticket work while preserving enterprise collaboration workflows.
It defines component boundaries, execution flow, state transitions, and trust boundaries.
Platform integration contracts are standardized by [Ticket Platform Interface](./ticket-platform-interface.md).

### 1.1 At a Glance
This system keeps human-centered ticket collaboration and automates only work that AI can safely process.

Core flow:
1. Read a ticket through the ingestion pipeline (details: [AI Ticket Ingestion Architecture](./ai-ingestion-architecture.md)) and [determine AI eligibility](./ai-eligibility-criteria.md).
2. [If required information is missing](./ai-inspection-qa-guideline.md), the AI leader asks clarification questions and collects responses.
3. After approval, workers execute in [sandboxed runtime](./sandbox-runtime-architecture.md), using startup prompt rules from [Worker System Prompt Contract](./worker-system-prompt-contract.md).
4. Publish results back to the source ticket platform (comment, attachment, state update).

### 1.2 Suggested Reading Order
1. `2. System Context`
2. [AI Ticket Ingestion Architecture](./ai-ingestion-architecture.md)
3. `4. End-to-End Execution Sequence`
4. `5. Ticket State Machine`
5. `7. Trust Boundaries and Security Zones`
6. `3, 6, 8, 9, 10` for implementation and operations details

### 1.3 Terms
1. Leader Agent: controls inspection, validation, and approval requests.
2. Worker: executes concrete tasks.
3. Decomposer: breaks large tasks into DAG work units.
4. Orchestrator: central flow and state coordinator.
5. Ticket Platform Adapter: converts platform APIs into unified contract.

## 2. System Context
This diagram shows external platforms, internal control flow, and publish path.

```mermaid
flowchart LR
    U[Requester / Assignee / Approver] -->|Ticket / Comment| TP[(Ticket Platforms)]
    TP -->|API| ING[Ingestor]
    ING --> ORCH[Orchestrator]

    ORCH --> ELIG[Eligibility Evaluator\nRules + LLM]
    ORCH --> LEAD[Leader Agent\nInspection Q/A]
    ORCH --> DISP[Dispatcher]

    DISP --> WRK[Worker Runtime\nDocker]
    WRK --> PUB[Result Publisher]
    PUB -->|Comment / Attach / Label / State| TP

    WRK --> SEC[(Secret Manager)]
    ORCH --> OBS[(Audit + Telemetry)]
    WRK --> OBS
    PUB --> OBS
```

Interpretation:
1. Users interact only through their ticket platform.
2. Worker credentials are always brokered by secret manager (see [Secret Broker Architecture](./secret-broker-architecture.md)).
3. Ingestor reads platform updates through adapters and normalizes them before orchestration (details: [AI Ticket Ingestion Architecture](./ai-ingestion-architecture.md)).
4. Results are published back to the originating platform through publisher + adapter.

Ingestion connection settings (platform type, host/base URL, auth reference, polling/webhook mode) are managed through the Ingester Admin Console, which supports multiple platform registrations, defined in [AI Ticket Ingestion Architecture](./ai-ingestion-architecture.md).

## 3. Logical Components
The architecture is split into four planes:
1. Control Plane
2. Integration Plane
3. Execution Plane
4. Platform Services

```mermaid
flowchart TB
    subgraph ControlPlane[Control Plane]
        ING[Ingestor]
        ELIG[Eligibility Evaluator]
        LEAD[Leader Agent]
        DISP[Dispatcher]
        DECOMP[Decomposer\nDAG + Topological Sort]
        PUB[Result Publisher]
        PR[Platform Router]
    end

    subgraph IntegrationPlane[Integration Plane]
        SPI[TicketPlatformAdapter Interface]
        A1[GitLabAdapter]
        A2[GitHubAdapter]
        A3[JiraAdapter]
        A4[FocalboardAdapter]
    end

    subgraph DataPlane[Execution Plane]
        WRK1[Worker A]
        WRK2[Worker B]
        WRK3[Worker N]
    end

    subgraph Platform[Platform Services]
        SEC[(Secret Broker)]
        QUE[(Job Queue)]
        OBS[(Audit/Telemetry)]
        ART[(Artifact Storage)]
    end

    PR --> SPI
    SPI --> A1
    SPI --> A2
    SPI --> A3
    SPI --> A4

    A1 --> GL[(GitLab)]
    A2 --> GH[(GitHub)]
    A3 --> JR[(Jira)]
    A4 --> FB[(Focalboard)]

    ING --> PR
    PR --> ELIG
    ELIG --> LEAD
    LEAD --> DISP
    DISP --> DECOMP
    DECOMP --> QUE
    QUE --> WRK1
    QUE --> WRK2
    QUE --> WRK3

    WRK1 --> PUB
    WRK2 --> PUB
    WRK3 --> PUB
    PUB --> PR

    WRK1 --> SEC
    WRK2 --> SEC
    WRK3 --> SEC

    PUB --> ART
    ING --> OBS
    ELIG --> OBS
    LEAD --> OBS
    DISP --> OBS
    DECOMP --> OBS
    WRK1 --> OBS
    WRK2 --> OBS
    WRK3 --> OBS
    PUB --> OBS
```

## 4. End-to-End Execution Sequence
Ingestion-specific behavior (mode selection, normalization, dedupe, and handoff checkpoints) is defined in [AI Ticket Ingestion Architecture](./ai-ingestion-architecture.md).

```mermaid
sequenceDiagram
    autonumber
    participant User as Requester
    participant TP as Ticket Platform
    participant AD as Platform Adapter
    participant ING as Ingestor
    participant ORCH as Orchestrator
    participant LEAD as Leader Agent
    participant APR as Human Approver
    participant DISP as Dispatcher
    participant DE as Decomposer
    participant WRK as Worker(Docker)
    participant SEC as Secret Broker
    participant PUB as Result Publisher

    User->>TP: Create/Update Ticket
    AD->>TP: Fetch events (API)
    AD->>ING: UnifiedTicket
    ING->>ORCH: Normalize ticket context
    ORCH->>ORCH: Eligibility (Rules + LLM)
    ORCH->>AD: Set ai-processable labels/fields

    ORCH->>LEAD: Start inspection session
    LEAD->>AD: Post clarification questions
    User->>TP: Reply with answers
    AD->>LEAD: Sync answer comments
    LEAD->>AD: Request approval
    APR->>TP: Approve execution

    ORCH->>DISP: Create execution job
    DISP->>DE: Decompose if oversized
    DE-->>DISP: DAG work units
    DISP->>WRK: Dispatch runnable unit
    WRK->>SEC: Request scoped credentials
    SEC-->>WRK: Short-lived token
    WRK->>WRK: Execute task in sandbox
    WRK-->>PUB: Execution result + artifacts
    PUB->>AD: Publish result update
    AD->>TP: Comment + attachments + state transition
```

## 5. Ticket State Machine
The internal state machine is platform-agnostic.
Adapters map platform-native status/fields to these states.

```mermaid
stateDiagram-v2
    [*] --> NEW
    NEW --> TRIAGE_PENDING
    TRIAGE_PENDING --> TRIAGE_DONE
    TRIAGE_DONE --> INSPECTION_QA: ai-processable=true
    TRIAGE_DONE --> [*]: ai-processable=false

    INSPECTION_QA --> INSPECTION_QA: need more info
    INSPECTION_QA --> INSPECTION_APPROVAL: criteria met
    INSPECTION_APPROVAL --> READY_TO_ASSIGN: approved
    INSPECTION_APPROVAL --> INSPECTION_QA: rejected/needs updates

    READY_TO_ASSIGN --> DECOMPOSING: oversized task
    READY_TO_ASSIGN --> QUEUED: normal task
    DECOMPOSING --> QUEUED

    QUEUED --> RUNNING
    RUNNING --> DONE: success
    RUNNING --> RETRYING: recoverable error
    RETRYING --> RUNNING: retry < N
    RETRYING --> ESCALATED: retry >= N
    ESCALATED --> [*]
    DONE --> [*]
```

## 6. Decomposition and Scheduling Model
```mermaid
flowchart TD
    T[Large Ticket] --> D[Build Task DAG]
    D --> C1[Unit A: Spec Clarification]
    D --> C2[Unit B: Code Change]
    D --> C3[Unit C: Test/Validation]
    D --> C4[Unit D: Packaging/Publish]

    C1 --> C2
    C2 --> C3
    C3 --> C4

    C1 --> S[Topological Scheduler]
    C2 --> S
    C3 --> S
    C4 --> S

    S --> Q[(Execution Queue)]
    Q --> W[Workers]
```

## 7. Trust Boundaries and Security Zones
```mermaid
flowchart LR
    subgraph External[External Zone]
      TP[(Ticket Platforms)]
      USER[Users/Approvers]
    end

    subgraph Integration[Integration Zone]
      ADP[Platform Adapters]
    end

    subgraph Orchestration[Orchestration Zone]
      ORCH[Orchestrator]
      LEAD[Leader Agent]
      DISP[Dispatcher]
      PUB[Publisher]
      AUD[(Audit Log)]
    end

    subgraph Execution[Execution Zone]
      WRK[Ephemeral Docker Workers]
    end

    subgraph SecretZone[Restricted Secret Zone]
      SEC[(Secret Manager)]
    end

    USER --> TP
    TP --> ADP
    ADP --> ORCH
    ORCH --> LEAD
    ORCH --> DISP
    DISP --> WRK
    WRK --> PUB
    PUB --> ADP
    ADP --> TP

    WRK --> SEC
    ADP --> AUD
    ORCH --> AUD
    LEAD --> AUD
    DISP --> AUD
    WRK --> AUD
    PUB --> AUD
```

## 8. MVP Non-Functional Targets
1. Security: 0 unauthorized executions, 0 credential leaks.
2. Reliability: deterministic retry then escalation behavior.
3. Traceability: full audit trail for state and access events.
4. Performance: reduced median lead time for standard tasks.
5. Product KPI: >= 60% completion rate for AI-processable tasks.
6. Portability: add new platform by adapter implementation only.

## 9. Platform API Interaction Principles
The single integration contract is [Ticket Platform Interface](./ticket-platform-interface.md).

1. All reads/writes go through adapters.
2. Tokens must use least-privilege scopes per platform.
3. Unsupported capabilities must follow documented fallbacks.
4. Publishing order remains consistent: comment -> attachment -> labels/state.

## 10. Rollout Phases
1. Phase 1: Interface + GitLab adapter + state machine baseline.
2. Phase 2: Eligibility + inspection Q/A + human approval gate.
3. Phase 3: Worker sandbox + result publishing.
4. Phase 4: GitHub/Jira/Focalboard adapter rollout.
5. Phase 5: Cross-platform observability and regression suite.
