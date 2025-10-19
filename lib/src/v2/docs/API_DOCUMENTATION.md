# Data Access Abstraction Layer - API Documentation

## Overview

The Data Access Abstraction Layer provides a unified interface for database operations that can seamlessly switch between MongoDB and DynamoDB. This abstraction layer maintains the existing functionality and performance characteristics while providing flexibility in database provider selection.

## Table of Contents

- [Core Interfaces](#core-interfaces)
- [Database Providers](#database-providers)
- [Configuration](#configuration)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Transactions](#transactions)
- [Metrics and Monitoring](#metrics-and-monitoring)
- [Migration Utilities](#migration-utilities)
- [Testing Framework](#testing-framework)

## Core Interfaces

### IDataAccessLayer

The main interface for all database operations.

```typescript
interface IDataAccessLayer<T> extends IDatabaseProvider {
  // CRUD Operations
  get<T>(key: DatabaseKey, options?: QueryOptions): Promise<T | null>;
  put<T>(data: T, options?: PutOptions): Promise<void>;
  update<T>(key: DatabaseKey, updates: UpdateInput, options?: UpdateOptions): Promise<void>;
  delete(key: DatabaseKey, options?: DeleteOptions): Promise<void>;
  
  // Query Operations
  query<T>(input: QueryInput): Promise<T[]>;
  scan<T>(input: ScanInput): Promise<{ items: T[], token?: any }>;
  batchGet<T>(keys: DatabaseKey[], options?: BatchOptions): Promise<T[]>;
  
  // Transaction Operations
  beginTransaction(): Promise<ITransaction>;
  
  // Provider-specific operations
  executeNative(operation: any): Promise<any>;
}
```

#### Methods

##### get<T>(key: DatabaseKey, options?: QueryOptions): Promise<T | null>

Retrieves a single item by its key.

**Parameters:**
- `key`: The database key identifying the item
- `options`: Optional query configuration

**Returns:** The item if found, null otherwise

**Example:**
```typescript
const user = await dal.get<UserData>({ 
  primary: 'USER#123', 
  sort: 'PROFILE' 
});
```

##### put<T>(data: T, options?: PutOptions): Promise<void>

Creates or updates an item in the database.

**Parameters:**
- `data`: The item to store
- `options`: Optional put configuration

**Example:**
```typescript
await dal.put({
  pk: 'USER#123',
  sk: 'PROFILE',
  userId: '123',
  name: 'John Doe',
  email: 'john@example.com'
});
```

##### update<T>(key: DatabaseKey, updates: UpdateInput, options?: UpdateOptions): Promise<void>

Updates specific fields of an existing item.

**Parameters:**
- `key`: The database key identifying the item
- `updates`: The fields to update
- `options`: Optional update configuration

**Example:**
```typescript
await dal.update(
  { primary: 'USER#123', sort: 'PROFILE' },
  { 
    name: 'John Smith',
    updatedAt: new Date()
  }
);
```

##### delete(key: DatabaseKey, options?: DeleteOptions): Promise<void>

Deletes an item from the database.

**Parameters:**
- `key`: The database key identifying the item
- `options`: Optional delete configuration

**Example:**
```typescript
await dal.delete({ primary: 'USER#123', sort: 'PROFILE' });
```

##### query<T>(input: QueryInput): Promise<T[]>

Performs a query operation with filtering and sorting.

**Parameters:**
- `input`: Query configuration

**Returns:** Array of matching items

**Example:**
```typescript
const students = await dal.query<StudentData>({
  keyCondition: {
    pk: 'USER#123',
    sk: { beginsWith: 'STUDENT#' }
  },
  filterCondition: {
    active: true
  },
  limit: 50
});
```

##### scan<T>(input: ScanInput): Promise<{ items: T[], token?: any }>

Performs a scan operation across the entire table or index.

**Parameters:**
- `input`: Scan configuration

**Returns:** Object containing items array and optional continuation token

**Example:**
```typescript
const result = await dal.scan<UserData>({
  filterCondition: {
    createdAt: { gte: new Date('2024-01-01') }
  },
  limit: 100
});
```

##### batchGet<T>(keys: DatabaseKey[], options?: BatchOptions): Promise<T[]>

Retrieves multiple items in a single operation.

**Parameters:**
- `keys`: Array of database keys
- `options`: Optional batch configuration

**Returns:** Array of found items

**Example:**
```typescript
const users = await dal.batchGet([
  { primary: 'USER#123', sort: 'PROFILE' },
  { primary: 'USER#456', sort: 'PROFILE' }
]);
```

### IDatabaseProvider

Base interface for database connectivity.

```typescript
interface IDatabaseProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getProviderType(): DatabaseProviderType;
}
```

### ITransaction

Interface for transaction operations.

```typescript
interface ITransaction {
  get<T>(key: DatabaseKey): Promise<T | null>;
  put<T>(data: T): Promise<void>;
  update(key: DatabaseKey, updates: UpdateInput): Promise<void>;
  delete(key: DatabaseKey): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
```

## Database Providers

### DynamoDB Provider

The DynamoDB provider maintains compatibility with the existing DynamoDB implementation.

```typescript
import { DynamoDBProvider } from '@mytaptrack/lib/v2/providers';

const provider = new DynamoDBProvider({
  region: 'us-east-1',
  primaryTable: 'MyTapTrack-Primary',
  dataTable: 'MyTapTrack-Data',
  consistentRead: true
});
```

### MongoDB Provider

The MongoDB provider provides equivalent functionality using MongoDB as the backend.

```typescript
import { MongoDBProvider } from '@mytaptrack/lib/v2/providers';

const provider = new MongoDBProvider({
  connectionString: 'mongodb://localhost:27017',
  database: 'mytaptrack',
  collections: {
    primary: 'primary_data',
    data: 'data_records'
  }
});
```

## Configuration

### Database Configuration

```typescript
interface DatabaseConfig {
  provider: 'dynamodb' | 'mongodb';
  dynamodb?: DynamoDBConfig;
  mongodb?: MongoDBConfig;
  migration?: MigrationConfig;
}

interface DynamoDBConfig {
  region: string;
  primaryTable: string;
  dataTable: string;
  consistentRead?: boolean;
}

interface MongoDBConfig {
  connectionString: string;
  database: string;
  collections: {
    primary: string;
    data: string;
  };
}
```

### Environment Variables

The abstraction layer supports configuration through environment variables:

```bash
# Database Provider Selection
DATABASE_PROVIDER=dynamodb  # or 'mongodb'

# DynamoDB Configuration
DYNAMODB_REGION=us-east-1
DYNAMODB_PRIMARY_TABLE=MyTapTrack-Primary
DYNAMODB_DATA_TABLE=MyTapTrack-Data
DYNAMODB_CONSISTENT_READ=true

# MongoDB Configuration
MONGODB_CONNECTION_STRING=mongodb://localhost:27017
MONGODB_DATABASE=mytaptrack
MONGODB_PRIMARY_COLLECTION=primary_data
MONGODB_DATA_COLLECTION=data_records
```

## Data Models

### Base Storage Model

All data models extend the base storage model:

```typescript
interface BaseStorageModel {
  pk: string;           // Primary key
  sk: string;           // Sort key
  pksk: string;         // Composite key for indexing
  version: number;      // Version for optimistic locking
  createdAt?: Date;     // Creation timestamp
  updatedAt?: Date;     // Last update timestamp
}
```

### User Data Model

```typescript
interface UserDataStorage extends BaseStorageModel {
  userId: string;
  usk: string;
  license: string;
  name: string;
  email: string;
  // ... other user-specific fields
}
```

### Student Data Model

```typescript
interface StudentDataStorage extends BaseStorageModel {
  studentId: string;
  userId: string;
  name: string;
  grade?: string;
  active: boolean;
  // ... other student-specific fields
}
```

## Error Handling

### Unified Error System

The abstraction layer provides consistent error handling across all providers:

```typescript
abstract class DatabaseError extends Error {
  abstract readonly code: string;
  abstract readonly retryable: boolean;
}

class ItemNotFoundError extends DatabaseError {
  readonly code = 'ITEM_NOT_FOUND';
  readonly retryable = false;
}

class ConditionalCheckFailedError extends DatabaseError {
  readonly code = 'CONDITIONAL_CHECK_FAILED';
  readonly retryable = false;
}

class ConnectionError extends DatabaseError {
  readonly code = 'CONNECTION_ERROR';
  readonly retryable = true;
}
```

### Error Handling Example

```typescript
try {
  const user = await dal.get({ primary: 'USER#123', sort: 'PROFILE' });
} catch (error) {
  if (error instanceof ItemNotFoundError) {
    console.log('User not found');
  } else if (error instanceof ConnectionError && error.retryable) {
    // Implement retry logic
    console.log('Connection error, retrying...');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Transactions

### Basic Transaction Usage

```typescript
const transaction = await dal.beginTransaction();

try {
  await transaction.put({
    pk: 'USER#123',
    sk: 'PROFILE',
    name: 'John Doe'
  });
  
  await transaction.update(
    { primary: 'USER#123', sort: 'SETTINGS' },
    { lastLogin: new Date() }
  );
  
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

### Transaction with Error Handling

```typescript
import { TransactionManager } from '@mytaptrack/lib/v2/utils';

const transactionManager = new TransactionManager(dal);

await transactionManager.executeTransaction(async (tx) => {
  // All operations within this function are part of the transaction
  await tx.put(userData);
  await tx.update(userKey, updates);
  
  // Transaction is automatically committed if no errors occur
  // or rolled back if an error is thrown
});
```

## Metrics and Monitoring

### Metrics Collection

```typescript
import { MetricsCollector } from '@mytaptrack/lib/v2/utils';

const metrics = new MetricsCollector();

// Metrics are automatically collected for all operations
const user = await dal.get(userKey); // This operation is automatically timed

// Manual metrics collection
metrics.recordOperation('custom_operation', 150, true);
```

### Health Checks

```typescript
import { HealthCheck } from '@mytaptrack/lib/v2/utils';

const healthCheck = new HealthCheck(dal);
const status = await healthCheck.checkHealth();

console.log('Database health:', status);
// Output:
// {
//   healthy: true,
//   provider: 'dynamodb',
//   connectionStatus: 'connected',
//   lastSuccessfulOperation: '2024-01-15T10:30:00Z',
//   metrics: {
//     averageResponseTime: 45,
//     errorRate: 0.02,
//     connectionCount: 5
//   }
// }
```

## Migration Utilities

### Data Migration

```typescript
import { MigrationManager } from '@mytaptrack/lib/v2/utils';

const migrationManager = new MigrationManager();

// Export data from DynamoDB
const sourceProvider = new DynamoDBProvider(dynamoConfig);
const exportedData = await migrationManager.exportData(sourceProvider);

// Import data to MongoDB
const targetProvider = new MongoDBProvider(mongoConfig);
await migrationManager.importData(targetProvider, exportedData);

// Validate migration
const validationResult = await migrationManager.validateMigration(
  sourceProvider, 
  targetProvider
);
```

## Testing Framework

### Abstract Test Suite

```typescript
import { DatabaseProviderTestSuite } from '@mytaptrack/lib/v2/testing';

class MyTestSuite extends DatabaseProviderTestSuite {
  createProvider() {
    return new DynamoDBProvider(testConfig);
  }
}

const testSuite = new MyTestSuite();
await testSuite.runAllTests();
```

### Test Data Management

```typescript
import { TestDataManager } from '@mytaptrack/lib/v2/testing';

const testDataManager = new TestDataManager(dal);

// Setup test data
await testDataManager.seedTestData();

// Run tests
// ...

// Cleanup
await testDataManager.cleanupTestData();
```

## Best Practices

### 1. Always Use Transactions for Multi-Item Operations

```typescript
// Good
const transaction = await dal.beginTransaction();
try {
  await transaction.put(user);
  await transaction.put(userSettings);
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}

// Avoid
await dal.put(user);
await dal.put(userSettings); // If this fails, user is already created
```

### 2. Handle Errors Appropriately

```typescript
// Good
try {
  const result = await dal.query(queryInput);
  return result;
} catch (error) {
  if (error instanceof ConnectionError && error.retryable) {
    // Implement retry logic
    return await this.retryOperation(() => dal.query(queryInput));
  }
  throw error;
}
```

### 3. Use Batch Operations for Multiple Items

```typescript
// Good
const users = await dal.batchGet(userKeys);

// Avoid
const users = await Promise.all(
  userKeys.map(key => dal.get(key))
);
```

### 4. Implement Proper Logging

```typescript
import { DatabaseLogger } from '@mytaptrack/lib/v2/utils';

const logger = new DatabaseLogger();

try {
  const result = await dal.query(queryInput);
  logger.logOperation('query', 'success', { resultCount: result.length });
  return result;
} catch (error) {
  logger.logOperation('query', 'error', { error: error.message });
  throw error;
}
```

## Performance Considerations

### 1. Use Appropriate Query Patterns

```typescript
// Efficient: Use key conditions for targeted queries
const students = await dal.query({
  keyCondition: {
    pk: 'USER#123',
    sk: { beginsWith: 'STUDENT#' }
  }
});

// Less efficient: Avoid full table scans when possible
const allStudents = await dal.scan({
  filterCondition: { type: 'student' }
});
```

### 2. Implement Caching for Frequently Accessed Data

```typescript
import { CachedDataAccessLayer } from '@mytaptrack/lib/v2/optimization';

const cachedDal = new CachedDataAccessLayer(dal, cacheProvider);
const user = await cachedDal.get(userKey); // Automatically cached
```

### 3. Use Connection Pooling for MongoDB

```typescript
const mongoProvider = new MongoDBProvider({
  connectionString: 'mongodb://localhost:27017',
  database: 'mytaptrack',
  collections: { primary: 'primary_data', data: 'data_records' },
  poolSize: 10, // Configure connection pool size
  maxIdleTimeMS: 30000
});
```

## Security Considerations

### 1. Use Field-Level Encryption for Sensitive Data

```typescript
import { SecureDataAccessLayer } from '@mytaptrack/lib/v2/security';

const secureDal = new SecureDataAccessLayer(dal, encryptionProvider);
await secureDal.put({
  pk: 'USER#123',
  sk: 'PROFILE',
  name: 'John Doe',
  ssn: '123-45-6789' // Automatically encrypted
});
```

### 2. Implement Access Control

```typescript
import { AccessControlProvider } from '@mytaptrack/lib/v2/security';

const accessControl = new AccessControlProvider();
const hasAccess = await accessControl.validateAccess(
  'read',
  'USER#123',
  securityContext
);

if (hasAccess) {
  const user = await dal.get(userKey);
}
```

### 3. Enable Audit Logging

```typescript
import { AuditLogger } from '@mytaptrack/lib/v2/security';

const auditLogger = new AuditLogger();
await auditLogger.auditLog('read', 'USER#123', securityContext);
```