@integration @resilience
Feature: Resilience under transient failures
  As an operations engineer
  I want retry/escalation behavior to be externally observable
  So that reliability policy can be tested without SUT internals

  Scenario: Ticket state eventually reaches a terminal policy state
    Given the SUT health endpoint is reachable
    And the ticket payload:
      """
      {
        "title": "Test transient dependency behavior",
        "description": "Simulate transient failures and verify terminal state",
        "requester": "erin",
        "labels": ["resilience"],
        "grant_ref_ids": ["gr_figma_read"]
      }
      """
    When I submit the ticket to SUT
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createTicket" with status 201
    When I capture ticket id from response
    And I trigger execution for the created ticket
    Then the HTTP status should be 202
    And the response should match OpenAPI operation "triggerExecution" with status 202
    When I wait up to 60 seconds until ticket state is "DONE"
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getTicketStatus" with status 200
