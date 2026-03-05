import { setWorldConstructor, World } from '@cucumber/cucumber';
import type { AxiosResponse } from 'axios';

export class IntegrationWorld extends World {
  public lastResponse?: AxiosResponse;
  public ticketPayload?: Record<string, unknown>;
  public inspectionAnswers?: Record<string, string>;
  public ticketId?: string;

  resetState(): void {
    this.lastResponse = undefined;
    this.ticketPayload = undefined;
    this.inspectionAnswers = undefined;
    this.ticketId = undefined;
  }
}

setWorldConstructor(IntegrationWorld);
