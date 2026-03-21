# Technology Stack

**Analysis Date:** 2026-03-21

## Languages

**Primary:**
- TypeScript 5.0+ (ES2022 target, CommonJS modules) - All business logic, APIs, and infrastructure code
- GraphQL - API schema definitions in `api/src/graphql/*.graphql`
- YAML - Configuration files in `config/*.yml`

## Runtime

**Environment:**
- Node.js 16+ (no specific version lock file found; versions specified in individual module tsconfig files)

**Package Manager:**
- npm (Node Package Manager) - Uses `npm i` and `npm ci` for dependency management
- Lockfiles: Present in root and each module (`package-lock.json`)

## Frameworks

**Core Infrastructure:**
- AWS CDK v2.204.0 - Infrastructure as code for all AWS deployments
  - Location: `cdk/` module with shared constructs
  - Used by: `core/`, `api/`, `data-prop/` stacks

**API & Web:**
- Express 5.1.0 - REST API server at `api/src/container/rest-api-server.ts`
- GraphQL 14.7.0 - GraphQL schema and resolvers
- express-graphql 0.12.0 - GraphQL server for Express
- graphql-http 1.22.4 - GraphQL HTTP protocol handler
- graphql-request 6.1.0 - GraphQL client library

**Lambda & Event Processing:**
- AWS Lambda - Serverless compute for API handlers and event processors
- AWS AppSync - GraphQL API with `@aws-appsync/utils` 1.5.0-1.7.0

**Testing:**
- Jest 29.5.0-29.7.0 - Test runner
- ts-jest 29.1.0+ - TypeScript support for Jest
- @types/jest 29.5+ - Jest type definitions

**Build & Development:**
- TypeScript 5.0.4+ - Language compilation
- ts-node 10.9.1 - TypeScript execution for Node
- ts-loader 9.2.6 - TypeScript loader for webpack/bundlers
- nodemon 3.1.11 - Development file watch tool
- SAM (Serverless Application Model) - Alternative deployment path

## Key Dependencies

**AWS SDK v3:**
- `@aws-sdk/client-dynamodb` 3.391.0-3.564.0 - DynamoDB operations
- `@aws-sdk/lib-dynamodb` 3.391.0 - Document client for DynamoDB
- `@aws-sdk/client-cognito-identity-provider` 3.391.0-3.799.0 - User authentication and authorization
- `@aws-sdk/client-s3` 3.391.0-3.563.0 - S3 storage operations
- `@aws-sdk/client-eventbridge` 3.391.0-3.564.0 - Event publishing and routing
- `@aws-sdk/client-ses` 3.391.0 - Email sending
- `@aws-sdk/client-sms` 3.391.0 - SMS messaging via SNS
- `@aws-sdk/client-sns` 3.391.0 - SNS notifications
- `@aws-sdk/client-sqs` 3.391.0 - SQS message queuing
- `@aws-sdk/client-ssm` 3.391.0-3.563.0 - Systems Manager Parameter Store
- `@aws-sdk/client-kms` 3.391.0 - KMS encryption key management
- `@aws-sdk/client-appsync` 3.409.0 - AppSync API management
- `@aws-sdk/client-secrets-manager` 3.391.0-3.556.0 - Secrets management
- `@aws-sdk/client-lex-runtime-service` 3.782.0 - AWS Lex chatbot integration
- `@aws-sdk/client-pinpoint` 3.502.0 - Email/SMS campaign management
- `@aws-sdk/client-sfn` 3.564.0-3.782.0 - Step Functions state machine execution
- `@aws-sdk/credential-providers` 3.409.0 - AWS credential resolution
- `@aws-sdk/s3-request-presigner` 3.400.0 - S3 presigned URL generation

**Data Access & Databases:**
- mongodb 6.19.0 - MongoDB driver (supports migration path from DynamoDB)
- amqplib 0.10.3 - AMQP protocol for RabbitMQ messaging
- ioredis 5.8.2 - Redis client for caching/sessions

**Messaging & Communication:**
- twilio 5.0.4 - SMS and voice communication
- graphql-request 4.3.0-6.1.0 - GraphQL client for internal API calls

**Security & Authentication:**
- jsonwebtoken 9.0.3 - JWT token creation and validation
- passport-saml 3.2.4 - SAML 2.0 authentication
- crypto-ts 1.0.2 - Cryptographic operations

**Payment Processing:**
- stripe 14.20.0 - Payment processing and subscriptions

**Utilities:**
- lodash 4.17.21 - Functional utilities
- moment-timezone 0.5.34-0.6.0 - Timezone-aware date handling
- short-uuid 4.2.0-5.2.0 - UUID generation and shortening
- uuid 8.3.2-9.0.0 - UUID v4 generation
- jsonschema 1.4.0-1.5.0 - JSON schema validation
- js-yaml 4.1.1 - YAML parsing
- dotenv 17.2.3 - Environment variable loading
- yaml 2.8.0 - Alternative YAML parser
- xlsx 0.18.5 - Excel file reading/writing
- qrcode 1.5.4 - QR code generation
- written-number 0.11.1 - Number to written format conversion

**Observability & Tracing:**
- @lumigo/tracer 1.80.2-1.100.2 - AWS Lambda distributed tracing and monitoring

**Code Quality & Compilation:**
- @babel/core 7.25.2 - JavaScript transpiler
- @babel/plugin-transform-modules-commonjs 7.24.8 - CommonJS transformation
- @babel/preset-env 7.10.2 - Modern JavaScript support
- @babel/preset-typescript 7.24.7 - TypeScript support
- glob 10.3.10 - File pattern matching
- short-uuid 5.2.0 - UUID shortening library
- typescript-rtti 0.9.6 - Runtime type information

## Configuration

**Environment:**
- Environment variables defined in `.env` and `.env.example`
- Critical configs: `AWS_REGION`, `STAGE`, `DYNAMODB_ENDPOINT`, `RABBITMQ_URL`, `REDIS_HOST`, `JWT_SECRET`, `STRIPE_*` keys
- Runtime config: `NODE_ENV`, `USE_LOCAL` (for local vs AWS mode)
- Database: `PrimaryTable` and `DataTable` names, `STRONGLY_CONSISTENT_READ` flag

**Build:**
- TypeScript config: `tsconfig.json` in each module (types/cdk/lib/api/data-prop/core)
- CDK config: `cdk.json` in core/api/data-prop with CDK context and app paths
- Jest config: In-package configuration with `ts-jest` preset and `globalSetup` hooks

**Local Development:**
- docker-compose.yml - Runs DynamoDB Local, RabbitMQ, Redis, GraphQL, Device API, REST API
- Makefile - Build, test, and deployment commands

## Platform Requirements

**Development:**
- Node.js 16+ runtime
- npm package manager
- Docker & Docker Compose (for local services: DynamoDB, RabbitMQ, Redis)
- AWS credentials (for AWS deployments)
- TypeScript compiler

**Production:**
- AWS Account with appropriate permissions
- AWS CDK CLI for deployment
- Lambda, DynamoDB, S3, Cognito, EventBridge, AppSync provisioned in AWS
- RabbitMQ service (external or AWS MQ)
- Redis for caching (ElastiCache or external)
- Secrets Manager for credentials storage

## Module Dependencies

**Build Order** (dependency hierarchy):
1. `types/` - Shared type definitions, no external module dependencies
2. `cdk/` - CDK constructs, depends on: types
3. `lib/` - Business logic and utilities, depends on: types, cdk
4. `core/` - Core infrastructure stack, depends on: types, cdk, lib
5. `api/` - GraphQL, REST, Device APIs, depends on: types, cdk, lib
6. `data-prop/` - Event-driven data processing, depends on: types, cdk, lib
7. `system-tests/` - Integration tests, depends on: types, cdk, lib
8. `cicd/` - CI/CD pipeline, depends on: all above

---

*Stack analysis: 2026-03-21*
