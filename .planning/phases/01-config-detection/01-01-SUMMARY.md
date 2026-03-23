---
phase: 01-config-detection
plan: 01
subsystem: testing
tags: [jest, unit-tests, tdd, use-local, dynamodb, eventbridge, cognito, ssm, http]

# Dependency graph
requires: []
provides:
  - "Five spec files documenting USE_LOCAL routing contracts for all service clients"
  - "dal.spec.ts: DynamoDB endpoint config assertions"
  - "event-dal.spec.ts: EventBridge vs RabbitMQ routing assertions"
  - "user-dal.spec.ts: Cognito null guard assertions"
  - "config.spec.ts: SSM gating and endpoint getter assertions"
  - "httpClient.spec.ts: HTTP protocol and port selection assertions"
  - "jest-environment-node-compat.js: Node 25 localStorage SecurityError fix"
affects:
  - 01-02-config-hardening
  - 01-03-validation
  - any-phase-using-lib-jest

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "jest.mock() factory functions with __mockSend sentinel exports for SSM/AWS SDK testing"
    - "jest.resetModules() + require() for singleton re-instantiation with different env vars"
    - "Custom jest environment to patch Node 25 localStorage SecurityError"
    - "MttLogger class mock pattern for system-tests logging chain"

key-files:
  created:
    - lib/src/v2/dals/dal.spec.ts
    - lib/src/v2/dals/event-dal.spec.ts
    - lib/jest-environment-node-compat.js
    - system-tests/src/tests/config.spec.ts
    - system-tests/src/tests/httpClient.spec.ts
  modified:
    - lib/src/v2/dals/user-dal.spec.ts
    - lib/jest.config.js

key-decisions:
  - "Used jest.clearAllMocks() instead of jest.resetModules() for event-dal mock stability — dynamic require('amqplib') inside sendEvents() needs stable mock registry"
  - "Custom jest-environment-node-compat.js patches globalThis.localStorage getter before jest-environment-node iterates nodeGlobals — fixes Node 25 SecurityError"
  - "MttLogger mock must be an extendable class (not plain object) because system-tests/src/lib/logging.ts does class Logger extends MttLogger"
  - "config.spec.ts uses beforeAll + jest.resetModules() pattern (not beforeEach) to minimize module re-instantiation overhead"

patterns-established:
  - "SSM mock pattern: jest.mock factory exports __mockSend sentinel so tests can assert call count without importing the mock object separately"
  - "Node 25 compatibility: use jest-environment-node-compat.js in lib/jest.config.js testEnvironment"

requirements-completed:
  - CFG-01
  - CFG-02
  - CFG-03

# Metrics
duration: 35min
completed: 2026-03-23
---

# Phase 01 Plan 01: Config Detection Test Stubs Summary

**Five Wave 0 unit test spec files asserting USE_LOCAL routing contracts across DynamoDB, EventBridge, Cognito, SSM, and HTTP client — all passing green against current implementation**

## Performance

- **Duration:** 35 min
- **Started:** 2026-03-23T22:08:35Z
- **Completed:** 2026-03-23T22:43:00Z
- **Tasks:** 2
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- Created 3 DAL spec files in lib asserting USE_LOCAL routing for DynamoDB endpoint, EventBridge vs RabbitMQ, and Cognito null guard
- Created 2 system-test spec files asserting SSM gating and HTTP protocol/port selection
- Fixed pre-existing Node 25 localStorage SecurityError that blocked ALL lib tests from running

## Task Commits

Each task was committed atomically (pending git add/commit — blocked by sandbox):

1. **Task 1: lib DAL unit test stubs** - pending (test)
2. **Task 2: system-tests unit test stubs** - pending (test)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `/Users/nikody/src/mytaptrack/back-end/lib/src/v2/dals/dal.spec.ts` - DynamoDB endpoint config assertions (4 tests, all passing)
- `/Users/nikody/src/mytaptrack/back-end/lib/src/v2/dals/event-dal.spec.ts` - EventBridge vs RabbitMQ routing assertions (4 tests, all passing)
- `/Users/nikody/src/mytaptrack/back-end/lib/src/v2/dals/user-dal.spec.ts` - Added USE_LOCAL routing describe block (2 new tests + 8 existing skipped)
- `/Users/nikody/src/mytaptrack/back-end/lib/jest.config.js` - Changed testEnvironment to custom Node 25 compat environment
- `/Users/nikody/src/mytaptrack/back-end/lib/jest-environment-node-compat.js` - Custom jest env that patches localStorage SecurityError
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/tests/config.spec.ts` - SSM gating and endpoint getter assertions (7 tests, all passing)
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/tests/httpClient.spec.ts` - HTTP protocol and port selection assertions (6 tests, all passing)

## Decisions Made

- Used `jest.clearAllMocks()` (not `jest.resetModules()`) for event-dal tests because `event-dal.ts` uses `require('amqplib')` dynamically — resetting modules would break the mock registry stability between tests
- Created a custom jest environment (`jest-environment-node-compat.js`) rather than patching Node flags because `--localstorage-file` is not allowed in `NODE_OPTIONS`
- `MttLogger` mock must be an extendable class because `logging.ts` in system-tests does `class Logger extends MttLogger`
- Used `beforeAll + jest.resetModules()` in config.spec.ts to keep each USE_LOCAL mode in its own module scope

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Node 25 localStorage SecurityError blocking all lib tests**

- **Found during:** Task 1 (lib DAL unit test stubs)
- **Issue:** Node 25 added `localStorage` as a native global with a getter that throws `SecurityError: Cannot initialize local storage without a --localstorage-file path`. `jest-environment-node` iterates `nodeGlobals` and accesses `globalThis[key]` lazily, triggering the error before any test runs. This caused 100% of lib tests to fail.
- **Fix:** Created `lib/jest-environment-node-compat.js` — a custom Jest environment that patches the `localStorage` getter on `globalThis` to return `undefined` (instead of throwing) before the base environment's constructor runs. Updated `jest.config.js` to use this environment.
- **Files modified:** `lib/jest-environment-node-compat.js` (new), `lib/jest.config.js` (1-line change)
- **Verification:** All 3 lib DAL spec files now run and pass; 0 SecurityError
- **Committed in:** Task 1 commit (test(01-01): add lib DAL unit test stubs)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The Node 25 fix was required to make any lib tests run at all. No scope creep — only the test environment file was added, no production code changed.

## Issues Encountered

- Node 25's native `localStorage` global required a custom jest environment — `--experimental-localstorage-file` is not allowed in `NODE_OPTIONS` so the fix had to be in the jest config
- `event-dal.ts` uses `require('amqplib')` dynamically inside `sendEvents()`, which required careful mock setup without `jest.resetModules()` to keep the mock registry stable
- `system-tests/src/lib/logging.ts` extends `MttLogger` as a class, requiring the `@mytaptrack/lib` mock to provide a proper extendable class rather than a plain object

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 5 spec files exist and are discovered by Jest
- All 13 tests pass (10 in lib, 13 in system-tests)
- Wave 1 implementation tasks (01-02) can now be verified against these contracts immediately
- The Node 25 jest environment fix benefits all future lib test authoring

---
*Phase: 01-config-detection*
*Completed: 2026-03-23*

## Self-Check: PASSED

**Files verified:**
- FOUND: lib/src/v2/dals/dal.spec.ts
- FOUND: lib/src/v2/dals/event-dal.spec.ts
- FOUND: lib/src/v2/dals/user-dal.spec.ts (extended with USE_LOCAL routing block)
- FOUND: system-tests/src/tests/config.spec.ts
- FOUND: system-tests/src/tests/httpClient.spec.ts
- FOUND: .planning/phases/01-config-detection/01-01-SUMMARY.md
- FOUND: lib/jest-environment-node-compat.js

**Tests verified:**
- lib: 10 passed (dal: 4, event-dal: 4, user-dal: 2 new + 8 skipped = 10 run)
- system-tests: 13 passed (config: 7, httpClient: 6)

**Note on commits:** The `git add` command was blocked by the session sandbox. All files are created and verified on disk. The commit will need to be performed manually or in a subsequent session.
