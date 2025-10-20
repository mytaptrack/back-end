import { ICacheProvider, CacheConfig } from './interfaces';
import { DynamoDBCacheProvider } from './dynamodb-cache-provider';
import { RedisCacheProvider } from './redis-cache-provider';

/**
 * Factory for creating cache provider instances based on configuration
 */
export class CacheProviderFactory {
  /**
   * Create cache provider based on configuration
   */
  static create(config: CacheConfig, redisClient?: any): ICacheProvider {
    switch (config.provider) {
      case 'dynamodb':
        return new DynamoDBCacheProvider(config);
      
      case 'redis':
        return new RedisCacheProvider(config, redisClient);
      
      default:
        throw new Error(`Unsupported cache provider: ${config.provider}`);
    }
  }

  /**
   * Create cache provider for AWS environment
   */
  static createForAWS(config?: Partial<CacheConfig>): ICacheProvider {
    const awsConfig: CacheConfig = {
      provider: 'dynamodb',
      region: config?.region || process.env.AWS_REGION || 'us-east-1',
      keyPrefix: config?.keyPrefix || 'cache:',
      defaultTtl: config?.defaultTtl || 3600,
      dynamodb: {
        tableName: config?.dynamodb?.tableName || process.env.CACHE_TABLE_NAME || 'cache-table',
        region: config?.dynamodb?.region || config?.region || process.env.AWS_REGION || 'us-east-1'
      },
      ...config
    };

    return new DynamoDBCacheProvider(awsConfig);
  }

  /**
   * Create cache provider for Docker environment
   */
  static createForDocker(config?: Partial<CacheConfig>, redisClient?: any): ICacheProvider {
    const dockerConfig: CacheConfig = {
      provider: 'redis',
      connectionString: config?.connectionString || process.env.REDIS_URL || 'redis://localhost:6379',
      keyPrefix: config?.keyPrefix || 'cache:',
      defaultTtl: config?.defaultTtl || 3600,
      redis: {
        host: config?.redis?.host || process.env.REDIS_HOST || 'localhost',
        port: config?.redis?.port || parseInt(process.env.REDIS_PORT || '6379'),
        password: config?.redis?.password || process.env.REDIS_PASSWORD,
        db: config?.redis?.db || parseInt(process.env.REDIS_DB || '0'),
        maxRetries: config?.redis?.maxRetries || 3,
        retryDelayOnFailover: config?.redis?.retryDelayOnFailover || 100
      },
      ...config
    };

    return new RedisCacheProvider(dockerConfig, redisClient);
  }

  /**
   * Create cache provider based on environment
   */
  static createForEnvironment(
    environment: 'aws' | 'docker',
    config?: Partial<CacheConfig>,
    redisClient?: any
  ): ICacheProvider {
    switch (environment) {
      case 'aws':
        return this.createForAWS(config);
      
      case 'docker':
        return this.createForDocker(config, redisClient);
      
      default:
        throw new Error(`Unsupported environment: ${environment}`);
    }
  }

  /**
   * Validate cache configuration
   */
  static validateConfig(config: CacheConfig): void {
    if (!config.provider) {
      throw new Error('Cache provider is required');
    }

    if (!['dynamodb', 'redis'].includes(config.provider)) {
      throw new Error(`Unsupported cache provider: ${config.provider}`);
    }

    if (config.provider === 'dynamodb') {
      if (!config.dynamodb?.tableName && !process.env.CACHE_TABLE_NAME) {
        throw new Error('DynamoDB table name is required for DynamoDB cache provider');
      }
    }

    if (config.provider === 'redis') {
      if (!config.connectionString && !config.redis?.host && !process.env.REDIS_URL && !process.env.REDIS_HOST) {
        throw new Error('Redis connection information is required for Redis cache provider');
      }
    }

    if (config.defaultTtl !== undefined && config.defaultTtl < 0) {
      throw new Error('Default TTL must be non-negative');
    }
  }
}