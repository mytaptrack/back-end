import { CacheProviderFactory } from '../cache-provider-factory';
import { DynamoDBCacheProvider } from '../dynamodb-cache-provider';
import { RedisCacheProvider } from '../redis-cache-provider';
import { CacheConfig } from '../interfaces';

describe('CacheProviderFactory', () => {
  describe('create', () => {
    it('should create DynamoDB cache provider for dynamodb provider', () => {
      const config: CacheConfig = {
        provider: 'dynamodb',
        region: 'us-east-1',
        dynamodb: {
          tableName: 'test-cache-table'
        }
      };

      const provider = CacheProviderFactory.create(config);
      expect(provider).toBeInstanceOf(DynamoDBCacheProvider);
    });

    it('should create Redis cache provider for redis provider', () => {
      const config: CacheConfig = {
        provider: 'redis',
        connectionString: 'redis://localhost:6379'
      };

      // Mock Redis client
      const mockRedisClient = {
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
        keys: jest.fn(),
        ping: jest.fn(),
        quit: jest.fn()
      };

      const provider = CacheProviderFactory.create(config, mockRedisClient);
      expect(provider).toBeInstanceOf(RedisCacheProvider);
    });

    it('should throw error for unsupported provider', () => {
      const config = {
        provider: 'unsupported'
      } as any;

      expect(() => CacheProviderFactory.create(config)).toThrow('Unsupported cache provider: unsupported');
    });
  });

  describe('createForAWS', () => {
    it('should create DynamoDB cache provider with default configuration', () => {
      const provider = CacheProviderFactory.createForAWS();
      expect(provider).toBeInstanceOf(DynamoDBCacheProvider);
    });

    it('should create DynamoDB cache provider with custom configuration', () => {
      const config = {
        region: 'us-west-2',
        keyPrefix: 'custom:',
        dynamodb: {
          tableName: 'custom-cache-table'
        }
      };

      const provider = CacheProviderFactory.createForAWS(config);
      expect(provider).toBeInstanceOf(DynamoDBCacheProvider);
    });

    it('should use environment variables for configuration', () => {
      const originalRegion = process.env.AWS_REGION;
      const originalTableName = process.env.CACHE_TABLE_NAME;

      process.env.AWS_REGION = 'eu-west-1';
      process.env.CACHE_TABLE_NAME = 'env-cache-table';

      const provider = CacheProviderFactory.createForAWS();
      expect(provider).toBeInstanceOf(DynamoDBCacheProvider);

      // Restore environment
      if (originalRegion) {
        process.env.AWS_REGION = originalRegion;
      } else {
        delete process.env.AWS_REGION;
      }
      
      if (originalTableName) {
        process.env.CACHE_TABLE_NAME = originalTableName;
      } else {
        delete process.env.CACHE_TABLE_NAME;
      }
    });
  });

  describe('createForDocker', () => {
    it('should create Redis cache provider with default configuration', () => {
      const mockRedisClient = {
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
        keys: jest.fn(),
        ping: jest.fn(),
        quit: jest.fn()
      };

      const provider = CacheProviderFactory.createForDocker(undefined, mockRedisClient);
      expect(provider).toBeInstanceOf(RedisCacheProvider);
    });

    it('should create Redis cache provider with custom configuration', () => {
      const config = {
        keyPrefix: 'docker:',
        redis: {
          host: 'redis-server',
          port: 6380
        }
      };

      const mockRedisClient = {
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
        keys: jest.fn(),
        ping: jest.fn(),
        quit: jest.fn()
      };

      const provider = CacheProviderFactory.createForDocker(config, mockRedisClient);
      expect(provider).toBeInstanceOf(RedisCacheProvider);
    });
  });

  describe('createForEnvironment', () => {
    it('should create AWS provider for aws environment', () => {
      const provider = CacheProviderFactory.createForEnvironment('aws');
      expect(provider).toBeInstanceOf(DynamoDBCacheProvider);
    });

    it('should create Docker provider for docker environment', () => {
      const mockRedisClient = {
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
        keys: jest.fn(),
        ping: jest.fn(),
        quit: jest.fn()
      };

      const provider = CacheProviderFactory.createForEnvironment('docker', undefined, mockRedisClient);
      expect(provider).toBeInstanceOf(RedisCacheProvider);
    });

    it('should throw error for unsupported environment', () => {
      expect(() => CacheProviderFactory.createForEnvironment('unsupported' as any)).toThrow('Unsupported environment: unsupported');
    });
  });

  describe('validateConfig', () => {
    it('should validate DynamoDB configuration', () => {
      const config: CacheConfig = {
        provider: 'dynamodb',
        dynamodb: {
          tableName: 'test-table'
        }
      };

      expect(() => CacheProviderFactory.validateConfig(config)).not.toThrow();
    });

    it('should validate Redis configuration', () => {
      const config: CacheConfig = {
        provider: 'redis',
        connectionString: 'redis://localhost:6379'
      };

      expect(() => CacheProviderFactory.validateConfig(config)).not.toThrow();
    });

    it('should throw error for missing provider', () => {
      const config = {} as CacheConfig;

      expect(() => CacheProviderFactory.validateConfig(config)).toThrow('Cache provider is required');
    });

    it('should throw error for unsupported provider', () => {
      const config = {
        provider: 'invalid'
      } as any;

      expect(() => CacheProviderFactory.validateConfig(config)).toThrow('Unsupported cache provider: invalid');
    });

    it('should throw error for missing DynamoDB table name', () => {
      const config: CacheConfig = {
        provider: 'dynamodb'
      };

      // Mock environment to not have CACHE_TABLE_NAME
      const originalTableName = process.env.CACHE_TABLE_NAME;
      delete process.env.CACHE_TABLE_NAME;

      expect(() => CacheProviderFactory.validateConfig(config)).toThrow('DynamoDB table name is required for DynamoDB cache provider');

      // Restore environment
      if (originalTableName) {
        process.env.CACHE_TABLE_NAME = originalTableName;
      }
    });

    it('should throw error for missing Redis connection information', () => {
      const config: CacheConfig = {
        provider: 'redis'
      };

      // Mock environment to not have Redis connection info
      const originalRedisUrl = process.env.REDIS_URL;
      const originalRedisHost = process.env.REDIS_HOST;
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;

      expect(() => CacheProviderFactory.validateConfig(config)).toThrow('Redis connection information is required for Redis cache provider');

      // Restore environment
      if (originalRedisUrl) {
        process.env.REDIS_URL = originalRedisUrl;
      }
      if (originalRedisHost) {
        process.env.REDIS_HOST = originalRedisHost;
      }
    });

    it('should throw error for negative TTL', () => {
      const config: CacheConfig = {
        provider: 'redis',
        connectionString: 'redis://localhost:6379',
        defaultTtl: -1
      };

      expect(() => CacheProviderFactory.validateConfig(config)).toThrow('Default TTL must be non-negative');
    });
  });
});