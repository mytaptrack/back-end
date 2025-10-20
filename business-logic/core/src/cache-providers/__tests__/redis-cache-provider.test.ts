import { RedisCacheProvider } from '../redis-cache-provider';
import { CacheConfig } from '../interfaces';

describe('RedisCacheProvider', () => {
  let provider: RedisCacheProvider;
  let mockRedisClient: any;
  let config: CacheConfig;

  beforeEach(() => {
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      ping: jest.fn(),
      quit: jest.fn()
    };

    config = {
      provider: 'redis',
      keyPrefix: 'test:',
      defaultTtl: 3600,
      redis: {
        host: 'localhost',
        port: 6379
      }
    };

    provider = new RedisCacheProvider(config, mockRedisClient);
  });

  describe('constructor', () => {
    it('should create provider with valid configuration and Redis client', () => {
      expect(provider).toBeInstanceOf(RedisCacheProvider);
    });

    it('should throw error for invalid provider type', () => {
      const invalidConfig = { ...config, provider: 'dynamodb' as any };
      expect(() => new RedisCacheProvider(invalidConfig, mockRedisClient)).toThrow('Invalid provider for RedisCacheProvider');
    });

    it('should throw error when Redis client is not provided', () => {
      expect(() => new RedisCacheProvider(config)).toThrow('Redis client must be provided to RedisCacheProvider constructor');
    });
  });

  describe('get', () => {
    it('should return cached value when item exists', async () => {
      const testValue = { data: 'test' };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(testValue));

      const result = await provider.get('test-key');
      expect(result).toEqual(testValue);
      expect(mockRedisClient.get).toHaveBeenCalledWith('test:test-key');
    });

    it('should return null when item does not exist', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      const result = await provider.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should return null and delete corrupted entry on parse error', async () => {
      mockRedisClient.get.mockResolvedValueOnce('invalid-json');
      mockRedisClient.del.mockResolvedValueOnce(1);

      const result = await provider.get('corrupted-key');
      expect(result).toBeNull();
      expect(mockRedisClient.del).toHaveBeenCalledWith('test:corrupted-key');
    });

    it('should return null on Redis error', async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error('Redis error'));

      const result = await provider.get('error-key');
      expect(result).toBeNull();
    });

    it('should connect if not already connected', async () => {
      // Create a new provider that starts disconnected
      const disconnectedMockClient = {
        ...mockRedisClient,
        ping: jest.fn().mockResolvedValueOnce('PONG'),
        get: jest.fn().mockResolvedValueOnce(null)
      };
      
      const disconnectedProvider = new RedisCacheProvider(config, disconnectedMockClient);
      // Manually set to disconnected state
      (disconnectedProvider as any).connected = false;

      await disconnectedProvider.get('test-key');
      expect(disconnectedMockClient.ping).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should store value with TTL', async () => {
      mockRedisClient.setex.mockResolvedValueOnce('OK');

      await provider.set('test-key', { data: 'test' }, 1800);
      expect(mockRedisClient.setex).toHaveBeenCalledWith('test:test-key', 1800, JSON.stringify({ data: 'test' }));
    });

    it('should store value with default TTL when not specified', async () => {
      mockRedisClient.setex.mockResolvedValueOnce('OK');

      await provider.set('test-key', { data: 'test' });
      expect(mockRedisClient.setex).toHaveBeenCalledWith('test:test-key', 3600, JSON.stringify({ data: 'test' }));
    });

    it('should store value without expiration when TTL is 0', async () => {
      mockRedisClient.set.mockResolvedValueOnce('OK');

      await provider.set('test-key', { data: 'test' }, 0);
      expect(mockRedisClient.set).toHaveBeenCalledWith('test:test-key', JSON.stringify({ data: 'test' }));
    });

    it('should throw error on Redis error', async () => {
      mockRedisClient.setex.mockRejectedValueOnce(new Error('Redis error'));

      await expect(provider.set('test-key', { data: 'test' })).rejects.toThrow('Redis error');
    });

    it('should connect if not already connected', async () => {
      const disconnectedMockClient = {
        ...mockRedisClient,
        ping: jest.fn().mockResolvedValueOnce('PONG'),
        setex: jest.fn().mockResolvedValueOnce('OK')
      };
      
      const disconnectedProvider = new RedisCacheProvider(config, disconnectedMockClient);
      // Manually set to disconnected state
      (disconnectedProvider as any).connected = false;

      await disconnectedProvider.set('test-key', { data: 'test' });
      expect(disconnectedMockClient.ping).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete item successfully', async () => {
      mockRedisClient.del.mockResolvedValueOnce(1);

      await provider.delete('test-key');
      expect(mockRedisClient.del).toHaveBeenCalledWith('test:test-key');
    });

    it('should throw error on Redis error', async () => {
      mockRedisClient.del.mockRejectedValueOnce(new Error('Redis error'));

      await expect(provider.delete('test-key')).rejects.toThrow('Redis error');
    });
  });

  describe('clear', () => {
    it('should clear all cache entries when no pattern provided', async () => {
      const mockKeys = ['test:key1', 'test:key2'];
      mockRedisClient.keys.mockResolvedValueOnce(mockKeys);
      mockRedisClient.del.mockResolvedValue(1);

      await provider.clear();
      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedisClient.del).toHaveBeenCalledTimes(2);
    });

    it('should clear entries matching pattern', async () => {
      const mockKeys = ['test:user:1', 'test:user:2'];
      mockRedisClient.keys.mockResolvedValueOnce(mockKeys);
      mockRedisClient.del.mockResolvedValue(1);

      await provider.clear('user:*');
      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:user:*');
      expect(mockRedisClient.del).toHaveBeenCalledTimes(2);
    });

    it('should add wildcard to pattern if not present', async () => {
      mockRedisClient.keys.mockResolvedValueOnce([]);

      await provider.clear('user');
      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:user*');
    });

    it('should handle empty key results', async () => {
      mockRedisClient.keys.mockResolvedValueOnce([]);

      await provider.clear();
      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should delete keys in batches', async () => {
      // Create 150 keys to test batching (batch size is 100)
      const mockKeys = Array.from({ length: 150 }, (_, i) => `test:key${i}`);
      mockRedisClient.keys.mockResolvedValueOnce(mockKeys);
      mockRedisClient.del.mockResolvedValue(1);

      await provider.clear();
      expect(mockRedisClient.del).toHaveBeenCalledTimes(150);
    });

    it('should throw error on Redis error', async () => {
      mockRedisClient.keys.mockRejectedValueOnce(new Error('Redis error'));

      await expect(provider.clear()).rejects.toThrow('Redis error');
    });
  });

  describe('isConnected', () => {
    it('should return true when connection is successful', async () => {
      mockRedisClient.ping.mockResolvedValueOnce('PONG');

      const result = await provider.isConnected();
      expect(result).toBe(true);
    });

    it('should return false when not connected', async () => {
      const disconnectedProvider = new RedisCacheProvider(config, mockRedisClient);
      // Simulate disconnected state
      (disconnectedProvider as any).connected = false;

      const result = await disconnectedProvider.isConnected();
      expect(result).toBe(false);
    });

    it('should return false and update connection state on ping failure', async () => {
      mockRedisClient.ping.mockRejectedValueOnce(new Error('Connection error'));

      const result = await provider.isConnected();
      expect(result).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      const disconnectedMockClient = {
        ...mockRedisClient,
        ping: jest.fn().mockResolvedValueOnce('PONG')
      };
      
      const disconnectedProvider = new RedisCacheProvider(config, disconnectedMockClient);
      // Manually set to disconnected state
      (disconnectedProvider as any).connected = false;

      await disconnectedProvider.connect();
      expect(disconnectedMockClient.ping).toHaveBeenCalled();
    });

    it('should throw error on connection failure', async () => {
      const disconnectedMockClient = {
        ...mockRedisClient,
        ping: jest.fn().mockRejectedValueOnce(new Error('Connection failed'))
      };
      
      const disconnectedProvider = new RedisCacheProvider(config, disconnectedMockClient);
      // Manually set to disconnected state
      (disconnectedProvider as any).connected = false;

      await expect(disconnectedProvider.connect()).rejects.toThrow('Connection failed');
    });

    it('should not ping if already connected', async () => {
      // provider is already connected in beforeEach
      await provider.connect();
      expect(mockRedisClient.ping).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      mockRedisClient.quit.mockResolvedValueOnce('OK');

      await provider.disconnect();
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should handle disconnect error gracefully', async () => {
      mockRedisClient.quit.mockRejectedValueOnce(new Error('Disconnect error'));

      // Should not throw
      await provider.disconnect();
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should not quit if not connected', async () => {
      const disconnectedMockClient = {
        ...mockRedisClient,
        quit: jest.fn()
      };
      
      const disconnectedProvider = new RedisCacheProvider(config, disconnectedMockClient);
      // Manually set to disconnected state
      (disconnectedProvider as any).connected = false;
      
      await disconnectedProvider.disconnect();
      expect(disconnectedMockClient.quit).not.toHaveBeenCalled();
    });
  });
});