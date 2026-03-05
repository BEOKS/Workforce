import assert from 'node:assert';
import { Given, When } from '@cucumber/cucumber';
import {
  createTicket,
  extractTicketId,
  getEligibility,
  getTicketStatus,
  postInspectionAnswers,
  triggerExecution
} from '../support/api-client';
import type { IntegrationWorld } from '../support/world';

Given('the ticket payload:', function (this: IntegrationWorld, docString: string) {
  this.ticketPayload = JSON.parse(docString) as Record<string, unknown>;
});

Given('the inspection answers:', function (this: IntegrationWorld, docString: string) {
  this.inspectionAnswers = JSON.parse(docString) as Record<string, string>;
});

When('I submit the ticket to SUT', async function (this: IntegrationWorld) {
  assert.ok(this.ticketPayload, 'ticket payload is not set');
  this.lastResponse = await createTicket(this, this.ticketPayload);
});

When('I capture ticket id from response', function (this: IntegrationWorld) {
  assert.ok(this.lastResponse, 'no last response to capture ticket id from');
  this.ticketId = extractTicketId(this.lastResponse.data);
});

When('I request eligibility for the created ticket', async function (this: IntegrationWorld) {
  assert.ok(this.ticketId, 'ticket id is not set');
  this.lastResponse = await getEligibility(this, this.ticketId);
});

When('I post inspection answers for the created ticket', async function (this: IntegrationWorld) {
  assert.ok(this.ticketId, 'ticket id is not set');
  assert.ok(this.inspectionAnswers, 'inspection answers are not set');
  this.lastResponse = await postInspectionAnswers(this, this.ticketId, this.inspectionAnswers);
});

When('I trigger execution for the created ticket', async function (this: IntegrationWorld) {
  assert.ok(this.ticketId, 'ticket id is not set');
  this.lastResponse = await triggerExecution(this, this.ticketId);
});

When('I request current state for the created ticket', async function (this: IntegrationWorld) {
  assert.ok(this.ticketId, 'ticket id is not set');
  this.lastResponse = await getTicketStatus(this, this.ticketId);
});
