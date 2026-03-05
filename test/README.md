# Integration Test Harness (Black-Box, Contract-First)

This `test/` workspace provides a language/framework-independent integration test harness for the orchestration system.

## Goals
1. Treat SUT as a black-box container.
2. Keep tests independent from SUT internals and source code.
3. Validate behavior through public contracts and observable side-effects only.
4. Run BDD scenarios with Cucumber + TypeScript.

## Architecture
- SUT: built from `../sut` Docker context.
- Ticket platform: OpenProject container.
- External APIs (GitLab/Confluence/Figma): MockServer container.
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
4. Validate side effects only via OpenProject APIs and MockServer verification APIs.

## Main Files
1. `docker-compose.integration.yml`: infra and SUT orchestration.
2. `contract/openapi.yaml`: SUT black-box API contract.
3. `features/*.feature`: BDD scenarios.
4. `features/step_definitions/*.ts`: step implementations.
5. `features/support/contract-validator.ts`: OpenAPI response validation.
6. `mockserver/expectations/expectations.json`: external API stubs.

## Notes
1. If your SUT API differs from the default paths, override path env vars in `test/.env`.
2. OpenProject is used as the OSS ticket platform baseline.
3. Keep contract changes backward-compatible when possible.
