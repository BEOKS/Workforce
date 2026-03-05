import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`missing required env: ${name}`);
  }
  return value;
};

export const config = {
  sutBaseUrl: required('SUT_BASE_URL', 'http://localhost:8080'),
  openProjectBaseUrl: required('OPENPROJECT_BASE_URL', 'http://localhost:8081'),
  mockServerBaseUrl: required('MOCKSERVER_BASE_URL', 'http://localhost:1080'),
  requestTimeoutMs: Number(required('REQUEST_TIMEOUT_MS', '15000')),
  paths: {
    health: required('SUT_HEALTH_PATH', '/healthz'),
    createTicket: required('SUT_CREATE_TICKET_PATH', '/v1/tickets'),
    getEligibility: required('SUT_GET_ELIGIBILITY_PATH', '/v1/tickets/{ticketId}/eligibility'),
    postInspectionAnswer: required('SUT_POST_INSPECTION_ANSWER_PATH', '/v1/tickets/{ticketId}/inspection/answers'),
    triggerExecution: required('SUT_TRIGGER_EXECUTION_PATH', '/v1/tickets/{ticketId}/execute'),
    getStatus: required('SUT_GET_STATUS_PATH', '/v1/tickets/{ticketId}/status')
  }
};

export const replacePathParams = (template: string, params: Record<string, string>): string => {
  return Object.entries(params).reduce((acc, [key, value]) => {
    return acc.replaceAll(`{${key}}`, encodeURIComponent(value));
  }, template);
};
