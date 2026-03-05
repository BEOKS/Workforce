import { Before } from '@cucumber/cucumber';
import type { IntegrationWorld } from './world';

Before(function (this: IntegrationWorld) {
  this.resetState();
});
