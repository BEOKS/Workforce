@integration @polling
Feature: Polling fallback when webhook delivery is unavailable
  As an integration suite
  I want SUT to ingest platform tickets through polling
  So that new tickets are still processed without webhooks

  Scenario: Platform ticket is ingested through periodic polling
    Given the SUT health endpoint is reachable
    When I request ingestion status
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getIngestionStatus" with status 200
    And response field "webhookEnabled" should equal "false"
    And response field "pollingEnabled" should equal "true"
    When I wait up to 15 seconds until platform ticket "op-poll-1001" is ingested
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getPlatformTicket" with status 200
    And response field "platformTicketId" should equal "op-poll-1001"
    And the created ticket id should be captured
    When I request current state for the created ticket
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getTicketStatus" with status 200
