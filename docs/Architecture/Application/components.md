# Application Component Model

## Overview

MyTapTrack follows a modular monorepo architecture with clear separation of concerns across multiple application components. The system is designed as a collection of loosely coupled, independently deployable services that work together to provide comprehensive data management and API capabilities.

## Component Architecture

### Architectural Layers

The application is structured in three primary layers:

1. **Foundation Layer**: Shared libraries and infrastructure constructs
2. **Service Layer**: Core business services and data processing
3. **Interface Layer**: API endpoints and user-facing interfaces

## Foundation Layer Components

### Types Module (`@mytaptrack/types`)

**Purpose**: Central type definitions and data contracts

**Key Responsibilities**:
- TypeScript interface definitions for all domain entities
- JSON schema validation definitions
- Cross-service data contracts
- API request/response type definitions

**Dependencies**: None (foundation component)

**Consumers**: All other components

**Key Artifacts**:
- `src/index.ts` - Main type exports
- `src/utils/` - Utility types and helpers
- `src/v1/` - Legacy API type definitions
- `src/v2/` - Current API type definitions

### CDK Module (`@mytaptrack/cdk`)

**Purpose**: Reusable AWS CDK constructs and infrastructure patterns

**Key Responsibilities**:
- Common CDK construct definitions
- Infrastructure deployment patterns
- Cross-stack resource sharing utilities
- Environment configuration management

**Dependencies**: 
- AWS CDK v2
- `@mytaptrack/types`

**Consumers**: All deployable service stacks

**Key Artifacts**:
- Reusable CDK constructs for common AWS resources
- Cross-stack reference utilities
- Environment-specific configuration patterns

### Library Module (`@mytaptrack/lib`)

**Purpose**: Shared business logic and data access layer

**Key Responsibilities**:
- Data access patterns and repository implementations
- Business logic and domain services
- AWS service client abstractions
- Utility functions and helpers

**Dependencies**:
- `@mytaptrack/types`
- `@mytaptrack/cdk`
- AWS SDK v3 clients

**Consumers**: All service components

**Key Artifacts**:
- `src/index.ts` - Main library exports
- `src/utils/` - Utility functions and helpers
- `src/v2/` - Current business logic implementations

## Service Layer Components

### Core Infrastructure (`@mytaptrack/core`)

**Purpose**: Foundation AWS infrastructure and shared resources

**Key Responsibilities**:
- DynamoDB table definitions and configuration
- Cognito User Pool setup and configuration
- EventBridge custom bus and rule definitions
- S3 bucket configuration for data lake
- Cross-service IAM roles and policies

**Dependencies**:
- `@mytaptrack/cdk`
- `@mytaptrack/lib`
- `@mytaptrack/types`

**Deployment**: Single CDK stack

**Key Resources**:
- DynamoDB tables for all data entities
- Cognito User Pool for authentication
- EventBridge custom event bus
- S3 buckets for file storage and data lake
- KMS keys for encryption
- SSM parameters for configuration

### API Services (`mytaptrack-user-api`)

**Purpose**: All API endpoints and GraphQL services

**Key Responsibilities**:
- GraphQL API implementation using AWS AppSync
- REST API endpoints via API Gateway
- Device communication APIs
- Authentication and authorization logic
- API request/response transformation

**Dependencies**:
- `@mytaptrack/cdk`
- `@mytaptrack/lib`
- `@mytaptrack/types`
- Core infrastructure resources

**Deployment**: Multiple CDK stacks (graphql, api, device)

**Sub-Components**:

#### GraphQL API Stack
- **Purpose**: Real-time data access via GraphQL subscriptions
- **Technology**: AWS AppSync with JavaScript resolvers
- **Key Features**:
  - Real-time subscriptions for live data updates
  - Cognito-based authentication
  - DynamoDB direct resolvers and Lambda resolvers
  - Schema-first development approach

#### REST API Stack  
- **Purpose**: Traditional REST endpoints for web and mobile clients
- **Technology**: API Gateway with Lambda functions
- **Key Features**:
  - RESTful resource endpoints
  - JWT token authentication
  - Request/response validation
  - Rate limiting and throttling

#### Device API Stack
- **Purpose**: IoT device communication and data ingestion
- **Technology**: API Gateway with specialized Lambda functions
- **Key Features**:
  - Device registration and management
  - Telemetry data ingestion
  - Device command and control
  - Secure device authentication

### Data Propagation Service (`@mytaptrack/services-data-propogate`)

**Purpose**: Event-driven data processing and real-time propagation

**Key Responsibilities**:
- EventBridge event processing
- Real-time data transformation and enrichment
- Cross-service data synchronization
- Batch data processing workflows
- Data lake ETL operations

**Dependencies**:
- `@mytaptrack/cdk`
- `@mytaptrack/lib`
- `@mytaptrack/types`
- Core infrastructure EventBridge

**Deployment**: Single CDK stack

**Key Features**:
- Event-driven architecture using EventBridge
- Lambda functions for event processing
- Step Functions for complex workflows
- S3 integration for data lake operations
- DynamoDB Streams processing

## Supporting Components

### System Tests (`system-tests`)

**Purpose**: End-to-end system validation and integration testing

**Key Responsibilities**:
- API endpoint testing across all services
- Integration testing between components
- Performance and load testing
- Environment validation and smoke tests

**Dependencies**: All deployed services

**Key Features**:
- Automated test suite execution
- Environment-specific test configurations
- Test data management and cleanup
- Performance metrics collection

### Configuration Management (`config/`)

**Purpose**: Environment-specific configuration and deployment parameters

**Key Responsibilities**:
- Environment configuration files (dev, test, prod)
- AWS service configuration parameters
- Feature flags and environment variables
- Deployment-specific settings

**Configuration Hierarchy**:
```
config.yml (base configuration)
├── dev.yml (development overrides)
├── test.yml (test environment overrides)
└── prod.yml (production overrides)
```

### Utilities (`utils/`)

**Purpose**: Deployment automation and environment management tools

**Key Responsibilities**:
- Environment setup and teardown scripts
- Configuration deployment automation
- Data export and import utilities
- Development workflow tools

**Key Scripts**:
- `set-env.ts` - Environment variable configuration
- `setup-env.ts` - Initial environment setup
- `export-data.ts` - Data export utilities

## Component Relationships

### Dependency Flow

```
types → cdk → lib → [core, api, data-prop]
                 ↘ system-tests
```

### Build Order

Components must be built in dependency order:

1. **types** - Foundation type definitions
2. **cdk** - Infrastructure constructs  
3. **lib** - Business logic and data access
4. **core** - Infrastructure deployment
5. **api** - API services deployment
6. **data-prop** - Data processing deployment
7. **system-tests** - Integration validation

### Runtime Dependencies

- **API Services** depend on Core infrastructure resources
- **Data Propagation** consumes events from API services
- **System Tests** validate all deployed services
- **All services** use shared libraries for common functionality

## Deployment Architecture

### Multi-Stack Deployment

The application uses a multi-stack CDK deployment pattern:

- **Core Stack**: Foundation infrastructure (databases, authentication, messaging)
- **GraphQL Stack**: AppSync GraphQL API and resolvers
- **API Stack**: REST API Gateway and Lambda functions
- **Device Stack**: Device-specific API endpoints
- **Data Propagation Stack**: Event processing and data workflows

### Environment Isolation

Each environment (dev, test, prod) maintains:
- Separate AWS accounts or regions
- Environment-specific configuration
- Isolated data stores and resources
- Independent deployment pipelines

### Cross-Stack Resource Sharing

Components share resources through:
- CDK cross-stack references
- SSM Parameter Store for configuration
- EventBridge for event communication
- Shared IAM roles and policies

## Scalability and Performance

### Horizontal Scaling

- **Lambda Functions**: Automatic scaling based on demand
- **DynamoDB**: On-demand scaling for read/write capacity
- **API Gateway**: Built-in request throttling and caching
- **EventBridge**: Automatic event routing and scaling

### Performance Optimization

- **GraphQL**: Efficient data fetching with resolver optimization
- **Caching**: API Gateway response caching
- **Connection Pooling**: Optimized database connections
- **Batch Processing**: Efficient bulk data operations

### Monitoring and Observability

- **CloudWatch**: Metrics and logging for all components
- **X-Ray**: Distributed tracing across services
- **Lumigo**: Enhanced observability and debugging
- **Custom Metrics**: Business-specific monitoring

## Security Architecture

### Authentication and Authorization

- **Cognito User Pools**: Centralized user authentication
- **JWT Tokens**: Stateless authentication across services
- **IAM Roles**: Service-to-service authorization
- **API Keys**: Device and third-party authentication

### Data Protection

- **Encryption at Rest**: KMS encryption for all data stores
- **Encryption in Transit**: TLS for all API communications
- **Data Isolation**: Tenant-based data segregation
- **Access Controls**: Fine-grained permissions per resource

### Network Security

- **VPC**: Isolated network environments
- **Security Groups**: Restrictive network access rules
- **WAF**: Web application firewall for API protection
- **Private Subnets**: Backend services isolation