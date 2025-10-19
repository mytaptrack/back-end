# Usage Examples - Database Provider Switching

## Overview

This document provides practical examples of how to use the Data Access Abstraction Layer and switch between database providers without changing your application code.

## Table of Contents

- [Basic Setup](#basic-setup)
- [Provider Configuration](#provider-configuration)
- [CRUD Operations](#crud-operations)
- [Query Operations](#query-operations)
- [Transaction Management](#transaction-management)
- [Error Handling](#error-handling)
- [Performance Optimization](#performance-optimization)
- [Testing Examples](#testing-examples)

## Basic Setup

### Using Environment Variables

The simplest way to configure the database provider is through environment variables:

```bash
# For DynamoDB
export DATABASE_PROVIDER=dynamodb
export DYNAMODB_REGION=us-east-1
export DYNAMODB_PRIMARY_TABLE=MyTapTrack-Primary
export DYNAMODB_DATA_TABLE=MyTapTrack-Data

# For MongoDB
export DATABASE_PROVIDER=mongodb
export MONGODB_CONNECTION_STRING=mongodb://localhost:27017
export MONGODB_DATABASE=mytaptrack
export MONGODB_PRIMARY_COLLECTION=primary_data
export MONGODB_DATA_COLLECTION=data_records
```

### Programmatic Configuration

```typescript
import { DatabaseProviderFactory, DatabaseConfig } from '@mytaptrack/lib/v2/utils';

// DynamoDB Configuration
const dynamoConfig: DatabaseConfig = {
  provider: 'dynamodb',
  dynamodb: {
    region: 'us-east-1',
    primaryTable: 'MyTapTrack-Primary',
    dataTable: 'MyTapTrack-Data',
    consistentRead: true
  }
};

// MongoDB Configuration
const mongoConfig: DatabaseConfig = {
  provider: 'mongodb',
  mongodb: {
    connectionString: 'mongodb://localhost:27017',
    database: 'mytaptrack',
    collections: {
      primary: 'primary_data',
      data: 'data_records'
    }
  }
};

// Create provider based on configuration
const dal = DatabaseProviderFactory.create(dynamoConfig);
// or
const dal = DatabaseProviderFactory.create(mongoConfig);
```

## Provider Configuration

### Configuration from File

```typescript
import { DatabaseConfigLoader } from '@mytaptrack/lib/v2/utils';

// Load configuration from file
const config = await DatabaseConfigLoader.loadFromFile('./config/database.json');
const dal = DatabaseProviderFactory.create(config);
```

Example `database.json`:

```json
{
  "provider": "dynamodb",
  "dynamodb": {
    "region": "us-east-1",
    "primaryTable": "MyTapTrack-Primary",
    "dataTable": "MyTapTrack-Data",
    "consistentRead": true
  },
  "migration": {
    "enabled": true,
    "batchSize": 100
  }
}
```

### Runtime Provider Switching

```typescript
class DatabaseService {
  private dal: IDataAccessLayer;

  constructor(config: DatabaseConfig) {
    this.dal = DatabaseProviderFactory.create(config);
  }

  async switchProvider(newConfig: DatabaseConfig) {
    // Disconnect current provider
    await this.dal.disconnect();
    
    // Create new provider
    this.dal = DatabaseProviderFactory.create(newConfig);
    
    // Connect to new provider
    await this.dal.connect();
  }

  async getUser(userId: string) {
    return await this.dal.get<UserData>({
      primary: `USER#${userId}`,
      sort: 'PROFILE'
    });
  }
}

// Usage
const service = new DatabaseService(dynamoConfig);
const user1 = await service.getUser('123'); // Uses DynamoDB

await service.switchProvider(mongoConfig);
const user2 = await service.getUser('123'); // Uses MongoDB
```

## CRUD Operations

### Create Operations

```typescript
// User creation - works with both providers
async function createUser(userData: UserData) {
  const userRecord = {
    pk: `USER#${userData.userId}`,
    sk: 'PROFILE',
    pksk: `USER#${userData.userId}#PROFILE`,
    userId: userData.userId,
    usk: `USER#${userData.userId}`,
    license: userData.license,
    name: userData.name,
    email: userData.email,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await dal.put(userRecord);
  return userRecord;
}

// Student creation
async function createStudent(studentData: StudentData) {
  const studentRecord = {
    pk: `USER#${studentData.userId}`,
    sk: `STUDENT#${studentData.studentId}`,
    pksk: `USER#${studentData.userId}#STUDENT#${studentData.studentId}`,
    studentId: studentData.studentId,
    userId: studentData.userId,
    name: studentData.name,
    grade: studentData.grade,
    active: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await dal.put(studentRecord);
  return studentRecord;
}
```

### Read Operations

```typescript
// Get single user
async function getUser(userId: string): Promise<UserData | null> {
  return await dal.get<UserData>({
    primary: `USER#${userId}`,
    sort: 'PROFILE'
  });
}

// Get multiple users
async function getUsers(userIds: string[]): Promise<UserData[]> {
  const keys = userIds.map(id => ({
    primary: `USER#${id}`,
    sort: 'PROFILE'
  }));

  return await dal.batchGet<UserData>(keys);
}

// Get user with error handling
async function getUserSafely(userId: string): Promise<UserData | null> {
  try {
    const user = await dal.get<UserData>({
      primary: `USER#${userId}`,
      sort: 'PROFILE'
    });
    return user;
  } catch (error) {
    if (error instanceof ItemNotFoundError) {
      return null;
    }
    throw error;
  }
}
```

### Update Operations

```typescript
// Update user profile
async function updateUser(userId: string, updates: Partial<UserData>) {
  const key = {
    primary: `USER#${userId}`,
    sort: 'PROFILE'
  };

  const updateData = {
    ...updates,
    updatedAt: new Date(),
    version: updates.version ? updates.version + 1 : 1
  };

  await dal.update(key, updateData);
}

// Conditional update with version check
async function updateUserWithVersionCheck(
  userId: string, 
  updates: Partial<UserData>, 
  expectedVersion: number
) {
  const key = {
    primary: `USER#${userId}`,
    sort: 'PROFILE'
  };

  const updateData = {
    ...updates,
    updatedAt: new Date(),
    version: expectedVersion + 1
  };

  const options = {
    conditionExpression: 'version = :expectedVersion',
    expressionAttributeValues: {
      ':expectedVersion': expectedVersion
    }
  };

  try {
    await dal.update(key, updateData, options);
  } catch (error) {
    if (error instanceof ConditionalCheckFailedError) {
      throw new Error('User was modified by another process');
    }
    throw error;
  }
}
```

### Delete Operations

```typescript
// Delete user
async function deleteUser(userId: string) {
  await dal.delete({
    primary: `USER#${userId}`,
    sort: 'PROFILE'
  });
}

// Soft delete with status update
async function softDeleteUser(userId: string) {
  await dal.update(
    {
      primary: `USER#${userId}`,
      sort: 'PROFILE'
    },
    {
      status: 'DELETED',
      deletedAt: new Date(),
      updatedAt: new Date()
    }
  );
}
```

## Query Operations

### Basic Queries

```typescript
// Get all students for a user
async function getUserStudents(userId: string): Promise<StudentData[]> {
  return await dal.query<StudentData>({
    keyCondition: {
      pk: `USER#${userId}`,
      sk: { beginsWith: 'STUDENT#' }
    }
  });
}

// Get active students only
async function getActiveStudents(userId: string): Promise<StudentData[]> {
  return await dal.query<StudentData>({
    keyCondition: {
      pk: `USER#${userId}`,
      sk: { beginsWith: 'STUDENT#' }
    },
    filterCondition: {
      active: true
    }
  });
}

// Get students with pagination
async function getStudentsPaginated(
  userId: string, 
  limit: number = 20, 
  startKey?: any
): Promise<{ students: StudentData[], nextToken?: any }> {
  const result = await dal.query<StudentData>({
    keyCondition: {
      pk: `USER#${userId}`,
      sk: { beginsWith: 'STUDENT#' }
    },
    limit,
    startKey
  });

  return {
    students: result,
    nextToken: result.length === limit ? result[result.length - 1] : undefined
  };
}
```

### Advanced Queries

```typescript
// Query with multiple conditions
async function getStudentsByGrade(userId: string, grade: string): Promise<StudentData[]> {
  return await dal.query<StudentData>({
    keyCondition: {
      pk: `USER#${userId}`,
      sk: { beginsWith: 'STUDENT#' }
    },
    filterCondition: {
      grade: grade,
      active: true
    },
    sortOrder: 'ASC'
  });
}

// Query with projection (only specific fields)
async function getStudentNames(userId: string): Promise<Array<{studentId: string, name: string}>> {
  return await dal.query({
    keyCondition: {
      pk: `USER#${userId}`,
      sk: { beginsWith: 'STUDENT#' }
    },
    projection: ['studentId', 'name']
  });
}

// Query with date range
async function getRecentStudents(userId: string, daysBack: number = 30): Promise<StudentData[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  return await dal.query<StudentData>({
    keyCondition: {
      pk: `USER#${userId}`,
      sk: { beginsWith: 'STUDENT#' }
    },
    filterCondition: {
      createdAt: { gte: cutoffDate }
    }
  });
}
```

### Scan Operations

```typescript
// Scan for all users (use sparingly)
async function getAllUsers(): Promise<UserData[]> {
  const result = await dal.scan<UserData>({
    filterCondition: {
      sk: 'PROFILE'
    }
  });

  return result.items;
}

// Scan with pagination
async function getAllUsersPaginated(
  limit: number = 50,
  startToken?: any
): Promise<{ users: UserData[], nextToken?: any }> {
  const result = await dal.scan<UserData>({
    filterCondition: {
      sk: 'PROFILE'
    },
    limit,
    startKey: startToken
  });

  return {
    users: result.items,
    nextToken: result.token
  };
}
```

## Transaction Management

### Basic Transactions

```typescript
// Create user and student in a transaction
async function createUserWithStudent(userData: UserData, studentData: StudentData) {
  const transaction = await dal.beginTransaction();

  try {
    // Create user
    await transaction.put({
      pk: `USER#${userData.userId}`,
      sk: 'PROFILE',
      ...userData,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Create student
    await transaction.put({
      pk: `USER#${userData.userId}`,
      sk: `STUDENT#${studentData.studentId}`,
      ...studentData,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// Transfer student between users
async function transferStudent(
  studentId: string, 
  fromUserId: string, 
  toUserId: string
) {
  const transaction = await dal.beginTransaction();

  try {
    // Get current student data
    const student = await transaction.get<StudentData>({
      primary: `USER#${fromUserId}`,
      sort: `STUDENT#${studentId}`
    });

    if (!student) {
      throw new Error('Student not found');
    }

    // Delete from old user
    await transaction.delete({
      primary: `USER#${fromUserId}`,
      sort: `STUDENT#${studentId}`
    });

    // Add to new user
    await transaction.put({
      ...student,
      pk: `USER#${toUserId}`,
      userId: toUserId,
      updatedAt: new Date()
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

### Transaction with Helper

```typescript
import { TransactionManager } from '@mytaptrack/lib/v2/utils';

const transactionManager = new TransactionManager(dal);

// Simplified transaction usage
async function updateUserAndStudents(
  userId: string, 
  userUpdates: Partial<UserData>,
  studentUpdates: Array<{ studentId: string, updates: Partial<StudentData> }>
) {
  await transactionManager.executeTransaction(async (tx) => {
    // Update user
    await tx.update(
      { primary: `USER#${userId}`, sort: 'PROFILE' },
      { ...userUpdates, updatedAt: new Date() }
    );

    // Update all students
    for (const { studentId, updates } of studentUpdates) {
      await tx.update(
        { primary: `USER#${userId}`, sort: `STUDENT#${studentId}` },
        { ...updates, updatedAt: new Date() }
      );
    }
  });
}
```

## Error Handling

### Comprehensive Error Handling

```typescript
import { 
  ItemNotFoundError, 
  ConditionalCheckFailedError, 
  ConnectionError,
  ValidationError 
} from '@mytaptrack/lib/v2/types';

async function robustUserOperation(userId: string, operation: string) {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      switch (operation) {
        case 'get':
          return await dal.get({ primary: `USER#${userId}`, sort: 'PROFILE' });
        case 'delete':
          await dal.delete({ primary: `USER#${userId}`, sort: 'PROFILE' });
          return;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        console.log(`User ${userId} not found`);
        return null;
      }
      
      if (error instanceof ConditionalCheckFailedError) {
        console.log(`Conditional check failed for user ${userId}`);
        throw new Error('User was modified by another process');
      }
      
      if (error instanceof ValidationError) {
        console.log(`Validation error: ${error.message}`);
        throw error;
      }
      
      if (error instanceof ConnectionError && error.retryable) {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`Connection error, retrying... (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          continue;
        }
      }
      
      // Re-throw unexpected errors
      throw error;
    }
  }
  
  throw new Error(`Operation failed after ${maxRetries} retries`);
}
```

### Error Logging

```typescript
import { DatabaseLogger } from '@mytaptrack/lib/v2/utils';

class UserService {
  private logger = new DatabaseLogger();

  async getUser(userId: string): Promise<UserData | null> {
    const startTime = Date.now();
    
    try {
      const user = await dal.get<UserData>({
        primary: `USER#${userId}`,
        sort: 'PROFILE'
      });
      
      this.logger.logOperation('get_user', 'success', {
        userId,
        duration: Date.now() - startTime
      });
      
      return user;
    } catch (error) {
      this.logger.logOperation('get_user', 'error', {
        userId,
        duration: Date.now() - startTime,
        error: error.message,
        errorType: error.constructor.name
      });
      
      throw error;
    }
  }
}
```

## Performance Optimization

### Caching Implementation

```typescript
import { CachedDataAccessLayer, CacheProvider } from '@mytaptrack/lib/v2/optimization';

// Setup caching
const cacheProvider = new CacheProvider({
  type: 'redis',
  connectionString: 'redis://localhost:6379',
  defaultTTL: 300 // 5 minutes
});

const cachedDal = new CachedDataAccessLayer(dal, cacheProvider);

// Usage - automatically cached
async function getCachedUser(userId: string): Promise<UserData | null> {
  // This will check cache first, then database if not found
  return await cachedDal.get<UserData>({
    primary: `USER#${userId}`,
    sort: 'PROFILE'
  });
}

// Cache invalidation
async function updateUserWithCacheInvalidation(
  userId: string, 
  updates: Partial<UserData>
) {
  const key = { primary: `USER#${userId}`, sort: 'PROFILE' };
  
  // Update database
  await dal.update(key, updates);
  
  // Invalidate cache
  await cacheProvider.delete(`USER#${userId}#PROFILE`);
}
```

### Batch Operations

```typescript
// Efficient batch operations
async function createMultipleStudents(
  userId: string, 
  studentsData: StudentData[]
): Promise<void> {
  const batchSize = 25; // DynamoDB batch limit
  
  for (let i = 0; i < studentsData.length; i += batchSize) {
    const batch = studentsData.slice(i, i + batchSize);
    
    const putOperations = batch.map(student => ({
      pk: `USER#${userId}`,
      sk: `STUDENT#${student.studentId}`,
      ...student,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    // Use batch put operation
    await dal.batchPut(putOperations);
  }
}

// Efficient batch retrieval
async function getMultipleUsers(userIds: string[]): Promise<UserData[]> {
  const keys = userIds.map(id => ({
    primary: `USER#${id}`,
    sort: 'PROFILE'
  }));
  
  return await dal.batchGet<UserData>(keys);
}
```

### Connection Pooling

```typescript
// MongoDB with connection pooling
const mongoConfig: DatabaseConfig = {
  provider: 'mongodb',
  mongodb: {
    connectionString: 'mongodb://localhost:27017',
    database: 'mytaptrack',
    collections: {
      primary: 'primary_data',
      data: 'data_records'
    },
    poolSize: 10,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000
  }
};

const dal = DatabaseProviderFactory.create(mongoConfig);
```

## Testing Examples

### Unit Testing with Mock Provider

```typescript
import { MockDatabaseProvider } from '@mytaptrack/lib/v2/testing';

describe('UserService', () => {
  let userService: UserService;
  let mockDal: MockDatabaseProvider;

  beforeEach(() => {
    mockDal = new MockDatabaseProvider();
    userService = new UserService(mockDal);
  });

  it('should create user successfully', async () => {
    const userData = {
      userId: '123',
      name: 'John Doe',
      email: 'john@example.com'
    };

    await userService.createUser(userData);

    expect(mockDal.put).toHaveBeenCalledWith(
      expect.objectContaining({
        pk: 'USER#123',
        sk: 'PROFILE',
        name: 'John Doe',
        email: 'john@example.com'
      })
    );
  });
});
```

### Integration Testing

```typescript
import { TestDataManager, TestDatabaseConfig } from '@mytaptrack/lib/v2/testing';

describe('Database Integration Tests', () => {
  let dal: IDataAccessLayer;
  let testDataManager: TestDataManager;

  beforeAll(async () => {
    const config = TestDatabaseConfig.getDynamoDBConfig();
    dal = DatabaseProviderFactory.create(config);
    await dal.connect();
    
    testDataManager = new TestDataManager(dal);
  });

  beforeEach(async () => {
    await testDataManager.seedTestData();
  });

  afterEach(async () => {
    await testDataManager.cleanupTestData();
  });

  afterAll(async () => {
    await dal.disconnect();
  });

  it('should perform CRUD operations correctly', async () => {
    const testUser = await testDataManager.createTestUser();
    
    // Test get
    const retrievedUser = await dal.get({
      primary: testUser.pk,
      sort: testUser.sk
    });
    expect(retrievedUser).toEqual(testUser);
    
    // Test update
    await dal.update(
      { primary: testUser.pk, sort: testUser.sk },
      { name: 'Updated Name' }
    );
    
    const updatedUser = await dal.get({
      primary: testUser.pk,
      sort: testUser.sk
    });
    expect(updatedUser.name).toBe('Updated Name');
    
    // Test delete
    await dal.delete({ primary: testUser.pk, sort: testUser.sk });
    
    const deletedUser = await dal.get({
      primary: testUser.pk,
      sort: testUser.sk
    });
    expect(deletedUser).toBeNull();
  });
});
```

### Cross-Provider Testing

```typescript
import { DatabaseProviderTestSuite } from '@mytaptrack/lib/v2/testing';

class DynamoDBTestSuite extends DatabaseProviderTestSuite {
  createProvider() {
    return DatabaseProviderFactory.create({
      provider: 'dynamodb',
      dynamodb: TestDatabaseConfig.getDynamoDBConfig()
    });
  }
}

class MongoDBTestSuite extends DatabaseProviderTestSuite {
  createProvider() {
    return DatabaseProviderFactory.create({
      provider: 'mongodb',
      mongodb: TestDatabaseConfig.getMongoDBConfig()
    });
  }
}

// Run the same tests against both providers
describe('Cross-Provider Tests', () => {
  const testSuites = [
    new DynamoDBTestSuite(),
    new MongoDBTestSuite()
  ];

  testSuites.forEach((suite, index) => {
    const providerName = index === 0 ? 'DynamoDB' : 'MongoDB';
    
    describe(`${providerName} Provider`, () => {
      beforeAll(async () => {
        await suite.setup();
      });

      afterAll(async () => {
        await suite.teardown();
      });

      it('should handle CRUD operations', async () => {
        await suite.testCrudOperations();
      });

      it('should handle query operations', async () => {
        await suite.testQueryOperations();
      });

      it('should handle transactions', async () => {
        await suite.testTransactions();
      });
    });
  });
});
```

This comprehensive set of examples demonstrates how to use the Data Access Abstraction Layer effectively while maintaining provider independence. The key principle is that your application code remains the same regardless of which database provider you're using - only the configuration changes.