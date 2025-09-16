# Technology Stack

## Core Technologies

- **Runtime**: Node.js 16+
- **Language**: TypeScript (ES2022 target)
- **Infrastructure**: AWS CDK v2
- **Cloud Platform**: AWS

## Key AWS Services

- **Compute**: Lambda functions, AppSync GraphQL
- **Storage**: DynamoDB, S3, Timestream
- **Authentication**: Cognito User Pools
- **Messaging**: EventBridge, SNS, SQS
- **API**: API Gateway, AppSync
- **IoT**: AWS IoT Core
- **Monitoring**: CloudWatch

## Build System & Dependencies

### Package Management
- Uses `npm` with `package-lock.json`
- Local file dependencies between modules (`file:../module`)
- Shared types package (`@mytaptrack/types`)

### Key Libraries
- **AWS SDK v3**: All AWS service clients
- **GraphQL**: `graphql`, `@aws-appsync/utils`
- **Utilities**: `lodash`, `moment-timezone`, `uuid`, `short-uuid`
- **Testing**: `jest` with coverage
- **Monitoring**: `@lumigo/tracer`

## Common Commands

### Full Installation & Deployment
```bash
make install                    # Install deps, build, configure, deploy all
make install STAGE=test         # Deploy to specific environment
```

### Development Workflow
```bash
make install-deps              # Install all dependencies
make build                     # Build all TypeScript projects
make deploy                    # Deploy all stacks to AWS
make test                      # Run system tests
```

### Individual Stack Operations
```bash
make deploy-core              # Deploy core infrastructure
make deploy-graphql           # Deploy GraphQL API
make deploy-api              # Deploy REST APIs
make deploy-device           # Deploy device APIs
make deploy-data-prop        # Deploy data propagation
```

### Environment Management
```bash
make set-env STAGE=dev        # Set environment variables
make del-env STAGE=dev        # Delete environment
make configure-env            # Configure environment settings
```

### Cleanup
```bash
make clean                    # Remove build artifacts and node_modules
make uninstall               # Destroy all AWS stacks
```

## TypeScript Configuration

- **Target**: ES2022 (API), ES2018 (Core)
- **Module**: CommonJS
- **Decorators**: Enabled for CDK constructs
- **Source Maps**: Enabled for debugging
- **Type Roots**: Includes `@mytaptrack` custom types