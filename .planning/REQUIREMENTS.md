# Requirements: MyTapTrack Back-End — Local Docker Support

**Defined:** 2026-03-23
**Core Value:** Lambda handlers run unmodified in both local Docker and AWS — the translation layer absorbs all environment differences.

## v1 Requirements

### Config & Environment

- [ ] **CFG-01**: System detects local vs AWS mode via `USE_LOCAL` env var and routes all service clients (DynamoDB, EventBridge, etc.) accordingly
- [ ] **CFG-02**: System tests correctly target local Docker stack when `USE_LOCAL=true`
- [ ] **CFG-03**: System tests correctly target AWS resources when `USE_LOCAL` is unset/false
- [ ] **CFG-04**: `docker compose up` starts all required services and APIs cleanly with no manual steps

### GraphQL Local Server

- [ ] **GQL-01**: All GraphQL query operations handled by local server
- [ ] **GQL-02**: All GraphQL mutation operations handled by local server
- [ ] **GQL-03**: GraphQL subscriptions handled or gracefully skipped in local mode
- [ ] **GQL-04**: Local GraphQL server correctly translates AppSync-style context to Lambda invocation format

### System Tests

- [ ] **TST-01**: Full system test suite passes against local Docker stack
- [ ] **TST-02**: Full system test suite passes against AWS deployment
- [ ] **TST-03**: Tests can be run in either mode without code changes (env var only)

### AWS Compatibility

- [ ] **AWS-01**: All existing CDK stacks deploy cleanly with no regressions
- [ ] **AWS-02**: Lambda handlers unchanged — no modifications to resolver/handler signatures

### Documentation

- [ ] **DOC-01**: README documents how to start the local stack and run system tests locally
- [ ] **DOC-02**: README documents how to run system tests against AWS

## v2 Requirements

### Local Service Expansion

- **SVC-01**: Local equivalents for SES (email sending) in dev mode
- **SVC-02**: Local equivalent for SNS/Pinpoint notifications in dev mode

## Out of Scope

| Feature | Reason |
|---------|--------|
| Local production deployment | Local mode is development-only |
| LocalStack for all AWS services | Only core data path services needed; full parity is out of scope |
| CI/CD pipeline changes | Pipeline targets AWS only |
| Modifying Lambda handler signatures | Core constraint — handlers must remain unchanged |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CFG-01 | Phase 1 | Pending |
| CFG-02 | Phase 1 | Pending |
| CFG-03 | Phase 1 | Pending |
| AWS-02 | Phase 1 | Pending |
| CFG-04 | Phase 2 | Pending |
| GQL-01 | Phase 2 | Pending |
| GQL-02 | Phase 2 | Pending |
| GQL-03 | Phase 2 | Pending |
| GQL-04 | Phase 2 | Pending |
| TST-01 | Phase 3 | Pending |
| TST-02 | Phase 3 | Pending |
| TST-03 | Phase 3 | Pending |
| AWS-01 | Phase 3 | Pending |
| DOC-01 | Phase 4 | Pending |
| DOC-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after roadmap creation*
