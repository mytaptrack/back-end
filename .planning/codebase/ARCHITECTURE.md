# Architecture

**Analysis Date:** 2026-03-21

## Pattern Overview

**Overall:** Modular AWS Lambda-based event-driven architecture with layered monorepo organization.

**Key Characteristics:**
- Layered module structure with strict dependency ordering: types → cdk → lib → [core, api, data-prop]
- Event-driven data propagation via AWS DynamoDB Streams → EventBridge
- Multi-API surface: GraphQL (AppSync), REST (API Gateway), Device-specific (IoT Core)
- Data access abstraction layer with DAL pattern for DynamoDB operations
- Lambda function entry points for API handlers and event processors
- TypeScript throughout with CommonJS modules and source maps

## Layers

**Types Layer (@mytaptrack/types):**
- Purpose: Shared TypeScript type definitions for all modules
- Location: `types/src/`
- Contains: Domain models (student, license, notifications, etc.), request/response types, API contracts
- Depends on: Nothing (root of dependency tree)
- Used by: All other modules (cdk, lib, core, api, data-prop)

**CDK Layer (@mytaptrack/cdk):**
- Purpose: Reusable AWS CDK constructs and infrastructure utilities
- Location: `cdk/src/`
- Contains: Custom CDK constructs (MttContext, MttDynamoDB, MttFunction, MttCognito, MttS3, etc.), AppSync utilities, IoT utilities
- Depends on: types
- Used by: core, api, data-prop (for infrastructure definitions)

**Library Layer (@mytaptrack/lib):**
- Purpose: Shared business logic, data access, utilities
- Location: `lib/src/`
- Contains: DAL implementations, database providers, utilities (encryption, mail, logging, AppSync client), security patterns, testing helpers
- Depends on: types, cdk, AWS SDK v3, external libraries (lodash, moment-timezone, graphql-request, mongodb, etc.)
- Used by: core, api, data-prop, system-tests

**Infrastructure Layer:**

**Core Stack (core/):**
- Purpose: Foundation AWS infrastructure (DynamoDB tables, Cognito, EventBridge, S3, KMS, etc.)
- Location: `core/lib/`, `core/src/functions/`
- Contains: Stack definitions (aws-stack.ts, security-stack.ts, website-stack.ts), Lambda functions for setup
- Depends on: types, cdk, lib
- Deploys: DynamoDB tables (primary, data), Cognito user pools with Google OAuth, EventBridge event bus, S3 buckets for data lake, KMS encryption, SES configuration

**API Layer (api/):**
- Purpose: All API endpoints and handlers
- Location: `api/src/`
- Contains: GraphQL resolvers, REST API handlers, Device API handlers, local development servers
- Depends on: types, cdk, lib
- Organized into: `graphql/` (AppSync resolvers), `v2/` (REST/device endpoints), `device/` (IoT device functions), `container/` (local servers)

**Data Propagation Layer (data-prop/):**
- Purpose: Event-driven data processing and persistence
- Location: `data-prop/src/functions/`
- Contains: EventBridge rule handlers, DynamoDB stream processors, Cognito triggers, S3 writers
- Depends on: types, cdk, lib
- Organized into: `eventbus/` (EventBridge rules), `cognito/` (auth triggers), `student/`, `licenses/`, `notifications/` (domain-specific processors)

## Data Flow

**REST/Device Request → Response:**

1. Client sends HTTP/device request to API Gateway / IoT endpoint
2. Handler imported in `api/src/container/rest-api-server.ts` or `api/src/device/functions/` receives request
3. Handler uses `WebUtils.apiWrapperEx()` to extract user context and validate authorization
4. Handler retrieves/updates data via DAL classes from `lib/src/v2/dals/` (StudentDal, LicenseDal, etc.)
5. DAL executes DynamoDB query/scan/update via `Dal` base class (`lib/src/v2/dals/dal.ts`)
6. Data returned to handler, formatted per response type
7. Response serialized and returned to client

**GraphQL Request → Response:**

1. Client sends GraphQL query/mutation to AppSync endpoint
2. AppSync invokes Lambda resolver defined in `api/lib/app-sync.ts` (via CDK)
3. Resolver wrapper extracts context from `AppSyncResults` in `api/src/graphql/resolver/types/index.ts`
4. Specific resolver handler (e.g., `api/src/graphql/resolver/query/getStudent/` or `mutations/student/`) executes
5. Handler uses `WebUtils.graphQLWrapper()` for authorization checks via `MttAppSyncContext`
6. Data retrieved via lib DAL layer (StudentDal, LicenseDal, etc.)
7. Result formatted to GraphQL type and returned

**DynamoDB Stream → EventBridge → Processing:**

1. Write to DynamoDB table triggers stream event
2. Lambda function `data-prop/src/functions/eventbus/from-dynamo.ts` processes stream record
3. Function maps DynamoDB record to domain event type (MttEventType: Student, License, etc.)
4. Event published to EventBridge bus via `PutEventsCommand`
5. EventBridge rule routes event to target handler (e.g., `data-prop/src/functions/student/prop/studentToS3.ts`)
6. Target handler processes event: updates related records, writes to S3, calls external services
7. Updates trigger additional DynamoDB stream events, creating event cascade

**State Management:**

- Primary state: DynamoDB tables (primary for operational data, data for analytics)
- Transient state: S3 (data lake for reports, student snapshots)
- Cache: Redis (via ioredis library) for session/temporary data
- Event state: EventBridge (audit trail via event bus)
- User state: Cognito user pool with custom attributes

## Key Abstractions

**Dal (Data Access Layer):**
- Purpose: Abstract DynamoDB operations
- Examples: `lib/src/v2/dals/student-dal.ts`, `lib/src/v2/dals/license-dal.ts`, `lib/src/v2/dals/schedule-dal.ts`
- Pattern: Base `Dal` class provides query/get/put/update/delete; domain-specific DALs extend with business logic

**Service Classes:**
- Purpose: Encapsulate domain business logic
- Examples: `api/src/graphql/resolver/mutations/student/service/` (student update service)
- Pattern: Service methods called by resolvers/handlers, delegate to DALs

**WebUtils Wrappers:**
- Purpose: Standardize error handling, authorization, logging for handlers
- Examples: `WebUtils.apiWrapperEx()` for REST, `WebUtils.graphQLWrapper()` for GraphQL, `WebUtils.lambdaWrapper()` for raw Lambda
- Pattern: Wrap handler function to inject context, catch errors, return formatted responses

**Event Types (MttEventType):**
- Purpose: Categorize changes for propagation
- Examples: Student created, License updated, Notification sent
- Pattern: DynamoDB stream processor identifies type from record pk/sk, publishes typed event

## Entry Points

**GraphQL API (AppSync):**
- Location: Resolvers in `api/src/graphql/resolver/`
- Triggers: GraphQL query/mutation/subscription requests
- Responsibilities: Validate user access, retrieve/update data, return typed results
- Patterns: Each resolver wrapped with `WebUtils.graphQLWrapper()`, uses `MttAppSyncContext<Args, Result>` for typing

**REST API (API Gateway + Lambda):**
- Location: Handlers in `api/src/v2/` organized by resource (student, licenses, manage, etc.)
- Triggers: HTTP requests to specific paths
- Responsibilities: Parse request body, validate authorization, call business logic, return JSON
- Patterns: Each handler wrapped with `WebUtils.apiWrapperEx()`, extracts user from `WebUserDetails`

**Device API (IoT Core):**
- Location: Handlers in `api/src/device/functions/`
- Triggers: MQTT messages from physical devices
- Responsibilities: Authenticate device, process telemetry/events, update device state
- Patterns: Device-specific authentication in `api/src/device/functions/iot/auth/`, handlers in `handlers/`

**Event Processors (DynamoDB Streams → EventBridge):**
- Location: `data-prop/src/functions/`
- Triggers: DynamoDB stream events (new/update/delete)
- Responsibilities: Transform stream record to domain event, publish to EventBridge
- Patterns: `from-dynamo.ts` is the main entry, routes to domain-specific handlers

**Local Development Servers:**
- Location: `api/src/container/`
- Files: `graphql-server.ts`, `rest-api-server.ts`, `device-server.ts`, `start-all.ts`
- Purpose: Run API locally without AWS for development
- Invoked: `npm run graphql:watch`, `npm run rest:start`, `npm run device:watch`

## Error Handling

**Strategy:** Wrap all handler functions with utility wrappers that catch errors, log with context, return consistent error responses.

**Patterns:**

- **REST APIs:** `WebUtils.apiWrapperEx()` catches errors, logs to CloudWatch/Lumigo tracer, returns HTTP error response with error code
- **GraphQL:** `WebUtils.graphQLWrapper()` catches errors, returns GraphQL error in standard format
- **Lambda:** `WebUtils.lambdaWrapper()` logs errors with full context, rethrows for Lambda failure handling
- **DAL Layer:** Custom exceptions for database failures (missing records, constraint violations); handlers catch and map to domain errors
- **Authorization:** Specific `AccessLevel` checks in wrappers; unauthorized access returns 403 or GraphQL auth error

## Cross-Cutting Concerns

**Logging:**
- Framework: `MttLogger` (`lib/src/utils/logger.ts`) with configurable levels (debug, info, warn, error)
- Usage: Most services instantiate logger and log key operations
- Aggregation: CloudWatch via Lambda execution role

**Validation:**
- Framework: `jsonschema` library used in DALs and handlers
- Pattern: Request validation done in handler wrapper before business logic
- Custom validators for business rules (e.g., schedule constraints, license limits)

**Authentication:**
- Provider: AWS Cognito with user pool (configured in core stack)
- OAuth: Google OAuth integration via `UserPoolIdentityProviderGoogle`
- Session: JWT tokens issued by Cognito, validated via custom authorizers in API Gateway
- Device Auth: Custom authentication in `api/src/device/functions/iot/auth/` for IoT devices

**Encryption:**
- Data at rest: KMS encryption via `MttKmsKey` construct
- PII: Encrypted in DynamoDB via `@mytaptrack/lib` encryption utilities (`lib/src/utils/encrypt-details.ts`)
- Secrets: AWS Secrets Manager referenced in handlers via environment variables

**Tracing:**
- Framework: `@lumigo/tracer` wraps Lambda functions
- Purpose: Distributed tracing across service calls
- Configuration: Auto-instrument AWS SDK calls, log payload samples

---

*Architecture analysis: 2026-03-21*
