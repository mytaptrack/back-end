# Phase 2: Local Stack Completeness - Research

**Researched:** 2026-03-23
**Domain:** Local GraphQL server completeness, Docker Compose orchestration, AppSync-to-Lambda context translation, subscription handling
**Confidence:** HIGH — all findings verified directly from source files in this repository

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CFG-04 | `docker compose up` starts all required services and APIs cleanly with no manual steps | docker-compose.yml exists with all services defined; entrypoint.sh handles readiness; gaps identified in graphql-api service startup |
| GQL-01 | All GraphQL query operations handled by local server | graphql-server.ts exists with resolver loading via AppSyncStack.addResolversToAppSync mock; resolver map builds correctly; must verify all query fieldNames load without error |
| GQL-02 | All GraphQL mutation operations handled by local server | Same mechanism as GQL-01; mutations are all registered via addLambdaResolver; same loading path |
| GQL-03 | GraphQL subscriptions handled or gracefully skipped in local mode | Three subscription types identified: Lambda-backed (onStudentNote), NoneDataSource with JS resolvers (onUserLicenseChange, onStudentDataChange), and inline mutation (studentDataChange); local server has no subscription protocol; must return null or structured skip response |
| GQL-04 | Local GraphQL server correctly translates AppSync-style context to Lambda invocation format | resolver-wrapper.ts exists and constructs AppSync context; identity field shape mismatch vs MttAppSyncContext identified; graphQLWrapper reads context.identity.groups, context.identity.username — must confirm wrapResolver passes these fields correctly |
</phase_requirements>

---

## Summary

Phase 2 is largely a gap-closing and wiring task for an already-substantial local server implementation. The infrastructure pieces are all present: `docker-compose.yml` defines five services (DynamoDB Local, RabbitMQ, Redis, graphql-api, device-api, rest-api), `api/Dockerfile` and `entrypoint.sh` handle container startup with readiness probes, and `graphql-server.ts` dynamically discovers all resolver mappings by running `AppSyncStack.addResolversToAppSync` with mock CDK objects. However, several concrete gaps prevent the success criteria from being met today.

The biggest gap is **CFG-04**: the `docker-compose.yml` `graphql-api` service references `CMD ["sh", "src/container/entrypoint.sh"]` which calls `npm run container:start`, but that npm script invokes `src/container/server.ts` — a file that does not exist. The actual GraphQL server is `src/container/graphql-server.ts` and the REST server is `src/container/rest-api-server.ts`. The `rest-api` service in docker-compose specifies `command: npm run rest:start` (which is correct), but the `graphql-api` service uses the Dockerfile CMD which points to the missing `server.ts`. Additionally, the `graphql-api` service exposes port 4000 only, but both GraphQL (4000) and the actual entrypoint script need to match.

The second major gap is **GQL-04 context fidelity**: `resolver-wrapper.ts` builds an AppSync context and passes it directly to each Lambda handler. However, `WebUtils.graphQLWrapper()` — which wraps every resolver's handler — reads `context.identity.groups`, `context.identity.username`, and `context.identity.claims`. The current `resolver-wrapper.ts` sets `identity: context.identity || null`, where `context.identity` comes from `AuthManager.getIdentity()`, which returns a `CognitoIdentity` object with fields `groups`, `username`, `sub`, and `'cognito:groups'`. The mapping is close but `username` is set correctly; `claims` is not populated at all. The `graphQLWrapper` code reads `context.identity.groups?.filter(x => x.startsWith('licenses/'))` for license extraction — this will work correctly because `groups` is populated. This is a medium-severity gap, not a blocker.

The third gap is **GQL-03 subscriptions**: `graphql-server.ts` uses `express-graphql` which does not support WebSocket subscriptions. There are three subscription fields: `onStudentNote` (Lambda-backed), `onUserLicenseChange` and `onStudentDataChange` (NoneDataSource with JS resolvers). In local mode, subscription attempts via HTTP will receive a GraphQL error. The requirement is "graceful skip, not unhandled error" — the current server does not explicitly handle this, so a subscription query sent over HTTP will either return null (if the resolver runs) or error out. The resolution is to register stub resolvers for subscription fields that return null with a structured message.

**Primary recommendation:** Fix the Dockerfile/entrypoint to invoke `graphql-server.ts` correctly, audit the `wrapResolver` identity shape to ensure `claims` is populated for graphQLWrapper compatibility, and add null-returning stub resolvers for the three subscription fields.

---

## Standard Stack

### Core (already in use — do not add new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `express` | 5.1.0 | HTTP server for local GraphQL and REST | Already used in graphql-server.ts and rest-api-server.ts |
| `express-graphql` | 0.12.0 | GraphQL over HTTP for local server | Already used in graphql-server.ts |
| `graphql` | 14.7.0 | Schema building and execution | Already used; `buildSchema` and `graphqlHTTP` |
| `@aws-appsync/utils` | 1.5.0 | `Context` type used in resolver-wrapper.ts | Already imported |
| `ioredis` | 5.8.2 | Token/identity storage in auth-manager.ts | Already used with in-memory fallback |
| `jsonwebtoken` | 9.0.3 | JWT sign/verify in auth-manager.ts | Already used |
| `amqplib` | 0.10.3 | RabbitMQ connection in local-env-setup.ts | Already used |
| `@aws-sdk/client-dynamodb` | 3.391.0+ | DynamoDB Local connection | Already used in local-env-setup.ts and init-tables.ts |
| `ts-node` | 10.9.1 | TypeScript execution for container scripts | Used in all npm scripts |
| `jest` | 29.5.0+ | Test runner | Existing |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nodemon` | 3.1.11 | File-watch restart for development | Already wired in `graphql:watch`, `rest:watch`, `device:watch` npm scripts |
| `dotenv` | 17.2.3 | `.env` loading in container startup | Already used in local-env-setup.ts |
| `constructs` | 10.4.2 | Required to instantiate CDK Construct mocks in graphql-server.ts | Already in devDependencies |
| `aws-cdk-lib` | 2.204.0 | `AppSyncStack.addResolversToAppSync` call in graphql-server.ts | Already in devDependencies |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| express-graphql | graphql-http | graphql-http is more modern but requires express adapter; express-graphql is already working |
| In-process resolver loading | Separate Lambda invoke | Simpler; Lambda invoke would require sam local or equivalent; current approach is correct |
| express-graphql for subscriptions | graphql-ws + ws | graphql-ws enables real WebSocket subscriptions locally; deferred — requirement is graceful skip, not full implementation |

**Installation:** No new packages needed for Phase 2.

---

## Architecture Patterns

### Existing Pattern: AppSync Stack Mock for Resolver Discovery

`graphql-server.ts` calls `AppSyncStack.addResolversToAppSync` with a mock `appsync` object that captures every `addLambdaResolver` call. This builds a `Record<codePath, fieldName>` map without instantiating real CDK resources. This is the correct and only approach — it stays automatically in sync with `app-sync.ts` without maintaining a separate mapping file.

**Gap:** The mock `appsync` object in `graphql-server.ts` only captures `addLambdaResolver` calls, not `addNoneDataSource`/`createResolver` calls. The three subscription/passthrough resolvers that use `createResolver` with a NoneDataSource are therefore not registered. For GQL-03 compliance, these must be handled separately.

**Subscriptions identified in app-sync.ts:**
- `onStudentNote` — registered via `addLambdaResolver` with `typeName: 'Subscription'`, `codePath: 'src/graphql/resolver/subscriptions/report/notes.ts'`. Handler exists and returns null. Will be loaded by the existing resolver map path.
- `onUserLicenseChange` — registered via `createResolver` with NoneDataSource. Not in the lambda resolver map. Requires a stub.
- `onStudentDataChange` — registered via `createResolver` with NoneDataSource. Not in the lambda resolver map. Requires a stub.
- `studentDataChange` — registered via `createResolver` on the Mutation type as a passthrough NoneDataSource resolver. Not loaded by the lambda resolver map. Requires a stub.

### Pattern: AppSync Context Construction in wrapResolver

**File:** `api/src/container/resolver-wrapper.ts`

The `wrapResolver` function builds the AppSync context object and passes it to `handler(appsyncContext)`. This is the correct invocation shape — the resolver's `handler` export is the `WebUtils.graphQLWrapper()` result, which expects an `MttAppSyncContext`.

**Key field mapping:**
- `arguments` — mapped from Express `args` (GraphQL execution arguments). Correct.
- `identity` — mapped from `context.identity` (set by JWT middleware from Redis). Partially correct; missing `claims` field.
- `stash` — initialized with `permissions: context.permissions || {}`. Correct starter; graphQLWrapper fills it in.
- `info.fieldName`, `info.parentTypeName`, `info.variables`, `info.selectionSetList` — all populated from `graphql` execution `info` object. Correct.
- `request.headers` — populated from Express headers. Correct.
- `result`, `prev` — initialized as empty objects. Correct.
- `error` — set to null. Correct per `@aws-appsync/utils` Context interface.

**Identity shape expected by `MttAppSyncContext`:**
```typescript
identity: {
    claims: any;       // READ by graphQLWrapper — not set in current wrapResolver
    username: string;  // READ by graphQLWrapper for identity.username
    groups: string[];  // READ by graphQLWrapper for license extraction
}
```

**Identity shape provided by `AuthManager.getIdentity()`:**
```typescript
{
    sub: string;
    username: string;           // maps to identity.username — correct
    email: string;
    'cognito:username': string;
    'cognito:groups': string[]; // array — NOT the same as identity.groups
    groups: string[];           // array — maps to identity.groups — correct
    accountId?: string;
    cognitoIdentityAuthProvider?: string | null;
    userArn?: string;
}
```

**Finding:** `claims` is missing. `graphQLWrapper` reads `context.identity.groups` which is present in the Redis identity object. The `claims` field is read only by `apiWrapperEx`, not `graphQLWrapper`, so this gap does not block GraphQL operations.

### Pattern: Docker Compose Service Startup with Readiness Probe

**File:** `api/src/container/entrypoint.sh`

The entrypoint script polls DynamoDB (`curl -s http://dynamodb-local:8000`) and RabbitMQ management (`curl -s http://rabbitmq:15672`) before starting. This is the correct approach for dependency readiness.

**Gap:** `entrypoint.sh` runs `npm run container:start` which maps to `npx ts-node --transpile-only src/container/server.ts` — but `server.ts` does not exist. The correct script is `src/container/graphql-server.ts`. This will cause the container to fail immediately on startup.

**Fix:** Either create `server.ts` as a re-export/shim of `graphql-server.ts`, or update the npm script `container:start` in `api/package.json` to point to `graphql-server.ts`.

### Pattern: Table Name Consistency

Init-tables.ts creates four tables: `mytaptrack-local-data`, `mytaptrack-local-primary`, `mytaptrack-data`, `mytaptrack-primary`. The docker-compose.yml `graphql-api`, `device-api`, and `rest-api` services all set `PrimaryTable=mytaptrack-local-primary` and `DataTable=mytaptrack-local-data`. The `.env.example` sets `PrimaryTable=mytaptrack-primary` and `DataTable=mytaptrack-data`. Init-tables creates all four, so no mismatch — but the `.env.example` points at the non-suffixed tables while docker-compose uses the `-local-` suffixed tables. This was identified as an open question in Phase 1 research; it remains active.

### Anti-Patterns to Avoid

- **Modifying handler exports:** Lambda handler signatures must not change. The `wrapResolver` layer absorbs all translation. Any context-shape fixes go in `resolver-wrapper.ts`, not in individual resolvers.
- **Throwing errors for subscription fields:** The requirement is "graceful skip response, not unhandled error." Register null-returning stubs — do not leave subscriptions unregistered.
- **Rebuilding the resolver map by hand:** The AppSync mock approach is correct and self-maintaining. Do not replace it with a manually-maintained YAML file.
- **Adding `depends_on` health checks without Docker Compose v3.x format:** The current `depends_on` is a simple list, not a condition-based health check. This is acceptable since `entrypoint.sh` handles the readiness loop.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resolver discovery | Hand-maintained YAML mapping | `AppSyncStack.addResolversToAppSync` mock | Already implemented; stays in sync with CDK stack |
| AppSync context | Custom serialization | `resolver-wrapper.ts` `wrapResolver` function | Already exists; only needs identity.claims addition |
| JWT validation | Custom crypto | `jsonwebtoken` + `auth-manager.ts` | Already implemented with Redis fallback to in-memory |
| Table creation | Custom DynamoDB setup script | `init-tables.ts` | Already creates all four required tables |
| Service readiness | `sleep N` in entrypoint | `entrypoint.sh` curl polling loop | Already implemented |
| Subscription WebSocket | Custom ws server | null-returning stubs (graceful skip per req) | Full WebSocket subscriptions are out of scope |

---

## Common Pitfalls

### Pitfall 1: `container:start` script points to non-existent `server.ts`
**What goes wrong:** `npm run container:start` in `api/package.json` runs `npx ts-node --transpile-only src/container/server.ts`. The file `src/container/server.ts` does not exist. The `graphql-api` Docker container will fail to start immediately with a "Cannot find module" error.
**Why it happens:** The entrypoint script calls `container:start`, which was mapped to a file that was renamed or never created.
**How to avoid:** In the fix plan, update `container:start` in `api/package.json` to point to `graphql-server.ts`, or create `server.ts` as a thin wrapper.
**Warning signs:** `docker compose up` shows `graphql-api` container exiting with code 1 within seconds.

### Pitfall 2: MockConstruct initialization in graphql-server.ts fails at CDK Node construction
**What goes wrong:** `graphql-server.ts` constructs `new Node(undefined, undefined, '')` directly to create a mock CDK scope. CDK `Node` is not designed for direct instantiation outside a CDK App context; this may throw.
**Why it happens:** The AppSync mock instantiation approach is fragile — it depends on CDK internals not having changed.
**How to avoid:** Verify that `loadResolverMappings()` runs cleanly when the server starts. If it throws, the server will fail to load any resolvers. Test with `npx ts-node --transpile-only -e "require('./api/src/container/graphql-server.ts')"` before committing.
**Warning signs:** Server starts but `Available resolvers: []` is logged — all resolvers failed to load.

### Pitfall 3: Subscription fields cause GraphQL execution errors instead of returning null
**What goes wrong:** If `onUserLicenseChange`, `onStudentDataChange`, or `studentDataChange` are not registered in the `root` resolver map, `express-graphql` will return a GraphQL error: "The query provides a field 'X' which is not defined by the server."
**Why it happens:** `createResolver` calls in `app-sync.ts` are not captured by the `addLambdaResolver` mock.
**How to avoid:** After loading the standard resolver map, explicitly register stubs for the three known subscription/none-source fields that return `null` with a log message.
**Warning signs:** Client receives `{"errors":[{"message":"Cannot return null for non-nullable field..."}]}` or a 400 on any subscription query.

### Pitfall 4: `graphql-api` container mounts source but does not build TypeScript
**What goes wrong:** `docker-compose.yml` mounts `./api/src:/app/src`, `./lib:/app/lib`, `./types:/app/types` as volumes. The container runs via `ts-node --transpile-only`, which transpiles at runtime. But `lib` and `types` are mounted as source, not built `dist/`. The `@mytaptrack/lib` package is referenced as `file:../lib` in `api/package.json`, so npm installs the local directory. If `lib/dist/` is not built before `docker compose up`, the import will fail.
**Why it happens:** The Docker volume mounts the raw source but the local package dependency requires `dist/` to exist for the CommonJS `require` resolution.
**How to avoid:** Phase 2 must ensure `npm run build` (at minimum `lib/` and `types/`) is run before `docker compose up`, or the Dockerfile/entrypoint must run `tsc -d` for lib.
**Warning signs:** Container throws `Cannot find module '@mytaptrack/lib'` or similar on startup.

### Pitfall 5: identity.claims missing causes subtle auth failures
**What goes wrong:** `WebUtils.apiWrapperEx` (used by REST handlers) reads `context.requestContext.authorizer.claims`. For GraphQL, `WebUtils.graphQLWrapper` reads `context.identity.groups` and `context.identity.username`. The missing `claims` field only becomes a problem if any GraphQL resolver internally calls `apiWrapperEx` or accesses `context.identity.claims` directly.
**Why it happens:** `resolver-wrapper.ts` does not set `claims` on the identity object.
**How to avoid:** Add `claims: identity` (or the raw JWT payload) to the identity object built in `wrapResolver`. Low-risk addition.
**Warning signs:** Resolver throws `TypeError: Cannot read properties of null (reading 'sub')` or similar on identity access.

---

## Code Examples

### Current: Resolver loading in graphql-server.ts
```typescript
// Source: api/src/container/graphql-server.ts (lines 108-129)
const resolverMap: Record<string, string> = {};
const appsync: any = {
    addLambdaResolver: (id, props: LambdaResolverProps) => { lambdaResolvers.push(props) },
    addNoneDataSource: (id, props) => {},
    createResolver: (id, props) => {}  // ← subscription resolvers captured as no-ops
};
AppSyncStack.addResolversToAppSync({ appsync, ... });

lambdaResolvers.forEach(config => {
    resolverMap[config.codePath] = config.fieldName;  // ← correct mapping
})
```

### Current: wrapResolver context construction
```typescript
// Source: api/src/container/resolver-wrapper.ts (lines 8-33)
const appsyncContext: Context = {
    arguments: args,
    source: {},
    result: {},
    prev: { result: {} },
    stash: { permissions: context.permissions || {} },
    info: {
        fieldName: info?.fieldName || '',
        parentTypeName: info?.parentType?.name || '',
        variables: info?.variableValues || {},
        selectionSetList: selectionSetList,
        selectionSetGraphQL: ''
    },
    request: { headers: context.headers || {}, domainName: null },
    identity: context.identity || null,  // ← Redis CognitoIdentity shape
    error: null
};
const result = await handler(appsyncContext);
```

### Current: MttAppSyncContext.identity shape expected by graphQLWrapper
```typescript
// Source: lib/src/utils/appsync-interfaces.ts (lines 5-36)
interface MttAppSyncContext<Params, Prev, Result, Stash> {
    identity: {
        claims: any;       // Not populated by wrapResolver — low-risk gap
        username: string;  // Populated via CognitoIdentity.username
        groups: string[];  // Populated via CognitoIdentity.groups
    };
    ...
}
```

### Current: graphQLWrapper license extraction (what must work)
```typescript
// Source: lib/src/utils/web-utils.ts (line 70)
const licenses = context.identity.groups
    ?.filter(x => x.startsWith('licenses/'))
    .map(x => x.substring('licenses/'.length)) ?? [];
```
The `groups` array from `CognitoIdentity` must contain entries like `'licenses/lic-123'` for license-scoped operations to work. `AuthManager.generateToken` accepts a `groups` array parameter — callers (system tests, test setup) must pass license groups in this format.

### Current: docker-compose.yml service graph
```
DynamoDB Local (:8000)
RabbitMQ (:5672, :15672)
Redis (:6379)
graphql-api (:4000)  ← depends_on: dynamodb-local, rabbitmq, redis
device-api (:3001)   ← depends_on: dynamodb-local, graphql-api
rest-api (:3000)     ← depends_on: dynamodb-local, graphql-api, redis
```

### Current: entrypoint.sh startup sequence
```bash
# Source: api/src/container/entrypoint.sh
until curl -s http://dynamodb-local:8000 > /dev/null 2>&1; do sleep 1; done
until curl -s http://rabbitmq:15672 > /dev/null 2>&1; do sleep 1; done
npm run container:init-tables   # creates required DynamoDB tables
npm run container:start         # ← BUG: points to missing server.ts
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-maintained resolver YAML (`graphql-mappings.yml`) | Dynamic discovery via `AppSyncStack.addResolversToAppSync` mock | Recent (commented-out YAML code still visible in graphql-server.ts) | Resolver map always in sync with CDK stack |
| `npm run graphql:start` manual start | Docker Compose with entrypoint | Recent (feature/localhost branch) | `docker compose up` can start all services |

**Commented-out code to be aware of:**
- `api/src/container/graphql-server.ts` lines 66-68: YAML-based resolver loading is commented out. The new AppSync mock approach replaced it but the old code remains.
- `api/src/container/graphql-server.ts` lines 112-126: Object.entries fallback is also commented out. Both can be deleted once the new approach is confirmed working.
- `api/src/container/extract-resolvers.ts`: This file uses regex parsing of `app-sync.ts` source to extract resolvers. It is not imported by `graphql-server.ts`. It appears to be an abandoned alternative approach. Do not use it.

---

## Open Questions

1. **Does `AppSyncStack.addResolversToAppSync` work with the mock Construct?**
   - What we know: `graphql-server.ts` constructs `new Node(undefined, undefined, '')` and wraps it in a mock Construct. CDK Node has changed across versions.
   - What's unclear: Whether the CDK version (2.204.0) allows Node to be constructed this way without a valid App scope. The mock `appsync` object is the thing that actually matters; the mock Construct is just needed to satisfy TypeScript types.
   - Recommendation: Test this with `npx ts-node --transpile-only api/src/container/graphql-server.ts` before building Docker image. If it fails, the fix is to make the mock objects simpler (plain JS objects cast to `any`), not a CDK concern.

2. **What does `npm run container:start` actually need to run?**
   - What we know: `api/package.json` maps `container:start` to `src/container/server.ts` which does not exist. The GraphQL server is `graphql-server.ts`.
   - Recommendation: Update `container:start` to `npx ts-node --transpile-only src/container/graphql-server.ts`. This is a one-line change.

3. **Are `lib/dist/` and `types/dist/` required to exist before `docker compose up`?**
   - What we know: The `graphql-api` Docker container mounts `./lib` and `./types` as volumes, and these are referenced as file: npm dependencies. TypeScript resolution via ts-node transpile-only will look for the source .ts files if `dist/` is absent, but npm resolution for `@mytaptrack/lib` requires the `package.json` `main` to resolve.
   - Recommendation: Verify `lib/package.json` main field points to `dist/index.js`. If so, `lib/dist/` must be built. Add a pre-compose check or note in the Makefile `container-up` target.

4. **What license group format do test users need?**
   - What we know: `graphQLWrapper` extracts licenses from `context.identity.groups` entries matching `'licenses/{licenseId}'`. `AuthManager.generateToken` stores the groups array as passed.
   - What's unclear: Whether the existing `local-global-setup.js` seeds test users with groups in this format.
   - Recommendation: Phase 3 concern but flag now — test users must have groups like `['licenses/test-license-id']` for license-scoped GraphQL operations to succeed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with ts-jest preset |
| Config file | `lib/jest.config.js` (unit tests), `system-tests/package.json` jest key (integration) |
| Quick run command | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="config.spec"` |
| Full suite command | `cd system-tests && USE_LOCAL=true npm run test:local` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CFG-04 | `docker compose up` starts all services cleanly | Smoke/manual | `docker compose up -d && docker compose ps` — verify all containers reach "running" state | Makefile `container-up` exists; no automated assertion |
| CFG-04 | graphql-api container reaches healthy state | Integration | `docker compose up -d && sleep 10 && curl -s http://localhost:4000/graphql -d '{"query":"{__typename}"}' -H 'Content-Type: application/json'` | Wave 0 gap — no health-check spec |
| GQL-01 | Each query operation returns a valid response | Integration | `cd system-tests && USE_LOCAL=true npm run test:local -- --testPathPattern="graphql"` (pending Phase 3 full suite) | Partial — some graphql specs in system-tests |
| GQL-01 | Resolver map loads all query fieldNames without error | Unit (server startup) | Check server startup log: `Available resolvers:` includes all expected queries | Manual log check today; Wave 0 gap for automated spec |
| GQL-02 | Each mutation operation processes without AWS fallthrough | Integration | Same as GQL-01 graphql pattern tests | Partial |
| GQL-03 | Subscription fields return null or structured skip, not error | Unit | Jest test sending subscription query to `http://localhost:4000/graphql` and asserting HTTP 200 with null data or structured message | Wave 0 gap |
| GQL-04 | AppSync context identity.groups populated correctly | Unit | Jest test of `wrapResolver` passing mock identity; assert `handler` receives groups array | Wave 0 gap — `system-tests/src/tests/config.spec.ts` exists but not for this |
| GQL-04 | graphQLWrapper license extraction works with local identity | Unit | Jest test of `WebUtils.graphQLWrapper` with local identity shape; assert licenses extracted | Wave 0 gap |

### Sampling Rate

- **Per task commit:** `cd api && npx ts-node --transpile-only -e "const g = require('./src/container/graphql-server'); console.log('server loads ok')" 2>&1 | tail -5` (verifies server module loads without crash)
- **Per wave merge:** `docker compose up -d && sleep 15 && curl -sf http://localhost:4000/graphql -d '{"query":"{ __typename }"}' -H 'Content-Type: application/json'` (verifies GraphQL endpoint responds)
- **Phase gate:** All resolver fieldNames logged by server, subscription stubs respond without error, `docker compose up` starts all six containers with no exit-code-1 failures

### Wave 0 Gaps

- [ ] `system-tests/src/tests/graphql-server.spec.ts` — smoke test: server starts, `__typename` query returns `{ data: { __typename: 'Query' } }`, subscription query returns null or structured skip message
- [ ] `api/src/container/resolver-wrapper.spec.ts` — unit test: `wrapResolver` builds correct AppSync context shape; `identity.groups` is array; `info.fieldName` matches; `arguments` passed through
- [ ] Fix `api/package.json` `container:start` script to point to `graphql-server.ts` (not `server.ts`)
- [ ] Verify `lib/dist/` exists before Docker container starts — add build step to `container-up` Makefile target or document as prerequisite

---

## Sources

### Primary (HIGH confidence)

- `/Users/nikody/src/mytaptrack/back-end/api/src/container/graphql-server.ts` — complete GraphQL server implementation
- `/Users/nikody/src/mytaptrack/back-end/api/src/container/resolver-wrapper.ts` — AppSync context construction
- `/Users/nikody/src/mytaptrack/back-end/api/src/container/local-env-setup.ts` — DynamoDB + RabbitMQ initialization
- `/Users/nikody/src/mytaptrack/back-end/api/src/container/auth-manager.ts` — JWT + Redis identity management
- `/Users/nikody/src/mytaptrack/back-end/api/src/container/rest-api-server.ts` — REST API server (reference for working pattern)
- `/Users/nikody/src/mytaptrack/back-end/api/src/container/init-tables.ts` — DynamoDB table creation
- `/Users/nikody/src/mytaptrack/back-end/api/src/container/config.ts` — container configuration
- `/Users/nikody/src/mytaptrack/back-end/docker-compose.yml` — service definitions and port mappings
- `/Users/nikody/src/mytaptrack/back-end/api/Dockerfile` — container build and entrypoint
- `/Users/nikody/src/mytaptrack/back-end/api/src/container/entrypoint.sh` — startup sequence
- `/Users/nikody/src/mytaptrack/back-end/api/lib/app-sync.ts` — authoritative resolver registration source
- `/Users/nikody/src/mytaptrack/back-end/api/src/graphql/resolver/subscriptions/report/notes.ts` — subscription handler (returns null)
- `/Users/nikody/src/mytaptrack/back-end/api/src/graphql/resolver/types/index.ts` — AppSyncResults type
- `/Users/nikody/src/mytaptrack/back-end/lib/src/utils/appsync-interfaces.ts` — MttAppSyncContext type
- `/Users/nikody/src/mytaptrack/back-end/lib/src/utils/web-utils.ts` — graphQLWrapper identity access patterns
- `/Users/nikody/src/mytaptrack/back-end/api/package.json` — npm scripts (confirms container:start → server.ts mismatch)
- `/Users/nikody/src/mytaptrack/back-end/makefile` — container-services and container-up targets
- `/Users/nikody/src/mytaptrack/back-end/.planning/phases/01-config-detection/01-RESEARCH.md` — Phase 1 context

### Secondary (MEDIUM confidence)

- `/Users/nikody/src/mytaptrack/back-end/.planning/STATE.md` — project decisions and history
- `/Users/nikody/src/mytaptrack/back-end/.planning/codebase/CONCERNS.md` — known broken commits, existing tech debt

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in package.json and running source files
- Architecture: HIGH — resolver loading, context construction, and subscription patterns all read directly from source
- Pitfalls: HIGH — container:start/server.ts mismatch is a verified concrete bug; others derived from observed code
- Validation: MEDIUM — test commands reference files that partially exist; Wave 0 gaps are concrete

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable implementation; no fast-moving external dependencies)
