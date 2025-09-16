# Database Error Handling and Logging System

This comprehensive error handling and logging system provides unified error management, structured logging, retry mechanisms, and circuit breaker patterns for database operations across different providers.

## Overview

The system consists of several interconnected components:

- **Structured Logging**: Consistent, contextual logging across all database operations
- **Error Handling**: Unified error translation and enrichment with actionable suggestions
- **Retry Management**: Exponential backoff retry with configurable policies
- **Circuit Breaker**: Automatic failure detection and recovery mechanisms
- **Performance Monitoring**: Operation timing and slow query detection
- **Error Aggregation**: Pattern analysis and reporting

## Components

### 1. Database Logger (`database-logger.ts`)

Provides structured logging with consistent format across all database providers.

#### Key Features

- **Multiple Log Levels**: DEBUG, INFO, WARN, ERROR, NONE
- **Contextual Logging**: Attach metadata to all log entries
- **Child Loggers**: Inherit context from parent loggers
- **Performance Logging**: Track operation timing and detect slow operations
- **Connection Logging**: Specialized logging for connection events
- **Sensitive Data Protection**: Automatic sanitization of credentials

#### Usage

```typescript
import { LoggerFactory, LogLevel } from '../utils/database-logger';

// Create a logger
const logger = LoggerFactory.getLogger('MyComponent', { provider: 'dynamodb' });

// Basic logging
logger.info('Operation completed', { duration: 150, itemCount: 5 });
logger.error('Operation failed', error, { operation: 'get', key: 'user#123' });

// Performance logging
const perfLogger = LoggerFactory.createPerformanceLogger('MyComponent');
perfLogger.logOperation({
  operation: 'query',
  provider: 'dynamodb',
  duration: 1200,
  success: true,
  itemCount: 50
});

// Connection logging
const connLogger = LoggerFactory.createConnectionLogger('MyComponent');
connLogger.logConnectionAttempt('dynamodb', config);
connLogger.logConnectionSuccess('dynamodb', 250);
```

#### Configuration

Set the log level via environment variable:

```bash
export DATABASE_LOG_LEVEL=DEBUG  # DEBUG, INFO, WARN, ERROR, NONE
```

### 2. Error Handler (`error-handler.ts`)

Comprehensive error handling with translation, enrichment, and actionable suggestions.

#### Key Features

- **Error Translation**: Convert provider-specific errors to unified types
- **Error Enrichment**: Add context and correlation information
- **Actionable Suggestions**: Provide specific guidance for error resolution
- **Error Tracking**: Monitor error patterns and frequencies
- **Severity Classification**: Categorize errors by impact level
- **Retry Recommendations**: Intelligent retry decision making

#### Usage

```typescript
import { ErrorHandlerFactory, ErrorContext } from '../utils/error-handler';

const errorHandler = ErrorHandlerFactory.getHandler('dynamodb');

try {
  // Database operation
} catch (error) {
  const context: ErrorContext = {
    operation: 'get',
    provider: 'dynamodb',
    table: 'users',
    key: { pk: 'user#123' },
    duration: 1500
  };
  
  const dbError = errorHandler.handleError(error, context);
  const report = errorHandler.reportError(dbError, context);
  
  console.log('Error suggestions:', report.suggestions);
  console.log('Severity:', report.severity);
  console.log('Actionable:', report.actionable);
}
```

#### Error Suggestions Examples

The system provides specific, actionable suggestions based on error type and context:

- **Connection Errors**: Network connectivity, credentials, security groups
- **Timeout Errors**: Query optimization, index usage, capacity scaling
- **Access Denied**: Permissions, IAM policies, authentication
- **Validation Errors**: Data format, required fields, constraints
- **Throughput Exceeded**: Capacity planning, access patterns, backoff strategies

### 3. Retry Manager (`retry-manager.ts`)

Intelligent retry mechanisms with exponential backoff and circuit breaker patterns.

#### Key Features

- **Exponential Backoff**: Configurable delay calculation with jitter
- **Retry Policies**: Different strategies for different error types
- **Circuit Breaker**: Automatic failure detection and recovery
- **Resilience Manager**: Combined retry and circuit breaker functionality
- **Comprehensive Logging**: Detailed retry attempt and failure logging

#### Usage

```typescript
import { ResilienceManagerFactory } from '../utils/retry-manager';

const resilienceManager = ResilienceManagerFactory.getManager('dynamodb');

// Execute operation with resilience
const result = await resilienceManager.executeWithResilience(
  async () => {
    // Your database operation
    return await databaseOperation();
  },
  'database_operation',
  'dynamodb',
  { key: 'user#123' }
);
```

#### Configuration

```typescript
const retryConfig = {
  maxAttempts: 5,
  baseDelay: 100,        // milliseconds
  maxDelay: 5000,        // milliseconds
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: ['CONNECTION_ERROR', 'TIMEOUT', 'THROUGHPUT_EXCEEDED']
};

const circuitConfig = {
  failureThreshold: 5,
  recoveryTimeout: 60000,  // milliseconds
  monitoringPeriod: 10000, // milliseconds
  halfOpenMaxCalls: 3
};
```

### 4. Integration with Database Providers

The error handling and logging system integrates seamlessly with database providers.

#### DynamoDB Provider Integration

```typescript
export class DynamoDBProvider extends BaseDatabaseProvider {
  private logger = LoggerFactory.getLogger('DynamoDBProvider', { provider: 'dynamodb' });
  private errorHandler = ErrorHandlerFactory.getHandler('dynamodb');
  private resilienceManager = ResilienceManagerFactory.getManager('dynamodb');

  async get<T>(key: DatabaseKey, options?: QueryOptions): Promise<T | null> {
    return withLogging(
      this.logger,
      'get',
      'dynamodb',
      async () => {
        const startTime = Date.now();
        
        try {
          const result = await this.resilienceManager.executeWithResilience(
            () => this.performGetOperation(key, options),
            'get',
            'dynamodb',
            { key, options }
          );
          
          this.logPerformanceMetrics('get', Date.now() - startTime, true);
          return result;
          
        } catch (error) {
          const context: ErrorContext = {
            operation: 'get',
            provider: 'dynamodb',
            table: this.getTableName(key),
            key,
            duration: Date.now() - startTime
          };
          
          throw this.errorHandler.handleError(error, context);
        }
      }
    );
  }
}
```

## Error Types and Handling

### Unified Error Types

All database errors are translated to unified types:

- `ConnectionError`: Network and connectivity issues
- `ValidationError`: Data validation failures
- `TransactionError`: Transaction-related failures
- `TimeoutError`: Operation timeouts
- `AccessDeniedError`: Permission and authentication issues
- `ResourceNotFoundError`: Missing tables, databases, etc.
- `DuplicateKeyError`: Unique constraint violations
- `ProvisionedThroughputExceededError`: Capacity limits (DynamoDB)
- `InternalServerError`: Provider internal errors
- `ConfigurationError`: Setup and configuration issues

### Error Translation

Provider-specific errors are automatically translated:

#### DynamoDB Error Translation

```typescript
// AWS SDK Error -> Unified Error
'ResourceNotFoundException' -> ResourceNotFoundError
'ConditionalCheckFailedException' -> ConditionalCheckFailedError
'ProvisionedThroughputExceededException' -> ProvisionedThroughputExceededError
'ValidationException' -> ValidationError
'AccessDeniedException' -> AccessDeniedError
```

#### MongoDB Error Translation

```typescript
// MongoDB Error -> Unified Error
Code 11000 -> DuplicateKeyError
Code 50 -> TimeoutError
Code 13 -> AccessDeniedError
Code 26 -> ResourceNotFoundError
'MongoNetworkError' -> ConnectionError
```

## Performance Monitoring

### Slow Operation Detection

Operations exceeding configurable thresholds are automatically logged:

```typescript
const performanceLogger = LoggerFactory.createPerformanceLogger('Component', 1000); // 1 second threshold

performanceLogger.logOperation({
  operation: 'query',
  provider: 'dynamodb',
  duration: 1500,  // Will trigger slow operation warning
  success: true,
  itemCount: 100
});
```

### Metrics Collection

The system collects comprehensive metrics:

- Operation timing and success rates
- Error frequencies by type and provider
- Connection events and health status
- Circuit breaker state changes
- Retry attempt patterns

## Error Aggregation and Analysis

### Error Aggregator

Collects and analyzes error patterns:

```typescript
import { ErrorHandlerFactory } from '../utils/error-handler';

const aggregator = ErrorHandlerFactory.createAggregator();

// Errors are automatically added by error handlers
const summary = aggregator.getErrorSummary(3600000); // Last hour

console.log('Error Summary:', {
  totalErrors: summary.totalErrors,
  byProvider: summary.byProvider,
  bySeverity: summary.bySeverity,
  topErrors: summary.topErrors
});
```

### Pattern Analysis

The system can identify error patterns and provide recommendations:

```typescript
const analysis = analyzeErrorPatterns();
// Returns:
// {
//   patterns: ['High number of critical errors', 'Frequent connection errors'],
//   recommendations: ['Investigate infrastructure', 'Check network connectivity']
// }
```

## Circuit Breaker Pattern

### States

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Failure threshold exceeded, requests are rejected
- **HALF_OPEN**: Testing recovery, limited requests allowed

### Configuration

```typescript
const circuitConfig = {
  failureThreshold: 5,     // Failures before opening
  recoveryTimeout: 60000,  // Time before attempting recovery
  halfOpenMaxCalls: 3      // Test calls in half-open state
};
```

### Automatic Recovery

The circuit breaker automatically:
1. Opens when failure threshold is reached
2. Transitions to half-open after recovery timeout
3. Closes after successful test calls
4. Reopens if test calls fail

## Best Practices

### 1. Structured Logging

Always include relevant context in log entries:

```typescript
logger.info('Operation completed', {
  operation: 'get',
  provider: 'dynamodb',
  table: 'users',
  key: 'user#123',
  duration: 150,
  itemCount: 1
});
```

### 2. Error Context

Provide comprehensive context when handling errors:

```typescript
const context: ErrorContext = {
  operation: 'query',
  provider: 'dynamodb',
  table: 'users',
  query: queryParams,
  duration: Date.now() - startTime,
  correlationId: requestId,
  userId: currentUser.id
};
```

### 3. Performance Monitoring

Set appropriate thresholds for your use case:

```typescript
// Different thresholds for different operations
const getLogger = LoggerFactory.createPerformanceLogger('Get', 500);    // 500ms
const queryLogger = LoggerFactory.createPerformanceLogger('Query', 2000); // 2s
const scanLogger = LoggerFactory.createPerformanceLogger('Scan', 5000);   // 5s
```

### 4. Circuit Breaker Configuration

Configure based on your system's characteristics:

```typescript
// High-traffic system
const highTrafficConfig = {
  failureThreshold: 10,
  recoveryTimeout: 30000,
  halfOpenMaxCalls: 5
};

// Low-traffic system
const lowTrafficConfig = {
  failureThreshold: 3,
  recoveryTimeout: 60000,
  halfOpenMaxCalls: 2
};
```

### 5. Error Recovery

Implement graceful error recovery:

```typescript
async function recoverFromErrors() {
  // Reset circuit breakers
  ResilienceManagerFactory.resetAll();
  
  // Clear error statistics
  errorHandler.resetStatistics();
  
  // Test connectivity
  await testConnectivity();
  
  logger.info('Error recovery completed');
}
```

## Environment Configuration

Configure the system via environment variables:

```bash
# Logging
export DATABASE_LOG_LEVEL=INFO

# Retry configuration
export DATABASE_RETRY_MAX_ATTEMPTS=5
export DATABASE_RETRY_BASE_DELAY=100
export DATABASE_RETRY_MAX_DELAY=5000

# Circuit breaker configuration
export DATABASE_CIRCUIT_FAILURE_THRESHOLD=5
export DATABASE_CIRCUIT_RECOVERY_TIMEOUT=60000

# Performance monitoring
export DATABASE_SLOW_OPERATION_THRESHOLD=1000
```

## Testing

The system includes comprehensive tests for all components:

```bash
# Run all error handling tests
npm test -- --testPathPattern="error-handler|database-logger|retry-manager"

# Run specific test suites
npm test database-logger.spec.ts
npm test error-handler.spec.ts
npm test retry-manager.spec.ts
```

## Integration Example

See `error-handling-integration-example.ts` for a complete example showing how to integrate all components in a real database provider implementation.

## Troubleshooting

### Common Issues

1. **High Error Rates**: Check error aggregator summary and patterns
2. **Circuit Breaker Always Open**: Review failure thresholds and recovery timeouts
3. **Missing Log Context**: Ensure proper logger configuration and context passing
4. **Performance Issues**: Monitor slow operation logs and adjust thresholds

### Debugging

Enable debug logging to see detailed operation flow:

```bash
export DATABASE_LOG_LEVEL=DEBUG
```

This will show:
- All retry attempts and delays
- Circuit breaker state transitions
- Detailed error context and suggestions
- Performance metrics for all operations