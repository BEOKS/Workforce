import assert from 'node:assert';
import { Given, Then, When } from '@cucumber/cucumber';
import {
  createTicket,
  extractTicketId,
  getEligibility,
  getOpenProjectHealth,
  getSutHealth,
  getTicketStatus,
  postInspectionAnswers,
  triggerExecution,
  verifyMockRequest
} from '../support/api-client';
import { assertFieldEquals, assertFieldOneOf, assertStatus } from '../support/assertions';
import { validateResponseByOperation } from '../support/contract-validator';
import type { IntegrationWorld } from '../support/world';

Given('the SUT health endpoint is reachable', async function (this: IntegrationWorld) {
  this.lastResponse = await getSutHealth();
  assertStatus(this.lastResponse.status, 200);
  validateResponseByOperation('getHealth', 200, this.lastResponse.data);
});

Given('OpenProject is reachable', async function (this: IntegrationWorld) {
  this.lastResponse = await getOpenProjectHealth();
  if (this.lastResponse.status >= 500) {
    throw new Error(`OpenProject health check failed: ${this.lastResponse.status}`);
  }
});

Given('the ticket payload:', function (this: IntegrationWorld, docString: string) {
  this.ticketPayload = JSON.parse(docString) as Record<string, unknown>;
});

Given('the inspection answers:', function (this: IntegrationWorld, docString: string) {
  this.inspectionAnswers = JSON.parse(docString) as Record<string, string>;
});

When('I submit the ticket to SUT', async function (this: IntegrationWorld) {
  assert.ok(this.ticketPayload, 'ticket payload is not set');
  this.lastResponse = await createTicket(this.ticketPayload);
});

When('I capture ticket id from response', function (this: IntegrationWorld) {
  assert.ok(this.lastResponse, 'no last response to capture ticket id from');
  this.ticketId = extractTicketId(this.lastResponse.data);
});

When('I request eligibility for the created ticket', async function (this: IntegrationWorld) {
  assert.ok(this.ticketId, 'ticket id is not set');
  this.lastResponse = await getEligibility(this.ticketId);
});

When('I post inspection answers for the created ticket', async function (this: IntegrationWorld) {
  assert.ok(this.ticketId, 'ticket id is not set');
  assert.ok(this.inspectionAnswers, 'inspection answers are not set');
  this.lastResponse = await postInspectionAnswers(this.ticketId, this.inspectionAnswers);
});

When('I trigger execution for the created ticket', async function (this: IntegrationWorld) {
  assert.ok(this.ticketId, 'ticket id is not set');
  this.lastResponse = await triggerExecution(this.ticketId);
});

When('I request current state for the created ticket', async function (this: IntegrationWorld) {
  assert.ok(this.ticketId, 'ticket id is not set');
  this.lastResponse = await getTicketStatus(this.ticketId);
});

When('I wait up to {int} seconds until ticket state is {string}', async function (this: IntegrationWorld, timeoutSec: number, targetState: string) {
  assert.ok(this.ticketId, 'ticket id is not set');

  const timeoutMs = timeoutSec * 1000;
  const pollMs = 2000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const response = await getTicketStatus(this.ticketId);
    this.lastResponse = response;

    if (response.status === 200 && String(response.data?.state) === targetState) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`ticket state did not become ${targetState} within ${timeoutSec}s`);
});

Then('the HTTP status should be {int}', function (this: IntegrationWorld, expectedStatus: number) {
  assert.ok(this.lastResponse, 'last response is not set');
  assertStatus(this.lastResponse.status, expectedStatus);
});

Then('the response should match OpenAPI operation {string} with status {int}', function (this: IntegrationWorld, operationId: string, status: number) {
  assert.ok(this.lastResponse, 'last response is not set');
  validateResponseByOperation(operationId, status, this.lastResponse.data);
});

Then('response field {string} should equal {string}', function (this: IntegrationWorld, fieldPath: string, expectedValue: string) {
  assert.ok(this.lastResponse, 'last response is not set');
  assertFieldEquals(this.lastResponse.data, fieldPath, expectedValue);
});

Then('response field {string} should be one of:', function (this: IntegrationWorld, fieldPath: string, docString: string) {
  assert.ok(this.lastResponse, 'last response is not set');
  const values = docString
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  assertFieldOneOf(this.lastResponse.data, fieldPath, values);
});

Then('the created ticket id should be captured', function (this: IntegrationWorld) {
  assert.ok(this.ticketId, 'ticket id was not captured');
});

Then('MockServer should have received {string} request to {string}', async function (_this: IntegrationWorld, method: string, requestPath: string) {
  await verifyMockRequest(method.toUpperCase(), requestPath, 1);
});
