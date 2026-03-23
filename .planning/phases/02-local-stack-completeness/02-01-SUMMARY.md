---
phase: 02-local-stack-completeness
plan: 01
subsystem: testing
tags: [jest, ts-jest, appsync, resolver-wrapper, tdd, graphql]

# Dependency graph
requires:
  - phase: 01-config-detection
    provides: USE_LOCAL env var pattern, jest-environment-node-compat.js for Node 25 compatibility
provides:
  - "5 unit tests for wrapResolver AppSync context shape (4 GREEN, 1 intentional RED for identity.claims)"
  - "api/jest.config.js with ts-jest and Node 25-compatible test environment"
  - "api/jest-environment-node-compat.js (copy of lib/ pattern for Node 25 localStorage fix)"
affects: [02-02-wrapResolver-claims-fix]

# Tech tracking
tech-stack:
  added: [jest (api/ now configured), ts-jest (api/ now runnable)]
  patterns: [TDD RED contract — intentionally failing test as specification for next plan]

key-files:
  created:
    - api/src/container/resolver-wrapper.spec.ts
    - api/jest.config.js
    - api/jest-environment-node-compat.js
  modified:
    - api/src/container/resolver-wrapper.ts

key-decisions:
  - "Test 3 (identity.claims) left intentionally RED — it is the Nyquist contract for Plan 02-02"
  - "api/jest-environment-node-compat.js mirrors lib/ pattern — Node 25 localStorage SecurityError affects all modules"
  - "resolver-wrapper.ts fixed to add missing env and args fields required by updated @aws-appsync/utils Context type"

patterns-established:
  - "TDD RED contract: write the failing test first; the RED state IS the spec for the next implementation plan"
  - "Node 25 jest compat: every module using jest must reference jest-environment-node-compat.js in jest.config.js"

requirements-completed: [GQL-04]

# Metrics
duration: 2min
completed: 2026-03-23
---

# Phase 2 Plan 01: wrapResolver AppSync Context Shape Contract Tests Summary

**5 TDD unit tests asserting wrapResolver passes identity.groups, identity.username, arguments, and info.fieldName — with Test 3 intentionally RED as the Nyquist contract for the identity.claims fix in Plan 02-02**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-23T07:23:19Z
- **Completed:** 2026-03-23T07:25:22Z
- **Tasks:** 1 (TDD: write tests, verify RED state)
- **Files modified:** 4

## Accomplishments

- Created api/src/container/resolver-wrapper.spec.ts with 5 unit tests covering the full AppSync context shape
- Tests 1, 2, 4, 5 pass GREEN against current wrapResolver implementation
- Test 3 fails RED (identity.claims undefined) — intentional Nyquist contract for Plan 02-02
- Established jest infrastructure for api/ module (jest.config.js + node-compat environment)

## Task Commits

Each task was committed atomically:

1. **TDD RED: wrapResolver context shape tests** - `05575e4` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `api/src/container/resolver-wrapper.spec.ts` - 5 unit tests for wrapResolver AppSync context shape
- `api/jest.config.js` - Jest config with ts-jest preset and Node 25-compatible environment
- `api/jest-environment-node-compat.js` - Node 25 localStorage SecurityError patch (mirrors lib/ pattern)
- `api/src/container/resolver-wrapper.ts` - Added missing `env` and `args` fields required by updated Context type

## Decisions Made

- Test 3 left intentionally RED: the failing test IS the specification for Plan 02-02 (identity.claims gap). GREEN would mean the gap is already closed.
- jest-environment-node-compat.js pattern established in Phase 1 (lib/) applies identically to api/ — copied rather than invented.
- resolver-wrapper.ts Context shape updated: @aws-appsync/utils v1.5+ requires `env` (process.env map) and `args` (alias for arguments) fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS2739: missing env and args fields in resolver-wrapper.ts Context shape**
- **Found during:** TDD RED phase (test suite failed to run)
- **Issue:** @aws-appsync/utils v1.5+ Context type requires `env` and `args` fields; resolver-wrapper.ts was missing both, causing a TypeScript compilation error that prevented the test suite from running
- **Fix:** Added `env: (process.env as Record<string, string>) || {}` and `args` (pointing to the same `args` parameter) to the appsyncContext object
- **Files modified:** api/src/container/resolver-wrapper.ts
- **Verification:** ts-jest compiled successfully; all 5 tests ran (4 GREEN, 1 RED as expected)
- **Committed in:** 05575e4 (task commit)

**2. [Rule 3 - Blocking] Added jest.config.js for api/ module**
- **Found during:** Initial jest run (no config found)
- **Issue:** api/ had no jest.config.js; jest ran without ts-jest transform, could not parse TypeScript
- **Fix:** Created api/jest.config.js with ts-jest preset and node-compat environment
- **Files modified:** api/jest.config.js (created)
- **Verification:** Tests ran via ts-jest transform successfully
- **Committed in:** 05575e4 (task commit)

**3. [Rule 3 - Blocking] Added jest-environment-node-compat.js for api/ module**
- **Found during:** First jest run after jest.config.js created
- **Issue:** Node 25 localStorage SecurityError (same issue fixed in Phase 1 for lib/)
- **Fix:** Copied lib/jest-environment-node-compat.js to api/ and referenced it in api/jest.config.js
- **Files modified:** api/jest-environment-node-compat.js (created), api/jest.config.js (updated)
- **Verification:** SecurityError gone; tests ran successfully
- **Committed in:** 05575e4 (task commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug, 2 Rule 3 blocking)
**Impact on plan:** All auto-fixes necessary for tests to run. The resolver-wrapper.ts fix also improves correctness — the Context object now matches the declared type. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Test contract for identity.claims is established and RED — Plan 02-02 can implement the fix with a clear pass/fail target
- api/ jest infrastructure is now functional for future test additions
- No blockers

---
*Phase: 02-local-stack-completeness*
*Completed: 2026-03-23*
