# Application Architecture

The application architecture perspective describes the structure and behavior of applications that support business functions.

## Contents

- [Application Component Model](./components.md)
- [Integration Patterns](./integration.md)
- [Application Lifecycle](./lifecycle.md)
- [Event-Driven Architecture](./event-driven-architecture.md)

## Overview

MyTapTrack follows a modular monorepo architecture with clear separation of concerns:

## Core Application Components

### Shared Libraries
- **types/**: Central TypeScript type definitions
- **cdk/**: Reusable CDK constructs and infrastructure patterns
- **lib/**: Business logic and data access layer

### Deployable Services
- **core/**: Foundation infrastructure (databases, Cognito, EventBridge)
- **api/**: All API services (GraphQL, REST, device communication)
- **data-prop/**: Event-driven data processing and propagation

### Supporting Components
- **system-tests/**: Integration and system-level testing
- **config/**: Environment-specific configuration
- **utils/**: Environment management and deployment scripts

## Integration Patterns

The system uses multiple integration patterns:
- **Event-driven**: EventBridge for real-time data propagation
- **API Gateway**: REST and GraphQL endpoints
- **Direct Integration**: DynamoDB and S3 access patterns