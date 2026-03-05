import assert from 'node:assert';
import axios, { type AxiosResponse } from 'axios';
import { config, replacePathParams } from './config';

const sut = axios.create({
  baseURL: config.sutBaseUrl,
  timeout: config.requestTimeoutMs,
  validateStatus: () => true
});

const openProject = axios.create({
  baseURL: config.openProjectBaseUrl,
  timeout: config.requestTimeoutMs,
  validateStatus: () => true
});

const mockServer = axios.create({
  baseURL: config.mockServerBaseUrl,
  timeout: config.requestTimeoutMs,
  validateStatus: () => true
});

export const getSutHealth = async (): Promise<AxiosResponse> => {
  return sut.get(config.paths.health);
};

export const getOpenProjectHealth = async (): Promise<AxiosResponse> => {
  return openProject.get('/health_checks/default');
};

export const createTicket = async (payload: Record<string, unknown>): Promise<AxiosResponse> => {
  return sut.post(config.paths.createTicket, payload);
};

export const getEligibility = async (ticketId: string): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.getEligibility, { ticketId });
  return sut.get(path);
};

export const postInspectionAnswers = async (
  ticketId: string,
  answers: Record<string, string>
): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.postInspectionAnswer, { ticketId });
  return sut.post(path, { answers });
};

export const triggerExecution = async (ticketId: string): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.triggerExecution, { ticketId });
  return sut.post(path);
};

export const getTicketStatus = async (ticketId: string): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.getStatus, { ticketId });
  return sut.get(path);
};

export const extractTicketId = (responseBody: unknown): string => {
  if (!responseBody || typeof responseBody !== 'object') {
    throw new Error('invalid create ticket response body');
  }

  const candidate = (responseBody as Record<string, unknown>).ticketId
    ?? (responseBody as Record<string, unknown>).id
    ?? (responseBody as Record<string, unknown>).ticket_id;

  assert.ok(candidate, 'ticket id was not found in response body');
  return String(candidate);
};

export const verifyMockRequest = async (method: string, path: string, atLeast = 1): Promise<void> => {
  const response = await mockServer.put('/mockserver/verify', {
    httpRequest: {
      method,
      path
    },
    times: {
      atLeast
    }
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`mock verification failed (${response.status}): ${JSON.stringify(response.data)}`);
  }
};
