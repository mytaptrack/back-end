import { DynamoDBCacheProvider } from '../dynamodb-cache-provider';
import { CacheConfig } from '../interfaces';

// Mock AWS SDK
const mockSend = jest.fn();
const mockDynamoDBClient = {
  send: mockSend
};

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => mockDynamoDBClient),
  GetItemCommand: jest.fn((params) => ({ params })),
  PutItemCommand: jest.fn((params) => ({ params })),
  DeleteItemCommand: jest.fn((params) => ({ params })),
  ScanCommand: jest.fn((params) => ({ params }))
}));

jest.mock('@aws-sdk/util-dynamodb', () => ({
  marshall: jest.fn((obj) => ({ marshalled: obj })),
  unmarshall: jest.fn((obj) => obj.unmarshalled || obj)
}));

describe('DynamoDBCacheProvider', () => {
  let provider: DynamoDBCacheProvider;
  let config: CacheConfig;

  beforeEach(() => {
    config = {
      provider: 'dynamodb',
      region: 'us-east-1',
      keyPrefix: 'test:',
      defaultTtl: 3600,
      dynamodb: {
        tableName: 'test-cache-table'
      }
    };

    provider = new DynamoDBCacheProvider(config);
    mockSend.mockClear();
  });

  describe('constructor', () => {
    it('should create provider with valid configuration', () => {
      expect(provider).toBeInstanceOf(DynamoDBCacheProvider);
    });

    it('should throw error for invalid provider type', () => {
      const invalidConfig = { ...config, provider: 'redis' as any };
      expect(() => new DynamoDBCacheProvider(invalidConfig)).toThrow('Invalid provider for DynamoDBCacheProvider');
    });

    it('should use default values for missing configuration', () => {
      const minimalConfig: CacheConfig = {
        provider: 'dynamodb'
      };

      const minimalProvider = new DynamoDBCacheProvider(minimalConfig);
      expect(minimalProvider).toBeInstanceOf(DynamoDBCacheProvider);
    });
  });

  describe('get', () => {
    it('should return cached value when item exists and not expired', async () => {
      const testValue = { data: 'test' };
      const cacheEntry = {
        value: testValue,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000 // 1 hour from now
      };

      mockSend.mockResolvedValueOnce({
        Item: { unmarshalled: cacheEntry }
      });

      const result = await provider.get('test-key');
      expect(result).toEqual(testValue);
    });

    it('should return null when item does not exist', async () => {
      mockSend.mockResolvedValueOnce({
        Item: null
      });

      const result = await provider.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should return null and delete expired item', async () => {
      const expiredEntry = {
        value: { data: 'expired' },
        createdAt: Date.now() - 7200000, // 2 hours ago
        expiresAt: Date.now() - 3600000   // 1 hour ago (expired)
      };

      mockSend
        .mockResolvedValueOnce({ Item: { unmarshalled: expiredEntry } }) // get
        .mockResolvedValueOnce({}); // delete

      const result = await provider.get('expired-key');
      expect(result).toBeNull();
      expect(mockSend).toHaveBeenCalledTimes(2); // get + delete
    });

    it('should return null on error', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      const result = await provider.get('error-key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store value with TTL', async () => {
      mockSend.mockResolvedValueOnce({});

      await provider.set('test-key', { data: 'test' }, 1800);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should store value with default TTL when not specified', async () => {
      mockSend.mockResolvedValueOnce({});

      await provider.set('test-key', { data: 'test' });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should store value without expiration when TTL is 0', async () => {
      mockSend.mockResolvedValueOnce({});

      await provider.set('test-key', { data: 'test' }, 0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error on DynamoDB error', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(provider.set('test-key', { data: 'test' })).rejects.toThrow('DynamoDB error');
    });
  });

  describe('delete', () => {
    it('should delete item successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      await provider.delete('test-key');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error on DynamoDB error', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(provider.delete('test-key')).rejects.toThrow('DynamoDB error');
    });
  });

  describe('clear', () => {
    it('should clear all cache entries when no pattern provided', async () => {
      const mockItems = [
        { pk: 'test:key1', sk: 'CACHE' },
        { pk: 'test:key2', sk: 'CACHE' }
      ];

      mockSend
        .mockResolvedValueOnce({ Items: mockItems }) // scan
        .mockResolvedValueOnce({}) // delete 1
        .mockResolvedValueOnce({}); // delete 2

      await provider.clear();
      expect(mockSend).toHaveBeenCalledTimes(3); // scan + 2 deletes
    });

    it('should clear entries matching pattern', async () => {
      const mockItems = [
        { pk: 'test:user:1', sk: 'CACHE' }
      ];

      mockSend
        .mockResolvedValueOnce({ Items: mockItems }) // scan
        .mockResolvedValueOnce({}); // delete

      await provider.clear('user:*');
      expect(mockSend).toHaveBeenCalledTimes(2); // scan + delete
    });

    it('should handle empty scan results', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await provider.clear();
      expect(mockSend).toHaveBeenCalledTimes(1); // scan only
    });

    it('should throw error on DynamoDB error', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(provider.clear()).rejects.toThrow('DynamoDB error');
    });
  });

  describe('isConnected', () => {
    it('should return true when connection is successful', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await provider.isConnected();
      expect(result).toBe(true);
    });

    it('should return false when connection fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Connection error'));

      const result = await provider.isConnected();
      expect(result).toBe(false);
    });
  });
});