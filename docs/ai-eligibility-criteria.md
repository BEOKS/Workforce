# AI Eligibility Criteria Guide

- Date: 2026-03-05
- Scope: Multi-board MVP (GitLab/GitHub/Jira/Focalboard)
- Goal: Decide consistently whether a ticket can enter the AI automation pipeline
- Basis: *Intelligent AI Delegation* (Tomasev et al., arXiv:2602.11865v1, 2026)

## 1. Purpose
This document defines the operational rules for AI eligibility decisions.
It standardizes how we classify tickets into:
1. AI-processable
2. AI-processable but inspection-required
3. Not processable (human route)

Related docs:
1. [AI Orchestration Architecture](./ai-orchestration-architecture.md)
2. [AI Orchestration MVP Design](./ai-orchestration-mvp-design.md)
3. [Ticket Platform Interface](./ticket-platform-interface.md)

## 2. Decision Output Contract
Every eligibility decision must return:
1. `is_ai_processable`: `true | false`
2. `decision_confidence`: `high | medium | low`
3. `reason_codes`: `string[]`
4. `requires_inspection`: `true | false`

## 3. Input Principle
### 3.1 Source Signals
Eligibility evaluation uses ticket context signals:
1. Title, description, comments
2. Labels/tags/custom fields (priority, risk, security, due date)
3. Attachment metadata
4. Deliverable intent (code/MR/doc/attachment)
5. Permission/grant metadata

### 3.2 Delegation Dimensions Are Derived, Not Supplied
Paper-aligned dimensions:
1. `complexity`
2. `criticality`
3. `uncertainty`
4. `cost`
5. `resource_requirements`
6. `constraints`
7. `verifiability`
8. `reversibility`
9. `contextuality`
10. `subjectivity`
11. `autonomy_level`
12. `monitoring_mode`

Important rule:
1. `delegation_dimensions` is not a required external input field in production flow.
2. The engine must infer dimensions from ticket signals.
3. Tests should verify inference by changing ticket signals, not by injecting precomputed dimensions.

## 4. Decision Procedure (Fixed Order)
1. Input validation
2. Hard Gate
3. Soft Gate (dimension inference + suitability scoring)
4. Score merge
5. Decision mapping
6. Trace persistence (`reason_codes` + evidence)
7. State transition after `TRIAGE_DONE`

Pseudocode:
```text
if missing_required_fields:
  return is_ai_processable=true, requires_inspection=true, reason=INSUFFICIENT_INPUT

if hard_gate_blocked:
  return is_ai_processable=false, requires_inspection=false, reason=HARD_POLICY_BLOCK

dimensions = infer_dimensions(ticket_signals)
rule_score = run_rule_scoring(ticket, dimensions)
llm_score  = run_llm_scoring(ticket)
final_score = 0.6 * rule_score + 0.4 * llm_score

if final_score >= 75:
  return is_ai_processable=true, requires_inspection=false
if final_score >= 60:
  return is_ai_processable=true, requires_inspection=true, reason=NEEDS_CLARIFICATION
return is_ai_processable=false, requires_inspection=false, reason=LOW_FEASIBILITY
```

## 5. Hard Gate
If any hard-gate condition is met, skip Soft Gate and block automation.

Blocking conditions:
1. Human-only legal/regulatory authority required
2. Privileged/high-risk production action without approved human handoff
3. Sensitive data exposure risk without safe path
4. Acceptance criteria undefined or non-measurable
5. External dependency cannot be validated
6. Unsafe triad: high criticality + low reversibility + low verifiability
7. Permission scope unsafe for delegation
8. Accountability chain missing in multi-step delegation
9. Security anomaly detected (injection/exfiltration/suspicious request)

Default hard-gate reason codes:
1. `HARD_POLICY_BLOCK`
2. `REQUIRES_HUMAN_ONLY_AUTHORITY`
3. `SENSITIVE_DATA_EXPOSURE_RISK`
4. `UNDEFINED_ACCEPTANCE_CRITERIA`
5. `LOW_VERIFIABILITY_HIGH_IMPACT`
6. `PERMISSION_SCOPE_UNSAFE`
7. `ACCOUNTABILITY_CHAIN_GAP`
8. `SECURITY_ANOMALY_DETECTED`

## 6. Soft Gate
Evaluate only tickets that passed Hard Gate.

### 6.1 Axes
1. Clarity
2. Feasibility
3. Risk boundedness
4. Verifiability
5. Reversibility
6. Context sensitivity
7. Autonomy fit
8. Monitoring readiness

### 6.2 Scoring
1. `rule_score`: 0-100
2. `llm_score`: 0-100
3. `final_score = 0.6 * rule_score + 0.4 * llm_score`

### 6.3 Thresholds
1. `final_score >= 75`: AI-processable (inspection optional)
2. `60 <= final_score < 75`: AI-processable + inspection required
3. `final_score < 60`: not processable

## 7. Inspection Trigger Baseline
Inspection must start when required execution context is missing/unclear.

Typical triggers:
1. Definition of Done missing
2. Output format unclear
3. Allowed/prohibited system boundary unclear
4. Priority or due date missing
5. Soft Gate returns clarification needed (`requires_inspection=true`)

Minimum question set:
1. Definition of Done (one sentence)
2. Output format (code/MR/doc/attachment)
3. Allowed and prohibited systems
4. Acceptable risk + rollback criteria
5. Priority + deadline

## 8. Decision Matrix
| Condition | Result | Required Follow-up |
|---|---|---|
| Hard Gate blocked | `is_ai_processable=false` | Route to human queue and persist blocking reasons |
| Hard Gate pass + `final_score >= 75` | `is_ai_processable=true` | Continue orchestration flow |
| Hard Gate pass + `60 <= final_score < 75` | `is_ai_processable=true`, `requires_inspection=true` | Run inspection Q/A |
| Hard Gate pass + `final_score < 60` | `is_ai_processable=false` | Route to human queue |

## 9. Platform Mapping and State
Common persistence markers:
1. `ai-processable`
2. `ai-inspection-required`
3. `ai-reason-*`

Platform mapping examples:
1. GitLab/GitHub: labels
2. Jira: labels + custom fields
3. Focalboard: properties/columns/tags

State transitions:
1. `TRIAGE_PENDING -> TRIAGE_DONE`
2. Processable + inspection-needed: `TRIAGE_DONE -> INSPECTION_QA`
3. Not processable: route to human queue

## 10. Operational Metrics
1. Misclassification rate (post-review)
2. Inspection conversion rate
3. AI completion rate to `DONE`
4. Escalation rate during execution
5. Cross-platform variance

## 11. Change Management
1. Hard Gate rule changes require security owner approval
2. Threshold changes are experiment-driven
3. New reason codes must be synchronized across architecture/design/interface docs

## 12. Reference
1. Nenad Tomasev, Matija Franklin, Simon Osindero. *Intelligent AI Delegation*. arXiv:2602.11865v1, 2026-02-12.
