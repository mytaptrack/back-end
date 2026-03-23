---
phase: 02-local-stack-completeness
plan: "02"
subsystem: api
tags: [graphql, appsync, resolver, identity, container, docker]

# Dependency graph
requires:
  - phase: 02-local-stack-completeness
    plan: "01"
    provides: wrapResolver TDD contract tests (resolver-wrapper.spec.ts)
provides:
  - container:start script correctly points to graphql-server.ts
  - identity.claims populated in AppSync context passed to Lambda handlers
  - All 5 resolver-wrapper.spec.ts tests passing GREEN
affects: [03-graphql-server-hardening, system-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "identity spread + claims alias: { ...context.identity, claims: context.identity } satisfies both graphQLWrapper (groups/username) and apiWrapperEx (claims.sub) contracts"

key-files:
  created: []
  modified:
    - api/package.json
    - api/src/container/resolver-wrapper.ts

key-decisions:
  - "Use spread+alias pattern for identity.claims: preserves all existing CognitoIdentity fields and adds claims pointing to the same object — zero breaking changes to existing graphQLWrapper consumers"
  - "container:start now points directly to graphql-server.ts (not a shim) — simpler, one indirection layer removed"

patterns-established:
  - "Pattern: identity claims alias — identity object spread with claims field pointing to self satisfies both old and new AppSync context consumers"

requirements-completed: [CFG-04, GQL-04]

# Metrics
duration: 1min
completed: 2026-03-23
---

# Phase 02 Plan 02: Container Start and Identity Claims Fix Summary

**graphql-api container startup fixed and identity.claims aliased so apiWrapperEx-style handlers receive context.identity.claims.sub without breaking graphQLWrapper consumers**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-23T23:27:22Z
- **Completed:** 2026-03-23T23:28:20Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Fixed container:start npm script to invoke graphql-server.ts (not non-existent server.ts), unblocking Docker container startup
- Added identity.claims alias to wrapResolver AppSync context shape via spread pattern
- All 5 resolver-wrapper.spec.ts tests now pass GREEN (including Test 3 which was intentionally RED in Plan 01)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix container:start script in api/package.json** - `5f456dc` (fix)
2. **Task 2: Add identity.claims to resolver-wrapper.ts wrapResolver** - `57124be` (fix)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `api/package.json` - container:start script updated from server.ts to graphql-server.ts
- `api/src/container/resolver-wrapper.ts` - identity field now uses `{ ...context.identity, claims: context.identity }` pattern

## Decisions Made

- Used spread+claims-alias pattern for identity rather than a separate transformation step — all existing fields preserved, claims added as alias pointing to same object. Zero risk of breaking graphQLWrapper consumers that read identity.groups or identity.username.
- Changed container:start to point directly to graphql-server.ts rather than introducing a shim — simpler, fewer indirection layers.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- graphql-api container can now start without code 1 exit
- identity.claims contract established for Phase 3 handler work
- resolver-wrapper.spec.ts fully green — ready for Phase 3 to extend the spec if needed

---
*Phase: 02-local-stack-completeness*
*Completed: 2026-03-23*
