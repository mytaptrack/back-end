# Roadmap: MyTapTrack Back-End — Local Docker Support

## Overview

This milestone threads a translation layer between local Docker services and the existing Lambda handlers, so developers can build and test without an AWS deployment. The work proceeds in four phases: first nail config detection so the system knows which mode it is running in, then complete local server coverage for all GraphQL operations, then verify both local and AWS test suites are green with no regressions, and finally document the local workflow for future developers.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Config Detection** - USE_LOCAL routing works correctly for all service clients and test runners
- [ ] **Phase 2: Local Stack Completeness** - All GraphQL operations handled locally; docker compose up starts cleanly
- [ ] **Phase 3: Test Validation** - Full system test suite passes in both local and AWS modes with no regressions
- [ ] **Phase 4: Documentation** - README covers local setup and system test execution in both modes

## Phase Details

### Phase 1: Config Detection
**Goal**: All service clients and test runners correctly route to local or AWS endpoints based on USE_LOCAL
**Depends on**: Nothing (first phase)
**Requirements**: CFG-01, CFG-02, CFG-03, AWS-02
**Success Criteria** (what must be TRUE):
  1. Setting USE_LOCAL=true causes DynamoDB, EventBridge, and Redis clients to connect to Docker-local endpoints instead of AWS
  2. System tests read USE_LOCAL and select local or AWS config without any code changes between runs
  3. System tests targeting AWS run correctly when USE_LOCAL is unset or false
  4. No Lambda handler signatures or resolver function exports are modified
**Plans**: TBD

### Phase 2: Local Stack Completeness
**Goal**: All GraphQL query, mutation, and subscription operations are handled by the local server, and the full Docker stack starts cleanly in one command
**Depends on**: Phase 1
**Requirements**: CFG-04, GQL-01, GQL-02, GQL-03, GQL-04
**Success Criteria** (what must be TRUE):
  1. Running `docker compose up` starts all services (DynamoDB Local, RabbitMQ, Redis, API servers) with no manual steps required
  2. Every GraphQL query operation returns a valid response from the local server
  3. Every GraphQL mutation operation is processed by the local server without falling through to AWS
  4. GraphQL subscriptions either work locally or return a clear graceful-skip response rather than an unhandled error
  5. The local GraphQL server correctly constructs AppSync-style context before invoking Lambda resolver functions
**Plans**: TBD

### Phase 3: Test Validation
**Goal**: The full system test suite is green against the local Docker stack and the AWS deployment is unaffected
**Depends on**: Phase 2
**Requirements**: TST-01, TST-02, TST-03, AWS-01
**Success Criteria** (what must be TRUE):
  1. Running the system test suite with USE_LOCAL=true produces all passing results against the local Docker stack
  2. Running the system test suite without USE_LOCAL produces all passing results against the AWS deployment
  3. Switching between modes requires only changing the USE_LOCAL environment variable — no test file edits
  4. All existing CDK stacks (core, api, data-prop) deploy cleanly with no CloudFormation errors or changed Lambda handler contracts
**Plans**: TBD

### Phase 4: Documentation
**Goal**: A developer who has never run the project locally can follow the README to start the stack and run tests in either mode
**Depends on**: Phase 3
**Requirements**: DOC-01, DOC-02
**Success Criteria** (what must be TRUE):
  1. README contains step-by-step instructions for starting the local Docker stack and running system tests against it
  2. README contains instructions for running system tests against the AWS deployment
  3. Both instruction sets are accurate against the current codebase (no broken steps)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Config Detection | 0/TBD | Not started | - |
| 2. Local Stack Completeness | 0/TBD | Not started | - |
| 3. Test Validation | 0/TBD | Not started | - |
| 4. Documentation | 0/TBD | Not started | - |
