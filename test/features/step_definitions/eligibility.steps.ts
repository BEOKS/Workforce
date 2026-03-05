import assert from 'node:assert';
import { Given, When } from '@cucumber/cucumber';
import { evaluateEligibility } from '../support/api-client';
import type { IntegrationWorld } from '../support/world';

Given('a default eligibility ticket payload', function (this: IntegrationWorld) {
  this.ticketPayload = {
    title: 'Standard automation task',
    description: 'Generate summary report and attach outputs',
    requester: 'qa-user',
    grant_ref_ids: ['gr_reporting_read'],
    labels: ['priority:normal', 'due:2026-03-20']
  };
});

When('I evaluate eligibility for the ticket payload', async function (this: IntegrationWorld) {
  assert.ok(this.ticketPayload, 'ticket payload is not set');
  this.lastResponse = await evaluateEligibility(this, this.ticketPayload);
});

When('I apply risk signal {string} to the ticket payload', function (this: IntegrationWorld, signal: string) {
  assert.ok(this.ticketPayload, 'ticket payload is not set');
  const payload = this.ticketPayload as Record<string, unknown>;
  const currentDescription = String(payload.description || '');
  const appendDescription = (line: string): void => {
    payload.description = currentDescription ? `${String(payload.description)}\n${line}` : line;
  };

  switch (signal) {
    case 'legal_constraint':
      appendDescription('Legal compliance authority is required.');
      break;
    case 'human_only_authority':
      appendDescription('This step requires human-only approval authority.');
      break;
    case 'complexity_high':
      appendDescription('Complex multi-step cross-service migration is required.');
      break;
    case 'criticality_high':
      appendDescription('Production critical customer impact is expected.');
      break;
    case 'uncertainty_high':
      appendDescription('Requirements are unclear and TBD.');
      break;
    case 'cost_high':
      appendDescription('High effort expected over several weeks.');
      break;
    case 'resource_requirements_high':
      appendDescription('Requires DB admin and cluster access from multiple teams.');
      break;
    case 'constraints_high':
      appendDescription('Restricted policy-bound operation with elevated constraints.');
      break;
    case 'verifiability_low':
      appendDescription('Outcome is subjective and cannot test with automated tests.');
      break;
    case 'reversibility_low':
      appendDescription('Change is irreversible and cannot rollback.');
      break;
    case 'contextuality_high':
      appendDescription('Uses sensitive PII and confidential internal-only context.');
      break;
    case 'subjectivity_high':
      appendDescription('Final output depends on aesthetic preference and opinion.');
      break;
    case 'autonomy_level_high':
      appendDescription('Must run fully automatic without approval.');
      break;
    case 'monitoring_mode_continuous':
      appendDescription('Requires continuous monitoring in real-time 24/7.');
      break;
    default:
      throw new Error(`unknown risk signal: ${signal}`);
  }
});

When('I set ticket field {string} to {string}', function (this: IntegrationWorld, fieldName: string, value: string) {
  assert.ok(this.ticketPayload, 'ticket payload is not set');

  if (value === 'null') {
    (this.ticketPayload as Record<string, unknown>)[fieldName] = null;
    return;
  }

  if (value === '[]') {
    (this.ticketPayload as Record<string, unknown>)[fieldName] = [];
    return;
  }

  (this.ticketPayload as Record<string, unknown>)[fieldName] = value;
});
