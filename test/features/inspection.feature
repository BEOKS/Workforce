@integration @inspection
Feature: Inspection Q/A loop for missing information
  As an orchestration safety mechanism
  I want missing ticket information to trigger inspection Q/A
  So that execution starts only with sufficient context

  Scenario: Inspection answer is accepted for an inspection-required ticket
    Given the SUT health endpoint is reachable
    And the ticket payload:
      """
      {
        "title": "Implement API integration",
        "description": "",
        "requester": "bob",
        "labels": ["integration"],
        "grant_ref_ids": ["gr_confluence_read", "gr_gitlab_write"]
      }
      """
    When I submit the ticket to SUT
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createTicket" with status 201
    When I capture ticket id from response
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
