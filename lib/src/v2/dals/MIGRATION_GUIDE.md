# DAL Migration Guide

This guide explains how to migrate existing DAL classes to use the new database abstraction layer while maintaining backward compatibility.

## Overview

The database abstraction layer allows MyTapTrack to seamlessly switch between MongoDB and DynamoDB as the underlying data storage solution. The migration is designed to be gradual and backward compatible.

## Migration Strategies

### Strategy 1: Gradual Migration (Recommended)

This approach allows you to migrate incrementally with full backward compatibility.

#### Step 1: Update Imports

Replace existing DAL imports with compatibility layer imports:

```typescript
// Before
import { Dal, DalBaseClass } from './dal';

// After
import { CompatibleDal as Dal, CompatibleDalBaseClass as DalBaseClass } from './dal-compatibility';
```

#### Step 2: Enable Abstraction Layer

Set the environment variable to enable the abstraction layer:

```bash
export USE_DATABASE_ABSTRACTION=true
export DATABASE_PROVIDER=dynamodb  # or mongodb
```

#### Step 3: Initialize Provider (Optional)

For more control, initialize the provider explicitly:

```typescript
import { CompatibleDalBaseClass } from './dal-compatibility';

// Initialize with default configuration
await CompatibleDalBaseClass.initialize();

// Or initialize with custom configuration
await CompatibleDalBaseClass.initialize({
  provider: 'mongodb',
  mongodb: {
    connectionString: 'mongodb://localhost:27017',
    database: 'mytaptrack',
    collections: {
      primary: 'primary',
      data: 'data'
    }
  }
});
```

### Strategy 2: Direct Abstraction Layer Usage

For new code or complete rewrites, use the abstraction layer directly:

```typescript
import { AbstractedDal, AbstractedDalBaseClass } from './abstracted-dal';

class MyNewDalClass extends AbstractedDalBaseClass {
  async myMethod() {
    // Use the provider directly
    const provider = this.getProvider();
    const result = await provider.get({ primary: 'key', sort: 'sort' });
    return result;
  }
}
```

### Strategy 3: Enhanced Legacy DAL

Update existing DAL classes to conditionally use the abstraction layer:

```typescript
class MyDalClass extends DalBaseClass {
  async myMethod(id: string) {
    const pk = `USER#${id}`;
    const sk = 'PROFILE';
    
    // Check if abstraction layer is available
    if (this.isAbstractionEnabled()) {
      const provider = this.getAbstractionProvider()!;
      const key: DatabaseKey = { primary: pk, sort: sk };
      return await provider.get(key);
    } else {
      // Fall back to legacy DAL
      return await this.primary.get({ pk, sk });
    }
  }
}
```

## Environment Variables

Configure the abstraction layer using these environment variables:

```bash
# Enable/disable abstraction layer
USE_DATABASE_ABSTRACTION=true|false

# Database provider selection
DATABASE_PROVIDER=dynamodb|mongodb

# DynamoDB configuration (when using DynamoDB)
AWS_REGION=us-east-1
PrimaryTable=MyTapTrack-Primary
DataTable=MyTapTrack-Data
STRONGLY_CONSISTENT_READ=true|false

# MongoDB configuration (when using MongoDB)
MONGODB_CONNECTION_STRING=mongodb://localhost:27017
MONGODB_DATABASE=mytaptrack
MONGODB_PRIMARY_COLLECTION=primary
MONGODB_DATA_COLLECTION=data
```

## Migration Checklist

### Pre-Migration

- [ ] Review existing DAL usage patterns
- [ ] Identify DynamoDB-specific features that need special handling
- [ ] Set up test environment with both database providers
- [ ] Create backup of existing data
- [ ] Plan rollback strategy

### During Migration

- [ ] Update imports to use compatibility layer
- [ ] Set USE_DATABASE_ABSTRACTION=true
- [ ] Test all CRUD operations
- [ ] Test query and scan operations
- [ ] Test transaction operations (if used)
- [ ] Validate error handling
- [ ] Monitor performance metrics

### Post-Migration

- [ ] Validate data consistency
- [ ] Monitor error rates and performance
- [ ] Update documentation
- [ ] Train team on new patterns
- [ ] Plan for future provider switches

## Common Patterns

### Basic CRUD Operations

```typescript
// Legacy pattern
const result = await this.primary.get({ pk: 'USER#123', sk: 'PROFILE' });

// Abstraction layer pattern
const provider = this.getAbstractionProvider();
const result = await provider.get({ primary: 'USER#123', sort: 'PROFILE' });
```

### Query Operations

```typescript
// Legacy pattern
const results = await this.primary.query({
  keyExpression: 'pk = :pk',
  attributeValues: { ':pk': 'USER#123' }
});

// Abstraction layer pattern
const provider = this.getAbstractionProvider();
const results = await provider.query({
  keyCondition: {
    field: 'pk',
    operator: '=',
    value: 'USER#123'
  }
});
```

### Conditional Updates

```typescript
// Legacy pattern
await this.primary.update({
  key: { pk: 'USER#123', sk: 'PROFILE' },
  updateExpression: 'SET #name = :name',
  attributeNames: { '#name': 'name' },
  attributeValues: { ':name': 'John Doe' },
  condition: 'attribute_exists(pk)'
});

// Abstraction layer pattern
const provider = this.getAbstractionProvider();
await provider.update({
  key: { primary: 'USER#123', sort: 'PROFILE' },
  updates: { name: 'John Doe' },
  condition: {
    field: 'pk',
    operator: 'exists'
  }
});
```

## Error Handling

The abstraction layer provides unified error handling:

```typescript
try {
  await provider.get({ primary: 'key', sort: 'sort' });
} catch (error) {
  if (error instanceof ItemNotFoundError) {
    // Handle item not found
  } else if (error instanceof ConnectionError) {
    // Handle connection issues
  } else if (error instanceof ValidationError) {
    // Handle validation errors
  }
}
```

## Performance Considerations

### Caching

The abstraction layer includes built-in caching:

```typescript
// Provider instances are cached automatically
const provider1 = DatabaseProviderFactory.create(config);
const provider2 = DatabaseProviderFactory.create(config); // Returns cached instance
```

### Connection Pooling

MongoDB provider includes connection pooling:

```typescript
const config = {
  provider: 'mongodb',
  mongodb: {
    connectionString: 'mongodb://localhost:27017',
    database: 'mytaptrack',
    collections: { primary: 'primary', data: 'data' },
    options: {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000
    }
  }
};
```

### Monitoring

Enable performance monitoring:

```typescript
// Metrics are collected automatically
const provider = DatabaseProviderFactory.create(config);
const health = await provider.healthCheck();
console.log('Provider health:', health);
```

## Testing

### Unit Testing

Test with both providers:

```typescript
describe('MyDalClass', () => {
  const providers = ['dynamodb', 'mongodb'];
  
  providers.forEach(providerType => {
    describe(`with ${providerType} provider`, () => {
      let dal: MyDalClass;
      
      beforeEach(async () => {
        const config = getTestConfig(providerType);
        await DalBaseClass.initializeProvider(config);
        dal = new MyDalClass();
      });
      
      it('should perform CRUD operations', async () => {
        // Test implementation
      });
    });
  });
});
```

### Integration Testing

Use the testing framework:

```typescript
import { TestRunner } from '../testing/test-runner';

const runner = new TestRunner({
  providers: ['dynamodb', 'mongodb'],
  includePerformanceTests: true
});

await runner.runAllTests();
```

## Troubleshooting

### Common Issues

1. **Provider not initialized**
   ```
   Error: Database provider not initialized
   ```
   Solution: Call `DalBaseClass.initializeProvider()` before using DAL classes.

2. **Configuration errors**
   ```
   Error: MongoDB configuration is required
   ```
   Solution: Ensure all required configuration is provided for the selected provider.

3. **Connection failures**
   ```
   Error: Failed to connect to database
   ```
   Solution: Check network connectivity and credentials.

### Debugging

Enable debug logging:

```bash
export DEBUG=mytaptrack:dal:*
export LOG_LEVEL=debug
```

### Rollback

To rollback to legacy DAL:

```bash
export USE_DATABASE_ABSTRACTION=false
```

Or restore from backup files:

```bash
# If using migration script
find . -name "*.backup" -exec sh -c 'mv "$1" "${1%.backup}"' _ {} \;
```

## Best Practices

1. **Always test thoroughly** before deploying to production
2. **Monitor performance** during and after migration
3. **Use feature flags** to control abstraction layer usage
4. **Keep rollback plan ready** in case of issues
5. **Migrate incrementally** rather than all at once
6. **Document provider-specific behaviors** for your team
7. **Use consistent error handling** patterns
8. **Validate data integrity** after provider switches

## Support

For questions or issues:

1. Check the troubleshooting section above
2. Review the test cases for usage examples
3. Consult the API documentation
4. Contact the development team

## Future Considerations

- Plan for additional database providers (PostgreSQL, etc.)
- Consider implementing read replicas for performance
- Evaluate caching strategies for frequently accessed data
- Monitor and optimize query patterns across providers