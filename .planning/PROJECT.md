# MyTapTrack Back-End — Local Docker Support

## What This Is

MyTapTrack is a behavior tracking backend for schools, built as a multi-stack AWS CDK application. This milestone adds local Docker development support: a local server layer that translates incoming requests into Lambda invocation format, allowing all Lambda functions to operate identically whether running locally in Docker or deployed to AWS.

## Core Value

Lambda handlers run unmodified in both local Docker and AWS — the translation layer absorbs all environment differences so developers can develop and test without an AWS deployment.

## Requirements

### Validated

<!-- Existing capabilities confirmed in codebase -->

- ✓ GraphQL API via AppSync with Lambda resolvers — existing
- ✓ REST API via API Gateway with Lambda handlers — existing
- ✓ Device/IoT API for physical behavior tracking devices — existing
- ✓ Event-driven data propagation via DynamoDB Streams → EventBridge — existing
- ✓ Cognito-based multi-tenant authentication — existing
- ✓ DynamoDB for operational data, S3 data lake for analytics — existing
- ✓ Local development servers in `api/src/container/` (graphql-server, rest-api-server, device-server) — existing
- ✓ docker-compose.yml with DynamoDB Local, RabbitMQ, Redis, API services — existing
- ✓ `USE_LOCAL` env var flag for local vs AWS mode — existing

### Active

- [ ] Config detection works correctly — code routes to local vs AWS endpoints based on environment, system tests know which mode to use
- [ ] Config/env wiring complete — all local services properly wired so full stack starts cleanly with `docker compose up`
- [ ] GraphQL coverage complete — all GraphQL operations handled by local server (no missing operation types)
- [ ] System tests pass locally — full suite green against local Docker stack
- [ ] System tests pass against AWS — AWS test run unaffected by local changes (config detection fix)
- [ ] AWS deployment unaffected — existing CDK stacks deploy cleanly, no regressions
- [ ] Developer documentation — README instructions for local setup and running system tests in both modes

### Out of Scope

- Replacing AWS infrastructure with local equivalents for production use — local mode is for development only
- Local equivalents for all AWS services (SES, SNS, Pinpoint, Step Functions, etc.) — only core data path services needed locally
- CI/CD changes — pipeline targets AWS only

## Context

The solution uses a translation layer pattern: `api/src/container/graphql-server.ts` (and rest/device equivalents) receive HTTP requests and reformat them as Lambda event payloads, invoking the original resolver functions directly. This means resolvers need no modification to work locally.

The primary gap is config detection: when running system tests, the test runner needs to know whether it's targeting local Docker or AWS, and the config loading needs to produce the right endpoints/credentials for each mode. The `USE_LOCAL` env var exists but the detection logic may not be consistently applied across all test paths.

AWS services running locally:
- DynamoDB → DynamoDB Local (Docker)
- EventBridge → RabbitMQ (AMQP, Docker)
- Redis → Redis (Docker)
- Cognito → JWT-based local auth (no cloud dependency)

## Constraints

- **Compatibility**: All changes must keep AWS CDK stacks deployable — no modifications to Lambda handler signatures or CDK infrastructure
- **Tech stack**: Node.js 16+, TypeScript, existing module dependency order (types → cdk → lib → api)
- **Scope**: Local mode is development-only — security shortcuts (e.g., hardcoded local secrets) are acceptable in local config only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Translation layer (not full AWS mock) | Lambda handlers stay unmodified; simpler than mocking entire AppSync/API Gateway | — Pending |
| RabbitMQ for local EventBridge | AMQP protocol familiar, avoids LocalStack complexity | — Pending |
| `USE_LOCAL` env var as detection mechanism | Simple flag over complex auto-detection | — Pending |

---
*Last updated: 2026-03-21 after initialization*
