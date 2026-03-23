---
phase: 2
slug: local-stack-completeness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 with ts-jest (system-tests), manual Docker smoke tests |
| **Config file** | `system-tests/package.json` `"jest"` key |
| **Quick run command** | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="graphql" --forceExit 2>&1 \| tail -30` |
| **Full suite command** | `cd system-tests && USE_LOCAL=true npm run test:local --forceExit` |
| **Docker smoke command** | `docker compose up -d && sleep 5 && curl -s http://localhost:4000/graphql -X POST -H "Content-Type: application/json" -d '{"query":"{__typename}"}' && docker compose down` |
| **Estimated runtime** | ~30 seconds (quick); ~120 seconds (full suite with containers) |

---

## Sampling Rate

- **After every task commit:** Run `docker compose up -d` + targeted curl smoke test against the changed service
- **After every plan wave:** Run `cd system-tests && USE_LOCAL=true npm run test:local --forceExit`
- **Before `/gsd:verify-work`:** Full suite green with Docker stack running
- **Max feedback latency:** 30 seconds (smoke), 120 seconds (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | CFG-04 | smoke | `docker compose up -d graphql-api && sleep 5 && curl -sf http://localhost:4000/graphql -X POST -H "Content-Type: application/json" -d '{"query":"{__typename}"}' && docker compose down` | ✅ | ⬜ pending |
| 2-01-02 | 01 | 1 | GQL-04 | unit | `cd lib && npm test -- --testPathPattern="resolver-wrapper" --passWithNoTests --forceExit 2>&1 \| tail -20` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | GQL-03 | smoke | `curl -sf http://localhost:4000/graphql -X POST -H "Content-Type: application/json" -d '{"query":"subscription { onUserLicenseChange { license } }"}' \| grep -i "null\|not supported\|graceful"` | ✅ | ⬜ pending |
| 2-02-01 | 02 | 2 | GQL-01 | integration | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="graphql" --forceExit 2>&1 \| tail -30` | ✅ | ⬜ pending |
| 2-02-02 | 02 | 2 | GQL-02 | integration | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="graphql" --forceExit 2>&1 \| tail -30` | ✅ | ⬜ pending |
| 2-03-01 | 03 | 3 | CFG-04 | e2e | `make container-services && sleep 10 && cd system-tests && USE_LOCAL=true npm run test:local --forceExit 2>&1 \| tail -40` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `api/src/container/resolver-wrapper.spec.ts` — unit tests: `wrapResolver` correctly passes `identity.groups`, `identity.username`, `identity.claims` to Lambda handler context; stubs for subscription field resolvers return null+message

*If none needed beyond above: "Existing infrastructure covers remaining phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `docker compose up` starts all services cleanly with no manual steps | CFG-04 | Requires Docker daemon running, port availability | Run `make container-services` (or `docker compose up`), verify all 6 services reach healthy state, no exit codes, no error logs in first 30 seconds |
| GraphQL subscriptions return graceful skip, not unhandled error | GQL-03 | Subscription protocol not supported over HTTP; behavior is null return | With stack running, POST `{"query":"subscription { onUserLicenseChange { license } }"}` to `http://localhost:4000/graphql`; response must be JSON (not 500), data field null or structured message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (smoke) / 120s (full suite)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
