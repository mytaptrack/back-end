---
phase: 1
slug: config-detection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 with ts-jest preset |
| **Config file** | `system-tests/package.json` `"jest"` key |
| **Quick run command** | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="config.spec"` |
| **Full suite command** | `cd system-tests && USE_LOCAL=true npm run test:local` |
| **Estimated runtime** | ~30 seconds (unit-only, no Docker); ~120 seconds (full local suite with Docker) |

---

## Sampling Rate

- **After every task commit:** Run `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="config.spec"`
- **After every plan wave:** Run `cd system-tests && USE_LOCAL=true npm run test:local`
- **Before `/gsd:verify-work`:** Full suite must be green (local Docker stack running)
- **Max feedback latency:** 30 seconds (unit), 120 seconds (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | CFG-01 | unit | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="dal.spec"` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | CFG-01 | unit | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="event-dal.spec"` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 0 | CFG-01 | unit | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="user-dal.spec"` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 0 | CFG-02 | unit | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="config.spec"` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 0 | CFG-02 | unit | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="httpClient.spec"` | ❌ W0 | ⬜ pending |
| 1-01-06 | 01 | 1 | CFG-01 | unit | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="dal.spec"` | ❌ W0 | ⬜ pending |
| 1-01-07 | 01 | 1 | CFG-03 | unit | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="config.spec"` | ❌ W0 | ⬜ pending |
| 1-01-08 | 01 | 2 | AWS-02 | manual | `grep -rn "export.*handleEvent\|export.*handler" api/src --include="*.ts"` — diff against baseline | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/src/v2/dals/dal.spec.ts` — unit tests: DynamoDB client gets `http://localhost:8000` when `DYNAMODB_ENDPOINT` is set; gets no endpoint override when unset
- [ ] `lib/src/v2/dals/event-dal.spec.ts` — unit tests: RabbitMQ path called when `USE_LOCAL=true`; EventBridge `.send()` called when `USE_LOCAL` absent (amqplib and AWS SDK mocked)
- [ ] `lib/src/v2/dals/user-dal.spec.ts` — unit test: `cognito` property is `null` when `USE_LOCAL=true`; is a `CognitoIdentityProviderClient` instance otherwise
- [ ] `system-tests/src/config.spec.ts` — unit tests for `getQLEndpoint`, `getApiEndpoint`, `getDeviceEndpoint`, `getClientId` in both modes (SSM mocked); `ssm === null` assertion when `USE_LOCAL=true`
- [ ] `system-tests/src/lib/httpClient.spec.ts` — unit tests: protocol is `http` and port is 3000/3001 when `USE_LOCAL=true`; `https` and 443 otherwise

*All Wave 0 gaps must be created before any Wave 1 implementation tasks run.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Handler export signatures unchanged | AWS-02 | Static audit, no runtime needed | Run `grep -rn "export.*handleEvent\|export.*handler" api/src --include="*.ts"` before and after; diff must show zero changes to handler signatures |
| `local-global-setup.js` seeds DynamoDB + Redis cleanly | CFG-02 | Requires Docker stack running | Bring up Docker stack (`docker compose up -d`), run `USE_LOCAL=true npm run test:local` from `system-tests/`, verify no seed errors in output |
| System tests run against AWS with `USE_LOCAL` absent | CFG-03 | Requires AWS credentials + deployed stack | From CI or a developer machine with valid AWS credentials, run `npm run test:aws` from `system-tests/`; all tests should pass |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (unit) / 120s (full suite)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
