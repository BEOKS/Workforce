@integration @execution
Feature: Worker execution with external API dependencies
  As a black-box integration suite
  I want to validate execution side effects through mock APIs
  So that worker behavior remains independent of SUT implementation language

  Scenario: Execution flow reaches mocked Confluence and GitLab APIs
    Given the SUT health endpoint is reachable
    And Ticket platform is reachable
    When I wait up to 15 seconds until platform ticket "op-exec-1001" is ingested
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getPlatformTicket" with status 200
    And response field "platformTicketId" should equal "op-exec-1001"
    And I trigger execution for the created ticket
    Then the HTTP status should be 202
    And the response should match OpenAPI operation "triggerExecution" with status 202
    And MockServer should have received "GET" request to "/confluence/wiki/api/v2/pages/123"
    And MockServer should have received "POST" request to "/gitlab/api/v4/projects/42/merge_requests"
