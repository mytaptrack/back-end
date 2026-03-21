# External Integrations

**Analysis Date:** 2026-03-21

## APIs & External Services

**Payment Processing:**
- Stripe - Subscription and payment processing
  - SDK/Client: `stripe` 14.20.0
  - Auth: API key from environment (not explicitly set in reviewed files, stored in secrets)
  - Used in: `api/src/` for license and subscription management

**Communication & Messaging:**
- Twilio - SMS and voice messaging
  - SDK/Client: `twilio` 5.0.4
  - Auth: `twilioSecret` environment variable pointing to AWS Secrets Manager
  - Implementation: `lib/src/utils/mail-client.ts`
  - Features: Text message sending with phone number normalization
  - Configuration: Phone number stored in Secrets Manager alongside accountSid and authToken

**Authentication:**
- SAML 2.0 - Enterprise single sign-on
  - SDK/Client: `passport-saml` 3.2.4
  - Implementation: `api/src/container/saml-handler.ts`
  - Config: `SAML_CERT`, `SAML_ENTRY_POINT`, `SAML_ISSUER`, `SAML_CALLBACK_URL` environment variables
  - Entry Point: `/auth/saml/login` (POST to `/auth/saml/callback`)
  - Fallback: Defaults to SimpleSAML test endpoint if cert not configured

**AWS Lex (Chatbot):**
- AWS Lex Runtime Service
  - SDK/Client: `@aws-sdk/client-lex-runtime-service` 3.782.0
  - Used in: Device event processing and student notifications

**AWS Pinpoint (Marketing/Communication):**
- AWS Pinpoint - Email and SMS campaign management
  - SDK/Client: `@aws-sdk/client-pinpoint` 3.502.0
  - Used in: Alternative to direct SES/SNS for managed campaigns

## Data Storage

**Primary Database:**
- DynamoDB (AWS)
  - Connection: Table names from `PrimaryTable` and `DataTable` environment variables
  - Client: `@aws-sdk/lib-dynamodb` with document interface
  - Implementation: `lib/src/v2/providers/dynamodb-provider.ts`
  - Features: Transactional support, batch operations, query/scan
  - Local Development: DynamoDB Local at `http://localhost:8000` via docker-compose

**Alternative Database Path (Not Currently Active):**
- MongoDB
  - SDK/Client: `mongodb` 6.19.0
  - Status: Included in dependencies; infrastructure for migration exists in types/lib
  - Not actively used in current API but infrastructure supports it
  - Migration utilities: `lib/src/v2/utils/migration-manager.ts`

**Message Broker:**
- RabbitMQ
  - Connection: `RABBITMQ_URL` environment variable (default: `amqp://mytaptrack:mytaptrack@localhost:5672`)
  - Client: `amqplib` 0.10.3
  - Local Development: RabbitMQ with management UI via docker-compose
  - Used in: Data processing, event handling, asynchronous job processing

**Caching Layer:**
- Redis
  - Connection: `REDIS_HOST` (localhost) and `REDIS_PORT` (6379) environment variables
  - Client: `ioredis` 5.8.2
  - Local Development: Redis 7-alpine via docker-compose
  - Used in: Session management, caching, rate limiting

**File Storage:**
- Amazon S3
  - SDK/Client: `@aws-sdk/client-s3` 3.391.0, `@aws-sdk/s3-request-presigner` 3.400.0
  - Purpose: Data lake, template storage, compliance/audit logs, website hosting
  - Buckets: `dataBucket`, `complianceBucket`, `templateBucket`, `websiteBucket` (from core/lib/aws-stack.ts)
  - Features: Presigned URLs for client downloads, cross-account replication, bucket logging
  - CloudFront: S3 origins via CloudFront CDN for web content

## Authentication & Identity

**Primary Auth Provider:**
- AWS Cognito
  - SDK/Client: `@aws-sdk/client-cognito-identity-provider` 3.391.0+
  - Implementation: `core/lib/aws-stack.ts` - `MttCognito` construct
  - Features: User pool creation, JWT token management, multi-factor auth
  - Used for: Web portal and device authentication

**JWT Token Management:**
- Custom JWT implementation
  - SDK/Client: `jsonwebtoken` 9.0.3
  - Secret Key: `JWT_SECRET` environment variable
  - Token Encryption: `TOKEN_ENCRYPT_KEY` environment variable

**SAML Single Sign-On:**
- Passport SAML strategy
  - SDK/Client: `passport-saml` 3.2.4
  - Endpoints: `/auth/saml/login`, `/auth/saml/callback`
  - Implementation: `api/src/container/saml-handler.ts`

## Monitoring & Observability

**Distributed Tracing:**
- Lumigo
  - SDK/Client: `@lumigo/tracer` 1.80.2-1.100.2
  - Implementation: AWS Lambda function tracing and monitoring
  - Used in: core, api, data-prop modules for observability

**Logs:**
- CloudWatch Logs (AWS)
  - SDK/Client: `@aws-sdk/client-cloudwatch-logs` 3.563.0
  - Log Groups: Created per Lambda function via CDK
  - API: Direct console.log statements in handlers captured by Lambda runtime

**Error Tracking:**
- Not detected - Uses CloudWatch logs and AWS X-Ray (implicit via Lumigo/Lambda)

## Messaging & Notifications

**Email Delivery:**
- Amazon SES (Simple Email Service)
  - SDK/Client: `@aws-sdk/client-ses` 3.391.0
  - Implementation: `lib/src/utils/mail-client.ts`
  - Features: Template management from S3, HTML email delivery
  - Configuration: IAM permissions via CDK

**SMS Messaging:**
- Twilio (Primary)
  - For text message delivery with formatting and carrier handling
  - Credentials from AWS Secrets Manager

- AWS SNS (Secondary/Commented Out)
  - SDK/Client: `@aws-sdk/client-sns` 3.391.0
  - Alternative implementation available but commented in mail-client
  - SMS origin number: `SMSOriginationNumber` environment variable

**Push Notifications:**
- SNS Push
  - SDK/Client: `@aws-sdk/client-sns` 3.391.0
  - ARNs: `pushSnsArns.android` and `pushSnsArns.ios` from config

## Event Processing & Streaming

**Event Bus:**
- AWS EventBridge
  - SDK/Client: `@aws-sdk/client-eventbridge` 3.391.0-3.564.0
  - Implementation: Event publishing for device events, data propagation
  - Used in: `api/src/device/functions/`, `data-prop/` for event-driven architecture

**Step Functions (State Machines):**
- AWS Step Functions
  - SDK/Client: `@aws-sdk/client-sfn` 3.564.0-3.782.0
  - CDK Construct: `@mytaptrack/cdk` step-functions module
  - Used in: Complex workflow orchestration (data processing, reports)

**Message Queues:**
- SQS (AWS Simple Queue Service)
  - SDK/Client: `@aws-sdk/client-sqs` 3.391.0
  - Implementation: Async job processing for reports, notifications
  - Used in: `api/src/v2/student/notification/delete.ts`, `graphql/resolver/mutations/report/`

**RabbitMQ:**
- Message broker for local/alternative event processing
  - Client: `amqplib` 0.10.3
  - Configuration: `RABBITMQ_URL` environment variable
  - Use: Data propagation, event consumption

## Encryption & Secrets

**Key Management:**
- AWS KMS (Key Management Service)
  - SDK/Client: `@aws-sdk/client-kms` 3.391.0
  - Implementation: Field-level encryption via `lib/src/utils/encrypt-details.ts`
  - Used for: Sensitive data encryption at rest

**Secrets Storage:**
- AWS Secrets Manager
  - SDK/Client: `@aws-sdk/client-secrets-manager` 3.391.0-3.556.0
  - Secrets stored: Twilio credentials (accountSid, authToken, phone)
  - Retrieval: `GetSecretValueCommand` in `mail-client.ts`

**Parameter Store:**
- AWS Systems Manager Parameter Store
  - SDK/Client: `@aws-sdk/client-ssm` 3.391.0-3.563.0
  - Use: Configuration and encrypted parameters

## Webhooks & Callbacks

**Incoming Webhooks:**
- Device APIs: `api/src/device/functions/api/` receive device events
- GraphQL Subscriptions: Real-time client updates via AppSync
- EventBridge Events: Triggered by device actions via `api/src/device/functions/events/`

**Outgoing Webhooks:**
- Not detected - Uses AWS services as targets (SNS, SQS, EventBridge)

## API Gateway & CDN

**REST API:**
- AWS API Gateway
  - Implementation: CDK constructs in `api/lib/api-stack.ts`
  - Routes: Express app routed through API Gateway

**GraphQL API:**
- AWS AppSync
  - SDK/Client: `@aws-sdk/client-appsync` 3.409.0, `@aws-appsync/utils` 1.5.0-1.7.0
  - Schema: `api/src/graphql/*.graphql` files
  - Resolvers: `api/src/graphql/resolver/` directory structure
  - Authentication: Cognito, API Key, IAM

**Content Delivery:**
- CloudFront CDN
  - Distribution: Web content served from S3 origins
  - Origins: `/behavior` and `/manage` paths

## Reporting & Analytics

**Timestream (Not Currently Active):**
- AWS Timestream - Time-series data analytics
  - Status: Feature throws "not accessible" error in:
    - `api/src/v2/manage/license/statsGet.ts`
    - `api/src/v2/manage/reports/efficacyPost.ts`
    - `api/src/v2/manage/reports/trackingOverTime.ts`
    - `api/src/device/functions/processing/process-timestream.ts`
  - SDK/Client: Not in dependencies (feature disabled)

**Event Data:**
- DynamoDB Tables
  - PrimaryTable: User and configuration data
  - DataTable: Event and event stream data
  - No external analytics platform integration detected

## IoT Services

**AWS IoT Core:**
- Not explicitly integrated in reviewed code
- References exist in type definitions: `IoTDevice`, `IoTClickType`, `IoTAppDevice`
- Device communication likely through REST/GraphQL APIs rather than MQTT

## Environment-Specific Configuration

**Configuration Files:**
- `config/dev.yml` - Development environment
- `config/dev-min.yml` - Minimal development setup
- `config/dev-dns.yml` - DNS configuration variant
- `config/example_prod.yml` - Production template
- `config/example_test.yml` - Testing template

**Key Configuration Points:**
- AWS regions (primary: `us-west-2` in dev)
- Domain names and subdomains
- S3 bucket names for templates and logs
- SNS ARNs for push notifications
- SMS origin number and secret references
- Stack definitions and deployment options

---

*Integration audit: 2026-03-21*
