# Service Context and Dependency Injection System

This module provides a comprehensive service context and dependency injection system for MyTapTrack that enables the same business logic to run in both AWS serverless and Docker container environments.

## Overview

The service context system consists of several key components:

- **ServiceContext**: Interface that provides all service dependencies (data access, messaging, auth, etc.)
- **ServiceContextFactory**: Creates appropriate context based on environment (AWS vs Docker)
- **ConfigurationLoader**: Loads configuration from environment variables and config files
- **DependencyContainer**: Manages service instances and their dependencies with lifecycle support
- **ServiceLifecycleManager**: Handles graceful startup and shutdown of services
- **ServiceLogger**: Structured logging with correlation ID support

## Key Features

### Environment Abstraction
- Automatically configures services based on environment (AWS or Docker)
- Unified interface for different service implementations
- Configuration-driven service selection

### Dependency Injection
- Singleton and factory service registration
- Automatic service initialization and shutdown
- Circular dependency detection and prevention
- Service lifecycle management

### Configuration Management
- Environment variable support
- Config file loading (JSON, YAML planned)
- Configuration validation
- Environment-specific defaults

### Graceful Lifecycle Management
- Automatic service initialization
- Graceful shutdown handling
- Process signal handling (SIGTERM, SIGINT)
- Custom shutdown handlers

## Usage Examples

### Basic Service Context Creation

```typescript
import { ServiceContextFactory } from '@mytaptrack/business-logic-core';

// Create AWS context
const factory = ServiceContextFactory.getInstance();
const awsContext = await factory.createAWSContext();

// Create Docker context
const dockerContext = await factory.createDockerContext();

// Create context with custom configuration
const customContext = await factory.createContext({
  environment: 'docker',
  database: {
    provider: 'mongodb',
    connectionString: 'mongodb://localhost:27017/mytaptrack'
  }
});
```

### Using Dependency Container

```typescript
import { DependencyContainer } from '@mytaptrack/business-logic-core';

const container = new DependencyContainer();

// Register a singleton service
container.register('userService', async () => {
  return new UserService();
}, { singleton: true });

// Register a factory service (new instance each time)
container.register('requestHandler', async () => {
  return new RequestHandler();
}, { singleton: false });

// Get service instance
const userService = await container.get('userService');

// Register instance directly
container.registerInstance('config', { environment: 'production' });
```

### Service Lifecycle Management

```typescript
import { ServiceLifecycleManager } from '@mytaptrack/business-logic-core';

const lifecycleManager = new ServiceLifecycleManager();

// Initialize with service context
await lifecycleManager.initialize(context);

// Add custom shutdown handler
lifecycleManager.addShutdownHandler(async () => {
  console.log('Performing custom cleanup...');
  // Custom cleanup logic
});

// Graceful shutdown (automatically handles process signals)
await lifecycleManager.shutdown();
```

### Business Service Implementation

```typescript
import { IBusinessService, ServiceContext } from '@mytaptrack/business-logic-core';

export class UserBusinessService implements IBusinessService {
  private context?: ServiceContext;

  async initialize(context: ServiceContext): Promise<void> {
    this.context = context;
    
    // Subscribe to events
    await this.context.messageBroker.subscribe('user.created', async (message) => {
      // Handle user creation event
    });
    
    this.context.logger.info('UserBusinessService initialized');
  }

  async shutdown(): Promise<void> {
    if (this.context) {
      await this.context.messageBroker.unsubscribe('user.created');
      this.context.logger.info('UserBusinessService shutdown');
    }
  }

  async createUser(userData: any): Promise<any> {
    if (!this.context) {
      throw new Error('Service not initialized');
    }

    // Use data access layer
    await this.context.dataAccess.put(userData);
    
    // Publish event
    await this.context.messageBroker.publish('user.created', { userId: userData.userId });
    
    // Log operation
    this.context.logger.info('User created successfully', { userId: userData.userId });
    
    return userData;
  }
}
```

## Configuration

### Environment Variables

The system supports the following environment variables:

#### General
- `ENVIRONMENT`: 'aws' or 'docker'
- `SERVICE_NAME`: Name of the service for logging

#### Database
- `DATABASE_PROVIDER`: 'dynamodb' or 'mongodb'
- `DATABASE_CONNECTION_STRING`: Connection string for database
- `DATABASE_REGION`: AWS region for DynamoDB
- `DYNAMODB_PRIMARY_TABLE`: Primary table name for DynamoDB
- `DYNAMODB_DATA_TABLE`: Data table name for DynamoDB

#### Message Broker
- `MESSAGE_BROKER_PROVIDER`: 'eventbridge' or 'rabbitmq'
- `MESSAGE_BROKER_CONNECTION_STRING`: Connection string for message broker
- `MESSAGE_BROKER_REGION`: AWS region for EventBridge
- `EVENTBRIDGE_BUS_NAME`: EventBridge bus name

#### Authentication
- `AUTH_PROVIDER`: 'cognito', 'jwt', or 'oidc'
- `AUTH_REGION`: AWS region for Cognito
- `COGNITO_USER_POOL_ID`: Cognito User Pool ID
- `COGNITO_CLIENT_ID`: Cognito Client ID
- `JWT_PUBLIC_KEY`: JWT public key for validation
- `JWT_ISSUER`: JWT issuer
- `JWT_AUDIENCE`: JWT audience
- `OIDC_DISCOVERY_URL`: OIDC discovery URL

#### Cache
- `CACHE_PROVIDER`: 'dynamodb' or 'redis'
- `CACHE_CONNECTION_STRING`: Connection string for cache
- `CACHE_REGION`: AWS region for DynamoDB cache
- `CACHE_KEY_PREFIX`: Key prefix for cache entries

### Configuration Files

The system looks for configuration files in the following order:
1. `./config/config.yml`
2. `./config/config.yaml`
3. `./config/config.json`
4. `./config.yml`
5. `./config.yaml`
6. `./config.json`

Example JSON configuration:
```json
{
  "environment": "docker",
  "database": {
    "provider": "mongodb",
    "connectionString": "mongodb://localhost:27017/mytaptrack"
  },
  "messageBroker": {
    "provider": "rabbitmq",
    "connectionString": "amqp://localhost:5672"
  },
  "authentication": {
    "provider": "jwt",
    "publicKey": "...",
    "issuer": "mytaptrack",
    "audience": "mytaptrack-api"
  },
  "cache": {
    "provider": "redis",
    "connectionString": "redis://localhost:6379",
    "keyPrefix": "mytaptrack:"
  }
}
```

## Architecture

### Service Context Interface

The `ServiceContext` interface provides access to all service dependencies:

```typescript
interface ServiceContext {
  dataAccess: IDataAccessLayer;      // Database operations
  messageBroker: IMessageBroker;     // Event publishing/subscribing
  authentication: IAuthenticationProvider; // Token validation
  cache: ICacheProvider;             // Caching operations
  logger: ILogger;                   // Structured logging
  config: ServiceConfig;             // Configuration settings
}
```

### Factory Pattern

The `ServiceContextFactory` uses the factory pattern to create appropriate service implementations based on configuration:

- **AWS Environment**: Uses DynamoDB, EventBridge, Cognito, etc.
- **Docker Environment**: Uses MongoDB, RabbitMQ, Redis, JWT, etc.

### Dependency Injection

The `DependencyContainer` provides:
- Service registration with factory functions
- Singleton and factory service patterns
- Automatic service initialization and shutdown
- Lifecycle management
- Circular dependency prevention

## Testing

The module includes comprehensive tests for all components:

- `service-context-factory.test.ts`: Tests for service context creation
- `configuration-loader.test.ts`: Tests for configuration loading
- `dependency-container.test.ts`: Tests for dependency injection

Run tests with:
```bash
npm test
```

## Integration with Business Logic Packages

This service context system is designed to be used by all business logic packages:

1. **Core Package**: Provides the service context interfaces and implementations
2. **Domain Packages**: Use the service context for data access, messaging, etc.
3. **Lambda Functions**: Create service context and delegate to business operations
4. **Container Services**: Use service context with lifecycle management

## Future Enhancements

- YAML configuration file support
- Additional authentication providers (LDAP, SAML)
- Metrics and monitoring integration
- Service discovery and registration
- Circuit breaker pattern for resilience
- Distributed tracing support