# Docker Container Configurations

This directory contains Docker container configurations for MyTapTrack services, enabling deployment in any Docker-compatible environment as an alternative to AWS serverless deployment.

## Container Services

### GraphQL API (`graphql-api/`)
- **Port**: 4000
- **Purpose**: Provides GraphQL API endpoints using Apollo Server
- **Dependencies**: All business logic packages for comprehensive GraphQL schema support
- **Health Check**: `/health` endpoint

### REST API (`rest-api/`)
- **Port**: 4501
- **Purpose**: Provides REST API endpoints for backward compatibility
- **Dependencies**: All business logic packages for complete REST API functionality
- **Health Check**: `/health` endpoint

### Device API (`device-api/`)
- **Port**: 4502
- **Purpose**: Handles IoT device communication and device-specific protocols
- **Dependencies**: Core and device business logic packages only
- **Health Check**: `/health` endpoint

### Data Processor (`data-processor/`)
- **Port**: 8080 (for health checks and metrics)
- **Purpose**: Background event processing and data propagation
- **Dependencies**: All business logic packages for comprehensive event handling
- **Health Check**: `/health` endpoint

## Docker Configuration Features

### Multi-Stage Builds
All Dockerfiles use multi-stage builds for optimal security and performance:

1. **Base Stage**: Sets up Alpine Linux with security updates and non-root user
2. **Dependencies Stage**: Installs production dependencies only
3. **Builder Stage**: Compiles TypeScript and builds the application
4. **Runtime Stage**: Final minimal image with only necessary files

### Security Features
- **Non-root user**: All containers run as `nodejs` user (UID 1001)
- **Minimal attack surface**: Alpine Linux base with only essential packages
- **Security updates**: Automatic security updates during build
- **Signal handling**: Proper signal handling with `dumb-init`
- **File permissions**: Proper file ownership and permissions

### Health Checks
- **Built-in health checks**: Each container includes health check endpoints
- **Container orchestration**: Health checks compatible with Docker Compose, Kubernetes, etc.
- **Timeout handling**: Configurable timeouts and retry logic
- **Graceful degradation**: Proper error handling and status reporting

### Performance Optimizations
- **Dependency caching**: Optimized layer caching for faster builds
- **Minimal dependencies**: Only production dependencies in final image
- **Compression**: Built-in gzip compression for HTTP responses
- **Connection pooling**: Optimized database and message broker connections

## Building Containers

### Prerequisites
Ensure all business logic packages are built before building containers:

```bash
# Build all dependencies
make build

# Or build individual packages
cd business-logic/core && npm run build
cd business-logic/user && npm run build
# ... etc for all packages
```

### Build Individual Containers

```bash
# GraphQL API
docker build -f containers/graphql-api/Dockerfile -t mytaptrack/graphql-api:latest .

# REST API
docker build -f containers/rest-api/Dockerfile -t mytaptrack/rest-api:latest .

# Device API
docker build -f containers/device-api/Dockerfile -t mytaptrack/device-api:latest .

# Data Processor
docker build -f containers/data-processor/Dockerfile -t mytaptrack/data-processor:latest .
```

### Build All Containers

```bash
# Build all containers with consistent tags
docker build -f containers/graphql-api/Dockerfile -t mytaptrack/graphql-api:latest .
docker build -f containers/rest-api/Dockerfile -t mytaptrack/rest-api:latest .
docker build -f containers/device-api/Dockerfile -t mytaptrack/device-api:latest .
docker build -f containers/data-processor/Dockerfile -t mytaptrack/data-processor:latest .
```

## Running Containers

### Environment Variables
Each container requires environment variables for configuration:

```bash
# Database configuration
DATABASE_PROVIDER=mongodb
MONGODB_CONNECTION_STRING=mongodb://admin:password@mongodb:27017/mytaptrack

# Message broker configuration
MESSAGE_BROKER_PROVIDER=rabbitmq
RABBITMQ_CONNECTION_STRING=amqp://admin:password@rabbitmq:5672

# Authentication configuration
AUTH_PROVIDER=jwt
JWT_PUBLIC_KEY=<base64-encoded-public-key>
JWT_ISSUER=mytaptrack
JWT_AUDIENCE=mytaptrack-api

# Cache configuration
CACHE_PROVIDER=redis
REDIS_CONNECTION_STRING=redis://redis:6379

# Service configuration
NODE_ENV=production
LOG_LEVEL=info
```

### Run Individual Containers

```bash
# GraphQL API
docker run -d \
  --name graphql-api \
  -p 4000:4000 \
  -e DATABASE_PROVIDER=mongodb \
  -e MONGODB_CONNECTION_STRING=mongodb://admin:password@mongodb:27017/mytaptrack \
  mytaptrack/graphql-api:latest

# REST API
docker run -d \
  --name rest-api \
  -p 4501:4501 \
  -e DATABASE_PROVIDER=mongodb \
  -e MONGODB_CONNECTION_STRING=mongodb://admin:password@mongodb:27017/mytaptrack \
  mytaptrack/rest-api:latest
```

### Use with Docker Compose
See the main `docker-compose.yml` file for complete orchestration configuration.

## Development

### Local Development
Each container supports development mode with hot-reload:

```bash
cd containers/graphql-api
npm install
npm run dev
```

### Testing Containers
Test container health and functionality:

```bash
# Test health endpoints
curl http://localhost:4000/health  # GraphQL API
curl http://localhost:4501/health  # REST API
curl http://localhost:4502/health  # Device API
curl http://localhost:8080/health  # Data Processor

# Test API functionality
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}'
```

## Security Considerations

### Container Security
- All containers run as non-root user
- Minimal base image (Alpine Linux)
- Regular security updates
- No unnecessary packages or tools
- Proper signal handling for graceful shutdown

### Network Security
- Services communicate through Docker networks
- No unnecessary port exposure
- Health checks use internal networking
- TLS/SSL termination at load balancer

### Secret Management
- Environment variables for configuration
- Support for Docker secrets
- No hardcoded credentials
- Secure secret rotation capabilities

## Monitoring and Logging

### Structured Logging
All containers produce structured JSON logs:

```json
{
  "timestamp": "2023-10-25T10:30:00.000Z",
  "level": "info",
  "service": "graphql-api",
  "correlationId": "req-123",
  "message": "Request processed successfully",
  "metadata": {
    "userId": "user-456",
    "operation": "getUserById",
    "duration": 150
  }
}
```

### Health Monitoring
- Built-in health check endpoints
- Dependency health verification
- Performance metrics collection
- Error rate monitoring

### Log Aggregation
Logs can be collected using standard Docker logging drivers:

```bash
# JSON file logging
docker run --log-driver json-file --log-opt max-size=10m mytaptrack/graphql-api

# Syslog logging
docker run --log-driver syslog --log-opt syslog-address=tcp://logserver:514 mytaptrack/graphql-api
```

## Troubleshooting

### Common Issues

1. **Container fails to start**
   - Check environment variables are set correctly
   - Verify database and message broker connectivity
   - Check container logs: `docker logs <container-name>`

2. **Health check failures**
   - Verify service is listening on correct port
   - Check internal networking configuration
   - Validate health check endpoint response

3. **Performance issues**
   - Monitor resource usage: `docker stats`
   - Check database connection pool settings
   - Verify message broker configuration

4. **Build failures**
   - Ensure all business logic packages are built
   - Check TypeScript compilation errors
   - Verify Docker build context includes necessary files

### Debug Commands

```bash
# View container logs
docker logs -f <container-name>

# Execute shell in running container
docker exec -it <container-name> /bin/sh

# Inspect container configuration
docker inspect <container-name>

# Monitor resource usage
docker stats <container-name>
```

## Migration from AWS

When migrating from AWS serverless to Docker containers:

1. **Update configuration**: Change environment variables to point to containerized services
2. **Data migration**: Export data from DynamoDB and import to MongoDB
3. **Message routing**: Update EventBridge rules to RabbitMQ exchanges
4. **Authentication**: Configure JWT/OIDC provider instead of Cognito
5. **Monitoring**: Set up container monitoring instead of CloudWatch

See the main project documentation for detailed migration procedures.