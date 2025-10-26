# Container Testing Guide

This guide explains how to run the MyTapTrack system tests against containerized services instead of AWS services.

## Overview

The system tests can be configured to run against either:
- **AWS Services** (default): Tests run against deployed AWS infrastructure
- **Container Services**: Tests run against local Docker containers

## Quick Start

### 1. Start Container Services

```bash
# Start the development containers
make docker-dev-start
```

### 2. Configure Tests for Containers

```bash
# Configure system tests to use containers
make test-containers-configure
```

### 3. Run Tests

```bash
# Run all system tests against containers
make test-containers-run

# Or run tests with automatic configuration
make test-containers
```

## Available Commands

### Makefile Commands

```bash
# Container testing (environment-specific)
make test-containers                    # Configure and run tests against dev containers
make test-containers-dev               # Configure and run tests against dev containers
make test-containers-test              # Configure and run tests against test containers
make test-containers-prod              # Configure and run tests against prod containers
make test-containers-configure         # Configure tests for container mode (dev)
make test-containers-configure-env ENV=test # Configure for specific environment
make test-containers-run               # Run tests (after configuration)
make test-containers-full              # Start containers and run full test suite
make test-containers-with-cleanup      # Run tests and stop containers afterward

# AWS testing
make test-aws-configure                # Configure tests for AWS mode
make test                             # Run tests against AWS (if configured)
```

### NPM Scripts

```bash
# Container mode (environment-specific)
npm run configure:containers:dev       # Configure for dev containers
npm run configure:containers:test      # Configure for test containers  
npm run configure:containers:prod      # Configure for prod containers
npm run test:container:dev            # Configure and run tests against dev containers
npm run test:container:test           # Configure and run tests against test containers
npm run test:container:prod           # Configure and run tests against prod containers

# AWS mode  
npm run configure:aws                 # Configure for AWS mode
npm run test:aws                      # Configure and run tests against AWS
```

## How It Works

### Configuration System

The system tests use a configuration adapter that:

1. **Detects the target environment** (containers vs AWS)
2. **Modifies endpoint configurations** to point to the correct services
3. **Skips AWS-specific setup** when running against containers
4. **Creates container-specific config files** as needed

### Environment Variables

When configured for containers, these environment variables are set:

```bash
CONTAINER_MODE=true
TEST_TARGET=containers
STAGE=container
GRAPHQL_ENDPOINT=http://localhost:4500
REST_ENDPOINT=http://localhost:4501
DEVICE_ENDPOINT=http://localhost:4502
SKIP_AWS_CONFIG=true
SKIP_SSM_PARAMS=true
```

### Configuration Files

- `system-tests/config/container.yml` - Container-specific configuration
- `system-tests/src/container-config.ts` - Configuration adapter
- `system-tests/src/configure-containers.ts` - Container setup script
- `system-tests/src/configure-aws.ts` - AWS setup script

## Container Services

The tests expect these container services to be running:

| Service | Port | Endpoint |
|---------|------|----------|
| GraphQL API | 4500 | http://localhost:4500/graphql |
| REST API | 4501 | http://localhost:4501/api/v2 |
| Device API | 4502 | http://localhost:4502/device |
| MongoDB (dev) | 27018 | mongodb://admin:devpassword@localhost:27018/mytaptrack_dev |
| MongoDB (test) | 27017 | mongodb://admin:testpassword@localhost:27017/mytaptrack_test |
| MongoDB (prod) | 27017 | mongodb://admin:password@localhost:27017/mytaptrack |
| RabbitMQ | 5672, 15672 | amqp://admin:{password}@localhost:5672 |
| Redis | 6379 | redis://localhost:6379 |

## Test Differences

### Container Mode vs AWS Mode

| Aspect | Container Mode | AWS Mode |
|--------|----------------|----------|
| **Endpoints** | localhost:PORT | AWS service URLs from SSM |
| **Database** | MongoDB | DynamoDB |
| **Authentication** | JWT (mock) | Cognito |
| **Message Broker** | RabbitMQ | EventBridge |
| **Cache** | Redis | ElastiCache/DynamoDB |
| **Configuration** | Local YAML | SSM Parameters |

### Test Behavior

- **Container mode**: Tests run against local services with mock data
- **AWS mode**: Tests run against real AWS infrastructure
- **Automatic detection**: Tests adapt based on configuration
- **Service validation**: Container tests include health checks

## Troubleshooting

### Common Issues

1. **Containers not running**
   ```bash
   # Check container status
   make docker-dev-status
   
   # Start containers if needed
   make docker-dev-start
   ```

2. **Configuration not applied**
   ```bash
   # Reconfigure for containers
   npm run configure:containers
   
   # Or reconfigure for AWS
   npm run configure:aws
   ```

3. **Services not ready**
   ```bash
   # Check service health
   curl http://localhost:4500/health  # GraphQL
   curl http://localhost:4501/health  # REST API
   curl http://localhost:4502/health  # Device API
   ```

4. **Port conflicts**
   ```bash
   # Check what's using the ports
   lsof -i :4500
   lsof -i :4501
   lsof -i :4502
   ```

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=debug
npm run test:container
```

### Manual Configuration

You can manually configure the test environment:

```typescript
// In your test files
import { configureForContainers, configureForAWS } from './src/container-config';

// Configure for containers
configureForContainers();

// Configure for AWS
configureForAWS();
```

## Development Workflow

### Typical Development Flow

1. **Start containers**: `make docker-dev-start`
2. **Configure tests**: `make test-containers-configure`
3. **Run specific tests**: `npm test -- --testNamePattern="User"`
4. **Make changes to code**
5. **Re-run tests**: `npm test`
6. **Switch back to AWS**: `make test-aws-configure`

### Continuous Testing

```bash
# Watch mode for container tests
npm run test:container:watch
```

### Integration with CI/CD

The container testing can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Start containers
  run: make docker-dev-start

- name: Run container tests
  run: make test-containers

- name: Stop containers
  run: make docker-dev-stop
```

## Best Practices

1. **Always configure before testing**: Use the configuration scripts
2. **Check service health**: Verify containers are running before tests
3. **Clean up after tests**: Stop containers when done
4. **Use appropriate timeouts**: Container tests may need longer timeouts
5. **Mock external dependencies**: Use container-appropriate mocks
6. **Separate test data**: Use different data sets for container vs AWS tests

## Configuration Reference

### Container Configuration

The container configuration includes:

```yaml
# Example for dev environment
env:
  endpoints:
    graphql: "http://localhost:4500"
    rest: "http://localhost:4501"
    device: "http://localhost:4502"
  database:
    type: "mongodb"
    connectionString: "mongodb://admin:devpassword@localhost:27018/mytaptrack_dev?authSource=admin"
  auth:
    type: "jwt"
    issuer: "mytaptrack-dev"
    audience: "mytaptrack-api-dev"
  cache:
    type: "redis"
    connectionString: "redis://localhost:6379"
  messageBroker:
    type: "rabbitmq"
    connectionString: "amqp://admin:devpassword@localhost:5672"
```

**Environment-Specific Database Configuration:**
- **dev**: `mytaptrack_dev` (port 27018 - avoids conflicts with local MongoDB)
- **test**: `mytaptrack_test` (port 27017)
- **prod**: `mytaptrack` (port 27017)

**MongoDB Collections (map to AWS DynamoDB tables):**
- `primary_data` ← AWS DynamoDB "primary" table
- `data` ← AWS DynamoDB "data" table (configurations, settings)
- `secondary_data` ← Additional data storage
- `cache` ← Caching layer

This configuration is automatically generated when you run the container configuration script.