import assert from 'node:assert';
import axios, { type AxiosResponse } from 'axios';
import { config, replacePathParams } from './config';
import type { IntegrationWorld } from './world';

const sut = axios.create({
  baseURL: config.sutBaseUrl,
  timeout: config.requestTimeoutMs,
  validateStatus: () => true
});

const ticketPlatform = axios.create({
  baseURL: config.ticketPlatformBaseUrl,
  timeout: config.requestTimeoutMs,
  validateStatus: () => true
});

const recordMetric = (
  world: IntegrationWorld,
  name: string,
  method: string,
  path: string,
  status: number,
  startedAtMs: number,
  endedAtMs: number
): void => {
  world.httpMetrics.push({
    name,
    method,
    path,
    status,
    durationMs: endedAtMs - startedAtMs,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString()
  });
};

const withMetric = async (
  world: IntegrationWorld,
  name: string,
  method: string,
  path: string,
  request: () => Promise<AxiosResponse>
): Promise<AxiosResponse> => {
  const startedAtMs = Date.now();
  try {
    const response = await request();
    const endedAtMs = Date.now();
    recordMetric(world, name, method, path, response.status, startedAtMs, endedAtMs);
    return response;
  } catch (error) {
    const endedAtMs = Date.now();
    const status = axios.isAxiosError(error) && error.response ? error.response.status : 0;
    recordMetric(world, name, method, path, status, startedAtMs, endedAtMs);
    throw error;
  }
};

export const getSutHealth = async (world: IntegrationWorld): Promise<AxiosResponse> => {
  return withMetric(world, 'getSutHealth', 'GET', config.paths.health, async () => sut.get(config.paths.health));
};

export const getTicketPlatformHealth = async (world: IntegrationWorld): Promise<AxiosResponse> => {
  const path = '/platform/health';
  return withMetric(world, 'getTicketPlatformHealth', 'GET', path, async () => ticketPlatform.get(path));
};

export const createTicket = async (world: IntegrationWorld, payload: Record<string, unknown>): Promise<AxiosResponse> => {
  return withMetric(world, 'createTicket', 'POST', config.paths.createTicket, async () => sut.post(config.paths.createTicket, payload));
};

export const createIngesterConnection = async (
  world: IntegrationWorld,
  payload: Record<string, unknown>
): Promise<AxiosResponse> => {
  return withMetric(world, 'createIngesterConnection', 'POST', config.paths.createIngesterConnection, async () => (
    sut.post(config.paths.createIngesterConnection, payload)
  ));
};

export const listIngesterConnections = async (world: IntegrationWorld): Promise<AxiosResponse> => {
  return withMetric(world, 'listIngesterConnections', 'GET', config.paths.listIngesterConnections, async () => (
    sut.get(config.paths.listIngesterConnections)
  ));
};

export const getIngesterConnection = async (world: IntegrationWorld, connectionId: string): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.getIngesterConnection, { connectionId });
  return withMetric(world, 'getIngesterConnection', 'GET', path, async () => sut.get(path));
};

export const updateIngesterConnection = async (
  world: IntegrationWorld,
  connectionId: string,
  payload: Record<string, unknown>
): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.updateIngesterConnection, { connectionId });
  return withMetric(world, 'updateIngesterConnection', 'PUT', path, async () => sut.put(path, payload));
};

export const deleteIngesterConnection = async (world: IntegrationWorld, connectionId: string): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.deleteIngesterConnection, { connectionId });
  return withMetric(world, 'deleteIngesterConnection', 'DELETE', path, async () => sut.delete(path));
};

export const triggerIngesterPoll = async (world: IntegrationWorld): Promise<AxiosResponse> => {
  return withMetric(world, 'triggerIngesterPoll', 'POST', config.paths.triggerIngesterPoll, async () => (
    sut.post(config.paths.triggerIngesterPoll)
  ));
};

export const getIngesterEgressAudit = async (
  world: IntegrationWorld,
  filters: { method?: string; path?: string; connectionId?: string } = {}
): Promise<AxiosResponse> => {
  return withMetric(world, 'getIngesterEgressAudit', 'GET', config.paths.getIngesterEgressAudit, async () => (
    sut.get(config.paths.getIngesterEgressAudit, { params: filters })
  ));
};

export const evaluateEligibility = async (
  world: IntegrationWorld,
  payload: Record<string, unknown>
): Promise<AxiosResponse> => {
  return withMetric(world, 'evaluateEligibility', 'POST', config.paths.evaluateEligibility, async () => (
    sut.post(config.paths.evaluateEligibility, payload)
  ));
};

export const getEligibility = async (world: IntegrationWorld, ticketId: string): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.getEligibility, { ticketId });
  return withMetric(world, 'getEligibility', 'GET', path, async () => sut.get(path));
};

export const postInspectionAnswers = async (
  world: IntegrationWorld,
  ticketId: string,
  answers: Record<string, string>
): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.postInspectionAnswer, { ticketId });
  return withMetric(world, 'postInspectionAnswers', 'POST', path, async () => sut.post(path, { answers }));
};

export const triggerExecution = async (world: IntegrationWorld, ticketId: string): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.triggerExecution, { ticketId });
  return withMetric(world, 'triggerExecution', 'POST', path, async () => sut.post(path));
};

export const getTicketStatus = async (world: IntegrationWorld, ticketId: string): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.getStatus, { ticketId });
  return withMetric(world, 'getTicketStatus', 'GET', path, async () => sut.get(path));
};

export const getIngestionStatus = async (world: IntegrationWorld): Promise<AxiosResponse> => {
  return withMetric(world, 'getIngestionStatus', 'GET', config.paths.getIngestionStatus, async () => sut.get(config.paths.getIngestionStatus));
};

export const getPlatformTicket = async (world: IntegrationWorld, platformTicketId: string): Promise<AxiosResponse> => {
  const path = replacePathParams(config.paths.getPlatformTicket, { platformTicketId });
  return withMetric(world, 'getPlatformTicket', 'GET', path, async () => sut.get(path));
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

export const verifyMockRequest = async (world: IntegrationWorld, method: string, path: string, atLeast = 1): Promise<void> => {
  const response = await getIngesterEgressAudit(world, { method, path });
  if (response.status !== 200) {
    throw new Error(`egress audit retrieval failed (${response.status}): ${JSON.stringify(response.data)}`);
  }

  const events = Array.isArray(response.data?.events) ? response.data.events : [];
  const matched = events.filter((event: Record<string, unknown>) => {
    return String(event.method || '').toUpperCase() === method.toUpperCase()
      && String(event.path || '') === path;
  });

  if (matched.length < atLeast) {
    throw new Error(`expected at least ${atLeast} egress calls for ${method} ${path}, got ${matched.length}`);
  }
};
