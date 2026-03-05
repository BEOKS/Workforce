@integration @security
Feature: Security gate for credentials and approval
  As a security control
  I want execution to be blocked when required grants are missing
  So that unauthorized work cannot run

  Scenario: Execution request is forbidden when grant references are missing
    Given the SUT health endpoint is reachable
    And the ticket payload:
      """
      {
        "title": "Run privileged external action",
        "description": "Requires secrets but no grant references provided",
        "requester": "david",
        "labels": ["security"]
      }
      """
    When I submit the ticket to SUT
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createTicket" with status 201
    When I capture ticket id from response
    And I trigger execution for the created ticket
    Then the HTTP status should be 403
    And the response should match OpenAPI operation "triggerExecution" with status 403
