# Enhanced Transaction Management System

The Enhanced Transaction Management System provides advanced transaction capabilities with error handling, rollback mechanisms, and fallback support for the database abstraction layer.

## Features

- **Enhanced Transaction Interface**: Extends basic transaction functionality with advanced features
- **Automatic Retry Logic**: Configurable retry mechanisms for transient failures
- **Timeout Management**: Automatic transaction timeout and cleanup
- **Fallback Support**: Graceful handling for databases without full transaction support
- **Error Handling**: Comprehensive error translation and recovery mechanisms
- **Monitoring**: Active transaction tracking and metrics collection
- **Rollback Mechanisms**: Automatic and manual rollback capabilities

## Core Components

### TransactionManager

The main entry point for transaction management operations.

```typescript
import { createTransactionManager } from './transaction-manager';

const transactionManager = createTransactionManager();
```

### EnhancedTransaction

An enhanced transaction implementation that wraps the underlying provider transaction with additional capabilities.

```typescript
const transaction = await transactionManager.beginTransaction(provider, {
  timeout: 60000,
  maxRetries: 3,
  retryDelay: 2000,
  enableFallback: true
});
```

### Transaction Options

Configure transaction behavior with comprehensive options:

```typescript
interface TransactionOptions {
  timeout?: number;           // Transaction timeout in milliseconds
  maxRetries?: number;        // Maximum retry attempts
  retryDelay?: number;        // Delay between retries
  isolationLevel?: string;    // Transaction isolation level
  enableFallback?: boolean;   // Enable fallback for unsupported providers
  onRetry?: (attempt: number, error: DatabaseError) => void;
  onRollback?: (reason: string, error?: DatabaseError) => void;
}
```

## Usage Examples

### Basic Transaction

```typescript
import { createTransactionManager } from './transaction-manager';
import { DatabaseFactory } from './database-factory';

async function basicExample() {
  const transactionManager = createTransactionManager();
  const provider = DatabaseFactory.create(config);
  
  await provider.connect();
  
  try {
    const transaction = await transactionManager.beginTransaction(provider);
    
    await transaction.put({
      pk: 'user#123',
      sk: 'profile',
      name: 'John Doe',
      email: 'john@example.com'
    });
    
    await transaction.update({
      key: { primary: 'user#123', sort: 'settings' },
      updates: { theme: 'dark' }
    });
    
    await transactionManager.executeTransaction(transaction);
    
  } catch (error) {
    console.error('Transaction failed:', error);
  } finally {
    await provider.disconnect();
    transactionManager.destroy();
  }
}
```

### Advanced Transaction with Retry

```typescript
async function advancedExample() {
  const transaction = await transactionManager.beginTransaction(provider, {
    timeout: 60000,
    maxRetries: 3,
    retryDelay: 2000,
    onRetry: (attempt, error) => {
      console.log(`Retry attempt ${attempt}: ${error.message}`);
    },
    onRollback: (reason, error) => {
      console.log(`Rollback: ${reason}`, error?.message);
    }
  });
  
  // Perform operations...
  await transactionManager.executeTransaction(transaction);
}
```

### Fallback Transaction

For databases that don't support full ACID transactions:

```typescript
async function fallbackExample() {
  const transaction = await transactionManager.beginTransaction(provider, {
    enableFallback: true
  });
  
  // Operations are executed sequentially with rollback capability
  await transaction.put(data);
  await transaction.update(updateInput);
  
  await transactionManager.executeTransaction(transaction);
}
```

### Manual Transaction Control

```typescript
async function manualExample() {
  const transaction = await transactionManager.beginTransaction(provider);
  
  try {
    await transaction.put(data);
    await transaction.update(updateInput);
    
    // Manual commit
    await transaction.commit();
    
  } catch (error) {
    // Manual rollback
    await transaction.rollback();
    throw error;
  }
}
```

## Transaction States

Transactions progress through the following states:

- **ACTIVE**: Transaction is active and accepting operations
- **COMMITTED**: Transaction has been successfully committed
- **ROLLED_BACK**: Transaction has been rolled back
- **FAILED**: Transaction has failed and cannot be recovered

## Error Handling

The system provides comprehensive error handling:

### Retryable Errors

Errors that can be automatically retried:
- Connection errors
- Timeout errors
- Throughput exceeded errors
- Internal server errors

### Non-Retryable Errors

Errors that cannot be retried:
- Validation errors
- Conditional check failures
- Access denied errors
- Configuration errors

### Error Translation

All provider-specific errors are translated to unified error types:

```typescript
try {
  await transaction.commit();
} catch (error) {
  if (error instanceof TransactionError) {
    console.log('Transaction error:', error.code);
  } else if (error instanceof ValidationError) {
    console.log('Validation error:', error.message);
  }
}
```

## Monitoring and Metrics

### Active Transaction Monitoring

```typescript
const activeTransactions = transactionManager.getActiveTransactions();
console.log(`Active transactions: ${activeTransactions.length}`);

for (const txn of activeTransactions) {
  console.log(`Transaction ${txn.getTransactionId()}: ${txn.getState()}`);
}
```

### Transaction Metrics

```typescript
import { DefaultMetricsCollector } from '../types/database-provider';

const metrics = new DefaultMetricsCollector();
const transactionManager = new TransactionManager(metrics);

// Metrics are automatically collected for all operations
const operationMetrics = metrics.getMetrics('dynamodb');
console.log('Average response time:', operationMetrics.averageResponseTime);
console.log('Error rate:', operationMetrics.errorRate);
```

### Cleanup and Maintenance

The transaction manager automatically cleans up expired transactions:

```typescript
// Manual cleanup
await transactionManager.cleanupExpiredTransactions();

// Automatic cleanup runs every 5 minutes
// Transactions older than 2x their timeout are cleaned up
```

## Utility Functions

### Transaction Status Checks

```typescript
import { 
  isTransactionActive, 
  getTransactionAge, 
  isTransactionExpired 
} from './transaction-manager';

if (isTransactionActive(transaction)) {
  const age = getTransactionAge(transaction);
  console.log(`Transaction age: ${age}ms`);
  
  if (isTransactionExpired(transaction)) {
    console.log('Transaction has expired');
  }
}
```

## Provider Support

### DynamoDB Transactions

- Full ACID transaction support
- Up to 25 operations per transaction
- Automatic retry on transient failures
- Condition checks and atomic operations

### MongoDB Transactions

- Session-based transactions
- Multi-document ACID transactions
- Automatic retry on transient failures
- Rollback on any operation failure

### Fallback Mode

For providers without full transaction support:
- Sequential operation execution
- Manual rollback implementation
- Best-effort consistency
- Operation tracking for rollback

## Best Practices

### Transaction Design

1. **Keep transactions short**: Minimize transaction duration to reduce lock contention
2. **Batch related operations**: Group related operations in a single transaction
3. **Handle failures gracefully**: Always implement proper error handling
4. **Use timeouts**: Set appropriate timeouts to prevent hanging transactions

### Error Handling

1. **Distinguish error types**: Handle retryable vs non-retryable errors differently
2. **Implement retry logic**: Use exponential backoff for retries
3. **Log transaction failures**: Maintain audit logs for failed transactions
4. **Monitor transaction metrics**: Track success rates and performance

### Performance Optimization

1. **Use connection pooling**: Maintain efficient database connections
2. **Minimize transaction scope**: Only include necessary operations
3. **Optimize retry settings**: Balance reliability with performance
4. **Monitor active transactions**: Prevent transaction buildup

## Configuration

### Environment Variables

```bash
# Transaction defaults
TRANSACTION_DEFAULT_TIMEOUT=30000
TRANSACTION_DEFAULT_MAX_RETRIES=3
TRANSACTION_DEFAULT_RETRY_DELAY=1000
TRANSACTION_CLEANUP_INTERVAL=300000
```

### Provider-Specific Configuration

```typescript
// DynamoDB configuration
const dynamoConfig = {
  provider: 'dynamodb',
  dynamodb: {
    region: 'us-east-1',
    primaryTable: 'MyTable',
    dataTable: 'MyDataTable',
    consistentRead: true
  }
};

// MongoDB configuration
const mongoConfig = {
  provider: 'mongodb',
  mongodb: {
    connectionString: 'mongodb://localhost:27017',
    database: 'myapp',
    collections: {
      primary: 'documents',
      data: 'data'
    },
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000
    }
  }
};
```

## Testing

The transaction management system includes comprehensive tests:

```bash
# Run transaction tests
npm test -- transaction-manager.spec.ts

# Run integration tests
npm test -- transaction-management-example.ts
```

## Troubleshooting

### Common Issues

1. **Transaction Timeouts**: Increase timeout or reduce transaction scope
2. **Retry Exhaustion**: Check for persistent connection issues
3. **Rollback Failures**: Ensure proper error handling in rollback logic
4. **Memory Leaks**: Verify transaction cleanup and manager destruction

### Debug Logging

Enable debug logging for transaction operations:

```typescript
const transaction = await transactionManager.beginTransaction(provider, {
  onRetry: (attempt, error) => {
    console.debug(`Retry ${attempt}: ${error.code} - ${error.message}`);
  },
  onRollback: (reason, error) => {
    console.debug(`Rollback: ${reason}`, error);
  }
});
```

## Migration Guide

### From Basic Transactions

```typescript
// Before: Basic transaction
const transaction = await provider.beginTransaction();
await transaction.put(data);
await transaction.commit();

// After: Enhanced transaction
const transactionManager = createTransactionManager();
const transaction = await transactionManager.beginTransaction(provider);
await transaction.put(data);
await transactionManager.executeTransaction(transaction);
```

### Adding Error Handling

```typescript
// Add retry and timeout handling
const transaction = await transactionManager.beginTransaction(provider, {
  timeout: 60000,
  maxRetries: 3,
  retryDelay: 2000
});
```

## API Reference

See the TypeScript interfaces and classes in `transaction-manager.ts` for complete API documentation.