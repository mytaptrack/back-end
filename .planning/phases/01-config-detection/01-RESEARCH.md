# Phase 1: Config Detection - Research

**Researched:** 2026-03-23
**Domain:** Environment-variable-driven service client routing (DynamoDB, EventBridge/RabbitMQ, Redis, Cognito) and system-test config selection
**Confidence:** HIGH — all findings verified directly from source files in this repository

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CFG-01 | System detects local vs AWS mode via `USE_LOCAL` env var and routes all service clients (DynamoDB, EventBridge, etc.) accordingly | Existing partial implementation found in `lib/src/v2/dals/dal.ts`, `event-dal.ts`, `user-dal.ts`, `web-utils.ts`; gaps identified below |
| CFG-02 | System tests correctly target local Docker stack when `USE_LOCAL=true` | `system-tests/src/config.ts` and `cognito.ts` already branch on `USE_LOCAL`; `local-global-setup.js` wires DynamoDB + Redis |
| CFG-03 | System tests correctly target AWS resources when `USE_LOCAL` is unset/false | `system-tests/src/config.ts` loads SSM parameters; `aws-test-setup.js` clears local creds; wiring verified |
| AWS-02 | Lambda handlers unchanged — no modifications to resolver/handler signatures | Research confirms all USE_LOCAL guards are in the lib/container layer, never in resolver exports |
</phase_requirements>

---

## Summary

Phase 1 is largely a gap-analysis and hardening task, not a greenfield build. Substantial `USE_LOCAL` routing already exists throughout the codebase: `Dal` reads `DYNAMODB_ENDPOINT` to switch the DynamoDB client endpoint, `EventDal` branches on `USE_LOCAL` to publish to RabbitMQ instead of EventBridge, `UserDal` skips Cognito calls when `USE_LOCAL=true`, and `WebUtils.lambdaWrapper` skips Lumigo tracing locally. The system-test layer has matching branches in `config.ts`, `cognito.ts`, and `httpClient.ts`, plus a `local-global-setup.js` that seeds DynamoDB and Redis before tests run.

What this phase must deliver is: (1) audit every service client instantiation in `lib/` and `api/container/` to confirm the `USE_LOCAL` gate is present and consistent — particularly for any Redis direct-connect paths that bypass the container setup — and (2) ensure the system-test configuration (`jest.setup.ts`, `local-global-setup.js`, `config.ts`) correctly branches without requiring code edits between runs. Lambda handler exports (`handleEvent`, resolver functions) must remain completely untouched throughout.

The critical constraint is that all routing logic lives in the infrastructure/DAL layer, never in the handler layer. The existing codebase already respects this, so the primary risk is incomplete coverage — a service client instantiated outside the known guarded files.

**Primary recommendation:** Audit all service client construction sites (`new DynamoDBClient`, `new EventBridgeClient`, `new Redis/ioredis`) across the entire monorepo, then apply the established `USE_LOCAL` guard pattern to any unguarded sites. Write a smoke-test script (no AWS, no Docker needed) that asserts the correct endpoint/client is selected for each value of `USE_LOCAL`.

---

## User Constraints

No CONTEXT.md exists for this phase. The following constraints are derived from locked decisions recorded in STATE.md and REQUIREMENTS.md.

### Locked Decisions
- Detection mechanism: `USE_LOCAL` environment variable (string `"true"` vs absent/`"false"`)
- Local EventBridge replacement: RabbitMQ via AMQP (`amqplib`)
- Translation layer approach: routing in lib/container layer; Lambda handler signatures never change
- DynamoDB local endpoint: `http://localhost:8000` (DynamoDB Local in Docker)

### Claude's Discretion
- Exact implementation of the audit scan (manual vs scripted)
- Whether to consolidate `USE_LOCAL` checks into a single config helper module
- Test script structure and tooling

### Deferred Ideas (OUT OF SCOPE)
- Full `docker compose up` orchestration (Phase 2)
- GraphQL local server completeness (Phase 2)
- Full system test suite pass (Phase 3)
- SES/SNS local equivalents (v2)

---

## Standard Stack

### Core (already in use — do not add new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@aws-sdk/client-dynamodb` | 3.391.0+ | DynamoDB client | Already used; `endpoint` param enables local routing |
| `@aws-sdk/lib-dynamodb` | 3.391.0+ | DynamoDB DocumentClient | Wraps low-level client; same endpoint passthrough |
| `@aws-sdk/client-eventbridge` | 3.391.0+ | AWS EventBridge client | Used in `event-dal.ts`; bypassed locally |
| `amqplib` | 0.10.3 | AMQP/RabbitMQ client | Local EventBridge substitute; already integrated |
| `ioredis` | 5.8.2 | Redis client | Local auth token store; already wired in `cognito.ts` and `local-global-setup.js` |
| `dotenv` | 17.2.3 | `.env` loading | `local-env-setup.ts` and `config.ts` use this for local startup |
| `jest` | 29.5.0+ | Test runner | Existing; `test:local` and `test:aws` npm scripts already defined |
| `ts-jest` | 29.1.0+ | TypeScript Jest support | Existing preset in `system-tests/package.json` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jsonwebtoken` | 9.0.3 | JWT signing | `local-global-setup.js` signs tokens for local Redis; do not change format |
| `@aws-sdk/client-ssm` | 3.391.0+ | SSM Parameter Store | AWS mode only — `config.ts` gates creation on `USE_LOCAL !== 'true'` |
| `@aws-sdk/client-cognito-identity-provider` | 3.391.0+ | Cognito auth | AWS mode only — `user-dal.ts` gates on `USE_LOCAL` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| RabbitMQ for EventBridge | LocalStack EventBridge | Decided against; RabbitMQ already integrated and simpler |
| Per-file USE_LOCAL checks | Centralized config module | A shared helper would reduce duplication but is a refactor; current pattern works and is consistent |

**Installation:** No new packages needed for Phase 1.

---

## Architecture Patterns

### Existing Pattern: Inline USE_LOCAL Guard at Client Construction

All current USE_LOCAL routing follows this pattern — check at the point of client construction or first call, not in handler code.

**DynamoDB — in `lib/src/v2/dals/dal.ts` constructor:**
```typescript
const clientConfig: any = {};
if (process.env.DYNAMODB_ENDPOINT) {
    clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
    clientConfig.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
}
this.dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig), ...);
```
Note: `Dal` uses `DYNAMODB_ENDPOINT` presence, not `USE_LOCAL` directly. This is intentional — setting `DYNAMODB_ENDPOINT=http://localhost:8000` implies local mode without requiring `USE_LOCAL`.

**EventBridge — in `lib/src/v2/dals/event-dal.ts`:**
```typescript
const eventbus = new EventBridgeClient({});  // top-level, always created

async sendEvents(...) {
    if (process.env.USE_LOCAL === 'true' || process.env.NODE_ENV === 'development') {
        // publish to RabbitMQ
        return;
    }
    await eventbus.send(new PutEventsCommand(...));
}
```
Note: The `EventBridgeClient` is instantiated at module load time regardless of mode. This is harmless — the client is just a configuration object until `.send()` is called.

**Cognito — in `lib/src/v2/dals/user-dal.ts`:**
```typescript
public cognito = process.env.USE_LOCAL == 'true' ? null : new CognitoIdentityProviderClient({});
```

**Lumigo Tracer — in `lib/src/utils/web-utils.ts`:**
```typescript
lambdaWrapper(func) {
    if (!process.env.LUMIGO_TOKEN || process.env.USE_LOCAL === 'true' || process.env.NODE_ENV === 'development') {
        return func;
    }
    return tracer.trace(func);
}
```

### System-Test Config Pattern

**File:** `system-tests/src/config.ts`

```typescript
if (process.env.USE_LOCAL === 'true') {
    dotenv.config({ path: '.env', override: true });  // local env
    process.env.DataTable = 'mytaptrack-local-data';
    process.env.PrimaryTable = 'mytaptrack-local-primary';
} else {
    process.env.DataTable = `mytaptrack-${environment}-data`;
    process.env.PrimaryTable = `mytaptrack-${environment}-primary`;
}
// SSM client created only when USE_LOCAL !== 'true'
let ssm = process.env.USE_LOCAL !== 'true' ? new SSMClient({ maxAttempts: 3 }) : null;
```

Endpoint resolution functions (`getQLEndpoint`, `getApiEndpoint`, `getDeviceEndpoint`, `getClientId`) all return hardcoded local values when `USE_LOCAL === 'true'`, or query SSM when AWS mode.

### Anti-Patterns to Avoid

- **Modifying handler exports:** Never add `USE_LOCAL` checks inside `handleEvent` functions or GraphQL resolver exports. All routing belongs in the DAL/container layer.
- **Checking `USE_LOCAL` after AWS SDK call:** Always gate before constructing clients or sending commands, not in catch blocks.
- **Using `NODE_ENV === 'development'` without `USE_LOCAL`:** `event-dal.ts` has this dual check; be consistent — new code should use `USE_LOCAL === 'true'` only, since `NODE_ENV` is not the canonical flag.
- **Hardcoding local endpoints in tests:** Tests must read from `process.env` (e.g., `DYNAMODB_ENDPOINT`, `REDIS_HOST`) so the Docker network can be reconfigured without code changes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DynamoDB local endpoint | Custom proxy or mock | `DynamoDBClient({ endpoint })` | AWS SDK v3 has native endpoint override |
| Local auth tokens | Custom JWT implementation | `jsonwebtoken` (already in use) | Already signed and stored in Redis by `local-global-setup.js` |
| Test data seeding | New migration scripts | `local-global-setup.js` Jest globalSetup | Already seeds license + users + Redis tokens before test run |
| USE_LOCAL env loading | Manual env parsing | `dotenv` (already in use) | Loaded by `local-env-setup.ts` and `config.ts`; consistent across contexts |

---

## Common Pitfalls

### Pitfall 1: USE_LOCAL not set when system-tests start in AWS mode
**What goes wrong:** `config.ts` checks `USE_LOCAL === 'true'`; if the variable is absent (not `'false'`), the SSM code path runs. The `aws-test-setup.js` sets `USE_LOCAL = 'false'` explicitly, but the `test:aws` npm script uses `&&` which may not propagate env vars across shells on all platforms.
**Why it happens:** Shell variable assignment (`USE_LOCAL=false && jest`) only applies to the current shell; child processes may not inherit it reliably if the parent shell is different.
**How to avoid:** Set `USE_LOCAL` in the jest `globalSetup` or `setupFilesAfterFramework` file, not in the npm script. `jest.setup.ts` already sets env vars for local mode — AWS mode should set `USE_LOCAL=false` there too.
**Warning signs:** SSM `GetParameterCommand` calls fail with credential errors when developer expects local mode.

### Pitfall 2: Dal constructed before DYNAMODB_ENDPOINT is set
**What goes wrong:** `Dal` reads `process.env.DYNAMODB_ENDPOINT` in its constructor. If `Dal` is imported (and thus constructed at module load) before `dotenv.config()` runs, it picks up an empty endpoint and connects to AWS.
**Why it happens:** CommonJS `require()` order is not always deterministic across deeply nested imports; `config.ts` calls `dotenv.config()` at the top, but only if it is the first import in the test file.
**How to avoid:** Ensure `local-global-setup.js` (which runs before any worker imports) sets all env vars before any `require('@mytaptrack/lib')` call — the file already does this correctly. Never construct a `Dal` at module load time in test helpers.
**Warning signs:** `Dal` logs "Using dynamodb table name: undefined" on startup.

### Pitfall 3: EventBridgeClient instantiated but USE_LOCAL check inside sendEvents
**What goes wrong:** `event-dal.ts` constructs `new EventBridgeClient({})` at module top-level. In local mode this is harmless because `.send()` is never called, but the constructor may attempt credential resolution at cold-start if `AWS_ACCESS_KEY_ID` is not set to dummy values, causing noisy errors.
**Why it happens:** AWS SDK v3 resolves credentials lazily in most cases but the credential provider chain can throw on malformed environment.
**How to avoid:** Ensure `.env` always sets `AWS_ACCESS_KEY_ID=local` and `AWS_SECRET_ACCESS_KEY=local` when `USE_LOCAL=true`. `local-global-setup.js` and `jest.setup.ts` both do this.
**Warning signs:** `CredentialsProviderError` in test output even with `USE_LOCAL=true`.

### Pitfall 4: Redis client not available when system-tests start
**What goes wrong:** `cognito.ts` uses `ioredis` to retrieve tokens; if Redis is not running, login() throws and all tests fail immediately.
**Why it happens:** `local-global-setup.js` has a 5-second timeout on Redis connect and gracefully degrades with a warning. Tests that call `login()` will then fail with a missing-token error, not a connection error.
**How to avoid:** The `local-global-setup.js` already handles this gracefully. Document the requirement that Redis must be running before `npm run test:local`. This is a Phase 2 (docker compose) concern, but Phase 1 must not make it worse.
**Warning signs:** `No token found in Redis for user X. Run 'npm run envSetup' first.`

### Pitfall 5: Table name mismatch between local-global-setup and Dal
**What goes wrong:** `jest.setup.ts` sets `PrimaryTable=mytaptrack-local-primary` but `local-global-setup.js` also sets `PrimaryTable=mytaptrack-local-primary`. If these ever diverge, seeded data is in one table but tests read from another.
**Why it happens:** Two files own the same env var.
**How to avoid:** Single source of truth — define table names in `.env.example` or a shared constant; both files read from the env var rather than hardcoding.
**Warning signs:** Tests return empty results despite successful setup; DynamoDB contains data but queries return nothing.

---

## Code Examples

### Verified: Dal constructor endpoint routing
```typescript
// Source: lib/src/v2/dals/dal.ts (lines 23-33)
const clientConfig: any = {};
if (process.env.DYNAMODB_ENDPOINT) {
    clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
    clientConfig.credentials = {
        accessKeyId: 'local',
        secretAccessKey: 'local'
    };
}
this.dynamodb = DynamoDBDocumentClient.from(
    new DynamoDBClient(clientConfig),
    { marshallOptions: { removeUndefinedValues: true } }
);
```

### Verified: EventBridge to RabbitMQ routing
```typescript
// Source: lib/src/v2/dals/event-dal.ts (lines 9-48)
if (process.env.USE_LOCAL === 'true' || process.env.NODE_ENV === 'development') {
    const amqp = require('amqplib');
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    // ... publish to queue/exchange
    return;
}
await eventbus.send(new PutEventsCommand({ Entries: [...] }));
```

### Verified: System-test endpoint selection
```typescript
// Source: system-tests/src/config.ts (lines 7-12, 29-34, 45-48, 85-87, 103-106, 122-125)
if (process.env.USE_LOCAL === 'true') {
    dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });
} else {
    process.env.DataTable = `mytaptrack-${environment}-data`;
    process.env.PrimaryTable = `mytaptrack-${environment}-primary`;
}
// SSM client created only when USE_LOCAL !== 'true'
let ssm: SSMClient = null;
if (process.env.USE_LOCAL !== 'true') {
    ssm = new SSMClient({ maxAttempts: 3 });
}
// Endpoint getters return hardcoded local values or query SSM
export async function getQLEndpoint() {
    if (process.env.USE_LOCAL === 'true') {
        return 'http://localhost:4000/graphql';
    }
    // ... SSM lookup
}
```

### Verified: HTTP client protocol selection
```typescript
// Source: system-tests/src/lib/httpClient.ts (lines 6, 65-68)
const isLocal = process.env.USE_LOCAL === 'true';
const protocol = isLocal ? 'http' : 'https';
const port = isLocal ? (path.startsWith('/api/v2') ... ? 3000 : 3001) : 443;
const client = isLocal ? http : https;
```

### Verified: .env.example — required local env vars
```bash
# Source: back-end/.env.example
USE_LOCAL=true
DYNAMODB_ENDPOINT=http://localhost:8000
RABBITMQ_URL=amqp://mytaptrack:mytaptrack@localhost:5672
REDIS_HOST=localhost
REDIS_PORT=6379
PrimaryTable=mytaptrack-primary
DataTable=mytaptrack-data
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local
AWS_REGION=us-east-1
JWT_SECRET=local-dev-secret-change-in-production
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual envSetup script (`test-env-setup.ts`) | Automatic `local-global-setup.js` Jest globalSetup | Recent (present on feature/localhost) | `npm run test:local` works without a separate setup step |
| Single `test` script | `test:local` and `test:aws` npm scripts | Recent | Mode selection is now explicit in npm scripts |

**Still present / watch for:**
- `test-env-setup.ts` (`npm run envSetup`) still exists; it is a manual alternative to `local-global-setup.js`. They overlap. Phase 1 does not need to remove it, but should not call it in the automated flow.
- `NODE_ENV === 'development'` check exists alongside `USE_LOCAL === 'true'` in `event-dal.ts` and `user-dal.ts`. This is a legacy dual-check. New code should use only `USE_LOCAL`.

---

## Open Questions

1. **Are there service client instantiation sites outside the known files?**
   - What we know: `dal.ts`, `event-dal.ts`, `user-dal.ts`, `appsync-client.ts`, `web-utils.ts` are confirmed guarded.
   - What's unclear: Other files in `api/src/`, `data-prop/src/`, and `lib/src/` may construct AWS clients directly without going through the DAL. A grep audit is needed.
   - Recommendation: As a Wave 0 task, run `grep -r "new.*Client({" --include="*.ts"` across the monorepo and verify each hit is either guarded or unreachable in local mode.

2. **Table name consistency: `mytaptrack-primary` (.env) vs `mytaptrack-local-primary` (jest.setup.ts)**
   - What we know: `.env.example` sets `PrimaryTable=mytaptrack-primary`; `jest.setup.ts` overrides to `mytaptrack-local-primary` when `USE_LOCAL=true`.
   - What's unclear: `local-env-setup.ts` (container startup) uses the `.env` value; system tests use the hardcoded `mytaptrack-local-primary`. If `initTables` in the container creates `mytaptrack-primary` but tests look for `mytaptrack-local-primary`, they target different tables.
   - Recommendation: Resolve to a single consistent table name across `.env`, `jest.setup.ts`, and `local-global-setup.js`.

3. **`USE_LOCAL` string comparison: `=== 'true'` vs `== 'true'` vs presence check**
   - What we know: Most files use `=== 'true'`; `user-dal.ts` line 34 uses `== 'true'` (loose equality). All are equivalent for string env vars.
   - Recommendation: Standardize on `process.env.USE_LOCAL === 'true'` throughout for consistency.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with ts-jest preset |
| Config file | `system-tests/package.json` `"jest"` key |
| Quick run command | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="devices/apps.graphql"` |
| Full suite command | `cd system-tests && USE_LOCAL=true npm run test:local` |
| AWS suite command | `cd system-tests && npm run test:aws` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CFG-01 | DynamoDB client targets `http://localhost:8000` when `USE_LOCAL=true` | Unit (smoke) | `node -e "process.env.USE_LOCAL='true'; process.env.DYNAMODB_ENDPOINT='http://localhost:8000'; const {Dal}=require('./lib/dist'); console.log('ok')"` | Wave 0 gap |
| CFG-01 | EventBridge bypassed; RabbitMQ used when `USE_LOCAL=true` | Unit | Jest unit test asserting `amqp.connect` called, not `EventBridgeClient.send` | Wave 0 gap |
| CFG-01 | Cognito client is null when `USE_LOCAL=true` | Unit | Jest unit test on `UserDal.cognito` | Wave 0 gap |
| CFG-02 | `getQLEndpoint()` returns `http://localhost:4000/graphql` when `USE_LOCAL=true` | Unit | Jest test in `system-tests/src/config.spec.ts` | Wave 0 gap |
| CFG-02 | `httpClient` uses `http` and port 3000 when `USE_LOCAL=true` | Unit | Jest test on `httpRequest` | Wave 0 gap |
| CFG-02 | `local-global-setup.js` seeds DynamoDB + Redis without error | Integration (manual) | Run `USE_LOCAL=true npm run test:local` with Docker stack running | Exists (script) |
| CFG-03 | `getQLEndpoint()` queries SSM when `USE_LOCAL` unset/false | Unit (mock SSM) | Jest test with SSM mock | Wave 0 gap |
| CFG-03 | SSM client not created when `USE_LOCAL=true` | Unit | Jest test asserting `ssm === null` | Wave 0 gap |
| AWS-02 | No handler export signatures changed | Static / grep | `grep -r "export.*handleEvent\|export.*handler" api/src --include="*.ts"` — no diff from baseline | Manual audit |

### Sampling Rate

- **Per task commit:** `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="devices/apps.graphql" 2>&1 | tail -5` (single spec, no Docker needed for unit-level checks)
- **Per wave merge:** `cd system-tests && USE_LOCAL=true npm run test:local` (full local suite, requires Docker stack)
- **Phase gate:** All unit/config tests pass without Docker; smoke integration test passes with Docker stack running

### Wave 0 Gaps

- [ ] `system-tests/src/config.spec.ts` — unit tests for `getQLEndpoint`, `getApiEndpoint`, `getDeviceEndpoint`, `getClientId` in both `USE_LOCAL=true` and `USE_LOCAL=false` modes (SSM mocked)
- [ ] `lib/src/v2/dals/event-dal.spec.ts` — unit test asserting RabbitMQ path used when `USE_LOCAL=true`, EventBridge path used otherwise (amqplib and AWS SDK mocked)
- [ ] `lib/src/v2/dals/dal.spec.ts` — unit test asserting DynamoDB client gets correct endpoint config based on `DYNAMODB_ENDPOINT` env var
- [ ] Grep audit script: `grep -rn "new.*Client({" --include="*.ts" lib/src api/src data-prop/src` — review output for unguarded sites before writing any implementation

---

## Sources

### Primary (HIGH confidence)
- `/Users/nikody/src/mytaptrack/back-end/lib/src/v2/dals/dal.ts` — DynamoDB endpoint routing implementation
- `/Users/nikody/src/mytaptrack/back-end/lib/src/v2/dals/event-dal.ts` — EventBridge / RabbitMQ routing implementation
- `/Users/nikody/src/mytaptrack/back-end/lib/src/v2/dals/user-dal.ts` — Cognito bypass for local mode
- `/Users/nikody/src/mytaptrack/back-end/lib/src/utils/web-utils.ts` — Lumigo tracer bypass
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/config.ts` — system-test endpoint selection
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/lib/cognito.ts` — local Redis token retrieval
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/lib/httpClient.ts` — HTTP/HTTPS protocol selection
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/local-global-setup.js` — Jest globalSetup for local seeding
- `/Users/nikody/src/mytaptrack/back-end/system-tests/src/jest.setup.ts` — per-worker env var setup
- `/Users/nikody/src/mytaptrack/back-end/.env.example` — canonical local env var set
- `/Users/nikody/src/mytaptrack/back-end/api/src/container/local-env-setup.ts` — container startup env setup

### Secondary (MEDIUM confidence)
- `/Users/nikody/src/mytaptrack/back-end/.planning/STATE.md` — project decisions (USE_LOCAL flag, RabbitMQ choice)
- `/Users/nikody/src/mytaptrack/back-end/.planning/codebase/CONCERNS.md` — known broken commits on feature/localhost branch

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in package.json and source imports
- Architecture: HIGH — routing patterns read directly from source files
- Pitfalls: HIGH — most derived from observed implementation patterns and known concerns
- Validation: MEDIUM — test commands assume current directory structure; verify paths before running

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable implementation; no fast-moving dependencies)
