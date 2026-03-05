@integration @ingestion @polling @platform-routing @architecture
Feature: Ingester architecture and platform routing
  As a black-box integration suite
  I want ingestion architecture and adapter routing behavior to be scenario-tested
  So that platform intake remains externally verifiable

  Scenario: Ingestion status exposes polling mode and poll metadata
    Given the SUT health endpoint is reachable
    When I wait up to 15 seconds until platform ticket "op-poll-1001" is ingested
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getPlatformTicket" with status 200
    When I request ingestion status
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getIngestionStatus" with status 200
    And response field "webhookEnabled" should equal "false"
    And response field "pollingEnabled" should equal "true"
    And response field "lastPollAt" should not equal "null"

  Scenario: Polling router calls every configured platform adapter endpoint
    Given the SUT health endpoint is reachable
    When I wait up to 15 seconds until platform ticket "op-poll-1001" is ingested
    And I wait up to 15 seconds until platform ticket "9201" is ingested
    And I wait up to 15 seconds until platform ticket "9301" is ingested
    And I wait up to 15 seconds until platform ticket "WF-9401" is ingested
    And I wait up to 15 seconds until platform ticket "PL-9501" is ingested
    Then the HTTP status should be 200
    And MockServer should have received "GET" request to "/ticket-platform/v1/tickets/updated"
    And MockServer should have received "GET" request to "/gitlab/api/v4/projects/42/issues"
    And MockServer should have received "GET" request to "/github/api/v3/repos/workforce/sample/issues"
    And MockServer should have received "GET" request to "/jira/rest/api/3/search"
    And MockServer should have received "GET" request to "/plane/api/v1/workspaces/workspace-qa/issues"

  Scenario: Validation failure is returned when required ticket fields are missing
    Given the SUT health endpoint is reachable
    And the ticket payload:
      """
      {
        "description": "Missing title and requester to test validation error"
      }
      """
    When I submit the ticket to SUT
    Then the HTTP status should be 400
    And the response should match OpenAPI operation "createTicket" with status 400
    And response field "code" should equal "BAD_REQUEST"

  Scenario: Unknown platform ticket lookup is rejected
    Given the SUT health endpoint is reachable
    When I request ingested platform ticket "missing-platform-ticket-0001"
    Then the HTTP status should be 404
    And the response should match OpenAPI operation "getPlatformTicket" with status 404
    And response field "code" should equal "NOT_FOUND"

  Scenario: Duplicate platform snapshots are skipped by idempotency
    Given the SUT health endpoint is reachable
    When I wait up to 15 seconds until platform ticket "op-poll-1001" is ingested
    And I wait up to 15 seconds until platform ticket "op-elig-1001" is ingested
    And I wait up to 15 seconds until platform ticket "op-insp-1001" is ingested
    And I wait up to 15 seconds until platform ticket "op-insp-1002" is ingested
    And I wait up to 15 seconds until platform ticket "op-exec-1001" is ingested
    And I wait up to 15 seconds until platform ticket "op-res-1001" is ingested
    And I wait up to 15 seconds until platform ticket "op-sec-1001" is ingested
    And I wait up to 15 seconds until platform ticket "9201" is ingested
    And I wait up to 15 seconds until platform ticket "9301" is ingested
    And I wait up to 15 seconds until platform ticket "WF-9401" is ingested
    And I wait up to 15 seconds until platform ticket "PL-9501" is ingested
    And I request ingestion status
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getIngestionStatus" with status 200
    And response field "ingestedCount" should equal "11"
    When I wait for 3 seconds
    And I request ingestion status
    Then the HTTP status should be 200
    And response field "ingestedCount" should equal "11"

  Scenario: Ingested platform ticket can be handed off to eligibility evaluation
    Given the SUT health endpoint is reachable
    When I wait up to 15 seconds until platform ticket "PL-9501" is ingested
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getPlatformTicket" with status 200
    And response field "platform" should equal "plane"
    And the created ticket id should be captured
    When I request eligibility for the created ticket
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getEligibility" with status 200
    And response field "decision" should be one of:
      """
      ai_processable
      requires_inspection
      not_processable
      """

  Scenario Outline: SUT stores platform type and polls the correct API endpoint for <platform>
    Given the SUT health endpoint is reachable
    When I wait up to 15 seconds until platform ticket "<platformTicketId>" is ingested
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getPlatformTicket" with status 200
    And response field "platformTicketId" should equal "<platformTicketId>"
    And response field "platform" should equal "<platform>"
    And MockServer should have received "GET" request to "<expectedPath>"

    Examples:
      | platform   | platformTicketId | expectedPath                               |
      | focalboard | op-poll-1001     | /ticket-platform/v1/tickets/updated        |
      | gitlab     | 9201             | /gitlab/api/v4/projects/42/issues          |
      | github     | 9301             | /github/api/v3/repos/workforce/sample/issues |
      | jira       | WF-9401          | /jira/rest/api/3/search                    |
      | plane      | PL-9501          | /plane/api/v1/workspaces/workspace-qa/issues |

  Scenario: Ingester admin console can register, read, and list a platform connection
    Given the SUT health endpoint is reachable
    And the connection payload:
      """
      {
        "connectionId": "reg-admin-1001",
        "platformType": "focalboard",
        "workspaceId": "workspace-admin",
        "boardId": "board-admin",
        "baseUrl": "http://mockserver:1080",
        "updatedPath": "/ticket-platform/v1/tickets/registry-a",
        "authType": "token",
        "secretRefId": "sec-admin-1001",
        "pollingEnabled": true,
        "pollingIntervalSec": 1,
        "webhookEnabled": false,
        "status": "active",
        "priority": 10,
        "isDefault": true
      }
      """
    When I register ingester connection
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createIngesterConnection" with status 201
    And response field "connectionId" should equal "reg-admin-1001"
    And response field "platformType" should equal "focalboard"
    And response field "workspaceId" should equal "workspace-admin"
    And response field "updatedPath" should equal "/ticket-platform/v1/tickets/registry-a"
    And response field "connectionCheckPassed" should equal "true"
    And response field "connectionCheckMessage" should contain "passed"
    When I request ingester connection "reg-admin-1001"
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getIngesterConnection" with status 200
    And response field "secretRefId" should equal "sec-admin-1001"
    And response field "status" should equal "active"
    When I list ingester connections
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "listIngesterConnections" with status 200
    And connection list should include "reg-admin-1001"

  Scenario: Ingester connection registration fails with reason when platform connectivity check fails
    Given the SUT health endpoint is reachable
    And the connection payload:
      """
      {
        "connectionId": "reg-admin-invalid-1001",
        "platformType": "focalboard",
        "workspaceId": "workspace-admin-invalid",
        "boardId": "board-admin-invalid",
        "baseUrl": "http://mockserver:1080",
        "updatedPath": "/ticket-platform/v1/tickets/not-found-path",
        "authType": "token",
        "secretRefId": "sec-admin-invalid-1001",
        "pollingEnabled": true,
        "pollingIntervalSec": 1,
        "webhookEnabled": false,
        "status": "active",
        "priority": 10,
        "isDefault": true
      }
      """
    When I register ingester connection
    Then the HTTP status should be 400
    And the response should match OpenAPI operation "createIngesterConnection" with status 400
    And response field "code" should equal "PLATFORM_CONNECTION_CHECK_FAILED"
    And response field "message" should contain "status"

  Scenario: Ingester admin console can update connection metadata and polling uses updated path
    Given the SUT health endpoint is reachable
    And the connection payload:
      """
      {
        "connectionId": "reg-admin-1002",
        "platformType": "focalboard",
        "workspaceId": "workspace-admin-update",
        "boardId": "board-admin-update",
        "baseUrl": "http://mockserver:1080",
        "updatedPath": "/ticket-platform/v1/tickets/registry-a",
        "authType": "token",
        "secretRefId": "sec-admin-1002",
        "pollingEnabled": true,
        "pollingIntervalSec": 1,
        "webhookEnabled": false,
        "status": "active",
        "priority": 10,
        "isDefault": true
      }
      """
    When I register ingester connection
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createIngesterConnection" with status 201
    And the connection payload:
      """
      {
        "connectionId": "reg-admin-1002",
        "platformType": "focalboard",
        "workspaceId": "workspace-admin-update",
        "boardId": "board-admin-update",
        "baseUrl": "http://mockserver:1080",
        "updatedPath": "/ticket-platform/v1/tickets/registry-b",
        "authType": "token",
        "secretRefId": "sec-admin-1002",
        "pollingEnabled": true,
        "pollingIntervalSec": 1,
        "webhookEnabled": false,
        "status": "active",
        "priority": 1,
        "isDefault": true
      }
      """
    When I update ingester connection "reg-admin-1002"
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "updateIngesterConnection" with status 200
    And response field "updatedPath" should equal "/ticket-platform/v1/tickets/registry-b"
    And response field "priority" should equal "1"
    When I trigger ingester polling now
    Then the HTTP status should be 202
    And the response should match OpenAPI operation "triggerIngesterPoll" with status 202
    When I wait up to 15 seconds until platform ticket "op-reg-2002" is ingested
    Then the HTTP status should be 200
    And response field "platformTicketId" should equal "op-reg-2002"
    And MockServer should have received "GET" request to "/ticket-platform/v1/tickets/registry-b"

  Scenario: Ingester admin console can delete a connection and it disappears from registry
    Given the SUT health endpoint is reachable
    And the connection payload:
      """
      {
        "connectionId": "reg-admin-1003",
        "platformType": "github",
        "workspaceId": "workspace-admin-delete",
        "repo": "repo-admin-delete",
        "baseUrl": "http://mockserver:1080",
        "updatedPath": "/github/api/v3/repos/workforce/sample/issues",
        "authType": "token",
        "secretRefId": "sec-admin-1003",
        "pollingEnabled": true,
        "pollingIntervalSec": 1,
        "webhookEnabled": false,
        "status": "active",
        "priority": 20,
        "isDefault": true
      }
      """
    When I register ingester connection
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createIngesterConnection" with status 201
    When I delete ingester connection "reg-admin-1003"
    Then the HTTP status should be 204
    And the response should match OpenAPI operation "deleteIngesterConnection" with status 204
    When I request ingester connection "reg-admin-1003"
    Then the HTTP status should be 404
    And the response should match OpenAPI operation "getIngesterConnection" with status 404
    And response field "code" should equal "NOT_FOUND"
    When I list ingester connections
    Then the HTTP status should be 200
    And connection list should not include "reg-admin-1003"

  Scenario: Duplicate connection uniqueness key is rejected
    Given the SUT health endpoint is reachable
    And the connection payload:
      """
      {
        "connectionId": "reg-dup-1001",
        "platformType": "gitlab",
        "workspaceId": "workspace-dup",
        "project": "project-dup",
        "baseUrl": "http://mockserver:1080",
        "updatedPath": "/gitlab/api/v4/projects/99/issues",
        "authType": "token",
        "secretRefId": "sec-dup-1001",
        "pollingEnabled": true,
        "pollingIntervalSec": 1,
        "webhookEnabled": false,
        "status": "active",
        "priority": 10,
        "isDefault": false
      }
      """
    When I register ingester connection
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createIngesterConnection" with status 201
    And the connection payload:
      """
      {
        "connectionId": "reg-dup-1002",
        "platformType": "gitlab",
        "workspaceId": "workspace-dup",
        "project": "project-dup",
        "baseUrl": "http://mockserver:1080",
        "updatedPath": "/gitlab/api/v4/projects/99/issues",
        "authType": "token",
        "secretRefId": "sec-dup-1002",
        "pollingEnabled": true,
        "pollingIntervalSec": 1,
        "webhookEnabled": false,
        "status": "active",
        "priority": 20,
        "isDefault": false
      }
      """
    When I register ingester connection
    Then the HTTP status should be 409
    And the response should match OpenAPI operation "createIngesterConnection" with status 409
    And response field "code" should equal "DUPLICATE_CONNECTION_KEY"

  Scenario: Only one default connection is allowed per platform and workspace
    Given the SUT health endpoint is reachable
    And the connection payload:
      """
      {
        "connectionId": "reg-default-1001",
        "platformType": "plane",
        "workspaceId": "workspace-default",
        "project": "project-default-a",
        "baseUrl": "http://mockserver:1080",
        "updatedPath": "/plane/api/v1/workspaces/workspace-qa/issues",
        "authType": "token",
        "secretRefId": "sec-default-1001",
        "pollingEnabled": true,
        "pollingIntervalSec": 1,
        "webhookEnabled": false,
        "status": "active",
        "priority": 10,
        "isDefault": true
      }
      """
    When I register ingester connection
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createIngesterConnection" with status 201
    And the connection payload:
      """
      {
        "connectionId": "reg-default-1002",
        "platformType": "plane",
        "workspaceId": "workspace-default",
        "project": "project-default-b",
        "baseUrl": "http://mockserver:1080",
        "updatedPath": "/plane/api/v1/workspaces/workspace-qa/issues",
        "authType": "token",
        "secretRefId": "sec-default-1002",
        "pollingEnabled": true,
        "pollingIntervalSec": 1,
        "webhookEnabled": false,
        "status": "active",
        "priority": 20,
        "isDefault": true
      }
      """
    When I register ingester connection
    Then the HTTP status should be 409
    And the response should match OpenAPI operation "createIngesterConnection" with status 409
    And response field "code" should equal "DEFAULT_CONNECTION_CONFLICT"

  Scenario: Polling uses stored connection registry metadata for platform route resolution
    Given the SUT health endpoint is reachable
    And the connection payload:
      """
      {
        "connectionId": "reg-route-1001",
        "platformType": "gitlab",
        "workspaceId": "workspace-route",
        "project": "project-route",
        "baseUrl": "http://mockserver:1080",
        "updatedPath": "/gitlab/api/v4/projects/99/issues",
        "authType": "token",
        "secretRefId": "sec-route-1001",
        "pollingEnabled": true,
        "pollingIntervalSec": 1,
        "webhookEnabled": false,
        "status": "active",
        "priority": 1,
        "isDefault": true
      }
      """
    When I register ingester connection
    Then the HTTP status should be 201
    And the response should match OpenAPI operation "createIngesterConnection" with status 201
    When I trigger ingester polling now
    Then the HTTP status should be 202
    And the response should match OpenAPI operation "triggerIngesterPoll" with status 202
    When I wait up to 15 seconds until platform ticket "9921" is ingested
    Then the HTTP status should be 200
    And the response should match OpenAPI operation "getPlatformTicket" with status 200
    And response field "platform" should equal "gitlab"
    And MockServer should have received "GET" request to "/gitlab/api/v4/projects/99/issues"
