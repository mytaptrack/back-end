# GraphQL API Container Service

This directory contains the GraphQL API container service implementation for MyTapTrack's Docker containerization solution.

## Overview

The GraphQL API service provides a containerized GraphQL endpoint that can run alongside or instead of AWS AppSync. It uses the same business logic packages as the Lambda functions, ensuring consistent behavior across deployment environments.

## Components

### GraphQLAPIService

The main service class that extends `ContainerService` and provides:

- Apollo Server integration (when dependencies are installed)
- GraphQL schema loading from existing schema files
- Resolver delegation to business logic services
- Authentication middleware integration
- Query complexity analysis
- Rate limiting
- Comprehensive logging

### GraphQL Context

The `GraphQLContext` interface provides resolvers with access to:

- Service dependencies (data access, message broker, authentication, cache, logger)
- HTTP request/response objects
- User authentication context
- Request correlation and tracking
- Business logic services

### Resolvers

The `GraphQLResolvers` class implements all GraphQL operations by delegating to business logic services:

- **Queries**: User data, student data, license information, reports, apps
- **Mutations**: Data updates, user management, student management
- **Subscriptions**: Real-time updates via message broker
- **Type Resolvers**: Field-level resolvers for complex types

### Plugins

#### Complexity Plugin
- Analyzes query complexity to prevent resource exhaustion
- Configurable complexity limits and scoring
- Blocks overly complex queries

#### Rate Limiting Plugin
- Per-user and per-IP rate limiting
- Configurable time windows and request limits
- Integration with cache providers for distributed rate limiting

#### Logging Plugin
- Structured logging for all GraphQL operations
- Request/response logging with correlation IDs
- Slow query detection and logging
- Error logging with context

## Configuration

```typescript
const config: ServerConfig = {
  port: 4000,
  graphql: {
    schemaPath: './api/src/graphql/schema.graphql',
    playground: true,
    introspection: true,
    complexity: {
      maximumComplexity: 1000,
      scalarCost: 1,
      objectCost: 2,
      listFactor: 10
    },
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100
    },
    logging: {
      logRequests: true,
      logErrors: true,
      logSlowQueries: true,
      slowQueryThreshold: 1000
    }
  }
};
```

## Usage

### Basic Usage

```typescript
import { GraphQLAPIService } from '@mytaptrack/business-logic-core';

const service = new GraphQLAPIService(config);
await service.initialize();

// Service is now running on configured port
// GraphQL endpoint: http://localhost:4000/graphql
```

### Docker Usage

```typescript
const service = new GraphQLAPIService({
  port: parseInt(process.env.PORT || '4000'),
  host: '0.0.0.0',
  graphql: {
    schemaPath: process.env.GRAPHQL_SCHEMA_PATH,
    complexity: {
      maximumComplexity: parseInt(process.env.GRAPHQL_MAX_COMPLEXITY || '1000')
    }
  }
});
```

## Schema Loading

The service loads GraphQL schemas from the existing schema files used by AppSync:

1. Loads the main schema file (`schema.graphql`)
2. Processes `#include` directives to load additional schema files
3. Falls back to a basic schema if files are not found
4. Creates executable schema with resolvers

## Business Logic Integration

Resolvers delegate to business logic services:

```typescript
// Query resolver example
getUser: async (parent, args, context) => {
  return UserOperations.getUserById(
    context.userContext.userId, 
    context.serviceContext
  );
}

// Mutation resolver example
updateUser: async (parent, args, context) => {
  return UserOperations.updateUser(
    context.userContext.userId,
    args.user,
    context.serviceContext
  );
}
```

## Authentication

The service integrates with the authentication abstraction layer:

- Optional authentication for introspection queries
- Required authentication for most operations
- User context extraction from tokens
- Permission and role-based access control

## Error Handling

Comprehensive error handling with:

- GraphQL-compliant error formatting
- Correlation ID tracking
- Structured error logging
- Production-safe error messages

## Monitoring

Built-in monitoring capabilities:

- Health check endpoints (`/health`, `/ready`, `/live`)
- Request/response logging with correlation IDs
- Performance metrics (query duration, complexity)
- Error tracking and alerting

## Development vs Production

### Development Features
- GraphQL Playground enabled
- Introspection enabled
- Detailed error messages
- Schema file watching (when implemented)

### Production Features
- GraphQL Playground disabled
- Introspection disabled
- Sanitized error messages
- Enhanced security headers

## Dependencies

### Required Dependencies (when fully implemented)
```json
{
  "@apollo/server": "^4.9.0",
  "graphql": "^16.8.0",
  "@graphql-tools/schema": "^10.0.0",
  "graphql-query-complexity": "^0.12.0"
}
```

### Current Implementation
The current implementation includes placeholder types and basic functionality that works without the GraphQL dependencies. Install the dependencies above to enable full GraphQL functionality.

## Testing

The service includes comprehensive tests covering:

- Service initialization and configuration
- Schema loading and fallback behavior
- Context creation and request handling
- Error handling and edge cases
- Environment-specific behavior

Run tests with:
```bash
npm test
```

## Future Enhancements

- Real-time subscriptions via WebSocket
- GraphQL federation support
- Advanced caching strategies
- Schema stitching for microservices
- Performance optimization and query batching