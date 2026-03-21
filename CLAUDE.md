# MyTapTrack Back-End

## Product Overview

MyTapTrack back-end is a multi-stack AWS CDK application providing data storage and API services:

- **Data Management**: DynamoDB for operational data, S3 data lake
- **API Services**: GraphQL (AppSync), REST (API Gateway), device-specific APIs
- **Real-time Processing**: Event-driven data propagation via AWS EventBridge
- **User Management**: Cognito-based authentication and authorization
- **Device Integration**: IoT device connectivity via AWS IoT Core
- **Reporting**: Data analytics and reporting

## Project Structure

Modular monorepo — modules must be built in dependency order:

```
types → cdk → lib → [core, api, data-prop]
```

```
/
├── types/          # Shared TypeScript type definitions (@mytaptrack/types)
├── cdk/            # Reusable CDK constructs and utilities
├── lib/            # Business logic, data access layer, shared utilities
├── core/           # Foundation infrastructure (DynamoDB, Cognito, EventBridge)
├── api/            # All API services (GraphQL, REST, device communication)
├── data-prop/      # Event-driven data processing and propagation
├── system-tests/   # End-to-end system validation
├── cicd/           # CI/CD pipeline infrastructure
├── config/         # Environment configuration files (*.yml)
└── utils/          # Deployment and environment utilities
```

## Technology Stack

- **Runtime**: Node.js 16+
- **Language**: TypeScript (ES2022 target, CommonJS modules)
- **Infrastructure**: AWS CDK v2
- **Package Manager**: npm (use `npm i`, not `npm ci`)
- **AWS Services**: Lambda, DynamoDB, S3, Timestream, Cognito, EventBridge, SNS, SQS, API Gateway, AppSync, IoT Core, CloudWatch
- **Key Libraries**: AWS SDK v3, graphql, @aws-appsync/utils, lodash, moment-timezone, uuid, jest, @lumigo/tracer

## Common Commands

```bash
# Full installation and deployment
make install                    # Install deps, build, configure, deploy all
make install STAGE=test         # Deploy to specific environment

# Development workflow
make install-deps               # Install all dependencies
make build                      # Build all TypeScript projects
make deploy                     # Deploy all stacks to AWS
make test                       # Run system tests

# Individual stack deployment
make deploy-core                # Core infrastructure
make deploy-graphql             # GraphQL API
make deploy-api                 # REST APIs
make deploy-device              # Device APIs
make deploy-data-prop           # Data propagation

# Environment management
make set-env STAGE=dev          # Set environment variables
make del-env STAGE=dev          # Delete environment
make configure-env              # Configure environment settings
make clean                      # Remove build artifacts and node_modules
make uninstall                  # Destroy all AWS stacks
```

## Conventions

- Each module has its own `package.json` with local file dependencies (`file:../module`)
- TypeScript source in `src/` directories; CDK infrastructure in `lib/` directories
- Build outputs in `dist/` or `.build/`
- GraphQL schema in `api/src/graphql/*.graphql`, resolvers in `api/src/graphql/resolver/`
- Lambda device functions in `api/src/device/functions/`
- Data processing functions in `data-prop/src/functions/`
- Environment configs in `config/*.yml`, CDK context in `*/cdk.json`
- Decorators enabled for CDK constructs
- Source maps enabled for debugging
