# Codebase Structure

**Analysis Date:** 2026-03-21

## Directory Layout

```
mytaptrack/back-end/
├── types/              # Shared TypeScript type definitions (@mytaptrack/types)
├── cdk/                # Reusable AWS CDK constructs (@mytaptrack/cdk)
├── lib/                # Business logic, DAL, shared utilities (@mytaptrack/lib)
├── core/               # Foundation infrastructure stacks (DynamoDB, Cognito, etc.)
├── api/                # All API services (GraphQL, REST, Device)
├── data-prop/          # Event-driven data processing (@mytaptrack/services-data-propogate)
├── system-tests/       # End-to-end system validation
├── cicd/               # CI/CD pipeline infrastructure
├── config/             # Environment configuration files (*.yml)
├── containers/         # Docker support files (docker-compose, logging)
├── utils/              # Deployment and environment utilities
├── docs/               # Project documentation
├── makefile            # Build and deployment targets
├── CLAUDE.md           # Project instructions and conventions
└── package.json        # Root package with dev dependencies
```

## Directory Purposes

**types/**
- Purpose: Single source of truth for all TypeScript types shared across modules
- Contains: Domain models, request/response contracts, GraphQL types, utility types
- Key files: `src/v1/`, `src/v2/` (versioned), `src/utils/`
- Exports via: `dist/index.d.ts` (built TypeScript definitions)
- Built first in dependency chain: `npm run build` → `tsc -d`

**cdk/**
- Purpose: Reusable AWS CDK constructs and infrastructure utilities
- Contains: Custom CDK construct classes, config loaders, AppSync utilities, IoT utilities
- Key files: `src/appsync/`, `src/iot/`, `src/utils/`, config file parsers
- Exports via: Named exports from `src/index.ts`
- Used by: core, api, data-prop for infrastructure definitions

**lib/**
- Purpose: Shared business logic and data access layer
- Contains: DAL (Data Access Layer), utilities, security, providers
- Structure: `src/v1/` (legacy), `src/v2/` (current), `src/utils/`
- Key subdirectories:
  - `src/v2/dals/` - DAL classes for each entity (StudentDal, LicenseDal, ScheduleDal, etc.)
  - `src/v2/providers/` - Database providers (DynamoDB, S3, Timestream)
  - `src/v2/security/` - Encryption, authorization patterns
  - `src/v2/optimization/` - Caching, query optimization
  - `src/v2/testing/` - Test data generation, fixtures
  - `src/v2/types/` - Internal types for DAL layer
  - `src/v2/utils/` - Helper functions
  - `src/utils/` - Global utilities (logging, email, encryption, AppSync client)
- Exports: `export * as v2 from './v2'` + utilities

**core/**
- Purpose: Foundation AWS infrastructure (stacks, configuration, setup functions)
- Contains: CDK stack definitions for core AWS services
- Key files:
  - `lib/aws-stack.ts` - Main stack with DynamoDB, Cognito, EventBridge, S3, KMS, SES setup
  - `lib/security-stack.ts` - IAM roles and policies
  - `lib/website-stack.ts` - Static website hosting
  - `src/functions/` - Lambda functions for custom resource handlers, setup
  - `utils/setenv.ts`, `utils/delenv.ts`, `utils/setup-env.ts` - Environment management scripts
- Build: SAM + CDK (`samtsc` in npm scripts)
- Deployment: `make deploy-core` or `cdk deploy`

**api/**
- Purpose: All API services (GraphQL, REST, Device, local servers)
- Structure: Multiple entry points for different deployment targets
- Key subdirectories:
  - `src/graphql/` - GraphQL schema files (*.graphql) and resolvers
    - `src/graphql/resolver/` - Handler functions organized by operation type (query, mutations, subscriptions)
    - `src/graphql/resolver/query/` - Query resolvers (getStudent, getLicenses, etc.)
    - `src/graphql/resolver/mutations/` - Mutation resolvers organized by domain (student, license, manage, etc.)
    - `src/graphql/resolver/types/` - GraphQL type interfaces and storage schemas
    - `src/graphql/resolver/authorization/` - Access control helpers
  - `src/v2/` - REST API handlers organized by domain
    - `src/v2/student/` - Student data endpoints (info, devices, behavior, schedule, etc.)
    - `src/v2/manage/` - Admin/management endpoints (licenses, apps, reports, templates)
    - `src/v2/licenses/` - License management endpoints
    - `src/v2/superuser/` - Superuser operations
    - `src/v2/user/` - User profile endpoints
    - `src/v2/utils/` - API-specific utilities
  - `src/device/` - Device-specific APIs (IoT Core integration)
    - `src/device/functions/iot/` - IoT Core handlers
    - `src/device/functions/iot/auth/` - Device authentication
    - `src/device/functions/iot/handlers/` - Message handlers (audio, click events)
    - `src/device/functions/api/` - Device REST API
    - `src/device/functions/appApi/` - App-to-device API
    - `src/device/library/` - Device-specific types and utilities
  - `src/container/` - Local development servers
    - `graphql-server.ts` - Express + GraphQL server for local GraphQL development
    - `rest-api-server.ts` - Express server hosting all REST endpoints
    - `device-server.ts` - Device API server
    - `start-all.ts` - Runs all servers
    - `local-env-setup.ts` - Local environment initialization (DynamoDB local, RabbitMQ)
    - `auth-manager.ts` - Local auth simulation
  - `src/migration/` - Data migration utilities
  - `lib/` - CDK stack definitions for API services (GraphQL stack, REST stack, Device stack)
  - `src/library/` - Symlink to `@mytaptrack/stack-lib` for shared API code

**data-prop/**
- Purpose: Event-driven data processing and propagation
- Contains: Lambda functions triggered by events (DynamoDB Streams, EventBridge, Cognito)
- Key subdirectories:
  - `src/functions/eventbus/` - DynamoDB stream → EventBridge conversion (from-dynamo.ts is main entry)
  - `src/functions/cognito/` - Cognito triggers (pre-sign-up, pre-token-generation)
  - `src/functions/student/` - Student-related event handlers
  - `src/functions/licenses/` - License-related event handlers (licenseToUser, licenseToStudent, licenseToS3)
  - `src/functions/notification/` - Notification event handlers
  - `src/functions/templates/` - Template event handlers
  - `src/functions/app/` - App event handlers
  - `src/library/` - Shared processing logic
- Build: SAM + CDK
- Deployment: `make deploy-data-prop`

**system-tests/**
- Purpose: End-to-end system validation
- Contains: Test suites that exercise entire API surface
- Key subdirectories:
  - `src/tests/` - Test cases organized by feature
  - `src/lib/` - Test utilities and helpers
  - `src/utils/` - Environment setup for tests
  - `config/` - Test configuration files
- Execution: `make test` → runs against deployed AWS or local environment

**cicd/**
- Purpose: CI/CD pipeline infrastructure (GitHub Actions, CodeBuild, CodePipeline)
- Contains: CDK definitions for automation

**config/**
- Purpose: Environment configuration files
- Contains: YAML files defining environment-specific settings
  - `example.yml` - Template configuration
  - `example_test.yml` - Test environment configuration
  - Other YAML files for different deployment stages (dev, test, prod)
- Loaded at runtime via `process.env.CONFIG_PATH` and `process.env.CONFIG_FILE`

**containers/**
- Purpose: Docker support
- Contains: docker-compose definitions and support scripts
- Key files: `docker-compose.yml` (DynamoDB, RabbitMQ, Redis services)

**utils/**
- Purpose: Deployment and environment management utilities
- Contains: Scripts for setting/deleting environments, exporting data
- Key files: `setenv.ts`, `delenv.ts`, `setup-env.ts`, export scripts

**docs/**
- Purpose: Project documentation
- Contains: Architecture diagrams, API documentation, operational guides
- Organized by: Application, Business, Data, Technology, Development, Operations, User Support

## Key File Locations

**Entry Points:**

- GraphQL: `api/lib/app-sync.ts` - CDK stack defining AppSync API and Lambda resolvers
- REST: `api/src/container/rest-api-server.ts` - Express server routing all REST endpoints
- Device: `api/src/device/functions/iot/api/` - Device-specific HTTP endpoints
- Data Propagation: `data-prop/src/functions/eventbus/from-dynamo.ts` - Main DynamoDB stream processor
- Infrastructure: `core/lib/aws-stack.ts` - Core infrastructure stack definition

**Configuration:**

- Root types: `types/tsconfig.json`, `types/package.json`
- Root lib: `lib/tsconfig.json`, `lib/package.json`
- Root API: `api/tsconfig.json`, `api/package.json`, `api/lib/api-v2-subs/` (CDK stacks for each API surface)
- CDK context: `core/cdk.json`, `api/cdk.json`, `data-prop/cdk.json` (CDK configuration)
- Environment: `config/*.yml` - YAML files with AWS region, table names, service configs

**Core Logic:**

- Database layer: `lib/src/v2/dals/` - DAL classes (StudentDal in `student-dal.ts`, LicenseDal in `license-dal.ts`, etc.)
- Base DAL: `lib/src/v2/dals/dal.ts` - Low-level DynamoDB operations (query, get, put, update, delete)
- Utilities: `lib/src/utils/` - logging, encryption, email, AppSync client
- Security: `lib/src/v2/security/` - Encryption and authorization patterns

**Testing:**

- System tests: `system-tests/src/tests/` - Organized by feature (GraphQL, REST, Device)
- Fixtures: `lib/src/v2/testing/` - Test data generation
- Jest config: `api/jest.config.js`, `lib/jest.config.js`, `data-prop/jest.config.js`

## Naming Conventions

**Files:**

- `*.ts` - TypeScript source
- `*.graphql` - GraphQL schema files in `api/src/graphql/`
- `*.yml` or `*.yaml` - Configuration files in `config/`
- `*.spec.ts` or `*.test.ts` - Test files
- `*-dal.ts` - Data access layer classes (student-dal.ts, license-dal.ts)
- Handlers: `get.ts`, `put.ts`, `post.ts`, `delete.ts`, `patch.ts` for REST endpoints by operation
- Resolvers: Named after GraphQL operation (e.g., `getStudent/index.ts`)

**Directories:**

- `src/` - TypeScript source in every module
- `lib/` - CDK stack definitions (infrastructure code)
- `dist/` - Compiled JavaScript and type definitions (gitignored, generated by `tsc`)
- `node_modules/` - Dependencies (gitignored)
- `.build/` - Build artifacts (gitignored)
- `cdk.out/` - CDK synthesis output (gitignored)

**Functions/Variables:**

- `handle` or `handleEvent` - Main handler function exported from endpoint files
- `WebUtils.apiWrapperEx()` - Wraps REST handlers
- `WebUtils.graphQLWrapper()` - Wraps GraphQL resolvers
- `WebUtils.lambdaWrapper()` - Wraps raw Lambda handlers
- DAL methods: PascalCase, singular/plural for collections (`getStudent()`, `getStudents()`)
- Environment variables: UPPERCASE_SNAKE_CASE (e.g., `PrimaryTable`, `DataTable`, `EVENT_BUS`)

## Where to Add New Code

**New REST Endpoint:**

1. Primary code: Create handler file in `api/src/v2/[domain]/[operation].ts` (e.g., `api/src/v2/student/info/get.ts` for GET /student/info)
2. Export: `export const handleEvent = WebUtils.apiWrapperEx(functionName, {processBody: 'JSON', role: 'users'})`
3. Register: Import in `api/src/container/rest-api-server.ts` and add route with `app.get/post/put/delete(path, handler)`
4. DAL calls: Use existing DAL classes from `lib/src/v2/dals/` or create new DAL if new entity type
5. Tests: Create `api/src/v2/[domain]/[operation].spec.ts` or in `system-tests/src/tests/`

**New GraphQL Query/Mutation:**

1. Schema: Add type definitions to `api/src/graphql/schema.graphql` or split file (use `#include "path"`)
2. Resolver: Create handler in `api/src/graphql/resolver/query/[operation]/index.ts` or `mutations/[domain]/[operation].ts`
3. Handler function: Wrap with `WebUtils.graphQLWrapper(handler, {student: {[field]: AccessLevel.admin}})`
4. Type resolver: Use `MttAppSyncContext<Args, ResultType>` for type-safe context
5. DAL calls: Use lib DAL layer (LicenseDal.getAll(), StudentDal.get(), etc.)

**New Data Propagation Handler:**

1. Location: `data-prop/src/functions/[domain]/[operation].ts` (e.g., `student/prop/studentToS3.ts`)
2. Trigger: Define EventBridge rule in `data-prop/lib/` stack to route to this Lambda
3. Handler: Export async function accepting event (DynamoDB stream record or EventBridge event)
4. Processing: Unmarshall/parse event, call lib DAL or AWS SDK as needed
5. Side effects: Update related records, write to S3, call external services

**New DAL/Entity Type:**

1. Location: Create new file in `lib/src/v2/dals/[entity]-dal.ts` (e.g., `report-dal.ts`)
2. Extend: Inherit from or use base `Dal` class pattern
3. Methods: Add domain-specific methods wrapping base query/get/put/update operations
4. Indexes: Define DynamoDB index usage via `MttIndexes` types from cdk
5. Export: Add to `lib/src/v2/dals/index.ts` barrel export

**New Utility/Helper:**

- Shared across modules: `lib/src/v2/utils/` (if general) or `lib/src/utils/` (if infrastructure)
- API-specific: `api/src/v2/utils/` or `api/src/container/` depending on scope

## Special Directories

**node_modules/:**
- Purpose: Package dependencies (gitignored, regenerated via `npm ci` or `npm i`)
- Generated: Yes
- Committed: No

**dist/:**
- Purpose: Compiled JavaScript and type definitions
- Generated: Yes (by `tsc` in build step)
- Committed: No (gitignored)

**.build/:**
- Purpose: Build artifacts for Lambda functions
- Generated: Yes (by CDK bundling)
- Committed: No

**cdk.out/:**
- Purpose: CloudFormation templates and assets from CDK synthesis
- Generated: Yes (by `cdk synth` or `cdk deploy`)
- Committed: No

**.planning/codebase/:**
- Purpose: AI planning documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: No (created by GSD analysis)
- Committed: Yes (project uses these for phase planning)

**config/:**
- Purpose: Environment-specific YAML configurations
- Generated: No (manually maintained)
- Committed: Yes (includes example_test.yml for testing)

---

*Structure analysis: 2026-03-21*
