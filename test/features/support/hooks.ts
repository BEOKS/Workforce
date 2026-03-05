import { After, Before, type ITestCaseHookParameter, setDefaultTimeout } from '@cucumber/cucumber';
import type { IntegrationWorld } from './world';

setDefaultTimeout(70 * 1000);

Before(function (this: IntegrationWorld) {
  this.resetState();
  this.scenarioPerf.startedAtMs = Date.now();
});

After(function (this: IntegrationWorld, { pickle }: ITestCaseHookParameter) {
  const endedAtMs = Date.now();
  const startedAtMs = this.scenarioPerf.startedAtMs ?? endedAtMs;
  const durationMs = endedAtMs - startedAtMs;

  this.scenarioPerf.endedAtMs = endedAtMs;
  this.scenarioPerf.durationMs = durationMs;

  const durations = this.httpMetrics.map((metric) => metric.durationMs);
  const totalCalls = durations.length;
  const minMs = totalCalls > 0 ? Math.min(...durations) : 0;
  const maxMs = totalCalls > 0 ? Math.max(...durations) : 0;
  const avgMs = totalCalls > 0 ? durations.reduce((acc, current) => acc + current, 0) / totalCalls : 0;

  const lines = [
    '### Performance Summary',
    `- Scenario: ${pickle.name}`,
    `- Scenario duration: ${durationMs} ms`,
    `- HTTP calls: ${totalCalls}`,
    `- HTTP latency (ms): min=${minMs}, avg=${avgMs.toFixed(2)}, max=${maxMs}`,
    '',
    '#### HTTP Calls',
    ...(
      totalCalls > 0
        ? this.httpMetrics.map(
          (metric, index) => `${index + 1}. [${metric.name}] ${metric.method} ${metric.path} -> ${metric.status} (${metric.durationMs} ms)`
        )
        : ['- No HTTP calls were captured']
    )
  ];

  this.attach(lines.join('\n'), 'text/markdown');
});
