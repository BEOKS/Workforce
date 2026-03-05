import { setWorldConstructor, World } from '@cucumber/cucumber';
import type { AxiosResponse } from 'axios';

export type HttpMetric = {
  name: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  startedAt: string;
  endedAt: string;
};

export type ScenarioPerf = {
  startedAtMs?: number;
  endedAtMs?: number;
  durationMs?: number;
};

export class IntegrationWorld extends World {
  public lastResponse?: AxiosResponse;
  public ticketPayload?: Record<string, unknown>;
  public connectionPayload?: Record<string, unknown>;
  public inspectionAnswers?: Record<string, string>;
  public ticketId?: string;
  public scenarioPerf: ScenarioPerf = {};
  public httpMetrics: HttpMetric[] = [];

  resetState(): void {
    this.lastResponse = undefined;
    this.ticketPayload = undefined;
    this.connectionPayload = undefined;
    this.inspectionAnswers = undefined;
    this.ticketId = undefined;
    this.scenarioPerf = {};
    this.httpMetrics = [];
  }
}

setWorldConstructor(IntegrationWorld);
