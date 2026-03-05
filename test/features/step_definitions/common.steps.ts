import assert from 'node:assert';
import { Given, Then, When } from '@cucumber/cucumber';
import {
  getIngestionStatus,
  getPlatformTicket,
  getSutHealth,
  getTicketPlatformHealth,
  getTicketStatus,
  verifyMockRequest
} from '../support/api-client';
import { assertFieldEquals, assertFieldOneOf, assertStatus, getField } from '../support/assertions';
import { validateResponseByOperation } from '../support/contract-validator';
import type { IntegrationWorld } from '../support/world';

Given('the SUT health endpoint is reachable', async function (this: IntegrationWorld) {
  this.lastResponse = await getSutHealth(this);
  assertStatus(this.lastResponse.status, 200);
  validateResponseByOperation('getHealth', 200, this.lastResponse.data);
});

Given('Ticket platform is reachable', async function (this: IntegrationWorld) {
  this.lastResponse = await getTicketPlatformHealth(this);
  if (this.lastResponse.status >= 500) {
    throw new Error(`ticket platform health check failed: ${this.lastResponse.status}`);
  }
});

When('I request ingestion status', async function (this: IntegrationWorld) {
  this.lastResponse = await getIngestionStatus(this);
});

When('I request ingested platform ticket {string}', async function (this: IntegrationWorld, platformTicketId: string) {
  this.lastResponse = await getPlatformTicket(this, platformTicketId);
});

When('I wait for {int} seconds', async function (this: IntegrationWorld, waitSec: number) {
  await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
});

When('I wait up to {int} seconds until ticket state is {string}', async function (this: IntegrationWorld, timeoutSec: number, targetState: string) {
  assert.ok(this.ticketId, 'ticket id is not set');

  const timeoutMs = timeoutSec * 1000;
  const pollMs = 2000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const response = await getTicketStatus(this, this.ticketId);
    this.lastResponse = response;

    if (response.status === 200 && String(response.data?.state) === targetState) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`ticket state did not become ${targetState} within ${timeoutSec}s`);
});

When('I wait up to {int} seconds until platform ticket {string} is ingested', async function (
  this: IntegrationWorld,
  timeoutSec: number,
  platformTicketId: string
) {
  const timeoutMs = timeoutSec * 1000;
  const pollMs = 1000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const response = await getPlatformTicket(this, platformTicketId);
    this.lastResponse = response;

    if (response.status === 200) {
      this.ticketId = String(response.data?.ticketId || '');
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`platform ticket ${platformTicketId} was not ingested within ${timeoutSec}s`);
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

Then('response field {string} should not equal {string}', function (this: IntegrationWorld, fieldPath: string, unexpectedValue: string) {
  assert.ok(this.lastResponse, 'last response is not set');
  const actual = String(getField(this.lastResponse.data, fieldPath));
  assert.notStrictEqual(actual, unexpectedValue, `expected field ${fieldPath} to not equal ${unexpectedValue}`);
});

Then('response field {string} should be one of:', function (this: IntegrationWorld, fieldPath: string, docString: string) {
  assert.ok(this.lastResponse, 'last response is not set');
  const values = docString
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  assertFieldOneOf(this.lastResponse.data, fieldPath, values);
});

Then('response field {string} should contain {string}', function (this: IntegrationWorld, fieldPath: string, expectedFragment: string) {
  assert.ok(this.lastResponse, 'last response is not set');
  const actual = String(getField(this.lastResponse.data, fieldPath));
  assert.ok(
    actual.includes(expectedFragment),
    `expected field ${fieldPath} to contain ${expectedFragment}, got ${actual}`
  );
});

Then('response array field {string} should contain {string}', function (this: IntegrationWorld, fieldPath: string, expectedValue: string) {
  assert.ok(this.lastResponse, 'last response is not set');
  const actual = getField(this.lastResponse.data, fieldPath);
  assert.ok(Array.isArray(actual), `expected field ${fieldPath} to be an array`);
  assert.ok(actual.map((value) => String(value)).includes(expectedValue), `expected array ${fieldPath} to contain ${expectedValue}`);
});

Then('the created ticket id should be captured', function (this: IntegrationWorld) {
  assert.ok(this.ticketId, 'ticket id was not captured');
});

Then('MockServer should have received {string} request to {string}', async function (
  this: IntegrationWorld,
  method: string,
  requestPath: string
) {
  await verifyMockRequest(this, method.toUpperCase(), requestPath, 1);
});
