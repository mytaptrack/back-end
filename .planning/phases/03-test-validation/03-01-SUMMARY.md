---
phase: 03-test-validation
plan: "01"
subsystem: testing
tags: [jest, dynamodb-local, s3-mock, graphql, redis, rabbitmq, USE_LOCAL]

# Dependency graph
requires:
  - phase: 02-local-stack-completeness
    provides: local GraphQL server, REST server, device server, S3 mock infrastructure

provides:
  - All 64 system tests passing against Docker local stack with USE_LOCAL=true
  - Six server-side bug fixes enabling test compatibility without spec file changes
  - local.yml config with test credentials for system test users

affects:
  - 04-api-completeness (test baseline established, all existing tests must stay green)
  - Any future phase touching graphql/resolver/mutations/student, reports/settings, or snapshot

# Tech tracking
tech-stack:
  added: []
  patterns:
    - USE_LOCAL env var as mode switch for all infrastructure (no spec file conditionals)
    - S3 mock at localhost:9000 via AWS_ENDPOINT_URL for local snapshot storage
    - Redis token store (key: token:{userId-at-encoded}) for cognito auth in local mode
    - Student-level vs user-specific dashboard settings distinction in reports/settings GET

key-files:
  created:
    - config/local.yml
  modified:
    - api/src/device/functions/appApi/token-utils.ts
    - api/src/graphql/resolver/mutations/student/update-info/data.ts
    - api/src/graphql/resolver/query/getSnapshot/list.ts
    - api/src/v2/reports/settings/get.ts
    - system-tests/src/jest.setup.ts
    - system-tests/src/lib/api-web.ts
    - system-tests/src/local-global-setup.js

key-decisions:
  - "Use strict === undefined in cleanObject to preserve null values (null == undefined is true in JS loose equality)"
  - "getSnapshot reads from S3 (via local mock) not DynamoDB - aligns with putSnapshot which always writes to S3"
  - "reports/settings GET returns student-level (shared) dashboard not user-specific overlay - matches AppSync getStudent path"
  - "Normalize undefined nullable GraphQL fields to null in local mode (AppSync returns null, not undefined, for unset optional scalars)"
  - "config/local.yml added to repo for test credentials - provides testing.admin/nonadmin without environment-specific secrets"

patterns-established:
  - "Local mode server fixes: never add USE_LOCAL checks to spec files; fix infrastructure only"
  - "When S3 is used for persistence (snapshot), the local S3 mock at :9000 handles reads and writes consistently"
  - "cleanObject(obj, skipKeys) with skipKeys=true skips top-level deletion but recursively cleans nested objects - be careful with null values"

requirements-completed: [TST-01, TST-03]

# Metrics
duration: 180min
completed: 2026-04-05
---

# Phase 3 Plan 01: Test Validation Summary

**All 64 system tests pass against local Docker stack with USE_LOCAL=true via six server-side bug fixes, zero spec file changes**

## Performance

- **Duration:** ~3 hours (multi-session with context handoff)
- **Started:** 2026-04-05T17:00:00Z (approx)
- **Completed:** 2026-04-06T02:37:29Z
- **Tasks:** 2 completed (Task 3 is checkpoint:human-verify gate)
- **Files modified:** 7 source files, 1 config file created

## Accomplishments

- Fixed 6 server-side bugs that caused test failures — no spec file was modified (TST-03 preserved)
- Achieved 64/64 tests passing across 20 test suites against local Docker stack
- Established pattern for null-safe JavaScript comparisons in cleanObject utility
- Unified snapshot storage: both read and write paths now use S3 (local mock) consistently

## Task Commits

1. **Task 1: Run local suite and capture failure output** - `5629f66` (fix: TypeScript compilation errors)
2. **Task 1 continued** - `0a5df6a` (fix: local test suite infrastructure)
3. **Task 2: Achieve full local suite green** - `ae14f0b` (fix: device token + login fallback)
4. **Task 2 continued** - `a2aafaf` (fix: strict equality in cleanObject)
5. **Task 2 continued** - `5e11488` (fix: reports/settings local mode)
6. **Task 2 continued** - `b1f1071` (fix: snapshot S3/DynamoDB consistency)
7. **Task 2 continued** - `7c0385c` (chore: add local.yml)
8. **Task 2 continued** - `8269ee4` (chore: jest.setup CONFIG_FILE)

## Files Created/Modified

- `api/src/device/functions/appApi/token-utils.ts` - Added USE_LOCAL check to use TOKEN_ENCRYPT_KEY env var instead of SSM
- `api/src/graphql/resolver/mutations/student/update-info/data.ts` - Changed `== undefined` to `=== undefined` in cleanObject to prevent null deletion
- `api/src/graphql/resolver/query/getSnapshot/list.ts` - Removed DynamoDB local paths; unified on S3 (local mock) for both read and write; fixed empty lastModified.date
- `api/src/v2/reports/settings/get.ts` - Added local mode path using student-level dashboard; normalize undefined nullable fields to null
- `system-tests/src/jest.setup.ts` - Use local.yml as CONFIG_FILE in local mode
- `system-tests/src/lib/api-web.ts` - Null-safe fallback when config.env.testing not set
- `system-tests/src/local-global-setup.js` - Set CONFIG_FILE=local.yml before env var setup
- `config/local.yml` - New: local development config with test user credentials

## Decisions Made

1. **Strict equality in cleanObject:** JavaScript's loose `==` treats `null == undefined` as true. Changed `== undefined` to `=== undefined` so null values in objects (e.g., `abc.overwrite: null`) are preserved through DynamoDB writes instead of being deleted.

2. **Snapshot storage unified on S3:** The original code had two paths — DynamoDB for local mode and S3 for production. But `putSnapshot` always wrote to S3 (via local S3 mock in local mode). Removed the DynamoDB read paths from `getSnapshot` so read and write are consistent.

3. **Student-level vs user-level dashboard:** The V1 `getStudentSettings` endpoint should return the SHARED student dashboard settings, not the user-specific overlay. This matches production AppSync `getStudent.dashboard` which returns the shared settings. The user-specific dashboard is stored in a separate `UserDashboardStorage` record.

4. **Null normalization for GraphQL scalar fields:** AppSync GraphQL returns `null` for unset optional scalar fields. Local DynamoDB path returns JavaScript `undefined`. Normalized `chartType`, `measurementUnit`, `showExcludedChartGaps` to `null` when undefined to match AppSync behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] token-utils.ts in appApi missing USE_LOCAL mode**
- **Found during:** Task 2 (devices/apps.spec.ts RegisterPhone failure)
- **Issue:** appApi/token-utils.ts called SSM for encryption key in all modes. Local mode needs TOKEN_ENCRYPT_KEY env var. Key mismatch caused decryption failure.
- **Fix:** Added `if (process.env.USE_LOCAL === 'true')` branch to use env var
- **Files modified:** api/src/device/functions/appApi/token-utils.ts
- **Committed in:** ae14f0b

**2. [Rule 1 - Bug] cleanObject used loose equality deleting null values**
- **Found during:** Task 2 (website-v2/student.spec.ts QLStudentAbc failure)
- **Issue:** `cleanObject(obj)` had `if(obj[key] == undefined)` — JavaScript loose `==` makes `null == undefined` evaluate to `true`, so null values were deleted from objects before DynamoDB writes. `abc.overwrite: null` was stripped, leaving the old `overwrite: true` unchanged.
- **Fix:** Changed to strict `=== undefined`
- **Files modified:** api/src/graphql/resolver/mutations/student/update-info/data.ts
- **Committed in:** a2aafaf

**3. [Rule 1 - Bug] getSnapshot local path read from DynamoDB, putSnapshot wrote to S3**
- **Found during:** Task 2 (website-v1/reports.spec.ts Snapshot failure — saved changes not persisted)
- **Issue:** getSnapshot had `if USE_LOCAL` branches reading from DynamoDB with incorrect keys (`date.millisecond()` instead of date-based keys). putSnapshot always wrote to S3 (local mock). Second postSnapshot returned fresh empty data, ignoring the saved snapshot.
- **Fix:** Removed DynamoDB local branches from getSnapshot; unified on S3 paths (which work via local mock)
- **Files modified:** api/src/graphql/resolver/query/getSnapshot/list.ts
- **Committed in:** b1f1071

**4. [Rule 1 - Bug] Empty report created with today's date instead of empty string**
- **Found during:** Task 2 (Snapshot test `lastModified.date` should be falsy)
- **Issue:** New snapshot objects set `lastModified.date = moment().format('MM/DD/yyyy')` (today's date). Test expects falsy.
- **Fix:** Changed to empty string `''` matching the production S3 fallback path
- **Files modified:** api/src/graphql/resolver/query/getSnapshot/list.ts
- **Committed in:** b1f1071 (same commit)

**5. [Rule 1 - Bug] reports/settings GET returning user dashboard instead of student dashboard**
- **Found during:** Task 2 (ReportSettings test autoExcludeDays returning [0,3,6] instead of [0,6])
- **Issue:** Local mode path returned user dashboard overlay instead of student-level settings. After saving user settings with autoExcludeDays=[0,3,6], the GET returned the user overlay, but test expected base student settings [0,6].
- **Fix:** Removed userDashboard lookup from local path; only use studentConfig.dashboard
- **Files modified:** api/src/v2/reports/settings/get.ts
- **Committed in:** 5e11488

**6. [Rule 1 - Bug] Nullable GraphQL fields returned as undefined instead of null**
- **Found during:** Task 2 (ReportSettings chartType/measurementUnit assertions)
- **Issue:** AppSync returns `null` for unset optional fields; local path returns `undefined`. Test expects `null`.
- **Fix:** Normalize chartType, measurementUnit, showExcludedChartGaps to null when undefined
- **Files modified:** api/src/v2/reports/settings/get.ts
- **Committed in:** 5e11488 (same commit)

---

**Total deviations:** 6 auto-fixed (Rule 1 - Bugs)
**Impact on plan:** All fixes were necessary for test correctness. No spec files modified. TST-03 requirement preserved.

## Issues Encountered

- Stale server processes: GraphQL and REST servers were running with old code after file edits. Required kill and restart to pick up changes. Each server restart took 8-15 seconds.
- Test parallel execution: website-v1/user.spec.ts failed once due to data contamination from parallel test workers sharing DynamoDB. Passed when run in isolation and on subsequent full-suite runs. This is a pre-existing flakiness in the test setup, not introduced by this plan.
- Server startup commands: `npm run start` runs CDK deploy (not intended). Correct commands are `npm run graphql:start`, `npm run rest:start`, `npm run device:start`.

## User Setup Required

None - all fixes are in server-side code. Tests run with `USE_LOCAL=true npm test` from system-tests/.

**Prerequisite servers must be running:**
- `cd api && USE_LOCAL=true npm run graphql:start` (port 4000)
- `cd api && USE_LOCAL=true npm run rest:start` (port 3000)
- `cd api && USE_LOCAL=true npm run device:start` (port 3001)
- Docker containers: DynamoDB Local (:8000), Redis (:6379), RabbitMQ (:5672)

## Next Phase Readiness

- Full local test baseline established: 64/64 tests passing
- Any future code changes can be validated with `USE_LOCAL=true npm test`
- The checkpoint (Task 3) requires human verification that the suite passes — this is the natural gate before proceeding to Phase 4

---
*Phase: 03-test-validation*
*Completed: 2026-04-05*
