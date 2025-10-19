# Data Access Abstraction Layer - Documentation

## Overview

The Data Access Abstraction Layer provides a unified interface for database operations that can seamlessly switch between MongoDB and DynamoDB. This documentation provides comprehensive guidance on using, configuring, and optimizing the abstraction layer.

## Documentation Structure

### 📚 Core Documentation

- **[API Documentation](./API_DOCUMENTATION.md)** - Complete API reference with interfaces, methods, and examples
- **[Usage Examples](./USAGE_EXAMPLES.md)** - Practical examples for common use cases and provider switching
- **[Migration Guide](./MIGRATION_GUIDE.md)** - Comprehensive procedures for migrating data between providers
- **[Troubleshooting Guide](./TROUBLESHOOTING_GUIDE.md)** - Solutions to common issues and debugging techniques
- **[Performance Tuning Guide](./PERFORMANCE_TUNING_GUIDE.md)** - Optimization strategies for both DynamoDB and MongoDB

### 🚀 Quick Start

1. **Installation and Setup**
   ```bash
   npm install @mytaptrack/lib
   ```

2. **Basic Configuration**
   ```typescript
   import { DatabaseProviderFactory } from '@mytaptrack/lib/v2/utils';
   
   const config = {
     provider: 'dynamodb', // or 'mongodb'
     dynamodb: {
       region: 'us-east-1',
       primaryTable: 'MyTapTrack-Primary',
       dataTable: 'MyTapTrack-Data'
     }
   };
   
   const dal = DatabaseProviderFactory.create(config);
   await dal.connect();
   ```

3. **Basic Operations**
   ```typescript
   // Create
   await dal.put({
     pk: 'USER#123',
     sk: 'PROFILE',
     name: 'John Doe',
     email: 'john@example.com'
   });
   
   // Read
   const user = await dal.get({
     primary: 'USER#123',
     sort: 'PROFILE'
   });
   
   // Update
   await dal.update(
     { primary: 'USER#123', sort: 'PROFILE' },
     { name: 'John Smith' }
   );
   
   // Delete
   await dal.delete({ primary: 'USER#123', sort: 'PROFILE' });
   ```

## Key Features

### ✅ Provider Independence
- Write code once, run on multiple database providers
- Runtime provider switching without code changes
- Consistent API across DynamoDB and MongoDB

### ✅ Performance Optimization
- Built-in caching layer with multiple strategies
- Connection pooling and optimization
- Query optimization and performance monitoring

### ✅ Data Consistency
- Transaction support across both providers
- Optimistic locking and version control
- Data validation and integrity checks

### ✅ Migration Support
- Comprehensive migration utilities
- Data transformation between providers
- Rollback capabilities and validation

### ✅ Monitoring and Observability
- Performance metrics collection
- Health checks and monitoring
- Structured logging and debugging tools

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│              (Your Business Logic)                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                Database Abstraction Layer                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Base DAL      │  │  Query Builder  │  │ Transaction │ │
│  │   Interface     │  │                 │  │   Manager   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Caching       │  │   Metrics       │  │   Error     │ │
│  │   Layer         │  │   Collection    │  │   Handling  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼────────┐ ┌──────▼──────┐ ┌────────▼────────┐
│   DynamoDB     │ │   MongoDB   │ │   Future DB     │
│ Implementation │ │Implementation│ │ Implementation  │
└────────────────┘ └─────────────┘ └─────────────────┘
```

## Configuration Options

### Environment Variables

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

# Performance Settings
CACHE_ENABLED=true
CACHE_TTL=300
CONNECTION_POOL_SIZE=10
METRICS_ENABLED=true
```

### Configuration File

```json
{
  "provider": "dynamodb",
  "dynamodb": {
    "region": "us-east-1",
    "primaryTable": "MyTapTrack-Primary",
    "dataTable": "MyTapTrack-Data",
    "consistentRead": true
  },
  "mongodb": {
    "connectionString": "mongodb://localhost:27017",
    "database": "mytaptrack",
    "collections": {
      "primary": "primary_data",
      "data": "data_records"
    }
  },
  "cache": {
    "enabled": true,
    "ttl": 300,
    "provider": "redis",
    "connectionString": "redis://localhost:6379"
  },
  "performance": {
    "connectionPoolSize": 10,
    "batchSize": 100,
    "queryTimeout": 30000
  },
  "monitoring": {
    "metricsEnabled": true,
    "healthCheckInterval": 30000,
    "slowQueryThreshold": 1000
  }
}
```

## Common Use Cases

### 1. Multi-Tenant Application
```typescript
class MultiTenantDataService {
  private dalProviders: Map<string, IDataAccessLayer> = new Map();
  
  async getTenantDAL(tenantId: string): Promise<IDataAccessLayer> {
    if (!this.dalProviders.has(tenantId)) {
      const config = await this.getTenantConfig(tenantId);
      const dal = DatabaseProviderFactory.create(config);
      await dal.connect();
      this.dalProviders.set(tenantId, dal);
    }
    
    return this.dalProviders.get(tenantId)!;
  }
}
```

### 2. Development to Production Migration
```typescript
// Development: Use MongoDB for flexibility
const devConfig = {
  provider: 'mongodb',
  mongodb: {
    connectionString: 'mongodb://localhost:27017',
    database: 'mytaptrack_dev'
  }
};

// Production: Use DynamoDB for scale
const prodConfig = {
  provider: 'dynamodb',
  dynamodb: {
    region: 'us-east-1',
    primaryTable: 'MyTapTrack-Primary-Prod'
  }
};

// Same application code works with both
const dal = DatabaseProviderFactory.create(
  process.env.NODE_ENV === 'production' ? prodConfig : devConfig
);
```

### 3. A/B Testing Different Providers
```typescript
class ABTestingService {
  private dynamoDAL: IDataAccessLayer;
  private mongoDAL: IDataAccessLayer;
  
  async getDALForUser(userId: string): Promise<IDataAccessLayer> {
    const testGroup = this.getTestGroup(userId);
    return testGroup === 'A' ? this.dynamoDAL : this.mongoDAL;
  }
  
  private getTestGroup(userId: string): 'A' | 'B' {
    // Simple hash-based assignment
    const hash = this.hashUserId(userId);
    return hash % 2 === 0 ? 'A' : 'B';
  }
}
```

## Best Practices

### 1. Error Handling
```typescript
try {
  const result = await dal.query(queryInput);
  return result;
} catch (error) {
  if (error instanceof ItemNotFoundError) {
    return null;
  }
  if (error instanceof ConnectionError && error.retryable) {
    // Implement retry logic
    return await this.retryOperation(() => dal.query(queryInput));
  }
  throw error;
}
```

### 2. Performance Optimization
```typescript
// Use caching for frequently accessed data
const cachedDAL = new CachedDataAccessLayer(dal, cacheProvider);

// Use batch operations for multiple items
const users = await dal.batchGet(userKeys);

// Use transactions for consistency
const transaction = await dal.beginTransaction();
try {
  await transaction.put(user);
  await transaction.put(userSettings);
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

### 3. Monitoring and Observability
```typescript
import { MetricsCollector, HealthCheck } from '@mytaptrack/lib/v2/utils';

const metrics = new MetricsCollector();
const healthCheck = new HealthCheck(dal);

// Monitor performance
setInterval(async () => {
  const health = await healthCheck.checkHealth();
  if (!health.healthy) {
    console.error('Database health check failed:', health);
  }
}, 30000);
```

## Testing

### Unit Testing
```typescript
import { MockDatabaseProvider } from '@mytaptrack/lib/v2/testing';

describe('UserService', () => {
  let userService: UserService;
  let mockDAL: MockDatabaseProvider;

  beforeEach(() => {
    mockDAL = new MockDatabaseProvider();
    userService = new UserService(mockDAL);
  });

  it('should create user successfully', async () => {
    const userData = { userId: '123', name: 'John Doe' };
    await userService.createUser(userData);
    
    expect(mockDAL.put).toHaveBeenCalledWith(
      expect.objectContaining({
        pk: 'USER#123',
        name: 'John Doe'
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

  it('should perform CRUD operations correctly', async () => {
    const testUser = await testDataManager.createTestUser();
    
    const retrievedUser = await dal.get({
      primary: testUser.pk,
      sort: testUser.sk
    });
    
    expect(retrievedUser).toEqual(testUser);
  });
});
```

## Migration Scenarios

### Scenario 1: Development to Production
1. Develop using MongoDB for flexibility
2. Test migration process in staging
3. Migrate to DynamoDB for production scale
4. Monitor performance and adjust as needed

### Scenario 2: Cost Optimization
1. Analyze usage patterns and costs
2. Migrate less frequently accessed data to MongoDB
3. Keep hot data in DynamoDB for performance
4. Implement tiered storage strategy

### Scenario 3: Geographic Distribution
1. Use DynamoDB in primary region
2. Use MongoDB in secondary regions
3. Implement data synchronization
4. Route requests based on geography

## Support and Contributing

### Getting Help
- Check the [Troubleshooting Guide](./TROUBLESHOOTING_GUIDE.md) for common issues
- Review [Usage Examples](./USAGE_EXAMPLES.md) for implementation patterns
- Consult the [API Documentation](./API_DOCUMENTATION.md) for detailed reference

### Performance Issues
- Follow the [Performance Tuning Guide](./PERFORMANCE_TUNING_GUIDE.md)
- Enable metrics collection and monitoring
- Use the built-in profiling tools

### Migration Support
- Review the [Migration Guide](./MIGRATION_GUIDE.md)
- Test migrations in staging environment first
- Use the provided validation tools

## Version History

### v2.0.0 (Current)
- Complete abstraction layer implementation
- Support for DynamoDB and MongoDB providers
- Comprehensive caching and optimization features
- Migration utilities and validation tools
- Performance monitoring and metrics collection

### Roadmap
- Additional database provider support (PostgreSQL, Redis)
- Enhanced caching strategies
- Advanced query optimization
- Real-time data synchronization
- GraphQL integration improvements

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

For detailed information on any topic, please refer to the specific documentation files linked above.