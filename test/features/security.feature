@integration @security
Feature: Security gate for credentials and approval
  As a security control
  I want execution to be blocked when required grants are missing
  So that unauthorized work cannot run

  Scenario: Execution request is forbidden when grant references are missing
    Given the SUT health endpoint is reachable
    When I wait up to 15 seconds until platform ticket "op-sec-1001" is ingested
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getPlatformTicket" with status 200
    And response field "platformTicketId" should equal "op-sec-1001"
    And I trigger execution for the created ticket
    Then the HTTP status should be 403
    And the response should match OpenAPI operation "triggerExecution" with status 403
