# MongoDB Provider

The MongoDB provider implements the unified database abstraction layer for MongoDB, providing seamless integration with MongoDB databases while maintaining compatibility with the existing DynamoDB-based data access patterns.

## Features

- **Full CRUD Operations**: Complete support for Create, Read, Update, and Delete operations
- **Advanced Querying**: Support for complex queries with filtering, sorting, and pagination
- **Transaction Support**: Full ACID transaction support using MongoDB sessions
- **Connection Management**: Robust connection pooling and health monitoring
- **Error Translation**: Unified error handling that translates MongoDB errors to standard database errors
- **Performance Monitoring**: Built-in metrics collection and performance tracking
- **Data Transformation**: Automatic transformation between application data models and MongoDB documents

## Installation

The MongoDB provider requires the MongoDB Node.js driver:

```bash
npm install mongodb @types/mongodb
```

## Configuration

### Basic Configuration

```typescript
import { MongoDBConfig } from '../types/database-abstraction';

const config: MongoDBConfig = {
  connectionString: 'mongodb://localhost:27017',
  database: 'mytaptrack',
  collections: {
    primary: 'primary_data',
    data: 'secondary_data'
  }
};
```

### Advanced Configuration

```typescript
const config: MongoDBConfig = {
  connectionString: 'mongodb://username:password@host1:27017,host2:27017/database?replicaSet=myReplicaSet',
  database: 'mytaptrack_prod',
  collections: {
    primary: 'primary_data',
    data: 'secondary_data'
  },
  options: {
    maxPoolSize: 20,           // Maximum number of connections in pool
    minPoolSize: 5,            // Minimum number of connections in pool
    maxIdleTimeMS: 60000,      // Close connections after 60 seconds of inactivity
    serverSelectionTimeoutMS: 10000  // How long to try selecting a server
  }
};
```

### Environment-Based Configuration

```typescript
const config: MongoDBConfig = {
  connectionString: process.env.MONGODB_URL || 'mongodb://localhost:27017',
  database: process.env.MONGODB_DATABASE || 'mytaptrack',
  collections: {
    primary: process.env.MONGODB_PRIMARY_COLLECTION || 'primary_data',
    data: process.env.MONGODB_DATA_COLLECTION || 'secondary_data'
  },
  options: {
    maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10'),
    minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2'),
    maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS || '30000'),
    serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '5000')
  }
};
```

## Usage

### Basic Setup

```typescript
import { MongoDBProvider } from './mongodb-provider';

const provider = new MongoDBProvider(config);

// Connect to MongoDB
await provider.connect();

// Check connection health
const health = await provider.healthCheck();
console.log('Connected:', health.healthy);
```

### CRUD Operations

#### Create (Put)

```typescript
// Insert a new document
const userData = {
  pk: 'user#123',
  sk: 'profile',
  userId: 'user123',
  name: 'John Doe',
  email: 'john.doe@example.com',
  status: 'active'
};

await provider.put(userData);

// Insert with condition (ensure document doesn't exist)
await provider.put(userData, { ensureNotExists: true });
```

#### Read (Get)

```typescript
import { DatabaseKey } from '../types/database-abstraction';

const key: DatabaseKey = { primary: 'user#123', sort: 'profile' };

// Get document
const user = await provider.get(key);

// Get with projection (only specific fields)
const userBasic = await provider.get(key, {
  projection: ['name', 'email']
});
```

#### Update

```typescript
import { UnifiedUpdateInput } from '../types/database-abstraction';

const updateInput: UnifiedUpdateInput = {
  key: { primary: 'user#123', sort: 'profile' },
  updates: {
    name: 'John Smith',
    lastLogin: new Date()
  },
  incrementFields: {
    loginCount: 1
  },
  appendToList: {
    tags: ['premium', 'verified']
  }
};

await provider.update(updateInput);
```

#### Delete

```typescript
const key: DatabaseKey = { primary: 'user#123', sort: 'profile' };

// Simple delete
await provider.delete(key);

// Delete with condition
await provider.delete(key, {
  condition: {
    field: 'status',
    operator: '=',
    value: 'inactive'
  }
});
```

### Query Operations

#### Query with Key Condition

```typescript
// Query by primary key
const users = await provider.query({
  keyCondition: {
    field: 'pk',
    operator: '=',
    value: 'user#123'
  }
});

// Query with begins_with
const userProfiles = await provider.query({
  keyCondition: {
    field: 'pk',
    operator: 'begins_with',
    value: 'user#'
  },
  filterCondition: {
    field: 'status',
    operator: '=',
    value: 'active'
  },
  limit: 10,
  sortOrder: 'ASC'
});

// Query with between
const recentUsers = await provider.query({
  keyCondition: {
    field: 'createdAt',
    operator: 'between',
    value: new Date('2023-01-01'),
    value2: new Date('2023-12-31')
  }
});
```

#### Scan Operations

```typescript
// Scan with filter
const activeUsers = await provider.scan({
  filterCondition: {
    field: 'status',
    operator: '=',
    value: 'active'
  },
  limit: 100
});

// Scan with pagination
let token = undefined;
const allUsers = [];

do {
  const result = await provider.scan({
    limit: 50,
    startKey: token
  });
  
  allUsers.push(...result.items);
  token = result.token;
} while (token);
```

#### Batch Operations

```typescript
// Batch get multiple documents
const keys: DatabaseKey[] = [
  { primary: 'user#123', sort: 'profile' },
  { primary: 'user#124', sort: 'profile' },
  { primary: 'user#125', sort: 'profile' }
];

const users = await provider.batchGet(keys);
```

### Transaction Operations

#### Using Transaction Object

```typescript
const transaction = await provider.beginTransaction();

try {
  // Add operations to transaction
  await transaction.put({
    pk: 'user#126',
    sk: 'profile',
    name: 'Alice Johnson',
    email: 'alice@example.com'
  });

  await transaction.update({
    key: { primary: 'user#123', sort: 'profile' },
    updates: { lastModified: new Date() }
  });

  await transaction.delete({ primary: 'user#124', sort: 'temp' });

  // Commit all operations
  await transaction.commit();
} catch (error) {
  // Rollback on error
  await transaction.rollback();
  throw error;
}
```

#### Using Execute Transaction

```typescript
import { TransactionOperation } from '../types/database-abstraction';

const operations: TransactionOperation[] = [
  {
    type: 'put',
    data: {
      pk: 'user#127',
      sk: 'profile',
      name: 'Bob Wilson'
    }
  },
  {
    type: 'update',
    updates: {
      key: { primary: 'user#123', sort: 'profile' },
      updates: { status: 'updated' }
    }
  },
  {
    type: 'delete',
    key: { primary: 'user#125', sort: 'temp' }
  }
];

await provider.executeTransaction(operations);
```

### Native MongoDB Operations

For operations that require MongoDB-specific functionality:

```typescript
// Execute native MongoDB aggregation
const aggregationResult = await provider.executeNative(async (db) => {
  return await db.collection('primary_data')
    .aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
    .toArray();
});

// Execute native MongoDB operations with full access to the database
const customResult = await provider.executeNative(async (db) => {
  const collection = db.collection('primary_data');
  
  // Create index
  await collection.createIndex({ pk: 1, sk: 1 }, { unique: true });
  
  // Execute complex query
  return await collection.find({
    $and: [
      { status: 'active' },
      { createdAt: { $gte: new Date('2023-01-01') } }
    ]
  }).toArray();
});
```

## Data Model Transformation

The MongoDB provider automatically transforms data between the application format and MongoDB document format:

### Application Format → MongoDB Document

```typescript
// Application data
const appData = {
  pk: 'user#123',
  sk: 'profile',
  userId: 'user123',
  name: 'John Doe'
};

// Automatically transformed to MongoDB document
{
  _id: ObjectId("..."),
  pk: 'user#123',
  sk: 'profile',
  pksk: 'user#123#profile',  // Composite key for indexing
  userId: 'user123',
  name: 'John Doe',
  createdAt: Date,
  updatedAt: Date
}
```

### MongoDB Document → Application Format

```typescript
// MongoDB document
{
  _id: ObjectId("..."),
  pk: 'user#123',
  sk: 'profile',
  pksk: 'user#123#profile',
  userId: 'user123',
  name: 'John Doe',
  createdAt: Date,
  updatedAt: Date
}

// Automatically transformed to application format
{
  pk: 'user#123',
  sk: 'profile',
  pksk: 'user#123#profile',
  userId: 'user123',
  name: 'John Doe',
  createdAt: Date,
  updatedAt: Date
  // Note: _id is removed
}
```

## Error Handling

The MongoDB provider translates MongoDB-specific errors to unified database errors:

```typescript
import { 
  ItemNotFoundError, 
  DuplicateKeyError, 
  ConnectionError,
  ValidationError 
} from '../types/database-errors';

try {
  await provider.get({ primary: 'nonexistent', sort: 'item' });
} catch (error) {
  if (error instanceof ItemNotFoundError) {
    console.log('Item not found');
  } else if (error instanceof ConnectionError) {
    console.log('Database connection issue');
  }
}
```

### Common Error Mappings

| MongoDB Error | Unified Error | Description |
|---------------|---------------|-------------|
| Code 11000 | DuplicateKeyError | Duplicate key violation |
| Code 50 | TimeoutError | Operation timeout |
| Code 13 | AccessDeniedError | Authentication/authorization failure |
| Code 26 | ResourceNotFoundError | Database/collection not found |
| Code 112 | ConditionalCheckFailedError | Write conflict |
| MongoNetworkError | ConnectionError | Network connectivity issues |

## Performance Considerations

### Connection Pooling

The MongoDB provider uses connection pooling for optimal performance:

```typescript
const config: MongoDBConfig = {
  // ... other config
  options: {
    maxPoolSize: 20,      // Adjust based on load
    minPoolSize: 5,       // Keep minimum connections open
    maxIdleTimeMS: 60000  // Close idle connections
  }
};
```

### Indexing

Ensure proper indexes are created for optimal query performance:

```typescript
// Create indexes using native operations
await provider.executeNative(async (db) => {
  const collection = db.collection('primary_data');
  
  // Compound index for pk/sk queries
  await collection.createIndex({ pk: 1, sk: 1 });
  
  // Index for pksk composite key
  await collection.createIndex({ pksk: 1 }, { unique: true });
  
  // Indexes for common query fields
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ createdAt: 1 });
  await collection.createIndex({ userId: 1 });
});
```

### Batch Operations

Use batch operations for better performance when dealing with multiple documents:

```typescript
// Instead of multiple individual gets
const users = await provider.batchGet([
  { primary: 'user#1', sort: 'profile' },
  { primary: 'user#2', sort: 'profile' },
  { primary: 'user#3', sort: 'profile' }
]);

// Instead of multiple individual puts in a loop
const operations = userData.map(data => ({
  type: 'put' as const,
  data
}));
await provider.executeTransaction(operations);
```

## Monitoring and Metrics

The MongoDB provider includes built-in metrics collection:

```typescript
// Get performance metrics
const metrics = provider['metrics'].getMetrics('mongodb');

console.log('Performance Metrics:', {
  totalOperations: metrics.totalOperations,
  successRate: (metrics.successfulOperations / metrics.totalOperations) * 100,
  averageResponseTime: metrics.averageResponseTime,
  errorRate: metrics.errorRate
});
```

## Best Practices

### 1. Connection Management

```typescript
// Always disconnect when done
try {
  await provider.connect();
  // ... operations
} finally {
  await provider.disconnect();
}
```

### 2. Error Handling

```typescript
// Handle specific error types
try {
  await provider.put(data, { ensureNotExists: true });
} catch (error) {
  if (error instanceof DuplicateKeyError) {
    // Handle duplicate key specifically
    console.log('Document already exists');
  } else {
    // Handle other errors
    throw error;
  }
}
```

### 3. Transaction Usage

```typescript
// Keep transactions short and focused
const transaction = await provider.beginTransaction();
try {
  // Only include related operations
  await transaction.put(userData);
  await transaction.update(relatedUpdate);
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

### 4. Query Optimization

```typescript
// Use specific queries instead of scans when possible
const users = await provider.query({
  keyCondition: {
    field: 'pk',
    operator: 'begins_with',
    value: 'user#'
  },
  filterCondition: {
    field: 'status',
    operator: '=',
    value: 'active'
  }
});

// Use projection to limit returned data
const userNames = await provider.query({
  keyCondition: { field: 'pk', operator: 'begins_with', value: 'user#' },
  projection: ['name', 'email']
});
```

## Migration from DynamoDB

The MongoDB provider is designed to be a drop-in replacement for the DynamoDB provider:

```typescript
// Before (DynamoDB)
const dynamoProvider = new DynamoDBProvider(dynamoConfig);

// After (MongoDB) - same interface
const mongoProvider = new MongoDBProvider(mongoConfig);

// All operations work the same way
await mongoProvider.get(key);
await mongoProvider.put(data);
await mongoProvider.query(queryInput);
```

## Troubleshooting

### Connection Issues

```typescript
// Check connection status
if (!provider.isConnected()) {
  console.log('Not connected, attempting to reconnect...');
  await provider.connect();
}

// Monitor connection health
const health = await provider.healthCheck();
if (!health.healthy) {
  console.log('Connection unhealthy:', health.connectionStatus);
}
```

### Performance Issues

```typescript
// Enable detailed logging for slow operations
const startTime = Date.now();
const result = await provider.query(complexQuery);
const duration = Date.now() - startTime;

if (duration > 1000) {
  console.warn(`Slow query detected: ${duration}ms`);
}
```

### Memory Usage

```typescript
// Monitor connection pool
const config = provider.getConfig();
console.log('Pool configuration:', {
  maxPoolSize: config.options?.maxPoolSize,
  minPoolSize: config.options?.minPoolSize
});
```

## Testing

The MongoDB provider includes comprehensive test coverage. Run tests with:

```bash
npm test -- mongodb-provider.spec.ts
```

For integration testing with a real MongoDB instance:

```bash
# Start MongoDB (using Docker)
docker run -d -p 27017:27017 --name mongodb-test mongo:latest

# Run integration tests
MONGODB_URL=mongodb://localhost:27017 npm test
```

## Contributing

When contributing to the MongoDB provider:

1. Ensure all tests pass
2. Add tests for new functionality
3. Update documentation
4. Follow the existing code style
5. Ensure error handling is consistent with the unified error system

## License

This MongoDB provider is part of the MyTapTrack database abstraction layer and follows the same license as the main project.