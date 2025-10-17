# Application Lifecycle and Build Dependencies

## Overview

The MyTapTrack application follows a structured build and deployment lifecycle that ensures proper dependency management, consistent environments, and reliable deployments across multiple AWS stacks.

## Build Lifecycle

### Dependency Chain

The application components must be built in a specific order due to their interdependencies:

```
1. types     → Foundation type definitions
2. cdk       → Infrastructure constructs
3. lib       → Business logic and data access
4. core      → Infrastructure deployment
5. api       → API services deployment
6. data-prop → Data processing deployment
7. system-tests → Integration validation
```

### Build Process Flow

#### Phase 1: Foundation Build
```bash
# 1. Build type definitions
cd types && npm ci && npm run build

# 2. Build CDK constructs
cd cdk && npm ci && npm run build

# 3. Build shared library
cd lib && npm ci && npm run build
```

**Outputs**:
- `types/dist/` - Compiled TypeScript definitions
- `cdk/dist/` - CDK construct libraries
- `lib/dist/` - Business logic modules

#### Phase 2: Service Preparation
```bash
# Install dependencies for all services
cd core && npm ci
cd api && npm ci
cd data-prop && npm ci
cd system-tests && npm ci
```

**Purpose**: Install npm dependencies without building, preparing for deployment

#### Phase 3: Infrastructure Deployment
```bash
# Deploy foundation infrastructure
cd core && cdk deploy --require-approval never

# Deploy API services (order matters)
cd api && cdk deploy --require-approval never graphql
cd api && cdk deploy --require-approval never api
cd api && cdk deploy --require-approval never device

# Deploy data processing
cd data-prop && cdk deploy --require-approval never
```

**Outputs**:
- AWS CloudFormation stacks
- Deployed Lambda functions
- Configured AWS resources

#### Phase 4: Validation
```bash
# Run system tests
cd system-tests && npm run envSetup && npm test
```

**Purpose**: Validate end-to-end functionality

## Dependency Management

### Package Dependencies

#### Local File Dependencies
The monorepo uses local file dependencies to ensure version consistency:

```json
{
  "dependencies": {
    "@mytaptrack/types": "file:../types",
    "@mytaptrack/cdk": "file:../cdk",
    "@mytaptrack/lib": "file:../lib"
  }
}
```

#### Dependency Resolution Order
1. **types** has no internal dependencies
2. **cdk** depends on types
3. **lib** depends on types and cdk
4. **Services** depend on types, cdk, and lib

### Build Automation

#### Makefile Targets

The root makefile provides automated build orchestration:

```makefile
# Full installation and deployment
install: install-deps build configure-env set-env deploy

# Install dependencies in correct order
install-deps:
    cd types && npm ci && npm run build
    cd cdk && npm ci && npm run build
    cd lib && npm ci && npm run build
    cd core && npm ci
    cd api && npm ci
    cd data-prop && npm ci
    cd system-tests && npm ci

# Build all TypeScript projects
build:
    cd types && npm run build
    cd lib && npm run build

# Deploy all services in correct order
deploy: set-env deploy-core deploy-data-prop deploy-graphql deploy-api deploy-device
```

#### Individual Service Builds

Each service can be built independently after dependencies are satisfied:

```bash
# Core infrastructure
make deploy-core

# GraphQL API
make deploy-graphql

# REST API
make deploy-api

# Device API
make deploy-device

# Data propagation
make deploy-data-prop
```

## Environment Management

### Configuration Lifecycle

#### Environment Setup Process
1. **Base Configuration**: Load `config/config.yml`
2. **Environment Override**: Apply `config/{env}.yml`
3. **Region Override**: Apply `config/{env}.{region}.yml` (if exists)
4. **Parameter Deployment**: Push to AWS Parameter Store
5. **Environment Variables**: Set local development variables

#### Configuration Hierarchy
```
config.yml (base)
├── dev.yml (development environment)
├── test.yml (test environment)
└── prod.yml (production environment)
```

#### Environment Commands
```bash
# Set up environment configuration
make configure-env

# Deploy environment variables to AWS
make set-env STAGE=dev

# Remove environment
make del-env STAGE=dev
```

### Environment Isolation

#### Development Environment
- **Purpose**: Local development and testing
- **Resources**: Shared development AWS account
- **Configuration**: `config/dev.yml`
- **Deployment**: Manual or automated via makefile

#### Test Environment
- **Purpose**: Integration testing and QA validation
- **Resources**: Dedicated test AWS account/region
- **Configuration**: `config/test.yml`
- **Deployment**: Automated via CI/CD pipeline

#### Production Environment
- **Purpose**: Live customer-facing services
- **Resources**: Production AWS account with high availability
- **Configuration**: `config/prod.yml`
- **Deployment**: Controlled release process with approvals

## Deployment Architecture

### Multi-Stack Deployment Pattern

#### Stack Dependencies
```
Core Stack (foundation)
├── GraphQL Stack (depends on Core)
├── API Stack (depends on Core)
├── Device Stack (depends on Core)
└── Data Propagation Stack (depends on Core)
```

#### Cross-Stack Resource Sharing

**Core Stack Exports**:
- DynamoDB table names and ARNs
- Cognito User Pool ID and ARN
- EventBridge custom bus ARN
- S3 bucket names and ARNs
- IAM role ARNs

**Consumer Stack Imports**:
- Reference exported resources via CDK cross-stack references
- Access configuration via SSM Parameter Store
- Use shared IAM roles for service-to-service communication

### Deployment Strategies

#### Blue-Green Deployment
- **GraphQL API**: AppSync schema updates with backward compatibility
- **REST API**: API Gateway stage-based deployments
- **Lambda Functions**: Alias-based traffic shifting
- **Database**: Schema migrations with rollback capability

#### Rolling Updates
- **Lambda Functions**: Gradual traffic shifting using aliases
- **API Gateway**: Canary deployments for new versions
- **Configuration**: Gradual parameter updates across instances

#### Rollback Procedures
- **Infrastructure**: CloudFormation stack rollback
- **Application Code**: Lambda function version rollback
- **Configuration**: Parameter Store version restoration
- **Database**: Migration rollback scripts

## Development Workflow

### Local Development Setup

#### Prerequisites
- Node.js 16+
- AWS CLI configured
- AWS CDK CLI installed
- Docker (for local testing)

#### Setup Process
```bash
# 1. Clone repository
git clone <repository-url>

# 2. Install and build all dependencies
make install-deps

# 3. Configure environment
make configure-env

# 4. Set environment variables
make set-env STAGE=dev

# 5. Deploy to development environment
make deploy
```

### Development Iteration

#### Code Changes
1. **Modify Source Code**: Edit TypeScript files in appropriate module
2. **Build Dependencies**: Run `npm run build` in changed module
3. **Deploy Changes**: Use `cdk deploy --hotswap` for rapid iteration
4. **Test Changes**: Run relevant test suites

#### Hot Reloading
```bash
# GraphQL API with hot reloading
cd api && npm run start

# Data propagation with hot reloading
cd data-prop && npm run start
```

### Testing Lifecycle

#### Unit Testing
- **Location**: Each module's `src/` directory
- **Framework**: Jest with TypeScript support
- **Coverage**: Automated coverage reporting
- **Execution**: `npm test` in each module

#### Integration Testing
- **Location**: `system-tests/` directory
- **Scope**: End-to-end API and service testing
- **Environment**: Deployed AWS resources
- **Execution**: `make test`

#### Performance Testing
- **Tools**: Custom load testing scripts
- **Metrics**: Response times, throughput, error rates
- **Environments**: Test and staging environments
- **Automation**: Integrated into CI/CD pipeline

## Monitoring and Observability

### Build Monitoring

#### Build Metrics
- **Build Duration**: Time for each phase and overall build
- **Success Rate**: Percentage of successful builds
- **Failure Analysis**: Common failure points and causes
- **Dependency Resolution**: Time spent resolving dependencies

#### Deployment Monitoring
- **Stack Deployment Time**: Duration for each CDK stack
- **Resource Creation**: Success/failure of individual resources
- **Cross-Stack Dependencies**: Validation of resource references
- **Rollback Events**: Frequency and causes of rollbacks

### Runtime Monitoring

#### Application Metrics
- **Lambda Performance**: Duration, memory usage, error rates
- **API Performance**: Response times, request volumes, error rates
- **Database Performance**: Read/write latencies, throttling events
- **Event Processing**: EventBridge message volumes and processing times

#### Infrastructure Monitoring
- **Resource Utilization**: CPU, memory, storage usage
- **Cost Monitoring**: AWS service costs and optimization opportunities
- **Security Monitoring**: Access patterns, authentication failures
- **Compliance Monitoring**: Configuration drift, policy violations

## Troubleshooting and Maintenance

### Common Build Issues

#### Dependency Resolution Failures
- **Cause**: Version conflicts or missing dependencies
- **Solution**: Clear node_modules and reinstall in correct order
- **Prevention**: Lock file maintenance and dependency auditing

#### CDK Deployment Failures
- **Cause**: Resource conflicts, permission issues, or configuration errors
- **Solution**: Check CloudFormation events and IAM permissions
- **Prevention**: Validate templates and test in development environment

#### Cross-Stack Reference Failures
- **Cause**: Stack deployment order or missing exports
- **Solution**: Verify stack dependencies and export/import configuration
- **Prevention**: Automated dependency validation in CI/CD

### Maintenance Procedures

#### Dependency Updates
1. **Security Updates**: Regular security patch application
2. **Version Upgrades**: Planned upgrades with testing
3. **Compatibility Testing**: Validate changes across all modules
4. **Rollback Planning**: Prepare rollback procedures for failed updates

#### Environment Maintenance
1. **Resource Cleanup**: Remove unused resources and stacks
2. **Configuration Updates**: Apply configuration changes across environments
3. **Backup Verification**: Validate backup and restore procedures
4. **Disaster Recovery**: Test disaster recovery procedures

#### Performance Optimization
1. **Build Optimization**: Improve build times and efficiency
2. **Deployment Optimization**: Reduce deployment duration
3. **Resource Optimization**: Right-size AWS resources
4. **Cost Optimization**: Identify and eliminate waste