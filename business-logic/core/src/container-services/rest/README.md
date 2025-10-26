# REST API Container Service

The REST API Container Service provides Express.js-based REST endpoints that delegate to business logic services. It maintains API compatibility with existing Lambda-based endpoints while running in a containerized environment.

## Features

- **Express.js Framework**: Full-featured HTTP server with middleware support
- **API Compatibility**: Maintains compatibility with existing Lambda-based REST APIs
- **Business Logic Integration**: Delegates to modular business logic packages
- **Authentication**: Integrated JWT/Cognito authentication support
- **Request/Response Transformation**: Transforms between Lambda and Express formats
- **Error Handling**: Comprehensive error handling with proper HTTP status codes
- **Rate Limiting**: Built-in rate limiting and DDoS protection
- **CORS Support**: Configurable CORS for cross-origin requests
- **Health Checks**: Standard health, readiness, and liveness endpoints

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    REST API Service                         │
├─────────────────────────────────────────────────────────────┤
│  Express.js Router                                          │
│  ├── Authentication Middleware                              │
│  ├── Request Validation Middleware                          │
│  ├── Rate Limiting Middleware                               │
│  ├── CORS Middleware                                        │
│  └── Error Handling Middleware                              │
├─────────────────────────────────────────────────────────────┤
│  Route Handlers                                             │
│  ├── User Routes (/api/v2/user/*)                          │
│  ├── Student Routes (/api/v2/student/*)                    │
│  ├── License Routes (/api/v2/license/*)                    │
│  ├── Report Routes (/api/v2/report/*)                      │
│  ├── App Routes (/api/v2/app/*)                            │
│  └── Utility Routes (/api/user/error)                      │
├─────────────────────────────────────────────────────────────┤
│  Business Logic Integration                                 │
│  ├── UserOperations                                         │
│  ├── StudentOperations                                      │
│  ├── LicenseOperations                                      │
│  ├── ReportOperations                                       │
│  └── AppOperations                                          │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

```typescript
const config: ServerConfig = {
  port: 3001,
  host: '0.0.0.0',
  cors: {
    origin: ['http://localhost:3000', 'https://app.mytaptrack.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
  },
  middleware: {
    requestLogging: true,
    compression: true,
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 1000,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    },
    bodyParser: {
      json: {
        limit: '10mb',
        strict: true
      },
      urlencoded: {
        limit: '10mb',
        extended: true
      }
    }
  },
  security: {
    helmet: true,
    trustProxy: true,
    hidePoweredBy: true
  }
};
```

## Usage

### Basic Usage

```typescript
import { RestAPIService } from '@mytaptrack/business-logic-core';

const restApiService = new RestAPIService(config);

// Initialize the service
await restApiService.initialize();

// The service is now running and accepting requests
console.log('REST API service started on port', config.port);

// Graceful shutdown
process.on('SIGTERM', async () => {
  await restApiService.shutdown();
});
```

### Docker Usage

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the service
CMD ["node", "dist/examples/rest-api-service-usage.js"]
```

## API Endpoints

### Health Endpoints

- `GET /health` - Comprehensive health check with dependency status
- `GET /ready` - Readiness check for container orchestration
- `GET /live` - Liveness check for container orchestration

### User Endpoints

- `GET /api/v2/user` - Get current user information
- `PUT /api/v2/user` - Update user information
- `GET /api/v2/user/alerts` - Get user alert statistics

### Student Endpoints

- `GET /api/v2/student` - Get student information
- `PUT /api/v2/student` - Create or update student
- `GET /api/v2/student/document` - Get student document
- `PUT /api/v2/student/document` - Upload student document
- `DELETE /api/v2/student/document` - Delete student document
- `GET /api/v2/student/subscriptions` - Get student subscriptions
- `PUT /api/v2/student/subscriptions` - Update student subscriptions
- `GET /api/v2/student/notification` - Get student notifications
- `DELETE /api/v2/student/notification` - Delete student notification
- `PUT /api/v2/student/behavior` - Update student behavior
- `DELETE /api/v2/student/behavior` - Delete student behavior
- `PUT /api/v2/student/response` - Update student response
- `DELETE /api/v2/student/response` - Delete student response
- `PUT /api/v2/student/abc` - Update student ABC data
- `DELETE /api/v2/student/abc` - Delete student ABC data
- `GET /api/v2/student/team` - Get student team information
- `PUT /api/v2/student/team` - Update student team
- `POST /api/v2/student/team` - Create student team
- `DELETE /api/v2/student/team` - Delete student team
- `GET /api/v2/student/schedules` - Get student schedules
- `PUT /api/v2/student/schedule` - Update student schedule
- `DELETE /api/v2/student/schedule` - Delete student schedule

### Utility Endpoints

- `POST /api/user/error` - Report browser errors (no authentication required)

## Authentication

The REST API service uses JWT-based authentication. All `/api/v2/*` endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

The authentication middleware:
1. Validates the JWT token
2. Extracts user context (userId, email, roles, permissions)
3. Adds user context to the request for use by route handlers

## Request/Response Format

### Request Format

Requests should use JSON format with appropriate Content-Type header:

```http
POST /api/v2/user
Content-Type: application/json
Authorization: Bearer <token>

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com"
}
```

### Response Format

Responses are returned in JSON format with standard HTTP status codes:

```json
{
  "userId": "user-123",
  "details": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com"
  },
  "license": "license-456"
}
```

### Error Response Format

Errors are returned with appropriate HTTP status codes and structured error information:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid user data",
    "correlationId": "req-123-456",
    "details": {
      "errors": [
        {
          "field": "email",
          "message": "Valid email is required",
          "code": "INVALID_EMAIL"
        }
      ]
    }
  }
}
```

## Error Handling

The service provides comprehensive error handling:

- **ValidationError** (400) - Invalid input data
- **NotFoundError** (404) - Resource not found
- **BusinessLogicError** (400) - Business rule violations
- **ServiceUnavailableError** (503) - Service dependencies unavailable
- **AuthenticationError** (401) - Invalid or missing authentication
- **InternalServerError** (500) - Unexpected errors

## Middleware

### Authentication Middleware

Validates JWT tokens and extracts user context:

```typescript
// Applied to all /api/v2/* routes
router.use(authMiddleware.create());
```

### Rate Limiting Middleware

Prevents abuse and DDoS attacks:

```typescript
rateLimiting: {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 1000, // per IP
  skipSuccessfulRequests: false,
  skipFailedRequests: false
}
```

### CORS Middleware

Handles cross-origin requests:

```typescript
cors: {
  origin: ['http://localhost:3000', 'https://app.mytaptrack.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}
```

### Request Validation Middleware

Validates request format and adds correlation IDs:

```typescript
// Validates Content-Type for POST/PUT requests
// Adds request ID and correlation ID
// Validates API version compatibility
```

## Monitoring

### Health Checks

The service provides multiple health check endpoints:

- **Deep Health Check** (`/health`) - Checks all dependencies
- **Readiness Check** (`/ready`) - Indicates if service is ready to accept traffic
- **Liveness Check** (`/live`) - Indicates if service is alive

### Logging

All requests and responses are logged with correlation IDs for tracing:

```json
{
  "timestamp": "2023-10-24T10:30:00.000Z",
  "level": "info",
  "service": "REST API Service",
  "correlationId": "req-123-456",
  "message": "Request processed",
  "metadata": {
    "method": "GET",
    "path": "/api/v2/user",
    "statusCode": 200,
    "responseTime": 150
  }
}
```

### Metrics

The service exposes metrics for monitoring:

- Request count and response times
- Error rates by endpoint
- Authentication success/failure rates
- Dependency health status

## Migration from Lambda

The REST API service maintains compatibility with existing Lambda-based endpoints:

### Request Transformation

Lambda event format is transformed to Express request format:

```typescript
// Lambda event
{
  "pathParameters": { "id": "123" },
  "queryStringParameters": { "filter": "active" },
  "body": "{\"name\":\"test\"}"
}

// Express request
req.params.id = "123"
req.query.filter = "active"
req.body = { name: "test" }
```

### Response Transformation

Express responses are formatted to match Lambda response format:

```typescript
// Lambda response
{
  "statusCode": 200,
  "headers": { "Content-Type": "application/json" },
  "body": "{\"result\":\"success\"}"
}

// Express response
res.status(200)
   .setHeader('Content-Type', 'application/json')
   .json({ result: "success" })
```

## Performance Considerations

### Connection Pooling

The service uses connection pooling for database and message broker connections:

```typescript
// MongoDB connection pool
maxPoolSize: 10,
minPoolSize: 2,
maxIdleTimeMS: 30000

// RabbitMQ connection pool
heartbeat: 60,
connectionTimeout: 10000
```

### Caching

Redis-based caching is used for frequently accessed data:

```typescript
// Cache user data for 15 minutes
await cache.set(`user:${userId}`, userData, 900);
```

### Compression

Response compression is enabled to reduce bandwidth:

```typescript
middleware: {
  compression: true
}
```

## Security

### Helmet.js

Security headers are added using Helmet.js:

```typescript
security: {
  helmet: true,
  trustProxy: true,
  hidePoweredBy: true
}
```

### Input Validation

All input is validated before processing:

```typescript
// JSON schema validation
// SQL injection prevention
// XSS protection
```

### Rate Limiting

Rate limiting prevents abuse:

```typescript
rateLimiting: {
  windowMs: 15 * 60 * 1000,
  maxRequests: 1000
}
```

## Testing

The service includes comprehensive tests:

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testNamePattern="RestAPIService"

# Run tests with coverage
npm run test:coverage
```

Test categories:
- Unit tests for individual methods
- Integration tests for route handlers
- End-to-end tests for complete workflows
- Performance tests for load testing

## Deployment

### Docker Deployment

```yaml
# docker-compose.yml
services:
  rest-api:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_PROVIDER=mongodb
      - MESSAGE_BROKER_PROVIDER=rabbitmq
    depends_on:
      - mongodb
      - rabbitmq
      - redis
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rest-api-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rest-api-service
  template:
    metadata:
      labels:
        app: rest-api-service
    spec:
      containers:
      - name: rest-api
        image: mytaptrack/rest-api:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /live
            port: 3001
        readinessProbe:
          httpGet:
            path: /ready
            port: 3001
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   Error: listen EADDRINUSE :::3001
   ```
   Solution: Change port in configuration or kill existing process

2. **Authentication Failures**
   ```bash
   Error: JWT token validation failed
   ```
   Solution: Check JWT configuration and token format

3. **Database Connection Issues**
   ```bash
   Error: MongoDB connection failed
   ```
   Solution: Verify MongoDB connection string and network access

### Debug Mode

Enable debug logging:

```bash
NODE_ENV=development DEBUG=mytaptrack:* npm start
```

### Health Check Debugging

Check service health:

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "healthy": true,
  "checks": {
    "database": true,
    "messageBroker": true,
    "cache": true,
    "authentication": true
  },
  "timestamp": "2023-10-24T10:30:00.000Z",
  "uptime": 3600
}
```