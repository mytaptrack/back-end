# Logging and Monitoring System

This module provides comprehensive logging and monitoring capabilities for MyTapTrack container services, implementing structured logging, performance metrics collection, health checks, and correlation ID tracking.

## Features

### Structured Logging
- **JSON Format**: Consistent structured logging across all services
- **Correlation ID Tracking**: Request tracing across service boundaries
- **Performance Logging**: Built-in performance timing and metrics
- **Context Management**: Child loggers with additional context
- **Multiple Log Levels**: Debug, info, warn, error with configurable thresholds

### Metrics Collection
- **Prometheus Compatible**: Standard Prometheus metrics format
- **Database Metrics**: Operation timing and success/failure tracking
- **API Metrics**: HTTP request/response metrics with status codes
- **Message Broker Metrics**: Queue operation performance tracking
- **Cache Metrics**: Hit/miss ratios and operation timing
- **Custom Metrics**: Counters, gauges, and histograms

### Health Checks
- **Service Health**: Overall service status monitoring
- **Dependency Health**: Database, message broker, cache connectivity
- **System Health**: Memory usage, disk space monitoring
- **Configurable Timeouts**: Customizable health check timeouts and retries
- **Detailed Status**: Comprehensive health check responses with metadata

### Express Middleware
- **Correlation Middleware**: Automatic correlation ID extraction/generation
- **Request Logging**: Incoming request and response logging
- **Performance Monitoring**: Slow request detection and metrics
- **Error Logging**: Comprehensive error logging with context
- **Rate Limiting**: Built-in rate limiting with logging
- **Timeout Handling**: Request timeout management

## Quick Start

### Basic Setup

```typescript
import { createMonitoringSetupFromEnv } from '@mytaptrack/business-logic-core/logging';

// Create monitoring setup from environment variables
const monitoring = createMonitoringSetupFromEnv('my-service');

// Use the logger
monitoring.logger.info('Service starting', { port: 4500 });

// Record metrics
monitoring.metrics.incrementCounter('service_starts_total');

// Check health
const health = await monitoring.healthCheckManager.runHealthChecks();
```

### Express Integration

```typescript
import express from 'express';
import { ContainerMonitoringService } from './shared/monitoring-service';

const app = express();
const monitoring = new ContainerMonitoringService('my-service');

// Setup monitoring middleware
monitoring.setupExpressMiddleware(app);

// Setup health and metrics endpoints
monitoring.setupMonitoringEndpoints(app);

// Register service dependencies
monitoring.registerDependencies({
  dataAccess: myDataAccess,
  messageBroker: myMessageBroker,
  cache: myCache
});

// Start metrics server
monitoring.startMetricsServer();
```

### Business Logic Integration

```typescript
import { withDatabaseMetrics, withMessageBrokerMetrics } from './shared/monitoring-service';

class UserService {
  async createUser(userData: any): Promise<any> {
    // Database operation with metrics
    const user = await withDatabaseMetrics('put', this.metrics, 'users')(async () => {
      return this.dataAccess.put(userData);
    });
    
    // Message broker operation with metrics
    await withMessageBrokerMetrics('publish', this.metrics, 'user-events')(async () => {
      await this.messageBroker.publish('user.created', { userId: user.id });
    });
    
    return user;
  }
}
```

## Configuration

### Environment Variables

```bash
# Logging Configuration
LOG_LEVEL=info                    # debug, info, warn, error
LOG_FORMAT=json                   # json, pretty
LOG_INCLUDE_STACK=true           # Include stack traces in error logs

# Metrics Configuration
METRICS_ENABLED=true             # Enable metrics collection
METRICS_PORT=9091               # Metrics server port
METRICS_PATH=/metrics           # Metrics endpoint path

# Health Check Configuration
HEALTH_CHECKS_ENABLED=true      # Enable health checks
HEALTH_CHECK_INTERVAL=30000     # Health check interval (ms)
HEALTH_CHECK_TIMEOUT=5000       # Health check timeout (ms)
HEALTH_CHECK_RETRIES=3          # Health check retry attempts

# Performance Configuration
REQUEST_TIMEOUT=30000           # Request timeout (ms)
SLOW_REQUEST_THRESHOLD=1000     # Slow request threshold (ms)

# Rate Limiting Configuration
RATE_LIMIT_ENABLED=true         # Enable rate limiting
RATE_LIMIT_WINDOW=60000         # Rate limit window (ms)
RATE_LIMIT_MAX=100             # Max requests per window
```

### Configuration File

```yaml
# containers/config/logging.yml
default:
  logging:
    level: info
    format: json
    correlationId: true
    includeStack: false
  
  monitoring:
    metrics:
      enabled: true
      port: 9091
    
  healthCheck:
    enabled: true
    interval: 30000
    timeout: 5000
    retries: 3
```

## Log Aggregation

### Docker Compose Setup

The system includes complete log aggregation with Loki, Promtail, and Grafana:

```bash
# Start logging infrastructure
docker-compose -f containers/logging/docker-compose.logging.yml up -d

# Access Grafana dashboard
open http://localhost:3000
```

### Log Format

All logs follow a consistent JSON structure:

```json
{
  "timestamp": "2023-10-28T19:43:19.770Z",
  "level": "info",
  "service": "graphql-api",
  "correlationId": "1698520999770-abc123def",
  "userId": "user-123",
  "requestId": "req-1698520999770-xyz789",
  "message": "User created successfully",
  "metadata": {
    "userId": "user-456",
    "email": "user@example.com",
    "environment": "production",
    "version": "1.0.0"
  },
  "performance": {
    "operation": "user_creation",
    "duration": 150,
    "resource": "users"
  }
}
```

## Metrics

### Available Metrics

#### HTTP Metrics
- `http_requests_total` - Total HTTP requests
- `http_request_duration_ms` - HTTP request duration
- `http_errors_total` - Total HTTP errors

#### Database Metrics
- `database_operations_total` - Total database operations
- `database_operation_duration_ms` - Database operation duration
- `database_errors_total` - Total database errors

#### Message Broker Metrics
- `message_operations_total` - Total message operations
- `message_operation_duration_ms` - Message operation duration
- `message_errors_total` - Total message errors

#### Cache Metrics
- `cache_operations_total` - Total cache operations
- `cache_operation_duration_ms` - Cache operation duration
- `cache_requests_total` - Total cache requests (hit/miss)

### Prometheus Integration

Metrics are available in Prometheus format at `/metrics`:

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{service="graphql-api",method="POST",path="/graphql",status_code="200"} 42

# HELP database_operation_duration_ms Duration of database operations in milliseconds
# TYPE database_operation_duration_ms histogram
database_operation_duration_ms{service="graphql-api",operation="get",success="true"} 25.5
```

## Health Checks

### Available Health Checks

- **Database**: Connectivity and basic operations
- **Message Broker**: Connection and queue accessibility
- **Cache**: Set/get operations and connectivity
- **Memory**: Memory usage monitoring
- **Disk Space**: Available disk space monitoring

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2023-10-28T19:43:19.770Z",
  "service": "graphql-api",
  "version": "1.0.0",
  "uptime": 3600000,
  "checks": [
    {
      "name": "database",
      "status": "healthy",
      "message": "Database connection is healthy",
      "duration": 25,
      "metadata": {
        "provider": "MongoDBProvider",
        "connectionTime": 25
      }
    }
  ],
  "dependencies": {
    "database": { "status": "healthy", "duration": 25 },
    "messageBroker": { "status": "healthy", "duration": 15 },
    "cache": { "status": "healthy", "duration": 5 }
  }
}
```

## Correlation ID Tracking

### Automatic Correlation

The system automatically:
- Extracts correlation IDs from `X-Correlation-ID` headers
- Generates new correlation IDs if not present
- Propagates correlation IDs across service calls
- Includes correlation IDs in all log entries

### Manual Correlation

```typescript
import { CorrelationUtils } from '@mytaptrack/business-logic-core/logging';

// Generate correlation ID
const correlationId = CorrelationUtils.generateId();

// Run with correlation context
await CorrelationUtils.runWithContext(
  { correlationId, userId: 'user-123' },
  async () => {
    // All logging within this context will include the correlation ID
    logger.info('Processing user request');
  }
);
```

## Performance Monitoring

### Automatic Performance Tracking

```typescript
// Performance timer
const timer = logger.startTimer('user_operation', 'users');

try {
  // Perform operation
  const result = await performOperation();
  return result;
} finally {
  timer.end({ operationType: 'create' });
}
```

### Operation Wrappers

```typescript
// Database operations
const user = await withDatabaseMetrics('get', metrics, 'users')(async () => {
  return dataAccess.get({ pk: 'U#123' });
});

// Message broker operations
await withMessageBrokerMetrics('publish', metrics, 'events')(async () => {
  return messageBroker.publish('user.created', userData);
});

// Cache operations
const cached = await withCacheMetrics('get', metrics)(async () => {
  return cache.get('user:123');
}, true); // true indicates cache hit
```

## Grafana Dashboards

### Pre-built Dashboards

The system includes pre-configured Grafana dashboards:

- **MyTapTrack Overview**: Service health, request rates, response times
- **Performance Metrics**: Database, message broker, and cache performance
- **Error Tracking**: Error rates and patterns across services
- **System Resources**: Memory, CPU, and disk usage

### Custom Dashboards

Create custom dashboards using the available metrics:

```json
{
  "dashboard": {
    "title": "Custom Service Dashboard",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{service}} - {{method}}"
          }
        ]
      }
    ]
  }
}
```

## Best Practices

### Logging
- Use appropriate log levels (debug for development, info for production)
- Include relevant context in log metadata
- Use correlation IDs for request tracing
- Avoid logging sensitive information

### Metrics
- Use consistent metric naming conventions
- Include relevant labels for filtering and grouping
- Monitor both success and failure rates
- Set up alerting for critical metrics

### Health Checks
- Keep health checks lightweight and fast
- Check critical dependencies only
- Use appropriate timeouts
- Provide meaningful error messages

### Performance
- Use performance timers for critical operations
- Monitor slow operations and set thresholds
- Track resource usage trends
- Optimize based on metrics data

## Troubleshooting

### Common Issues

1. **Missing Correlation IDs**: Ensure correlation middleware is first in the middleware chain
2. **High Memory Usage**: Check for memory leaks in metrics collection
3. **Slow Health Checks**: Reduce timeout values or optimize dependency checks
4. **Missing Metrics**: Verify metrics are being recorded and endpoints are accessible

### Debug Mode

Enable debug logging for troubleshooting:

```bash
LOG_LEVEL=debug npm start
```

### Health Check Debugging

Check individual health endpoints:

```bash
curl http://localhost:4500/health
curl http://localhost:4500/ready
curl http://localhost:4500/live
```

### Metrics Debugging

View raw metrics:

```bash
curl http://localhost:9091/metrics
curl http://localhost:9091/metrics?format=json
```