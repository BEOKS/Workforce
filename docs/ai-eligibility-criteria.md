# AI Eligibility Criteria Guide

- Date: 2026-03-05
- Scope: Multi-board MVP (GitLab/GitHub/Jira/Focalboard)
- Goal: Decide whether a ticket should enter AI automation
- Basis: *Intelligent AI Delegation* (Tomašev et al., arXiv:2602.11865v1, 2026-02-12)

## 1. Why This Document Exists (Macro)
This document defines a single, defensible eligibility logic.
The system must always answer:
1. `is_ai_processable`: `true | false`
2. `requires_inspection`: `true | false`
3. `decision_confidence`: `high | medium | low`
4. `reason_codes`: `string[]`

The target is consistent routing:
1. Process automatically
2. Process with inspection
3. Route to human queue

Related docs:
1. [AI Orchestration Architecture](./ai-orchestration-architecture.md)
2. [AI Orchestration MVP Design](./ai-orchestration-mvp-design.md)
3. [Ticket Platform Interface](./ticket-platform-interface.md)

## 2. First Principles (Deductive Premises)
P1. Safety precedes throughput.  
If safety is not guaranteed, automation is blocked.

P2. Eligibility must be evidence-driven.  
Delegation dimensions are inferred from ticket context by an LLM with explicit evidence and confidence.

P3. Delegation is a multi-objective optimization problem.  
Decision quality is not a single metric; it balances success probability, safety, verification, trust cost, and delegation economics.

P4. Low-confidence inference is not a free pass.  
When confidence/evidence is insufficient, route to inspection before execution.

## 3. Main Conclusion (Eligibility Theorem)
Given P1-P4, eligibility must be decided in this order:
1. Apply Hard Gate.
2. If Hard Gate passed, infer delegation dimensions by LLM.
3. Convert dimensions to objective scores.
4. Compute `final_score`.
5. Map score and confidence to processable/inspection/human routing.

In short:
1. Hard policy risk -> block
2. Unclear but recoverable -> inspect
3. Clear and sufficient -> automate

## 4. Inputs and Inference Contract
### 4.1 Input Signals
Eligibility evaluation reads:
1. Title, description, comments
2. Labels/tags/custom fields (priority, risk, due date, security)
3. Attachment metadata
4. Deliverable intent (code/MR/doc/attachment)
5. Permission/grant metadata

### 4.2 Delegation Dimensions (Paper Section 2.2)
Dimensions are inferred, not provided as authoritative input:
1. `complexity`
2. `criticality`
3. `uncertainty`
4. `duration`
5. `cost`
6. `resource_requirements`
7. `constraints`
8. `verifiability`
9. `reversibility`
10. `contextuality`
11. `subjectivity`
12. `autonomy_level`
13. `monitoring_mode`

### 4.3 LLM Inference Output Schema
For each dimension, the LLM must return:
1. `value` (`low | medium | high`; allowed categorical variants for `constraints`/`monitoring_mode`)
2. `confidence` (`0.0-1.0`)
3. `evidence` (traceable snippets or metadata refs)

Global fields:
1. `overall_confidence`
2. `missing_information[]`
3. `inference_notes` (observed facts vs inferred judgment)

Hard requirement:
1. Static regex/keyword rules cannot be the primary mechanism for dimension assignment.

## 5. Hard Gate (Safety Before Scoring)
If any condition is true, skip Soft Gate and block automation.

Blocking conditions:
1. Human-only legal/regulatory authority required
2. Privileged production action without approved human handoff
3. Sensitive data exposure risk without safe execution path
4. Acceptance criteria undefined or non-measurable
5. External dependency cannot be validated
6. Permission scope unsafe for delegation
7. Accountability chain missing in multi-step delegation
8. Security anomaly detected (injection/exfiltration/suspicious intent)

Default reason codes:
1. `HARD_POLICY_BLOCK`
2. `REQUIRES_HUMAN_ONLY_AUTHORITY`
3. `SENSITIVE_DATA_EXPOSURE_RISK`
4. `UNDEFINED_ACCEPTANCE_CRITERIA`
5. `PERMISSION_SCOPE_UNSAFE`
6. `ACCOUNTABILITY_CHAIN_GAP`
7. `SECURITY_ANOMALY_DETECTED`

## 6. Soft Gate (LLM + Multi-objective Scoring)
### 6.1 Objective Construction
Following paper Section 4.3, convert inferred dimensions into five objective scores (`0-100`):
1. `success_likelihood`
   - Inputs: `complexity`, `uncertainty`, `resource_requirements`, `duration`, `autonomy_level`
2. `safety_margin`
   - Inputs: `criticality`, `constraints`, `contextuality`
3. `verification_strength`
   - Inputs: `verifiability`, `monitoring_mode`
4. `trust_efficiency`
   - Inputs: `subjectivity`, `contextuality`, expected oversight burden, historical trust signals
5. `delegation_economics`
   - Inputs: `cost`, `duration`, expected delegation overhead (negotiation/monitoring/verification)

### 6.2 Final Score
```text
final_score =
  0.30 * success_likelihood +
  0.25 * safety_margin +
  0.20 * verification_strength +
  0.15 * trust_efficiency +
  0.10 * delegation_economics
```

Interpretation:
1. Highest weight is probability of successful completion.
2. Safety and verifiability remain dominant constraints.
3. Economic efficiency matters, but never overrides safety.

### 6.3 Confidence and Evidence Guardrail
Even with high `final_score`, enforce inspection when:
1. `overall_confidence < 0.55`, or
2. `missing_information` contains critical execution unknowns

This is the operational equivalent of "uncertainty-aware delegation with bounded risk."

### 6.4 Unsafe Triad Handling (Soft Gate)
`criticality=high` + `verifiability=low` + `reversibility=low` is treated as a high-risk Soft Gate pattern, not an automatic Hard Gate block.

Default action:
1. `requires_inspection=true`
2. `reason_codes` includes `NEEDS_CLARIFICATION`
3. Human validation/approval is required before execution

Escalation rule:
1. If triad appears together with explicit policy/authority/security violation, Hard Gate takes precedence.

## 7. Decision Mapping (Micro)
### 7.1 Deterministic Mapping Order
1. If Hard Gate blocked -> `is_ai_processable=false`, `requires_inspection=false`
2. Else if low confidence/critical missing info -> `is_ai_processable=true`, `requires_inspection=true`, reason `NEEDS_CLARIFICATION`
3. Else if unsafe triad and no policy violation -> `is_ai_processable=true`, `requires_inspection=true`, reason `NEEDS_CLARIFICATION`
4. Else if `final_score < 60` -> `is_ai_processable=false`, `requires_inspection=false`, reason `LOW_FEASIBILITY`
5. Else if `60 <= final_score < 75` -> `is_ai_processable=true`, `requires_inspection=true`, reason `NEEDS_CLARIFICATION`
6. Else (`final_score >= 75`) -> `is_ai_processable=true`, `requires_inspection=false`

### 7.2 Compact Pseudocode
```text
if hard_gate_blocked:
  return false, false, high, [HARD_POLICY_BLOCK...]

inference = llm_infer(ticket_signals)
if inference.overall_confidence < 0.55 or critical_missing(inference):
  return true, true, low_or_medium, [NEEDS_CLARIFICATION]

if unsafe_triad(inference.dimensions) and not policy_violation(inference):
  return true, true, medium, [NEEDS_CLARIFICATION]

final_score = weighted_sum(inference.objective_scores)

if final_score < 60:
  return false, false, medium, [LOW_FEASIBILITY]
if final_score < 75:
  return true, true, medium, [NEEDS_CLARIFICATION]
return true, false, high, []
```

## 8. Inspection Baseline
Inspection is required when execution context is insufficient.

Typical triggers:
1. Definition of Done missing
2. Output format unclear
3. Allowed/prohibited system boundary unclear
4. Priority or due date missing
5. Soft Gate asks clarification (`requires_inspection=true`)

Minimum question set:
1. Definition of Done (one sentence)
2. Output format (code/MR/doc/attachment)
3. Allowed and prohibited systems
4. Acceptable risk and rollback criteria
5. Priority and deadline

## 9. Decision Matrix
| Condition | Result | Follow-up |
|---|---|---|
| Hard Gate blocked | `is_ai_processable=false` | Route to human queue and persist blocking evidence |
| Hard Gate pass + low confidence / critical missing info | `is_ai_processable=true`, `requires_inspection=true` | Run inspection Q/A first |
| Hard Gate pass + unsafe triad (no policy violation) | `is_ai_processable=true`, `requires_inspection=true` | Mandatory inspection and human validation |
| Hard Gate pass + `final_score >= 75` | `is_ai_processable=true` | Continue orchestration flow |
| Hard Gate pass + `60 <= final_score < 75` | `is_ai_processable=true`, `requires_inspection=true` | Run inspection Q/A |
| Hard Gate pass + `final_score < 60` | `is_ai_processable=false` | Route to human queue |

## 10. Platform Mapping and State
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

## 11. Operational Metrics
1. Misclassification rate (post-review)
2. Inspection conversion rate
3. AI completion rate to `DONE`
4. Escalation rate during execution
5. Cross-platform variance

## 12. Governance
1. Hard Gate changes require security owner approval.
2. Scoring weight/threshold changes must be experiment-driven and versioned.
3. New reason codes must be synchronized across architecture/design/interface docs.
4. Prompt/schema changes for LLM inference must include regression tests.

## 13. Reference
1. Nenad Tomašev, Matija Franklin, Simon Osindero. *Intelligent AI Delegation*. arXiv:2602.11865v1, 2026-02-12.
