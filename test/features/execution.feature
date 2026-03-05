@integration @execution
Feature: Worker execution with external API dependencies
  As a black-box integration suite
  I want to validate execution side effects through mock APIs
  So that worker behavior remains independent of SUT implementation language

  Scenario: Execution flow reaches mocked Confluence and GitLab APIs
    Given the SUT health endpoint is reachable
    And OpenProject is reachable
    And the ticket payload:
      """
      {
        "title": "Use Confluence context and create GitLab MR",
        "description": "Read a Confluence page and create a merge request",
        "requester": "charlie",
        "labels": ["automation"],
        "grant_ref_ids": ["gr_confluence_read", "gr_gitlab_mr_write"]
      }
      """
    When I submit the ticket to SUT
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createTicket" with status 201
    When I capture ticket id from response
    And I trigger execution for the created ticket
    Then the HTTP status should be 202
    And the response should match OpenAPI operation "triggerExecution" with status 202
    And MockServer should have received "GET" request to "/confluence/wiki/api/v2/pages/123"
    And MockServer should have received "POST" request to "/gitlab/api/v4/projects/42/merge_requests"
