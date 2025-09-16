# DynamoDB Provider Implementation

This document describes the DynamoDB provider implementation for the database abstraction layer.

## Overview

The DynamoDB provider (`DynamoDBProvider`) implements the unified database abstraction interface (`IDataAccessLayer`) specifically for Amazon DynamoDB. It provides a consistent API for database operations while maintaining compatibility with existing DynamoDB patterns and functionality.

## Features

### Core Functionality
- **CRUD Operations**: Get, Put, Update, Delete with DynamoDB-specific optimizations
- **Query Operations**: Query and Scan with pagination support
- **Batch Operations**: Batch get operations with automatic batching (100-item limit)
- **Transaction Support**: Full ACID transactions with up to 25 operations
- **Connection Management**: Automatic connection handling and health monitoring
- **Error Translation**: Unified error handling with DynamoDB-specific error translation

### Advanced Features
- **Metrics Collection**: Built-in performance monitoring and metrics
- **Health Checks**: Connection status and performance monitoring
- **Native Operations**: Escape hatch for DynamoDB-specific operations
- **Consistent Read Support**: Configurable consistent read behavior
- **Index Support**: Global and Local Secondary Index support

## Configuration

```typescript
interface DynamoDBConfig {
  region: string;           // AWS region
  primaryTable: string;     // Primary table name
  dataTable: string;        // Data table name (for multi-table setups)
  consistentRead?: boolean; // Default consistent read behavior
  endpoint?: string;        // Custom endpoint (for local development)
}
```

### Environment Variables
- `AWS_REGION`: AWS region for DynamoDB
- `PrimaryTable`: Primary table name
- `DataTable`: Data table name
- `STRONGLY_CONSISTENT_READ`: Enable consistent reads (true/false)

## Usage Examples

### Basic Setup

```typescript
import { DynamoDBProvider } from './providers/dynamodb-provider';

const config = {
  region: 'us-east-1',
  primaryTable: 'MyApp-Primary',
  dataTable: 'MyApp-Data',
  consistentRead: true
};

const provider = new DynamoDBProvider(config);
await provider.connect();
```

### CRUD Operations

```typescript
// Create
await provider.put({
  pk: 'USER#123',
  sk: 'PROFILE',
  userId: '123',
  name: 'John Doe',
  email: 'john@example.com'
});

// Read
const user = await provider.get({
  primary: 'USER#123',
  sort: 'PROFILE'
});

// Update
await provider.update({
  key: { primary: 'USER#123', sort: 'PROFILE' },
  updates: { name: 'John Smith' },
  incrementFields: { version: 1 }
});

// Delete
await provider.delete({
  primary: 'USER#123',
  sort: 'PROFILE'
});
```

### Query Operations

```typescript
// Query by partition key
const userRecords = await provider.query({
  keyCondition: {
    field: 'pk',
    operator: '=',
    value: 'USER#123'
  }
});

// Query with filter
const activeUsers = await provider.query({
  keyCondition: {
    field: 'pk',
    operator: 'begins_with',
    value: 'USER#'
  },
  filterCondition: {
    field: 'status',
    operator: '=',
    value: 'active'
  },
  indexName: 'StatusIndex'
});
```

### Transactions

```typescript
// Using executeTransaction
await provider.executeTransaction([
  {
    type: 'put',
    data: { pk: 'USER#456', sk: 'PROFILE', name: 'Jane Doe' }
  },
  {
    type: 'update',
    updates: {
      key: { primary: 'STATS', sort: 'USER_COUNT' },
      updates: {},
      incrementFields: { count: 1 }
    }
  }
]);

// Using transaction object
const transaction = await provider.beginTransaction();
await transaction.put({ pk: 'USER#789', sk: 'PROFILE', name: 'Bob Smith' });
await transaction.update({
  key: { primary: 'STATS', sort: 'USER_COUNT' },
  updates: {},
  incrementFields: { count: 1 }
});
await transaction.commit();
```

### Batch Operations

```typescript
// Batch get
const keys = [
  { primary: 'USER#123', sort: 'PROFILE' },
  { primary: 'USER#456', sort: 'PROFILE' }
];
const users = await provider.batchGet(keys);

// Scan with pagination
const result = await provider.scan({
  filterCondition: {
    field: 'type',
    operator: '=',
    value: 'user'
  },
  limit: 50
});
```

## Integration with Existing DAL

The DynamoDB provider can be integrated with existing DAL classes:

```typescript
class ModernUserDal {
  constructor(private provider: DynamoDBProvider) {}
  
  async getUser(userId: string) {
    return this.provider.get({
      primary: `USER#${userId}`,
      sort: 'PROFILE'
    });
  }
  
  async createUser(userData: any) {
    await this.provider.put({
      pk: `USER#${userData.userId}`,
      sk: 'PROFILE',
      ...userData
    }, { ensureNotExists: true });
  }
}
```

## Error Handling

The provider translates DynamoDB errors to unified error types:

```typescript
try {
  await provider.get({ primary: 'nonexistent' });
} catch (error) {
  if (error instanceof ItemNotFoundError) {
    console.log('Item not found');
  } else if (error instanceof ConnectionError) {
    console.log('Connection issue');
  }
}
```

### Error Types
- `ItemNotFoundError`: Item doesn't exist
- `ConditionalCheckFailedError`: Condition check failed
- `ConnectionError`: Network/connection issues
- `ValidationError`: Invalid input data
- `TransactionError`: Transaction failed
- `ProvisionedThroughputExceededError`: Throttling
- `AccessDeniedError`: Permission issues
- `TimeoutError`: Operation timeout

## Performance Monitoring

Built-in metrics collection:

```typescript
const metrics = provider.getMetrics();
console.log('Average response time:', metrics.averageResponseTime);
console.log('Error rate:', metrics.errorRate);
console.log('Total operations:', metrics.totalOperations);
```

## Health Monitoring

```typescript
const health = await provider.healthCheck();
console.log('Healthy:', health.healthy);
console.log('Connection status:', health.connectionStatus);
console.log('Metrics:', health.metrics);
```

## Native Operations (Escape Hatch)

For DynamoDB-specific operations not covered by the abstraction:

```typescript
import { GetCommand } from '@aws-sdk/lib-dynamodb';

const result = await provider.executeNative(
  new GetCommand({
    TableName: 'MyTable',
    Key: { pk: 'test', sk: 'item' },
    // DynamoDB-specific options
    ReturnConsumedCapacity: 'TOTAL'
  })
);
```

## Key Mapping

The provider automatically converts between unified keys and DynamoDB keys:

```typescript
// Unified key format
const key = { primary: 'USER#123', sort: 'PROFILE' };

// Converted to DynamoDB format
const dynamoKey = { pk: 'USER#123', sk: 'PROFILE' };
```

## Update Expression Building

The provider automatically builds DynamoDB update expressions:

```typescript
const updateInput = {
  key: { primary: 'USER#123', sort: 'PROFILE' },
  updates: { name: 'New Name', status: 'active' },
  incrementFields: { loginCount: 1 },
  appendToList: { tags: ['new-tag'] }
};

// Generates:
// SET #n0 = :v0, #n1 = :v1, #n2 = list_append(if_not_exists(#n2, :empty_list), :v2)
// ADD #n3 :v3
```

## Testing

The provider includes comprehensive tests:

```bash
npm test -- --testPathPattern=dynamodb-provider
```

Test categories:
- Unit tests for core functionality
- Integration tests with mocked AWS SDK
- Error handling tests
- Performance tests
- Transaction tests

## Limitations

1. **Transaction Limits**: Maximum 25 operations per transaction (DynamoDB limit)
2. **Batch Limits**: Maximum 100 items per batch get (DynamoDB limit)
3. **Item Size**: 400KB maximum item size (DynamoDB limit)
4. **Query Complexity**: Limited to DynamoDB query capabilities
5. **Cross-Table Transactions**: Limited support for multi-table transactions

## Migration from Existing DAL

To migrate from the existing DAL pattern:

1. **Replace Dal instances** with DynamoDBProvider
2. **Update method calls** to use unified interface
3. **Modify key formats** to use DatabaseKey interface
4. **Update error handling** to use unified error types
5. **Test thoroughly** with existing data patterns

## Best Practices

1. **Connection Management**: Always connect before operations and disconnect when done
2. **Error Handling**: Use specific error types for different scenarios
3. **Batch Operations**: Use batch operations for multiple items
4. **Transactions**: Use transactions for related operations
5. **Monitoring**: Monitor metrics and health status
6. **Testing**: Test with both connected and disconnected states
7. **Configuration**: Use environment variables for configuration
8. **Performance**: Use consistent reads only when necessary

## Future Enhancements

Planned improvements:
- Connection pooling optimization
- Advanced caching layer
- Query optimization hints
- Automatic retry with exponential backoff
- Enhanced metrics and monitoring
- Support for DynamoDB Streams
- Advanced transaction patterns