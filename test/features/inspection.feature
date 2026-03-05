@integration @inspection
Feature: Inspection Q/A loop for missing information
  As an orchestration safety mechanism
  I want missing ticket information to trigger inspection Q/A
  So that execution starts only with sufficient context

  Scenario: Inspection answer is accepted for an inspection-required ticket
    Given the SUT health endpoint is reachable
    When I wait up to 15 seconds until platform ticket "op-insp-1001" is ingested
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getPlatformTicket" with status 200
    And response field "platformTicketId" should equal "op-insp-1001"
    And I request eligibility for the created ticket
    Then the HTTP status should be 200
    And response field "decision" should be one of:
      """
      requires_inspection
      ai_processable
      """
    Given the inspection answers:
      """
      {
        "definition_of_done": "MR is created with linked test evidence",
        "priority": "high"
      }
      """
    When I post inspection answers for the created ticket
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "postInspectionAnswer" with status 200
    And response field "accepted" should equal "true"

  Scenario: Eligibility can be checked again after inspection answers are collected
    Given the SUT health endpoint is reachable
    When I wait up to 15 seconds until platform ticket "op-insp-1002" is ingested
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getPlatformTicket" with status 200
    And response field "platformTicketId" should equal "op-insp-1002"
    Given the inspection answers:
      """
      {
        "api_scope": "read-only",
        "target_repo": "platform/workforce"
      }
      """
    When I post inspection answers for the created ticket
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "postInspectionAnswer" with status 200
    And response field "accepted" should equal "true"
    When I request eligibility for the created ticket
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getEligibility" with status 200
    And response field "decision" should be one of:
      """
      requires_inspection
      ai_processable
      """

  Scenario: Start inspection when Definition of Done is missing
    Given the SUT health endpoint is reachable
    And the ticket payload:
      """
      {
        "title": "Inspection condition - missing DoD",
        "description": "Output format: code\nAllowed systems: github\nProhibited systems: production-db\nPriority: high\nDue date: 2026-03-20",
        "requester": "qa-user",
        "labels": ["priority:high", "due:2026-03-20"],
        "grant_ref_ids": ["gr_gitlab_mr_write"]
      }
      """
    When I submit the ticket to SUT
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createTicket" with status 201
    When I capture ticket id from response
    And I request eligibility for the created ticket
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getEligibility" with status 200
    And response field "decision" should equal "requires_inspection"
    And response array field "reasonCodes" should contain "MISSING_DEFINITION_OF_DONE"

  Scenario: Start inspection when output format is unclear
    Given the SUT health endpoint is reachable
    And the ticket payload:
      """
      {
        "title": "Inspection condition - unclear output format",
        "description": "Definition of Done: merged MR with tests\nAllowed systems: github\nProhibited systems: production-db\nPriority: high\nDue date: 2026-03-20",
        "requester": "qa-user",
        "labels": ["priority:high", "due:2026-03-20"],
        "grant_ref_ids": ["gr_gitlab_mr_write"]
      }
      """
    When I submit the ticket to SUT
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createTicket" with status 201
    When I capture ticket id from response
    And I request eligibility for the created ticket
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getEligibility" with status 200
    And response field "decision" should equal "requires_inspection"
    And response array field "reasonCodes" should contain "UNCLEAR_OUTPUT_FORMAT"

  Scenario: Start inspection when allowed and prohibited systems are not separated
    Given the SUT health endpoint is reachable
    And the ticket payload:
      """
      {
        "title": "Inspection condition - missing system boundary",
        "description": "Definition of Done: merged MR with tests\nOutput format: code\nPriority: high\nDue date: 2026-03-20",
        "requester": "qa-user",
        "labels": ["priority:high", "due:2026-03-20"],
        "grant_ref_ids": ["gr_gitlab_mr_write"]
      }
      """
    When I submit the ticket to SUT
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createTicket" with status 201
    When I capture ticket id from response
    And I request eligibility for the created ticket
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getEligibility" with status 200
    And response field "decision" should equal "requires_inspection"
    And response array field "reasonCodes" should contain "MISSING_SYSTEM_BOUNDARY"

  Scenario: Start inspection when priority or due date is missing
    Given the SUT health endpoint is reachable
    And the ticket payload:
      """
      {
        "title": "Inspection condition - missing schedule metadata",
        "description": "Definition of Done: merged MR with tests\nOutput format: code\nAllowed systems: github\nProhibited systems: production-db",
        "requester": "qa-user",
        "labels": [],
        "grant_ref_ids": ["gr_gitlab_mr_write"]
      }
      """
    When I submit the ticket to SUT
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createTicket" with status 201
    When I capture ticket id from response
    And I request eligibility for the created ticket
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getEligibility" with status 200
    And response field "decision" should equal "requires_inspection"
    And response array field "reasonCodes" should contain "MISSING_PRIORITY_OR_DUE_DATE"

  Scenario: Start inspection when eligibility decision itself requires inspection
    Given the SUT health endpoint is reachable
    And the ticket payload:
      """
      {
        "title": "Inspection condition - eligibility requires inspection",
        "description": "Definition of Done: merged MR with tests\nOutput format: code\nAllowed systems: github\nProhibited systems: production-db\nPriority: high\nDue date: 2026-03-20\nComplex multi-step cross-service migration is required.",
        "requester": "qa-user",
        "labels": ["priority:high", "due:2026-03-20"],
        "grant_ref_ids": ["gr_gitlab_mr_write"]
      }
      """
    When I submit the ticket to SUT
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createTicket" with status 201
    When I capture ticket id from response
    And I request eligibility for the created ticket
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getEligibility" with status 200
    And response field "decision" should equal "requires_inspection"
    And response array field "reasonCodes" should contain "NEEDS_CLARIFICATION"
