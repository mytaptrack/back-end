---
phase: 02-local-stack-completeness
plan: 03
subsystem: api
tags: [graphql, express-graphql, subscriptions, NoneDataSource, resolver-stubs]

# Dependency graph
requires:
  - phase: 02-local-stack-completeness
    provides: graphql-server.ts dynamic resolver loading (02-01, 02-02)
provides:
  - Null-returning stubs for onUserLicenseChange, onStudentDataChange, studentDataChange
  - Graceful skip (GQL-03) for NoneDataSource fields that bypass addLambdaResolver
affects: [02-local-stack-completeness, phase-3-tech-debt]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NoneDataSource stub pattern: root['fieldName'] = async () => null with log message"
    - "GQL-03 graceful skip: subscription/passthrough fields return null instead of field-not-defined error"

key-files:
  created: []
  modified:
    - api/src/container/graphql-server.ts

key-decisions:
  - "Stubs added directly to root resolver map (not via loadResolvers) because NoneDataSource fields use createResolver(), not addLambdaResolver"
  - "Dead code (YAML fallback, Object.entries fallback) removed — was superseded by AppSyncStack.addResolversToAppSync dynamic loading approach in 02-01"

patterns-established:
  - "NoneDataSource stub: root['fieldName'] = async (_args, _context, _info) => null — registered after loadResolvers() completes"

requirements-completed: [GQL-01, GQL-02, GQL-03]

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 02 Plan 03: Subscription Stubs and Dead Code Cleanup Summary

**Null-returning stubs for onUserLicenseChange, onStudentDataChange, and studentDataChange registered in graphql-server.ts root map — NoneDataSource fields now return graceful null instead of field-not-defined errors**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-23T23:30:00Z
- **Completed:** 2026-03-23T23:31:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added three async stub resolvers to the root resolver map after `loadResolvers()` — covers the NoneDataSource fields that createResolver() registers but addLambdaResolver does not capture
- Removed commented-out YAML loading block (`yamlPath`, `yamlContent`, `yaml.load`) from `loadResolverMappings`
- Removed commented-out Object.entries fallback block (Query/Mutation/Subscription) — superseded by AppSyncStack dynamic loading since plan 02-01
- All existing resolvers unchanged; `loadResolvers()` call and return value unmodified

## Task Commits

Each task was committed atomically:

1. **Task 1: Add subscription stubs and remove dead code** - `550c458` (feat)

## Files Created/Modified
- `api/src/container/graphql-server.ts` - Added NoneDataSource stubs after loadResolvers(), removed two dead-code comment blocks

## Decisions Made
- Stubs registered on root object directly (not inside loadResolvers) because the three fields come from createResolver(), not addLambdaResolver — the existing dynamic loading path cannot reach them
- Dead YAML/Object.entries blocks removed cleanly; they had been superseded since plan 02-01 introduced AppSyncStack.addResolversToAppSync

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 02 plan 03 complete: subscription stubs active, dead code removed
- graphql-server.ts is now clean for Phase 3 work (wrapResolver duplication tech debt)
- The `wrapResolver` duplication (graphql-server.ts vs resolver-wrapper.ts) is deferred to Phase 3 as planned

---
*Phase: 02-local-stack-completeness*
*Completed: 2026-03-23*
