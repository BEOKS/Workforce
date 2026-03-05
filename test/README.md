# Integration Test Harness (Black-Box, Contract-First)

This `test/` workspace provides a language/framework-independent integration test harness for the orchestration system.

## Goals
1. Treat SUT as a black-box container.
2. Keep tests independent from SUT internals and source code.
3. Validate behavior through public contracts and observable side-effects only.
4. Run BDD scenarios with Cucumber + TypeScript.

## Architecture
- SUT: built from `../sut` Docker context.
- Ticket platform + external APIs: MockServer container implementing the ticket-platform interface contract and external dependency stubs.
- Test runner: TypeScript + Cucumber.

## Prerequisites
1. Docker + Docker Compose.
2. Node.js 20+.
3. `npm`.

## Quick Start
```bash
cp test/.env.example test/.env
npm --prefix test ci
./test/scripts/up.sh
./test/scripts/run.sh
./test/scripts/down.sh
```

## SUT Independence Rules
1. Do not import SUT source code in any test file.
2. Interact with SUT only through HTTP/JSON endpoints.
3. Validate responses against `test/contract/openapi.yaml`.
4. Validate side effects only via ticket-platform/mock APIs and MockServer verification APIs.

## Main Files
1. `docker-compose.integration.yml`: infra and SUT orchestration.
2. `contract/openapi.yaml`: SUT black-box API contract.
3. `features/*.feature`: BDD scenarios.
4. `features/step_definitions/*.ts`: step implementations.
5. `features/support/contract-validator.ts`: OpenAPI response validation.
6. `mockserver/expectations/expectations.json`: external API stubs.

## Notes
1. If your SUT API differs from the default paths, override path env vars in `test/.env`.
2. Ticket platform behavior is mocked using MockServer with the unified ticket-platform interface shape.
3. Keep contract changes backward-compatible when possible.

## Performance Metrics in Report
1. The harness captures scenario-level duration and per-HTTP-call latency/status for every scenario.
2. Metrics are attached in Cucumber scenario artifacts via `After` hook.
3. Open `test/reports/html/index.html` and inspect each scenario to see:
   - Scenario duration (ms)
   - HTTP call count
   - HTTP latency summary (min/avg/max, ms)
   - HTTP call details (`method path -> status (duration ms)`)
4. Current policy is observability-only; threshold overages do not fail scenarios.

## Report JS Bundle
1. `npm --prefix test run report:html` now post-processes HTML reports to use a single JS bundle: `test/reports/html/assets/js/report.bundle.js`.
2. Every report generation rebuilds this bundle from reporter template assets and rewrites all report pages to reference only that one JS file.
