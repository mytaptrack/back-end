---
phase: 3
slug: test-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 with ts-jest preset |
| **Config file** | `system-tests/package.json` `"jest"` key |
| **Quick run command** | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="devices/apps"` |
| **Full suite command** | `cd system-tests && USE_LOCAL=true npm run test:local` |
| **AWS suite command** | `cd system-tests && npm run test:aws` |
| **Estimated runtime** | ~30s (single spec); ~5-10 min (full suite with Docker) |

---

## Sampling Rate

- **After every task commit:** `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="devices/apps" 2>&1 | tail -10`
- **After every plan wave:** Full `USE_LOCAL=true npm run test:local`
- **Before `/gsd:verify-work`:** Both local and AWS suites must be green
- **Max feedback latency:** 30s (single spec), ~10 min (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 03-01 | 0 | TST-01 | integration | `make container-services && cd system-tests && USE_LOCAL=true npm run test:local 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 3-01-02 | 03-01 | 1 | TST-02 | integration (manual) | `cd system-tests && npm run test:aws 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 3-01-03 | 03-01 | 1 | TST-03 | static | `grep -n "USE_LOCAL" system-tests/src/config.ts system-tests/src/jest.setup.ts` | ✅ | ⬜ pending |
| 3-02-01 | 03-02 | 2 | AWS-01 | static | `cd api && npx cdk synth 2>&1 \| tail -20` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No new test files needed — all verification uses existing system-test infrastructure.

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full system test suite passes against AWS | TST-02 | Requires live AWS deployment with valid credentials | Run `cd system-tests && npm run test:aws` from a machine with valid AWS creds pointing at the deployed stack |
| CDK stacks deploy cleanly | AWS-01 | Requires AWS credentials + CDK bootstrap | Run `make deploy` and verify no CloudFormation failures |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s per task commit
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
