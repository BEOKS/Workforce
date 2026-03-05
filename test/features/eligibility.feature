@integration @eligibility
Feature: Eligibility decision for all incoming tickets
  As a platform-independent black-box test harness
  I want to evaluate AI eligibility for every submitted ticket
  So that routing decisions are visible and contract-compliant

  Scenario: Legacy ticket eligibility endpoint remains compatible for ingested ticket
    Given the SUT health endpoint is reachable
    When I wait up to 15 seconds until platform ticket "op-elig-1001" is ingested
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getPlatformTicket" with status 200
    And response field "platformTicketId" should equal "op-elig-1001"
    Then the created ticket id should be captured
    When I request eligibility for the created ticket
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getEligibility" with status 200
    And response field "decision" should be one of:
      """
      ai_processable
      requires_inspection
      not_processable
      """

  Scenario Outline: Hard Gate blocks risky tickets
    Given the SUT health endpoint is reachable
    And a default eligibility ticket payload
    When I set delegation dimension "constraints" to "<constraints>"
    And I evaluate eligibility for the ticket payload
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "evaluateEligibility" with status 200
    And response field "is_ai_processable" should equal "false"
    And response field "decision_confidence" should equal "high"
    And response field "requires_inspection" should equal "false"
    And response field "reason_codes" should contain "HARD_POLICY_BLOCK"

    Examples:
      | constraints |
      | legal |
      | human_only |

  Scenario: Hard Gate blocks privileged ticket when grant refs are missing
    Given the SUT health endpoint is reachable
    And a default eligibility ticket payload
    When I set ticket field "title" to "Run privileged production action"
    And I set ticket field "grant_ref_ids" to "[]"
    And I evaluate eligibility for the ticket payload
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "evaluateEligibility" with status 200
    And response field "is_ai_processable" should equal "false"
    And response field "decision_confidence" should equal "high"
    And response field "requires_inspection" should equal "false"
    And response field "reason_codes" should contain "HARD_POLICY_BLOCK"

  Scenario: Soft Gate passes low-risk ticket without inspection
    Given the SUT health endpoint is reachable
    And a default eligibility ticket payload
    When I evaluate eligibility for the ticket payload
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "evaluateEligibility" with status 200
    And response field "is_ai_processable" should equal "true"
    And response field "decision_confidence" should equal "high"
    And response field "requires_inspection" should equal "false"

  Scenario Outline: Soft Gate requires inspection for high-risk delegation dimensions
    Given the SUT health endpoint is reachable
    And a default eligibility ticket payload
    When I set delegation dimension "<dimension>" to "<value>"
    And I evaluate eligibility for the ticket payload
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "evaluateEligibility" with status 200
    And response field "is_ai_processable" should equal "true"
    And response field "decision_confidence" should equal "medium"
    And response field "requires_inspection" should equal "true"
    And response field "reason_codes" should contain "NEEDS_CLARIFICATION"

    Examples:
      | dimension | value |
      | complexity | high |
      | criticality | high |
      | uncertainty | high |
      | cost | high |
      | resource_requirements | high |
      | constraints | high |
      | verifiability | low |
      | reversibility | low |
      | contextuality | high |
      | subjectivity | high |
      | autonomy_level | high |
      | monitoring_mode | continuous |
