# Container Services

This module provides the base classes and infrastructure for creating containerized services in MyTapTrack. It includes HTTP server setup, middleware management, health checks, and graceful shutdown handling.

## Overview

The container services module enables MyTapTrack to run in Docker containers while maintaining the same business logic as the AWS serverless deployment. It provides:

- **ContainerService**: Abstract base class for all container services
- **Middleware**: Authentication, CORS, error handling, logging, and rate limiting
- **Health Checks**: Database, message broker, cache, and authentication connectivity checks
- **Graceful Shutdown**: Proper cleanup of connections and resources

## Key Components

### ContainerService Base Class

The `ContainerService` abstract class provides common functionality for all containerized services:

```typescript
import { ContainerService, ServerConfig } from '@mytaptrack/business-logic-core';

class MyAPIService extends ContainerService {
  constructor(config: ServerConfig) {
    super(config);
  }

  protected getServiceName(): string {
    return 'my-api-service';
  }

  protected async setupRoutes(): Promise<void> {
    // Define your routes here
    this.addRoute('get', '/api/status', (req, res) => {
      res.json({ status: 'ok' });
    });
  }
}
```

### Middleware

The module includes several middleware components:

#### Authentication Middleware
```typescript
// Require authentication
this.addRoute('get', '/protected', 
  this.getAuthMiddleware().create(),
  handler
);

// Optional authentication
this.addRoute('get', '/optional', 
  this.getAuthMiddleware().createOptional(),
  handler
);

// Require specific role
this.addRoute('post', '/admin', 
  this.getAuthMiddleware().create(),
  this.getAuthMiddleware().requireRole('admin'),
  handler
);
```

#### CORS Middleware
```typescript
// Permissive CORS for development
const corsMiddleware = CorsMiddleware.createPermissive();

// Restrictive CORS for production
const corsMiddleware = CorsMiddleware.createRestrictive([
  'https://app.mytaptrack.com'
]);
```

#### Rate Limiting Middleware
```typescript
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100
};

const rateLimitMiddleware = new RateLimitingMiddleware(
  serviceContext, 
  rateLimitConfig
);
```

### Health Checks

Health checks are automatically configured for:

- **Database**: Checks database connectivity
- **Message Broker**: Verifies message broker connection
- **Cache**: Tests cache provider connectivity
- **Authentication**: Validates authentication provider

Available endpoints:
- `GET /health` - Full health check with all dependencies
- `GET /health/quick` - Quick health check without deep dependency checks
- `GET /ready` - Readiness check for container orchestration
- `GET /live` - Liveness check for container orchestration

### Configuration

Server configuration supports:

```typescript
interface ServerConfig {
  port: number;
  host?: string;
  cors?: CorsConfig;
  middleware?: MiddlewareConfig;
  security?: SecurityConfig;
}
```

Example configuration:
```typescript
const config: ServerConfig = {
  port: 4000,
  host: 'localhost',
  cors: {
    origin: ['http://localhost:3000'],
    credentials: true
  },
  middleware: {
    requestLogging: true,
    compression: true,
    rateLimiting: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 100
    }
  },
  security: {
    helmet: true,
    trustProxy: true
  }
};
```

## Usage Examples

### Basic REST API Service

```typescript
import { ContainerService, ServerConfig } from '@mytaptrack/business-logic-core';

class RestAPIService extends ContainerService {
  protected getServiceName(): string {
    return 'rest-api';
  }

  protected async setupRoutes(): Promise<void> {
    // Public endpoint
    this.addRoute('get', '/api/status', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Protected endpoint
    this.addRoute('get', '/api/users', 
      this.getAuthMiddleware().create(),
      async (req, res) => {
        const user = (req as any).user;
        // Business logic here
        res.json({ users: [], requestedBy: user.email });
      }
    );
  }
}

// Start the service
const config: ServerConfig = { port: 3000 };
const service = new RestAPIService(config);
await service.initialize();
```

### GraphQL API Service

```typescript
class GraphQLService extends ContainerService {
  protected getServiceName(): string {
    return 'graphql-api';
  }

  protected async setupRoutes(): Promise<void> {
    // GraphQL endpoint
    this.addRoute('post', '/graphql',
      this.getAuthMiddleware().createOptional(),
      async (req, res) => {
        const { query, variables } = req.body;
        // GraphQL processing logic
        res.json({ data: { hello: 'World' } });
      }
    );
  }
}
```

### Custom Middleware

```typescript
class CustomService extends ContainerService {
  protected async setupRoutes(): Promise<void> {
    // Add custom middleware
    this.addMiddleware((req, res, next) => {
      res.setHeader('X-Service-Version', '1.0.0');
      next();
    });

    // Routes with custom logic
    this.addRoute('get', '/api/custom', async (req, res) => {
      const serviceContext = (req as any).serviceContext;
      
      // Use service context for business operations
      await serviceContext.cache.set('last-request', Date.now());
      
      res.json({ message: 'Custom response' });
    });
  }
}
```

## Lifecycle Management

The container service handles the complete lifecycle:

1. **Initialization**
   - Create service context
   - Initialize dependencies (database, message broker, cache, auth)
   - Setup middleware
   - Configure health checks
   - Start HTTP server

2. **Runtime**
   - Handle incoming requests
   - Process middleware chain
   - Execute business logic
   - Return responses

3. **Shutdown**
   - Stop accepting new requests
   - Complete in-flight requests
   - Shutdown dependencies
   - Clean up resources

## Error Handling

Comprehensive error handling includes:

- **Service Errors**: Business logic errors with proper HTTP status codes
- **Validation Errors**: Request validation failures
- **Authentication Errors**: Token validation and authorization failures
- **System Errors**: Unexpected errors with proper logging

All errors include correlation IDs for request tracing.

## Security Features

Built-in security features:

- **Helmet**: Security headers
- **CORS**: Cross-origin request handling
- **Rate Limiting**: Request throttling
- **Authentication**: Token validation
- **Authorization**: Role and permission-based access control
- **Request Sanitization**: Sensitive data redaction in logs

## Monitoring and Observability

Comprehensive monitoring includes:

- **Structured Logging**: JSON-formatted logs with correlation IDs
- **Request Tracing**: End-to-end request tracking
- **Performance Metrics**: Response times and throughput
- **Health Monitoring**: Dependency health checks
- **Error Tracking**: Detailed error logging and reporting

## Integration with Business Logic

Container services integrate seamlessly with the business logic packages:

```typescript
// In route handlers
const serviceContext = (req as any).serviceContext;

// Use business logic operations
const userService = new UserService(
  serviceContext.dataAccess,
  serviceContext.messageBroker,
  serviceContext.authentication
);

const user = await userService.createUser(userData);
```

This ensures the same business logic runs in both AWS Lambda functions and Docker containers.