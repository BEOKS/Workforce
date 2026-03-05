import assert from 'node:assert';
import { Given, Then, When } from '@cucumber/cucumber';
import {
  createIngesterConnection,
  deleteIngesterConnection,
  getIngesterConnection,
  listIngesterConnections,
  triggerIngesterPoll,
  updateIngesterConnection
} from '../support/api-client';
import { getField } from '../support/assertions';
import type { IntegrationWorld } from '../support/world';

Given('the connection payload:', function (this: IntegrationWorld, docString: string) {
  this.connectionPayload = JSON.parse(docString) as Record<string, unknown>;
});

When('I register ingester connection', async function (this: IntegrationWorld) {
  assert.ok(this.connectionPayload, 'connection payload is not set');
  this.lastResponse = await createIngesterConnection(this, this.connectionPayload);
});

When('I list ingester connections', async function (this: IntegrationWorld) {
  this.lastResponse = await listIngesterConnections(this);
});

When('I request ingester connection {string}', async function (this: IntegrationWorld, connectionId: string) {
  this.lastResponse = await getIngesterConnection(this, connectionId);
});

When('I update ingester connection {string}', async function (this: IntegrationWorld, connectionId: string) {
  assert.ok(this.connectionPayload, 'connection payload is not set');
  this.lastResponse = await updateIngesterConnection(this, connectionId, this.connectionPayload);
});

When('I delete ingester connection {string}', async function (this: IntegrationWorld, connectionId: string) {
  this.lastResponse = await deleteIngesterConnection(this, connectionId);
});

When('I trigger ingester polling now', async function (this: IntegrationWorld) {
  this.lastResponse = await triggerIngesterPoll(this);
});

Then('connection list should include {string}', function (this: IntegrationWorld, connectionId: string) {
  assert.ok(this.lastResponse, 'last response is not set');
  const connections = getField(this.lastResponse.data, 'connections');
  assert.ok(Array.isArray(connections), 'connections is not an array');

  const found = connections.some((connection) => {
    return connection && typeof connection === 'object'
      && String((connection as Record<string, unknown>).connectionId) === connectionId;
  });

  assert.ok(found, `expected connection list to include ${connectionId}`);
});

Then('connection list should not include {string}', function (this: IntegrationWorld, connectionId: string) {
  assert.ok(this.lastResponse, 'last response is not set');
  const connections = getField(this.lastResponse.data, 'connections');
  assert.ok(Array.isArray(connections), 'connections is not an array');

  const found = connections.some((connection) => {
    return connection && typeof connection === 'object'
      && String((connection as Record<string, unknown>).connectionId) === connectionId;
  });

  assert.ok(!found, `expected connection list to not include ${connectionId}`);
});
