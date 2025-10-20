# Cache Providers

The cache providers module provides a unified caching abstraction layer that supports both AWS and Docker deployments. This allows the same business logic to work with different caching backends depending on the deployment environment.

## Overview

The cache abstraction layer consists of:

- **ICacheProvider Interface**: Unified interface for all cache operations
- **DynamoDBCacheProvider**: AWS-native caching using DynamoDB tables
- **RedisCacheProvider**: High-performance caching using Redis for Docker deployments
- **CacheProviderFactory**: Factory for creating appropriate cache providers based on configuration

## Key Features

- **Environment Agnostic**: Same interface works in both AWS and Docker environments
- **TTL Support**: Consistent time-to-live behavior across all providers
- **Pattern Matching**: Support for clearing cache entries by pattern
- **Connection Management**: Built-in connection health checks and management
- **Error Handling**: Graceful error handling with fallback behavior

## Use Cases by Environment

### AWS Environment (DynamoDB Cache)
- **Database Query Results**: Cache expensive database queries to reduce DynamoDB read costs
- **API Response Caching**: Cache external API responses to reduce latency and API costs
- **Computed Data**: Cache complex calculations or data transformations
- **Rate Limiting**: Implement rate limiting across Lambda function invocations
- **Feature Flags**: Cache feature flag configurations

**Note**: User session management is handled by AWS Cognito and passed in Lambda event context, so session caching is not needed.

### Docker Environment (Redis Cache)
- **User Sessions**: Manage user authentication sessions across container instances
- **Database Query Results**: Cache database queries to reduce database load
- **API Response Caching**: Cache external API responses for faster response times
- **Computed Data**: Cache expensive computations across requests
- **Rate Limiting**: Implement rate limiting across multiple container instances

## Usage

### Basic Usage

```typescript
import { CacheProviderFactory, ICacheProvider } from '@mytaptrack/business-logic-core';

// Create cache provider for current environment
const cache = CacheProviderFactory.createForEnvironment(
  process.env.NODE_ENV === 'production' ? 'aws' : 'docker'
);

// Store computed data with default TTL
await cache.set('computed:report:123', { data: reportData, generatedAt: Date.now() });

// Store API response with custom TTL (5 minutes)
await cache.set('api:external:weather', { temperature: 72, humidity: 45 }, 300);

// Retrieve data
const cachedReport = await cache.get('computed:report:123');

// Delete specific item
await cache.delete('api:external:weather');

// Clear all computed data entries
await cache.clear('computed:*');
```

### AWS Environment (DynamoDB)

```typescript
import { CacheProviderFactory } from '@mytaptrack/business-logic-core';

const cache = CacheProviderFactory.createForAWS({
  region: 'us-east-1',
  keyPrefix: 'myapp:',
  defaultTtl: 3600,
  dynamodb: {
    tableName: 'my-cache-table'
  }
});
```

### Docker Environment (Redis)

```typescript
import { CacheProviderFactory } from '@mytaptrack/business-logic-core';
import Redis from 'ioredis'; // or your preferred Redis client

const redisClient = new Redis({
  host: 'redis-server',
  port: 6379
});

const cache = CacheProviderFactory.createForDocker({
  keyPrefix: 'myapp:',
  defaultTtl: 3600,
  redis: {
    host: 'redis-server',
    port: 6379
  }
}, redisClient);
```

## Configuration

### CacheConfig Interface

```typescript
interface CacheConfig {
  provider: 'dynamodb' | 'redis';
  connectionString?: string;
  region?: string;
  keyPrefix?: string;
  defaultTtl?: number;
  
  // DynamoDB-specific config
  dynamodb?: {
    tableName?: string;
    region?: string;
  };
  
  // Redis-specific config
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    maxRetries?: number;
    retryDelayOnFailover?: number;
  };
}
```

### Environment Variables

The cache providers support configuration through environment variables:

#### DynamoDB Provider
- `AWS_REGION`: AWS region for DynamoDB
- `CACHE_TABLE_NAME`: DynamoDB table name for caching

#### Redis Provider
- `REDIS_URL`: Complete Redis connection string
- `REDIS_HOST`: Redis server hostname
- `REDIS_PORT`: Redis server port
- `REDIS_PASSWORD`: Redis authentication password
- `REDIS_DB`: Redis database number

## Cache Operations

### ICacheProvider Interface

```typescript
interface ICacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(pattern?: string): Promise<void>;
  isConnected(): Promise<boolean>;
}
```

### Operation Details

#### get<T>(key: string)
- Retrieves a value from the cache
- Returns `null` if the key doesn't exist or has expired
- Automatically handles deserialization and expiration checking

#### set<T>(key: string, value: T, ttl?: number)
- Stores a value in the cache with optional TTL
- TTL is in seconds; if not provided, uses the default TTL
- TTL of 0 means no expiration

#### delete(key: string)
- Removes a specific key from the cache
- Safe to call even if the key doesn't exist

#### clear(pattern?: string)
- Clears cache entries matching a pattern
- If no pattern is provided, clears all entries with the configured key prefix
- Supports wildcard patterns (e.g., `user:*`)

#### isConnected()
- Checks if the cache provider is connected and operational
- Useful for health checks and monitoring

## Implementation Details

### DynamoDB Provider

The DynamoDB cache provider uses a single table with the following structure:

```
Primary Key (pk): {keyPrefix}{cacheKey}
Sort Key (sk): "CACHE"
Attributes:
- value: The cached data
- createdAt: Timestamp when the item was created
- expiresAt: Timestamp when the item expires (optional)
- ttl: DynamoDB TTL attribute for automatic cleanup
```

### Redis Provider

The Redis cache provider uses standard Redis operations:

- `GET/SET` for basic operations
- `SETEX` for operations with TTL
- `DEL` for deletions
- `KEYS` with pattern matching for bulk operations

## Error Handling

Both providers implement graceful error handling:

- **Get operations**: Return `null` on errors to avoid breaking application flow
- **Set/Delete operations**: Throw errors to ensure data consistency
- **Connection errors**: Automatically detected and reported through `isConnected()`

## Performance Considerations

### DynamoDB Provider
- Uses consistent reads for cache operations
- Implements batch operations for bulk deletions
- Leverages DynamoDB TTL for automatic cleanup

### Redis Provider
- Implements connection pooling and retry logic
- Uses batch operations for bulk deletions (100 keys per batch)
- Supports Redis clustering and high availability configurations

## Testing

The module includes comprehensive tests for all providers:

```bash
# Run cache provider tests
npm test -- cache-providers

# Run specific provider tests
npm test -- dynamodb-cache-provider
npm test -- redis-cache-provider
npm test -- cache-provider-factory
```

## Examples

See `examples/cache-usage.ts` for comprehensive usage examples including:

- Database query result caching
- API response caching  
- Computed data caching
- Rate limiting with cache
- User session caching (Docker only)
- Health check implementation
- Configuration validation

## Integration with Service Context

The cache providers integrate seamlessly with the service context system:

```typescript
import { ServiceContextFactory } from '@mytaptrack/business-logic-core';

const context = await ServiceContextFactory.createContext({
  environment: 'aws',
  cache: {
    provider: 'dynamodb',
    dynamodb: {
      tableName: 'my-cache-table'
    }
  }
});

// Cache is now available through context
await context.cache.set('key', 'value');
```

## Migration Between Providers

When migrating between cache providers (e.g., from DynamoDB to Redis), consider:

1. **Data Migration**: Cache data is typically ephemeral and doesn't need migration
2. **Key Compatibility**: Both providers use the same key format with prefixes
3. **TTL Behavior**: Both providers handle TTL consistently
4. **Configuration**: Update configuration to point to the new provider

The abstraction layer ensures that business logic remains unchanged during provider migrations.