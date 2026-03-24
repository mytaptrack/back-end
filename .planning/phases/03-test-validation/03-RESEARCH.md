# Phase 3: Test Validation - Research

**Researched:** 2026-03-24
**Domain:** Jest system-test execution against local Docker stack and AWS; CDK stack regression verification
**Confidence:** HIGH — all findings read directly from source files in this repository

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TST-01 | Full system test suite passes against local Docker stack | `system-tests/src/tests/` has ~15 active spec files; `local-global-setup.js` seeds DynamoDB+Redis automatically; tests use `USE_LOCAL=true` to target `localhost:{4000,3000,3001}`; GraphQL, REST, device API paths all wired for local mode |
| TST-02 | Full system test suite passes against AWS deployment | `aws-test-setup.js` validates AWS credentials; `config.ts` loads SSM parameters for all endpoints; `dev.yml` provides real `testing.admin` credentials; known issue: system tests ARE NOT passing for AWS resources — config loading may be misrouted |
| TST-03 | Tests can be run in either mode without code changes (env var only) | `test:local` and `test:aws` npm scripts already exist; `jest.setup.ts` and `config.ts` branch on `USE_LOCAL===true`; `httpClient.ts` uses `isLocal` at module-load time; env-var-only switching is architecturally in place |
| AWS-01 | All existing CDK stacks deploy cleanly with no regressions | Three deployable stacks: `core/`, `api/`, `data-prop/`; Phase 2 changes were limited to `api/src/container/` (runtime-only); CDK stack definitions in `api/lib/` were not touched; synth smoke test should confirm no regressions |
</phase_requirements>

---

## Summary

Phase 3 is a diagnosis-and-fix phase, not a greenfield build. The test infrastructure is mostly complete: `local-global-setup.js` seeds DynamoDB tables and Redis tokens before tests run, `config.ts` and `httpClient.ts` correctly branch on `USE_LOCAL`, and the GraphQL/REST servers built in Phase 2 handle all resolver operations. The phase has two distinct problems to solve.

**Problem 1 (TST-01): System tests not passing against local Docker.** The user confirmed tests pass when supporting services are running via `make container-services`. This means the test infrastructure is fundamentally correct and the issue is likely specific resolver failures or data-shape mismatches from the Phase 2 work. Investigation should start by running `USE_LOCAL=true npm run test:local` against a live stack and reading failure output to identify which tests fail and why.

**Problem 2 (TST-02): System tests not passing against AWS.** The user explicitly flagged this as a config issue where the config "doesn't understand local vs AWS configuration." The most likely cause is that `example_test.yml` (which the GraphQL server uses as its base config) lacks the `testing:` section with admin credentials, while `dev.yml` (which system tests merge via `STAGE=dev`) does have it. The `ConfigFile` class merges: `CONFIG_FILE` (default `config.yml`) → then `{STAGE}.yml` — so in AWS mode the `testing.admin` credentials should come from `dev.yml`, but something in the connection may be failing (SSM parameter path, credential scope, or the `test:aws` script's `&&` chain which does not propagate `USE_LOCAL=false` as a child-process env var reliably).

**Problem 3 (AWS-01): CDK regression check.** Phase 2 changes were limited to `api/src/container/graphql-server.ts` and `api/src/container/resolver-wrapper.ts` — both are runtime-only files that do not participate in CDK synthesis. No Lambda handler signatures changed. A `cdk synth` smoke test should confirm clean synthesis.

**Primary recommendation:** Run the local suite first, fix specific test failures, then investigate the AWS config path by adding debug logging to identify where the AWS mode fails — likely the `test:aws` script's shell `&&` chain not inheriting `USE_LOCAL=false` into the Jest process.

---

## Standard Stack

### Core (already in use — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jest` | 29.7.0 | Test runner | Already configured; `test:local` / `test:aws` scripts present |
| `ts-jest` | 29.3.2 | TypeScript Jest support | Already configured as preset in `system-tests/package.json` |
| `graphql-request` | 6.1.0 | GraphQL client in tests | Already used by `QLApiClass` in `api-ql.ts` |
| `ioredis` | 5.8.2 | Redis client for token setup/retrieval | Used in `local-global-setup.js` and `cognito.ts` |
| `jsonwebtoken` | 9.0.3 | JWT signing for local tokens | Used in `local-global-setup.js` to mint Redis-stored tokens |
| `dotenv` | 17.2.3 | .env loading | Used by `local-global-setup.js` and `config.ts` |
| `@aws-sdk/client-cognito-identity-provider` | 3.799.0 | Cognito auth for AWS mode | Used in `cognito.ts` when `USE_LOCAL !== 'true'` |
| `@aws-sdk/client-ssm` | 3.799.0 | SSM parameter lookup for AWS mode | Used in `config.ts` for endpoint/clientId discovery |
| AWS CDK CLI | v2 | CDK synth/deploy for AWS-01 | Installed globally; used for regression check |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@mytaptrack/cdk` | local file | `ConfigFile` config loader | Used in `local-global-setup.js` to load test users from YAML |
| `@mytaptrack/lib` | local file | `UserDal`, `LicenseDal` | Used in `local-global-setup.js` to seed DynamoDB records |

**Installation:** No new packages needed for Phase 3.

---

## Architecture Patterns

### Pattern 1: Two-Mode Test Execution

System tests support exactly two modes, selected entirely by `USE_LOCAL`:

```
USE_LOCAL=true  → local Docker stack (DynamoDB Local, RabbitMQ, Redis, local servers on :4000/:3000/:3001)
USE_LOCAL=false → AWS deployment (AppSync, API Gateway, DynamoDB in AWS, Cognito, SSM endpoints)
```

Neither mode requires code changes — only the env var changes.

**Local mode data flow:**
1. `local-global-setup.js` (Jest globalSetup) seeds DynamoDB + Redis tokens
2. `jest.setup.ts` sets `PrimaryTable=mytaptrack-local-primary`, `DataTable=mytaptrack-local-data`
3. `config.ts` loads `.env` via dotenv, creates `Dal` pointing to `localhost:8000`
4. `cognito.ts` retrieves JWT from Redis; attaches as `Authorization` header
5. `QLApiClass` / `WebApiClass` POST to `localhost:4000` (GraphQL) or `localhost:3000` (REST)

**AWS mode data flow:**
1. `aws-test-setup.js` validates credentials via `aws sts get-caller-identity`
2. `jest.setup.ts` sets `USE_LOCAL=false`
3. `config.ts` creates `SSMClient`, fetches endpoints and `clientId` from Parameter Store
4. `cognito.ts` performs `InitiateAuth` against real Cognito user pool
5. `QLApiClass` / `WebApiClass` hit real AppSync/API Gateway endpoints

### Pattern 2: Automatic Local Environment Setup

`local-global-setup.js` runs once before all test workers via `globalSetup`. It:
1. Loads `.env` with `dotenv.config()`
2. Probes DynamoDB TCP connection (fails gracefully if not running)
3. Calls `LicenseDal.save()` with license `000000-000000-000000`
4. Calls `UserDal.saveUserPii()` and `UserDal.saveUserConfig()` for each test user
5. Mints JWTs and stores `token:{userId}`, `refresh:{userId}`, `identity:{userId}` keys in Redis
6. Probes Redis with 5-second timeout (fails gracefully if not running)

Test users come from `config.env.testing.admin` / `nonadmin` (from `dev.yml`) or fall back to hardcoded `teacher@mytaptrack.com` / `parent@mytaptrack.com`.

### Pattern 3: ConfigFile Multi-File Merge

`ConfigFile` merges three YAML files in order:
1. `{CONFIG_PATH}/{CONFIG_FILE}` — base config (defaults to `config.yml`; graphql-server overrides to `example_test.yml`)
2. `{CONFIG_PATH}/{STAGE}.yml` — stage-specific overrides (system-tests use `STAGE=dev`, so `dev.yml`)
3. `{CONFIG_PATH}/{STAGE}.{AWS_REGION}.yml` — region-specific overrides

This means `dev.yml`'s `testing:` section (with admin email/password) is merged onto top of the base config. The `example_test.yml` base config does NOT have a `testing:` section — it only provides infrastructure-level config (domain, certs, SSM paths).

### Recommended Project Structure for Phase 3

No structural changes needed. All existing test files, setup scripts, and API client classes remain unchanged. Only fixes to specific test failures and the AWS-mode config diagnosis.

### Anti-Patterns to Avoid

- **Editing test files to switch modes:** The entire phase contract is that only `USE_LOCAL` changes. Never add `if (USE_LOCAL)` inside test spec files.
- **Hardcoding AWS endpoints in test helpers:** All endpoint resolution must go through `getQLEndpoint()`, `getApiEndpoint()`, `getDeviceEndpoint()` in `config.ts`.
- **Running `make test` for AWS mode (it calls `envSetup` first):** Use `cd system-tests && npm run test:aws` directly for controlled AWS mode testing.
- **Table name drift:** `mytaptrack-local-primary` and `mytaptrack-local-data` must match across `init-tables.ts`, `docker-compose.yml`, `jest.setup.ts`, and `local-global-setup.js`. Current state: all four are aligned.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Local DynamoDB seeding | Custom migration scripts | `local-global-setup.js` Jest globalSetup | Already seeds license + users + Redis tokens atomically before test workers start |
| JWT token generation | Custom token issuer | `jsonwebtoken` in `local-global-setup.js` | Already signs tokens in same format as `auth-manager.ts` |
| GraphQL client for tests | Raw HTTP fetch | `QLApiClass` + `graphql-request` | All GraphQL operations already implemented in `api-ql.ts` |
| REST client for tests | Raw HTTP fetch | `WebApiClass` + `httpRequest` | All REST operations already implemented in `api-web.ts` |
| Endpoint discovery | Hardcoded URLs | `getQLEndpoint()`, `getApiEndpoint()` in `config.ts` | Already handles both modes; SSM in AWS, `localhost` in local |
| CDK regression check | Manual diff | `cdk synth` + CloudFormation template comparison | CDK produces deterministic templates; synth catches all breaking infrastructure changes |

---

## Common Pitfalls

### Pitfall 1: `test:aws` script shell chain does not propagate `USE_LOCAL=false`

**What goes wrong:** The npm script is:
```bash
"test:aws": "USE_LOCAL=false && node src/aws-test-setup.js && USE_LOCAL=false jest"
```
On most shells, `VAR=value command` sets the variable only for that command. The `&&` chaining means `USE_LOCAL=false` on the left of `&&` sets it as a shell variable for the current shell, but `jest` (third command) may or may not inherit it depending on shell implementation.

**Why it happens:** `VAR=value` without a command is a pure shell variable assignment. `jest` needs it as an environment variable inherited via `export` or inline prefix.

**How to avoid:** The `aws-test-setup.js` script already sets `process.env.USE_LOCAL = 'false'` within Node — but this only affects that Node process, not the subsequent `jest` invocation. The `jest.setup.ts` already guards: if `USE_LOCAL` is not set, it sets it to `'false'`. So the actual behavior depends on whether `jest.setup.ts` runs before config.ts's module-level side effects. Verify this chain actually works before declaring TST-02 done.

**Warning signs:** SSM calls fail with "SSM client not available in local mode" error, indicating `USE_LOCAL` was unexpectedly `'true'` when AWS mode was intended.

### Pitfall 2: `config.ts` has module-level side effects that run before `jest.setup.ts`

**What goes wrong:** `config.ts` creates `Dal`, runs `dotenv.config()`, and conditionally creates `SSMClient` at module import time. If any test file imports from `config.ts` before `jest.setup.ts` has set env vars, `USE_LOCAL` may be incorrect.

**Why it happens:** Jest runs `setupFilesAfterEnv` (where `jest.setup.ts` lives) AFTER module imports triggered by the test file itself. But `jest.setup.ts` does NOT import `config.ts` — it only sets env vars. So `config.ts` is safe as long as it's first imported during test execution, not during the globalSetup phase.

**How to avoid:** Never import `config.ts` directly in `local-global-setup.js` (it does not — it uses `ConfigFile` from `@mytaptrack/cdk` separately). `jest.setup.ts` sets env vars before any test module imports occur. This is currently correct.

**Warning signs:** `SSMClient` instantiation error at test startup, or `Dal` pointing to wrong DynamoDB endpoint.

### Pitfall 3: `example_test.yml` is missing `testing:` section — local fallback users differ from AWS users

**What goes wrong:** In local mode, `local-global-setup.js` seeds Redis tokens for the users returned by `config.env.testing.admin` — but if `STAGE=dev` and `dev.yml` provides `admin@advosight.com`, the seeded tokens are for that user. When `cognito.ts` calls `login()` in local mode, it reads `config.env.testing.admin.email` to look up `token:{userId}` in Redis. If the seeded userId and the queried userId differ, the token lookup fails.

**Why it happens:** `graphql-server.ts` sets `CONFIG_FILE=example_test.yml` before loading config. System-tests set `STAGE=dev` which merges `dev.yml` on top. This is consistent — both use the same merge result. But if `dev.yml` is not available (e.g., CI environment), the `testing.admin` field will be `undefined` and `local-global-setup.js` falls back to `teacher@mytaptrack.com`. As long as the fallback is consistent, tests should work.

**How to avoid:** Verify that the `STAGE` used in `local-global-setup.js` (which runs as Jest globalSetup) is the same as in `jest.setup.ts` (which runs per-worker). Both default to `STAGE ?? 'dev'`, so they are consistent.

**Warning signs:** `No token found in Redis for user admin-at-advosight-com` (hyphened encoding of the email).

### Pitfall 4: DynamoDB table name split — local API server uses `mytaptrack-primary`; tests expect `mytaptrack-local-primary`

**What goes wrong:** `.env.example` sets `PrimaryTable=mytaptrack-primary` for the local API servers. `jest.setup.ts` overrides to `mytaptrack-local-primary` for test workers. These are different tables in DynamoDB Local. Tests seed into `mytaptrack-local-primary` but the API server reads from `mytaptrack-primary`.

**Why it happens:** The design intentionally separates test data from API server data. `init-tables.ts` creates all four tables (`mytaptrack-local-*` and `mytaptrack-*`). The API server picks up `PrimaryTable=mytaptrack-primary` from `.env` while tests use the `local-` variant.

**Resolution status:** This is a known design split. It means tests that create data and then query it via the API will find empty results — the API server queries a different table than what tests write to. **This is likely the root cause of TST-01 failures.**

**How to avoid:** The graphql-server and rest-api-server containers must use the same table names as the test workers. Either: (a) change `docker-compose.yml` to pass `PrimaryTable=mytaptrack-local-primary` (it already does this for the containers), or (b) confirm that `.env` (loaded by local API servers when running outside Docker) also uses `mytaptrack-local-primary`. Check `.env` in the repo root vs `.env.example`.

**Warning signs:** `getStudents` returns empty array despite `setupStudent` having been called successfully.

### Pitfall 5: CDK synth fails due to missing environment-specific parameters

**What goes wrong:** Running `cdk synth` in `api/`, `core/`, or `data-prop/` requires `CONFIG_PATH` and `STAGE` to resolve the YAML config. If synth is run in an environment without a valid `{STAGE}.yml`, it may fail on missing required fields.

**How to avoid:** Use `--context` flags or environment variables to point CDK at the `example_test.yml`/`example.yml` configs, which provide structural templates with empty required fields. The goal for AWS-01 is to verify no CDK construct changes broke handler contracts — a dry-run synth suffices.

---

## Code Examples

### Local mode test execution (verified working when Docker is running)

```bash
# Step 1: Start only the data services (not the API servers — tests talk directly to localhost ports)
cd /path/to/back-end
make container-services   # starts DynamoDB Local, RabbitMQ, Redis

# Step 2: Start API servers (in separate terminals or as background processes)
make graphql-watch        # starts graphql-server.ts on :4000
make rest-start           # starts rest-api-server.ts on :3000

# Step 3: Run system tests
cd system-tests
npm run test:local        # USE_LOCAL=true jest
```

### Verify table name alignment (key investigation command)

```bash
# Check .env to see what PrimaryTable the local API server will use
grep PrimaryTable /Users/nikody/src/mytaptrack/back-end/.env 2>/dev/null

# Check what table the tests expect to read from
grep -n "mytaptrack-local-primary\|PrimaryTable" \
  /Users/nikody/src/mytaptrack/back-end/system-tests/src/jest.setup.ts
```

### CDK synth smoke test (AWS-01 verification)

```bash
# Verify api/ stack synthesizes cleanly (no Lambda handler contract changes)
cd /Users/nikody/src/mytaptrack/back-end/api
STAGE=dev CONFIG_PATH=../config npx cdk synth --quiet 2>&1 | tail -5

# Same for core and data-prop
cd /Users/nikody/src/mytaptrack/back-end/core
STAGE=dev CONFIG_PATH=../config npx cdk synth --quiet 2>&1 | tail -5

cd /Users/nikody/src/mytaptrack/back-end/data-prop
STAGE=dev CONFIG_PATH=../config npx cdk synth --quiet 2>&1 | tail -5
```

### AWS mode test execution

```bash
# Requires: AWS SSO logged in, STAGE set to environment with SSM parameters
cd /Users/nikody/src/mytaptrack/back-end/system-tests
STAGE=dev npm run test:aws
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `npm run envSetup` before local tests | Automatic `local-global-setup.js` Jest globalSetup | Phase 1 | `test:local` works without separate setup step |
| Single `test` script | `test:local` and `test:aws` npm scripts | Phase 1 | Mode selection is explicit |
| Server startup via `server.ts` shim | Direct `graphql-server.ts` | Phase 2 (02-02) | One fewer indirection layer, fewer startup errors |
| No subscription stubs | Null-returning stubs for NoneDataSource fields | Phase 2 (02-03) | `onUserLicenseChange`, `onStudentDataChange`, `studentDataChange` return null instead of unhandled error |

---

## Open Questions

1. **What is the `.env` file's current `PrimaryTable` value?**
   - What we know: `.env.example` sets `PrimaryTable=mytaptrack-primary`; tests expect `mytaptrack-local-primary`; docker-compose uses `mytaptrack-local-primary` for containers
   - What's unclear: The actual `.env` file (gitignored) may have been updated to `mytaptrack-local-primary` or may still say `mytaptrack-primary`. If the API server running outside Docker uses `.env`, this split could be the root cause of TST-01 failures.
   - Recommendation: First task of Phase 3 must read `.env` and compare to `jest.setup.ts`. If they differ, align them to `mytaptrack-local-primary`.

2. **Why are AWS tests (TST-02) failing?**
   - What we know: User says "config doesn't understand local vs AWS configuration"; `aws-test-setup.js` sets `USE_LOCAL=false` in its own Node process; `test:aws` script uses shell `&&` chain
   - What's unclear: Whether the `USE_LOCAL=false` actually reaches the Jest workers, and whether SSM parameters exist for the target `STAGE` environment
   - Recommendation: Add a debug print at the top of `jest.setup.ts` to log `process.env.USE_LOCAL` when tests start. Then run `test:aws` and observe the output.

3. **Do all GraphQL resolvers that the tests exercise actually have handler implementations loaded?**
   - What we know: Phase 2 loaded all resolvers dynamically via `AppSyncStack.addResolversToAppSync`; NoneDataSource stubs added; Phase 2 human verification confirmed docker compose up starts cleanly
   - What's unclear: Whether any resolver handler files throw on startup (missing env vars, import errors) that get swallowed by the catch-all in the local server
   - Recommendation: On first local test run, check graphql-server logs for any resolver loading errors before investigating test failures.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with ts-jest preset |
| Config file | `system-tests/package.json` `"jest"` key |
| Quick run command | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="devices/apps.graphql"` |
| Full local suite | `cd system-tests && USE_LOCAL=true npm run test:local` |
| Full AWS suite | `cd system-tests && STAGE=dev npm run test:aws` |
| CDK synth check | `cd api && STAGE=dev CONFIG_PATH=../config npx cdk synth --quiet` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TST-01 | GraphQL queries return valid results from local server | Integration | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="devices/apps.graphql"` | YES: `tests/devices/apps.graphql.spec.ts` |
| TST-01 | GraphQL mutations (updateStudent, updateApp) work against local server | Integration | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="website-v2/apps"` | YES: `tests/website-v2/apps.spec.ts` |
| TST-01 | Student CRUD operations pass against local stack | Integration | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="website-v2/student"` | YES: `tests/website-v2/student.spec.ts` |
| TST-01 | Full local suite green | Integration | `cd system-tests && USE_LOCAL=true npm run test:local` | YES: all spec files |
| TST-02 | Full AWS suite green (requires AWS credentials + SSM params) | Integration | `cd system-tests && STAGE=dev npm run test:aws` | YES: all spec files (same as local) |
| TST-03 | `USE_LOCAL=true` runs local mode with no code changes | Smoke | Run `test:local`, then `test:aws` without touching any .ts file | Manual verification |
| TST-03 | `USE_LOCAL` env-var-only switching works (unit verification) | Unit | `cd system-tests && USE_LOCAL=true npx jest --testPathPattern="config.spec"` | YES: `tests/config.spec.ts` |
| AWS-01 | api/ CDK stack synthesizes cleanly | CDK synth | `cd api && STAGE=dev CONFIG_PATH=../config npx cdk synth --quiet 2>&1; echo "exit: $?"` | YES: CDK infrastructure exists |
| AWS-01 | core/ CDK stack synthesizes cleanly | CDK synth | `cd core && STAGE=dev CONFIG_PATH=../config npx cdk synth --quiet 2>&1; echo "exit: $?"` | YES: CDK infrastructure exists |
| AWS-01 | data-prop/ CDK stack synthesizes cleanly | CDK synth | `cd data-prop && STAGE=dev CONFIG_PATH=../config npx cdk synth --quiet 2>&1; echo "exit: $?"` | YES: CDK infrastructure exists |
| AWS-01 | Lambda handler export count unchanged (164 baseline from Phase 1) | Static/grep | `grep -r "export.*handleEvent\|export.*handler" api/src --include="*.ts" \| wc -l` | Manual audit |

### Sampling Rate

- **Per task commit:** `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="devices/apps.graphql" 2>&1 | tail -10`
- **Per wave merge:** `cd system-tests && USE_LOCAL=true npm run test:local 2>&1 | tail -20`
- **Phase gate:** Full local suite green AND full AWS suite green AND all three CDK stacks synth clean

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements. The task is to diagnose and fix failures in the existing suite, not to write new test files.

However, the following investigation steps are needed before any fixes:

- [ ] Read `.env` to determine actual `PrimaryTable` value used by local API servers
- [ ] Run `USE_LOCAL=true npm run test:local` with Docker stack up to capture the first failure output
- [ ] Add debug print to `jest.setup.ts` to confirm `USE_LOCAL` value at test worker startup (for TST-02 diagnosis)
- [ ] Run `cdk synth` on all three stacks to confirm AWS-01 baseline

---

## Sources

### Primary (HIGH confidence)

- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/local-global-setup.js` — DynamoDB + Redis seeding logic, table names, token format
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/config.ts` — endpoint resolution, ConfigFile loading, SSM gating
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/jest.setup.ts` — env var setup, table name overrides, USE_LOCAL branching
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/aws-test-setup.js` — AWS credential verification, USE_LOCAL=false setting
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/lib/cognito.ts` — local Redis token retrieval vs Cognito auth
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/lib/httpClient.ts` — protocol/port selection based on USE_LOCAL
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/lib/api-ql.ts` — QLApiClass with all GraphQL operations
- `/Users/nikody/src/mytaptrack/back-end/system-tests/package.json` — jest config, test scripts
- `/Users/nikody/src/mytaptrack/back-end/api/src/container/init-tables.ts` — DynamoDB table schemas including both `mytaptrack-local-*` and `mytaptrack-*` variants
- `/Users/nikody/src/mytaptrack/back-end/docker-compose.yml` — container table name assignments (all use `mytaptrack-local-*`)
- `/Users/nikody/src/mytaptrack/back-end/.env.example` — canonical local env vars (uses `mytaptrack-primary`, NOT `mytaptrack-local-primary`)
- `/Users/nikody/src/mytaptrack/back-end/cdk/src/config-file.ts` — ConfigFile merge logic
- `/Users/nikody/src/mytaptrack/back-end/config/dev.yml` — confirmed `testing.admin` credentials exist here
- `/Users/nikody/src/mytaptrack/back-end/config/example_test.yml` — confirmed NO `testing.admin` credentials

### Secondary (MEDIUM confidence)

- `/Users/nikody/src/mytaptrack/back-end/.planning/phases/02-local-stack-completeness/02-02-SUMMARY.md` — Phase 2 changes to resolver-wrapper.ts and container:start
- `/Users/nikody/src/mytaptrack/back-end/.planning/phases/02-local-stack-completeness/02-03-SUMMARY.md` — NoneDataSource stubs added, dead code removed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from source files and package.json
- Architecture: HIGH — all patterns read directly from production source files
- Pitfalls: HIGH — most derived from observed implementation patterns and confirmed mismatches between .env.example and jest.setup.ts
- Open questions: MEDIUM — root causes are hypothesized from code paths; confirmation requires running tests and observing output

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable implementation; test infrastructure changes are the active work)
