# Codebase Concerns

**Analysis Date:** 2026-03-21

## Broken/Interim Commits in Main Branch

**Status: CRITICAL - Blocks Progress**

- Commit `0b3737d`: "Interim checkin to track changes, but is a broken checkin" - explicitly marked as broken
- Commit `c362eea`: "Extending graphql to handle more scenarios. This is an interim checkin" - incomplete work
- Multiple "interim checkin" messages indicate work-in-progress merged to feature/localhost

**Files affected:** All modules potentially impacted by broken checkins
- Impact: Build may fail, deployments may be incomplete
- Fix approach: Audit broken commit `0b3737d` for what broke, revert or fix forward

## Tech Debt

### Dual Database Support - Implementation Burden

**Issue:** MongoDB provider (`lib/src/v2/providers/mongodb-provider.ts`) and DynamoDB provider (`lib/src/v2/providers/dynamodb-provider.ts`) both ~1000+ LOC, with complete parallel implementations

**Files:**
- `lib/src/v2/providers/dynamodb-provider.ts` (1001 lines)
- `lib/src/v2/providers/mongodb-provider.ts` (996 lines)
- `lib/src/v2/providers/mongodb-provider.spec.ts` (700 lines)
- `lib/src/v2/providers/dynamodb-provider.spec.ts` (574 lines)

**Impact:**
- Every database operation must be implemented twice
- Bug fixes must be applied to both providers
- Testing burden doubled
- Migration complexity if switching providers

**Fix approach:**
1. Determine primary database (DynamoDB is AWS-native, likely primary)
2. Deprecate MongoDB provider or mark as "legacy"
3. Remove if not in active use
4. If keeping both, create shared interface contracts to prevent divergence

### Large, Complex DAL Files

**Issue:** Business logic concentrated in large Data Access Layer files with multiple responsibilities

**Files:**
- `lib/src/v2/dals/app-dal.ts` (947 lines)
- `lib/src/v2/dals/student-dal.ts` (894 lines)
- `lib/src/v2/dals/user-dal.ts` (755 lines)
- `api/src/graphql/resolver/mutations/student/update-info/data.ts` (828 lines)

**Impact:**
- Difficult to test in isolation
- High risk of regression when modifying
- Poor separation of concerns
- Harder to debug production issues

**Fix approach:**
1. Extract query builders into separate modules
2. Create dedicated classes for specific entities (StudentQuery, AppQuery)
3. Break DAL tests into smaller units
4. Consider builder pattern for complex queries

### Weak Type Safety

**Issue:** 144 instances of `any` type usage across lib/src

**Files:** Multiple files including:
- `cdk/src/function.ts`
- `cdk/src/layer.ts`
- `cdk/src/utils/compile-utils.ts`
- `cdk/src/appsync/appsync-interfaces.ts`
- Data provider and DAL files

**Impact:**
- TypeScript safety benefits lost
- Silent bugs at runtime
- IDE autocomplete doesn't work
- Refactoring is unsafe

**Fix approach:**
1. Audit `any` usage to categorize (legitimate unknowns vs. laziness)
2. Replace with `unknown` + runtime checks where appropriate
3. Use generics for collections instead of `any[]`
4. Enable `noImplicitAny` in tsconfig if not already strict

### Credential/Token Logging

**Issue:** Console.log statements contain sensitive data

**Files:**
- `lib/src/v2/dals/app-dal.ts` lines 44, 46, 48, 55:
  ```typescript
  console.log('Decrypted', token, decryptedToken);  // Line 46 - logs DECRYPTED TOKEN
  console.log('Invalid token retrieved', decryptedToken);  // Line 48
  ```
- `lib/src/v2/dals/app-dal.ts` line 129: `console.log('Config count', configs.length);`

**Impact:**
- Tokens logged to CloudWatch in plain text
- Compliance violation (SOC2, HIPAA may apply)
- Security incident risk if logs compromised
- PII potentially exposed

**Current mitigation:** `audit-logger.ts` has redaction patterns, but not applied to all logging

**Fix approach:**
1. Remove all console.log() from production code
2. Replace with structured logger that applies audit-logger redaction
3. Configure CloudWatch log filtering to catch remaining sensitive patterns
4. Implement log sanitization middleware for all Lambda functions

## Security Considerations

### Environment Variable Access Without Validation

**Issue:** Direct `process.env` access without null checks or defaults

**Files:**
- `api/src/v2/licenses/post.ts`: `process.env.StudentTable as string`
- `api/src/v2/licenses/delete.ts`: `process.env.LicenseTable!`
- `api/src/v2/student/documents/get.ts`: `process.env.dataBucket`
- `lib/src/v2/dals/app-dal.ts` line 33-34: `process.env.TokenEncryptKey` (used without validation)
- `lib/src/v2/dals/app-dal.ts` line 94: `process.env.platformIosArn`, `process.env.platformAndroidArn`

**Impact:**
- Missing env vars cause runtime crashes instead of deployment-time failures
- Non-obvious failures in Lambda cold starts
- Makes deployment configuration errors hard to detect

**Fix approach:**
1. Create env config validator that runs on function startup
2. Use assertion operator only after validation
3. Provide clear error messages for missing required env vars
4. Document all required env vars in function comments

### Encryption Key Caching Without Invalidation

**Issue:** Token encryption key cached globally without invalidation mechanism

**Files:**
- `lib/src/v2/dals/app-dal.ts` lines 20-39: `cachedTokenKey`, `cachedTokenDetails`

**Impact:**
- Key rotation events won't be picked up by running functions
- Old/revoked keys still in use until function restarts
- No monitoring of cache hits/misses

**Fix approach:**
1. Add TTL to cached values (e.g., 1 hour)
2. Add CloudWatch metric for cache invalidation events
3. Implement key rotation detection and force refresh
4. Consider using Parameter Store with automatic refresh instead of manual caching

### SNS Platform Endpoint Lifecycle Management

**Issue:** Old SNS push endpoints deleted but new one might fail, leaving app without notifications

**Files:**
- `lib/src/v2/dals/app-dal.ts` lines 86-90: Deletes old endpoint before creating new

**Impact:**
- Brief window where device can't receive push notifications
- If SNS endpoint creation fails, no rollback to old endpoint
- Error handling returns empty string (line 106) without logging reason

**Fix approach:**
1. Create new endpoint first, validate it works
2. Delete old endpoint only after new one confirmed
3. Log SNS API errors with full context (platform, token)
4. Implement retry with exponential backoff for SNS operations

### executeNative Bypasses Security Controls

**Issue:** `executeNative()` method allows raw database operations without encryption/audit

**Files:**
- `lib/src/v2/security/secure-dal.ts` lines with `executeNative()`
- Console warning present: `console.warn('executeNative bypasses security controls')`

**Impact:**
- Potential for unencrypted data access
- Audit logging skipped for native operations
- Used in tests but could be misused in production

**Fix approach:**
1. Restrict `executeNative` to test-only code (e.g., separate interface)
2. Add runtime guards preventing production use
3. Make all production paths go through encrypted DAL
4. Add integration tests verifying encryption applied

## Performance Bottlenecks

### N+1 Query Patterns in Data Fetching

**Issue:** Large batch operations fetch configs, then loop through to get additional data

**Files:**
- `lib/src/v2/dals/app-dal.ts` lines 121-150: `getAppsForLicense()` batches keys but may trigger multiple DB queries

**Impact:**
- High latency for operations fetching many related records
- DynamoDB capacity unit waste
- Timeouts on large datasets

**Fix approach:**
1. Use DynamoDB batch operations (BatchGetItem) for all related data
2. Pre-fetch all needed data before loops
3. Implement query optimizer to reduce batch rounds
4. Add query cost logging to detect N+1 patterns in tests

### Transaction Manager Complexity (811 LOC)

**Issue:** `lib/src/v2/utils/transaction-manager.ts` is large with complex state machine logic

**Impact:**
- Hard to understand transaction flow
- Difficult to add features or fix bugs
- Risk of transaction conflicts not being handled

**Fix approach:**
1. Extract state transitions to separate strategy classes
2. Add comprehensive logging of transaction state changes
3. Create visual state diagram documentation
4. Break transaction phases into smaller, testable units

## Fragile Areas

### Student Update Logic - High Risk

**Issue:** `api/src/graphql/resolver/mutations/student/update-info/data.ts` (828 lines) contains complex student state updates with multiple data sources

**Files:**
- `api/src/graphql/resolver/mutations/student/update-info/data.ts` - Main update logic
- `api/src/graphql/resolver/mutations/student/update-info/delete.ts` - Delete logic (3957 bytes)
- `api/src/graphql/resolver/mutations/student/update-info/schedules.ts` - Schedule updates

**Why fragile:**
- Multiple DALs interacting (`StudentDal`, `ScheduleDal`, `LicenseDal`)
- Complex object transformations (cleanObject function)
- TODO comment at line 81: "Check student school id to see if that is in the system" - incomplete feature
- Long function signature with tuple destructuring
- Multiple transaction operations need to succeed atomically

**Safe modification:**
1. Add comprehensive integration tests before changing
2. Use transaction manager for all multi-step updates
3. Add audit logging of each state change
4. Validate constraints (school ID, license) before update
5. Test failure scenarios (partial updates, permission denial)

**Test coverage gaps:**
- No visible tests for `update-info/data.ts` handler
- Edge cases: concurrent updates, permission changes during update
- Rollback scenarios not tested

### GraphQL API Test Files (7 total in entire api/)

**Issue:** Very few API tests relative to codebase size

**Files:**
- 999 total TypeScript files in codebase
- Only 7 test files in `api/`
- Main query/mutation resolvers have no visible .spec.ts files

**Impact:**
- API changes break silently until caught in system tests
- Regressions in common operations go undetected
- High risk of breaking field removals or type changes

**Fix approach:**
1. Create unit tests for each mutation handler
2. Test permission checks and auth boundary
3. Test error handling and edge cases
4. Set coverage target (80%+) for api/ module

## Test Coverage Gaps

### System Tests with 217 Skipped Tests

**Issue:** 217 instances of `xit()` or `xdescribe()` (skipped tests) in codebase

**Impact:**
- Unclear which features are actually tested
- Skipped tests may be outdated and misleading
- Maintenance burden of abandoned tests

**Files:** Distributed across test suite

**Fix approach:**
1. Audit skipped tests - categorize into: "works but flaky", "not implemented yet", "broken test"
2. Remove tests that are truly obsolete
3. Re-enable and fix flaky tests with proper mocking/timeouts
4. Document why specific tests remain skipped (with GitHub issue links)

### Limited Coverage of Data Propagation

**Issue:** Data propagation module (`data-prop/`) likely undercovered given event-driven nature

**Impact:**
- State inconsistencies between tables/S3 go undetected
- Event processing failures cause data loss silently

**Fix approach:**
1. Add integration tests for each event stream handler
2. Test both happy path and error scenarios (event malformed, DynamoDB write fails, etc.)
3. Verify audit logging of all propagation operations

## Missing Critical Features

### Incomplete Student School ID Validation

**Issue:** TODO comment at `api/src/graphql/resolver/mutations/student/update-info/data.ts:81`

```typescript
// TODO: Check student school id to see if that is in the system
return await createStudent(context);
```

**Impact:**
- Students can be created with non-existent school IDs
- Data integrity issue
- Orphaned students in system

**Fix approach:**
1. Validate school ID exists in system before creating student
2. Return clear error to client if school ID invalid
3. Add integration test checking this constraint
4. Make school ID required for student creation

## Dependencies at Risk

### Dual Provider Transition Risk

**Issue:** Codebase supports both DynamoDB and MongoDB providers, unclear which is "production"

**Potential concerns:**
- Code paths for both providers tested in CI but only one used in production
- Dead code maintenance burden for unused provider
- Risk of breaking changes to unused provider

**Migration plan:**
1. Determine which provider is actually used in production (check CDK deployments)
2. Standardize on single provider
3. Document deprecation plan if keeping both
4. Remove unused provider code in next major version

### AWS SDK Version Pinning

**Issue:** Multiple AWS SDK v3 packages at various versions (^3.899.0 in package.json)

**Impact:**
- Potential security updates not applied
- Breaking changes in minor versions possible
- Inconsistent behavior across services

**Fix approach:**
1. Audit all AWS SDK dependencies for security advisories
2. Update to latest stable v3 versions
3. Lock to exact versions (remove ^) until regression testing passed
4. Add dependabot or similar for security updates

## Backup Files Present

**Issue:** Backup file `api/lib/app-sync.bk.ts` (14KB) present in source tree

**Files:**
- `api/lib/app-sync.bk.ts` - Old version of AppSync stack

**Impact:**
- Unclear which version is active
- Code duplication making future changes harder
- Potential confusion in code review

**Fix approach:**
1. Delete backup file
2. If old version needed for reference, preserve in git history only
3. Add .bk files to .gitignore
4. Consider using git branches instead of file copies for versioning

## Configuration and Setup Issues

### Environment Variable Documentation Missing

**Issue:** Many environment variables used throughout codebase without centralized documentation

**Files affected:**
- `api/src/v2/` directory
- `lib/src/v2/dals/app-dal.ts`
- Lambda functions across all modules

**Impact:**
- New developers don't know what env vars are required
- Deployment errors from missing configuration
- Variables may be set but unused (code rot)

**Fix approach:**
1. Create ENV_VARS.md documenting all required variables
2. Add validation/example values
3. Group by module/function
4. Link from relevant code via comments

---

*Concerns audit: 2026-03-21*
