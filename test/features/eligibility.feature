@integration @eligibility
Feature: Eligibility decision for all incoming tickets
  As a platform-independent black-box test harness
  I want to evaluate AI eligibility for every submitted ticket
  So that routing decisions are visible and contract-compliant

  Scenario: Eligibility endpoint returns a valid decision for a newly created ticket
    Given the SUT health endpoint is reachable
    And the ticket payload:
      """
      {
        "title": "Generate team weekly report",
        "description": "Collect metrics and produce summary",
        "requester": "alice",
        "labels": ["reporting"],
        "grant_ref_ids": ["gr_reporting_read"]
      }
      """
    When I submit the ticket to SUT
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createTicket" with status 201
    When I capture ticket id from response
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
