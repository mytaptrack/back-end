---
phase: 01-config-detection
plan: 02
subsystem: testing
tags: [USE_LOCAL, dynamodb, cognito, jest, env-vars]

# Dependency graph
requires:
  - phase: 01-config-detection plan 01
    provides: USE_LOCAL routing scaffolding, unit tests for DAL behavior

provides:
  - Strict === equality for USE_LOCAL in user-dal.ts cognito init
  - Explicit USE_LOCAL=false in jest.setup.ts AWS mode else-branch
  - Aligned table name comments between local-global-setup.js and jest.setup.ts
  - .env.example annotation explaining container vs test table name distinction

affects:
  - 01-03 (system test execution depends on correct local/AWS routing)
  - any plan touching user-dal.ts or test setup files

# Tech tracking
tech-stack:
  added: []
  patterns:
    - USE_LOCAL strict equality (=== 'true') — new code must always use triple-equals
    - Explicit false assignment for AWS mode — absence of USE_LOCAL treated same as 'false'

key-files:
  created: []
  modified:
    - lib/src/v2/dals/user-dal.ts
    - system-tests/src/jest.setup.ts
    - system-tests/src/local-global-setup.js
    - .env.example

key-decisions:
  - "Leave event-dal.ts NODE_ENV fallback untouched — existing code is grandfathered; only new code uses USE_LOCAL-only pattern"
  - "Handler exports baseline count: 164 (api/src) — Plan 03 will compare against this"

patterns-established:
  - "USE_LOCAL pattern: always === 'true', never == 'true' or truthy check"
  - "AWS mode must explicitly set USE_LOCAL=false to prevent SSM/env-var ambiguity"

requirements-completed: [CFG-01, CFG-02, CFG-03, AWS-02]

# Metrics
duration: 2min
completed: 2026-03-23
---

# Phase 1 Plan 02: Config Detection Hardening Summary

**Strict === equality for USE_LOCAL in cognito init, explicit AWS-mode guard in jest.setup, and aligned table-name sync comments across test setup files**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-23T17:28:19Z
- **Completed:** 2026-03-23T17:30:31Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Fixed loose `==` to strict `===` in user-dal.ts cognito client initialization (line 34)
- Added explicit `else` branch in jest.setup.ts so AWS mode always has USE_LOCAL='false' set
- Added sync comment in local-global-setup.js linking table names to jest.setup.ts
- Annotated .env.example to clarify container vs test table name distinction

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix user-dal.ts strict equality and add jest.setup.ts AWS-mode guard** - `d2f11ad` (fix)
2. **Task 2: Verify table name consistency and annotate .env.example** - `eccca79` (chore)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `lib/src/v2/dals/user-dal.ts` - Changed cognito init from `==` to `===` 'true'
- `system-tests/src/jest.setup.ts` - Added else block setting USE_LOCAL='false' in AWS mode
- `system-tests/src/local-global-setup.js` - Added sync comment above table name assignments
- `.env.example` - Added 3-line comment block explaining container vs test table names

## Decisions Made
- Left event-dal.ts `NODE_ENV` fallback untouched per plan guidance — grandfathered code, only new code should use USE_LOCAL-only pattern
- Recorded handler export count baseline (164) for Plan 03 validation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- All lib/src `*.spec.ts` files fail with `SecurityError: Cannot initialize local storage without a --localstorage-file path` — this is a pre-existing jsdom configuration issue, not related to our changes. All tests in the affected spec files are `test.skip`, so 0 tests run. Not a regression.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- USE_LOCAL routing is now consistent throughout DAL layer (strict equality, explicit false in AWS mode)
- Table name alignment confirmed and documented
- Handler export baseline (164) recorded for Plan 03 integrity check
- Ready for Plan 03: local container server and system test wiring

---
*Phase: 01-config-detection*
*Completed: 2026-03-23*
