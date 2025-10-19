# Design Document

## Overview

The Docker containerization solution will transform MyTapTrack from an AWS-native serverless application into a portable, containerized system that can run in any Docker-compatible environment. The design leverages the existing data access abstraction layer and extends it with business logic abstraction, message broker abstraction, and authentication abstraction to create a unified codebase that supports both AWS serverless and Docker container deployments.

The solution follows a microservices architecture where each major functional area (GraphQL API, REST API, data processing, etc.) runs in separate containers, communicating through RabbitMQ message broker and sharing data through MongoDB. Business logic is extracted into reusable npm packages that can be consumed by both Lambda functions and containerized services.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Client Applications                                 │
│                    (Web App, Mobile Apps, IoT Devices)                         │
└─────────────────────────────┬───────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────────────────┐
│                          Load Balancer / Ingress                                │
│                        (nginx, Traefik, or cloud LB)                           │
└─────────────────────────────┬───────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌─────────▼─────────┐  ┌───────▼────────┐
│   GraphQL API  │  │    REST API       │  │   Device API   │
│   Container    │  │   Container       │  │   Container    │
└───────┬────────┘  └─────────┬─────────┘  └───────┬────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────────────────┐
│                        Business Logic Layer                                     │
│                     (Shared npm packages)                                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │   User      │ │  Student    │ │   License   │ │   Report    │ │    App    │ │
│  │  Service    │ │  Service    │ │   Service   │ │   Service   │ │  Service  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌─────────▼─────────┐  ┌───────▼────────┐
│   Data Access  │  │   Message Broker  │  │ Authentication │
│   Abstraction  │  │   Abstraction     │  │  Abstraction   │
└───────┬────────┘  └─────────┬─────────┘  └───────┬────────┘
        │                     │                     │
┌───────▼────────┐  ┌─────────▼─────────┐  ┌───────▼────────┐
│    MongoDB     │  │    RabbitMQ       │  │   Auth Provider│
│   Container    │  │   Container       │  │  (Keycloak/    │
│                │  │                   │  │   Auth0/etc)   │
└────────────────┘  └───────────────────┘  └────────────────┘
```

### Container Architecture

```
Docker Compose Stack:
├── nginx-proxy (Load Balancer)
├── graphql-api (GraphQL Service)
├── rest-api (REST API Service)  
├── device-api (Device Communication)
├── data-processor (Event Processing)
├── rabbitmq (Message Broker)
├── mongodb (Database)
├── redis (Caching & Sessions)
├── keycloak (Authentication - Optional)
└── monitoring (Prometheus/Grafana - Optional)
```

## Components and Interfaces

### Business Logic Abstraction

The core innovation is extracting business logic into framework-agnostic packages that can be consumed by both Lambda functions and containerized services.

```typescript
// Modular business logic package structure for optimal Lambda bundle sizes
@mytaptrack/business-logic-core/          // Shared interfaces and types only
├── interfaces/
├── types/
└── errors/

@mytaptrack/business-logic-user/          // User-specific operations only
├── user-operations.ts
├── user-validation.ts
└── types.ts

@mytaptrack/business-logic-student/       // Student-specific operations only
├── student-operations.ts
├── student-validation.ts
└── types.ts

@mytaptrack/business-logic-license/       // License-specific operations only
├── license-operations.ts
├── license-validation.ts
└── types.ts

@mytaptrack/business-logic-report/        // Report-specific operations only
├── report-operations.ts
├── report-validation.ts
└── types.ts

@mytaptrack/business-logic-app/           // App-specific operations only
├── app-operations.ts
├── app-validation.ts
└── types.ts

@mytaptrack/business-logic-device/        // Device-specific operations only
├── device-operations.ts
├── device-validation.ts
└── types.ts
```

#### Business Logic Interface

```typescript
// Base service interface
interface IBusinessService {
  initialize(context: ServiceContext): Promise<void>;
  shutdown(): Promise<void>;
}

// Service context provides environment-specific dependencies
interface ServiceContext {
  dataAccess: IDataAccessLayer;
  messageBroker: IMessageBroker;
  authentication: IAuthenticationProvider;
  cache: ICacheProvider;
  logger: ILogger;
  config: ServiceConfig;
}

// Modular service approach for Lambda optimization
// Each Lambda only imports the specific operations it needs

// @mytaptrack/business-logic-user package
export class UserOperations {
  static async createUser(
    userData: CreateUserInput,
    context: ServiceContext
  ): Promise<User> {
    // Focused business logic for user creation only
    const user = await context.dataAccess.put(userData);
    await context.messageBroker.publish('user.created', { userId: user.id });
    return user;
  }

  static async getUserById(
    userId: string,
    context: ServiceContext
  ): Promise<User | null> {
    return context.dataAccess.get({ pk: `U#${userId}`, sk: 'P' });
  }
}

// Lambda function only imports what it needs
import { UserOperations } from '@mytaptrack/business-logic-user';
export const createUserHandler = async (event) => {
  const context = await createServiceContext();
  return UserOperations.createUser(event.userData, context);
};
```

### Message Broker Abstraction

Provides unified interface for both EventBridge (AWS) and RabbitMQ (Docker).

```typescript
interface IMessageBroker {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(eventType: string, payload: any, options?: PublishOptions): Promise<void>;
  subscribe(eventType: string, handler: MessageHandler, options?: SubscribeOptions): Promise<void>;
  unsubscribe(eventType: string): Promise<void>;
}

interface MessageHandler {
  (message: BrokerMessage): Promise<void>;
}

interface BrokerMessage {
  eventType: string;
  payload: any;
  metadata: {
    messageId: string;
    timestamp: Date;
    source: string;
    correlationId?: string;
  };
}

// EventBridge implementation (AWS)
class EventBridgeMessageBroker implements IMessageBroker {
  async publish(eventType: string, payload: any): Promise<void> {
    await this.eventBridge.putEvents({
      Entries: [{
        Source: 'mytaptrack',
        DetailType: eventType,
        Detail: JSON.stringify(payload)
      }]
    }).promise();
  }
}

// RabbitMQ implementation (Docker)
class RabbitMQMessageBroker implements IMessageBroker {
  async publish(eventType: string, payload: any): Promise<void> {
    const exchange = 'mytaptrack.events';
    const routingKey = eventType.replace('.', '_');
    
    await this.channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true }
    );
  }
}
```

### Authentication Abstraction

Unified authentication interface supporting both Cognito and external identity providers.

```typescript
interface IAuthenticationProvider {
  validateToken(token: string): Promise<AuthenticationResult>;
  getUserContext(token: string): Promise<UserContext>;
  refreshToken(refreshToken: string): Promise<TokenResult>;
}

interface UserContext {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  groups: string[];
  customAttributes: Record<string, any>;
}

interface AuthenticationResult {
  valid: boolean;
  userContext?: UserContext;
  error?: string;
}

// Cognito implementation (AWS)
class CognitoAuthenticationProvider implements IAuthenticationProvider {
  async validateToken(token: string): Promise<AuthenticationResult> {
    try {
      const decoded = jwt.verify(token, this.cognitoPublicKey);
      const userContext = await this.extractUserContext(decoded);
      return { valid: true, userContext };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

// Generic JWT/OIDC implementation (Docker)
class JWTAuthenticationProvider implements IAuthenticationProvider {
  async validateToken(token: string): Promise<AuthenticationResult> {
    try {
      const decoded = jwt.verify(token, this.publicKey);
      const userContext = await this.extractUserContext(decoded);
      return { valid: true, userContext };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}
```

### Container Service Architecture

Each API service runs in its own container with the same business logic.

```typescript
// Container service base class
abstract class ContainerService {
  protected businessServices: Map<string, IBusinessService> = new Map();
  protected context: ServiceContext;

  async initialize(): Promise<void> {
    // Initialize service context based on environment
    this.context = await this.createServiceContext();
    
    // Initialize business services
    await this.initializeBusinessServices();
    
    // Start HTTP server
    await this.startServer();
  }

  private async createServiceContext(): Promise<ServiceContext> {
    const config = await this.loadConfiguration();
    
    return {
      dataAccess: DatabaseProviderFactory.create(config.database),
      messageBroker: MessageBrokerFactory.create(config.messageBroker),
      authentication: AuthProviderFactory.create(config.authentication),
      cache: CacheProviderFactory.create(config.cache),
      logger: LoggerFactory.create(config.logging),
      config
    };
  }
}

// GraphQL API service
class GraphQLAPIService extends ContainerService {
  private apolloServer: ApolloServer;

  async initializeBusinessServices(): Promise<void> {
    this.businessServices.set('user', new UserService(
      this.context.dataAccess,
      this.context.messageBroker,
      this.context.authentication
    ));
    
    this.businessServices.set('student', new StudentService(
      this.context.dataAccess,
      this.context.messageBroker,
      this.context.authentication
    ));
    
    // ... other services
  }

  async startServer(): Promise<void> {
    this.apolloServer = new ApolloServer({
      typeDefs: await this.loadGraphQLSchema(),
      resolvers: this.createResolvers(),
      context: ({ req }) => ({
        ...this.context,
        request: req,
        businessServices: this.businessServices
      })
    });

    await this.apolloServer.listen({ port: process.env.PORT || 4000 });
  }
}
```

## Data Models

### Unified Data Models

The existing data models from the current system will be maintained, leveraging the data access abstraction layer to work with both DynamoDB and MongoDB.

```typescript
// Existing models work unchanged
interface UserDataStorage extends BaseStorageModel {
  pk: string;           // U#{userId}
  sk: string;           // P
  userId: string;
  email: string;
  license: string;
  // ... existing fields
}

interface StudentDataStorage extends BaseStorageModel {
  pk: string;           // S#{studentId}
  sk: string;           // P
  studentId: string;
  userId: string;
  // ... existing fields
}
```

### Configuration Models

```typescript
interface DockerDeploymentConfig {
  environment: 'docker' | 'aws';
  
  database: {
    provider: 'mongodb';
    mongodb: {
      connectionString: string;
      database: string;
      collections: {
        primary: string;
        data: string;
      };
    };
  };
  
  messageBroker: {
    provider: 'rabbitmq';
    rabbitmq: {
      connectionString: string;
      exchanges: {
        events: string;
        deadLetter: string;
      };
    };
  };
  
  authentication: {
    provider: 'jwt' | 'oidc' | 'keycloak';
    jwt?: {
      publicKey: string;
      issuer: string;
      audience: string;
    };
    oidc?: {
      discoveryUrl: string;
      clientId: string;
      clientSecret: string;
    };
  };
  
  cache: {
    provider: 'redis';
    redis: {
      connectionString: string;
      keyPrefix: string;
    };
  };
  
  services: {
    graphqlApi: {
      port: number;
      cors: string[];
    };
    restApi: {
      port: number;
      cors: string[];
    };
    deviceApi: {
      port: number;
    };
  };
}
```

## Error Handling

### Unified Error System

Extends the existing error system to work across container boundaries.

```typescript
abstract class ServiceError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  abstract readonly retryable: boolean;
  
  constructor(
    message: string,
    public readonly correlationId?: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
  }
}

class BusinessLogicError extends ServiceError {
  readonly code = 'BUSINESS_LOGIC_ERROR';
  readonly statusCode = 400;
  readonly retryable = false;
}

class ServiceUnavailableError extends ServiceError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly statusCode = 503;
  readonly retryable = true;
}

// Error handling middleware for containers
class ErrorHandler {
  static handleContainerError(error: Error, req: Request, res: Response): void {
    const correlationId = req.headers['x-correlation-id'] as string;
    
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          correlationId,
          retryable: error.retryable
        }
      });
    } else {
      // Log unexpected errors
      logger.error('Unexpected error', { error, correlationId });
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
          correlationId,
          retryable: false
        }
      });
    }
  }
}
```

## Testing Strategy

### Multi-Environment Testing

```typescript
// Abstract test suite for business logic
abstract class BusinessLogicTestSuite {
  protected context: ServiceContext;
  
  abstract createTestContext(): Promise<ServiceContext>;
  
  async setup(): Promise<void> {
    this.context = await this.createTestContext();
  }
  
  async testUserOperations(): Promise<void> {
    const userService = new UserService(
      this.context.dataAccess,
      this.context.messageBroker,
      this.context.authentication
    );
    
    // Test business logic
    const user = await userService.createUser({
      email: 'test@example.com',
      license: 'test-license'
    });
    
    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
  }
}

// AWS test implementation
class AWSTestSuite extends BusinessLogicTestSuite {
  async createTestContext(): Promise<ServiceContext> {
    return {
      dataAccess: new DynamoDBProvider(testConfig.aws.dynamodb),
      messageBroker: new EventBridgeMessageBroker(testConfig.aws.eventbridge),
      authentication: new CognitoAuthenticationProvider(testConfig.aws.cognito),
      // ... other providers
    };
  }
}

// Docker test implementation  
class DockerTestSuite extends BusinessLogicTestSuite {
  async createTestContext(): Promise<ServiceContext> {
    return {
      dataAccess: new MongoDBProvider(testConfig.docker.mongodb),
      messageBroker: new RabbitMQMessageBroker(testConfig.docker.rabbitmq),
      authentication: new JWTAuthenticationProvider(testConfig.docker.jwt),
      // ... other providers
    };
  }
}
```

### Container Integration Testing

```typescript
// Docker Compose test environment
class ContainerIntegrationTest {
  private compose: DockerCompose;
  
  async setup(): Promise<void> {
    // Start test containers
    await this.compose.up(['mongodb', 'rabbitmq', 'redis']);
    
    // Wait for services to be ready
    await this.waitForServices();
    
    // Seed test data
    await this.seedTestData();
  }
  
  async testFullWorkflow(): Promise<void> {
    // Test complete user workflow across containers
    const response = await this.makeGraphQLRequest(`
      mutation CreateUser($input: CreateUserInput!) {
        createUser(input: $input) {
          id
          email
        }
      }
    `, {
      input: { email: 'test@example.com', license: 'test' }
    });
    
    expect(response.data.createUser).toBeDefined();
    
    // Verify message was published
    await this.verifyMessagePublished('user.created');
    
    // Verify data was stored
    await this.verifyDataStored('users', response.data.createUser.id);
  }
}
```

## Deployment Strategy

### Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  nginx-proxy:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - graphql-api
      - rest-api
      - device-api

  graphql-api:
    build:
      context: .
      dockerfile: containers/graphql-api/Dockerfile
    environment:
      - NODE_ENV=production
      - DATABASE_PROVIDER=mongodb
      - MESSAGE_BROKER_PROVIDER=rabbitmq
      - AUTH_PROVIDER=jwt
    depends_on:
      - mongodb
      - rabbitmq
      - redis
    volumes:
      - ./config/docker.yml:/app/config/config.yml

  rest-api:
    build:
      context: .
      dockerfile: containers/rest-api/Dockerfile
    environment:
      - NODE_ENV=production
      - DATABASE_PROVIDER=mongodb
      - MESSAGE_BROKER_PROVIDER=rabbitmq
      - AUTH_PROVIDER=jwt
    depends_on:
      - mongodb
      - rabbitmq
      - redis

  device-api:
    build:
      context: .
      dockerfile: containers/device-api/Dockerfile
    environment:
      - NODE_ENV=production
      - DATABASE_PROVIDER=mongodb
      - MESSAGE_BROKER_PROVIDER=rabbitmq
    depends_on:
      - mongodb
      - rabbitmq

  data-processor:
    build:
      context: .
      dockerfile: containers/data-processor/Dockerfile
    environment:
      - NODE_ENV=production
      - DATABASE_PROVIDER=mongodb
      - MESSAGE_BROKER_PROVIDER=rabbitmq
    depends_on:
      - mongodb
      - rabbitmq

  mongodb:
    image: mongo:6.0
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=password
      - MONGO_INITDB_DATABASE=mytaptrack
    volumes:
      - mongodb_data:/data/db
      - ./init-scripts/mongodb:/docker-entrypoint-initdb.d
    ports:
      - "27017:27017"

  rabbitmq:
    image: rabbitmq:3.11-management
    environment:
      - RABBITMQ_DEFAULT_USER=admin
      - RABBITMQ_DEFAULT_PASS=password
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
      - ./init-scripts/rabbitmq:/etc/rabbitmq/conf.d
    ports:
      - "5672:5672"
      - "15672:15672"

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  keycloak:
    image: quay.io/keycloak/keycloak:20.0
    environment:
      - KEYCLOAK_ADMIN=admin
      - KEYCLOAK_ADMIN_PASSWORD=password
      - KC_DB=postgres
    ports:
      - "8080:8080"
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=keycloak
      - POSTGRES_USER=keycloak
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  mongodb_data:
  rabbitmq_data:
  redis_data:
  postgres_data:
```

### Container Dockerfiles

```dockerfile
# containers/graphql-api/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY lib/package*.json ./lib/
COPY types/package*.json ./types/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY lib/ ./lib/
COPY types/ ./types/
COPY containers/graphql-api/ ./

# Build application
RUN npm run build

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Start application
CMD ["npm", "start"]
```

## Security Considerations

### Container Security

```typescript
// Security configuration for containers
interface SecurityConfig {
  network: {
    isolation: boolean;
    allowedPorts: number[];
    firewallRules: FirewallRule[];
  };
  
  secrets: {
    provider: 'docker-secrets' | 'vault' | 'env';
    encryption: {
      algorithm: string;
      keyRotation: boolean;
    };
  };
  
  authentication: {
    tokenValidation: {
      issuer: string;
      audience: string;
      algorithms: string[];
    };
    rateLimiting: {
      windowMs: number;
      maxRequests: number;
    };
  };
  
  communication: {
    tls: {
      enabled: boolean;
      certificatePath: string;
      keyPath: string;
    };
    interService: {
      encryption: boolean;
      authentication: boolean;
    };
  };
}
```

### Secret Management

```typescript
// Secret management abstraction
interface ISecretManager {
  getSecret(key: string): Promise<string>;
  setSecret(key: string, value: string): Promise<void>;
  rotateSecret(key: string): Promise<void>;
}

class DockerSecretManager implements ISecretManager {
  async getSecret(key: string): Promise<string> {
    // Read from Docker secrets or environment variables
    const secretPath = `/run/secrets/${key}`;
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
    return process.env[key] || '';
  }
}
```

## Monitoring and Observability

### Logging Strategy

```typescript
// Structured logging for containers
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  correlationId?: string;
  userId?: string;
  message: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack: string;
  };
}

class ContainerLogger implements ILogger {
  log(level: string, message: string, metadata?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level as any,
      service: process.env.SERVICE_NAME || 'unknown',
      correlationId: this.getCorrelationId(),
      message,
      metadata
    };
    
    // Output structured JSON for log aggregation
    console.log(JSON.stringify(entry));
  }
}
```

### Health Checks

```typescript
// Health check system for containers
class HealthCheckManager {
  private checks: Map<string, HealthCheck> = new Map();
  
  registerCheck(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }
  
  async runHealthChecks(): Promise<HealthStatus> {
    const results = new Map<string, boolean>();
    
    for (const [name, check] of this.checks) {
      try {
        const result = await Promise.race([
          check.execute(),
          this.timeout(5000)
        ]);
        results.set(name, result);
      } catch (error) {
        results.set(name, false);
      }
    }
    
    const healthy = Array.from(results.values()).every(r => r);
    
    return {
      healthy,
      checks: Object.fromEntries(results),
      timestamp: new Date().toISOString()
    };
  }
}

// Database health check
class DatabaseHealthCheck implements HealthCheck {
  constructor(private dataAccess: IDataAccessLayer) {}
  
  async execute(): Promise<boolean> {
    try {
      await this.dataAccess.isConnected();
      return true;
    } catch {
      return false;
    }
  }
}
```

## Performance Considerations

### Caching Strategy

```typescript
// Redis-based caching for Docker deployment
class RedisCacheProvider implements ICacheProvider {
  constructor(private redis: Redis) {}
  
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.redis.setex(key, ttl, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }
  
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

### Connection Pooling

```typescript
// Optimized connection management
class ConnectionManager {
  private pools: Map<string, any> = new Map();
  
  async getMongoDBPool(config: MongoDBConfig): Promise<MongoClient> {
    const key = `mongodb:${config.connectionString}`;
    
    if (!this.pools.has(key)) {
      const client = new MongoClient(config.connectionString, {
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
      });
      
      await client.connect();
      this.pools.set(key, client);
    }
    
    return this.pools.get(key);
  }
  
  async getRabbitMQPool(config: RabbitMQConfig): Promise<Connection> {
    const key = `rabbitmq:${config.connectionString}`;
    
    if (!this.pools.has(key)) {
      const connection = await amqp.connect(config.connectionString, {
        heartbeat: 60,
        connectionTimeout: 10000,
      });
      
      this.pools.set(key, connection);
    }
    
    return this.pools.get(key);
  }
}
```

This design provides a comprehensive foundation for containerizing MyTapTrack while maintaining code reusability between AWS and Docker deployments. The abstraction layers ensure that business logic remains unchanged while infrastructure concerns are handled by environment-specific implementations.