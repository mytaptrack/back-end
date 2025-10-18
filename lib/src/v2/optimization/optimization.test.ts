/**
 * Tests for database optimization features
 */

import {
  OptimizedDataAccessLayer,
  OptimizedDALFactory,
  CachedDataAccessLayer,
  CircuitBreakerDataAccessLayer,
  QueryOptimizer,
  BatchOptimizer,
  InMemoryCacheProvider,
  CircuitBreaker,
  CircuitBreakerState
} from './index';

import { 
  IDataAccessLayer, 
  DatabaseKey, 
  UnifiedQueryInput,
  DatabaseProviderType 
} from '../types/database-abstraction';

// Mock provider for testing
class MockDataAccessLayer implements IDataAccessLayer {
  private data = new Map<string, any>();
  private shouldFail = false;
  private failureCount = 0;

  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
    this.failureCount = 0;
  }

  async connect(): Promise<void> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error('Connection failed');
    }
  }

  async disconnect(): Promise<void> {}

  isConnected(): boolean {
    return !this.shouldFail;
  }

  getProviderType(): DatabaseProviderType {
    return 'dynamodb';
  }

  async healthCheck() {
    return {
      healthy: !this.shouldFail,
      provider: 'dynamodb' as DatabaseProviderType,
      connectionStatus: this.shouldFail ? 'error' as const : 'connected' as const,
      metrics: {
        averageResponseTime: 10,
        errorRate: this.shouldFail ? 1 : 0,
        connectionCount: 1
      }
    };
  }

  async get<TResult>(key: DatabaseKey): Promise<TResult | null> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error('Get operation failed');
    }
    
    const keyStr = `${key.primary}#${key.sort || ''}`;
    return this.data.get(keyStr) || null;
  }

  async put<TData>(data: TData): Promise<void> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error('Put operation failed');
    }
    
    const key = `${(data as any).pk}#${(data as any).sk || ''}`;
    this.data.set(key, data);
  }

  async update(): Promise<any> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error('Update operation failed');
    }
  }

  async delete(key: DatabaseKey): Promise<void> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error('Delete operation failed');
    }
    
    const keyStr = `${key.primary}#${key.sort || ''}`;
    this.data.delete(keyStr);
  }

  async query<TResult>(input: UnifiedQueryInput): Promise<TResult[]> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error('Query operation failed');
    }
    
    // Simple mock query implementation
    return Array.from(this.data.values()).slice(0, input.limit || 10) as TResult[];
  }

  async scan<TResult>(): Promise<{ items: TResult[], token?: any }> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error('Scan operation failed');
    }
    
    return {
      items: Array.from(this.data.values()) as TResult[]
    };
  }

  async batchGet<TResult>(keys: DatabaseKey[]): Promise<TResult[]> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error('BatchGet operation failed');
    }
    
    const results: TResult[] = [];
    for (const key of keys) {
      const keyStr = `${key.primary}#${key.sort || ''}`;
      const item = this.data.get(keyStr);
      if (item) {
        results.push(item);
      }
    }
    return results;
  }

  async beginTransaction(): Promise<any> {
    return {
      commit: async () => {},
      rollback: async () => {},
      isActive: () => true
    };
  }

  async executeTransaction(): Promise<void> {}

  async executeNative(): Promise<any> {
    return {};
  }

  getFailureCount(): number {
    return this.failureCount;
  }
}

describe('Database Optimization Features', () => {
  let mockProvider: MockDataAccessLayer;

  beforeEach(() => {
    mockProvider = new MockDataAccessLayer();
  });

  describe('CachedDataAccessLayer', () => {
    it('should cache get operations', async () => {
      const cacheConfig = {
        enabled: true,
        defaultTtl: 300,
        maxSize: 1000,
        keyPrefix: 'test'
      };

      const cacheStrategy = {
        cacheReads: true,
        cacheQueries: false,
        cacheScans: false,
        cacheBatchGets: false,
        readTtl: 300,
        queryTtl: 180,
        scanTtl: 60,
        batchGetTtl: 300,
        invalidateOnWrite: true,
        invalidateOnUpdate: true,
        invalidateOnDelete: true,
        cacheNullResults: true,
        maxQueryResultSize: 100
      };

      const cachedDAL = new CachedDataAccessLayer(mockProvider, cacheConfig, cacheStrategy);

      // Put some data
      await cachedDAL.put({ pk: 'test1', sk: 'item1', data: 'value1' });

      // First get should hit the database
      const result1 = await cachedDAL.get({ primary: 'test1', sort: 'item1' });
      expect(result1).toEqual({ pk: 'test1', sk: 'item1', data: 'value1' });

      // Second get should hit the cache
      const result2 = await cachedDAL.get({ primary: 'test1', sort: 'item1' });
      expect(result2).toEqual({ pk: 'test1', sk: 'item1', data: 'value1' });

      // Verify cache stats
      const stats = await cachedDAL.getCacheStats();
      expect(stats.hits).toBeGreaterThan(0);
    });

    it('should invalidate cache on write operations', async () => {
      const cacheConfig = {
        enabled: true,
        defaultTtl: 300,
        maxSize: 1000
      };

      const cachedDAL = new CachedDataAccessLayer(mockProvider, cacheConfig);

      // Put and get data to populate cache
      await cachedDAL.put({ pk: 'test1', sk: 'item1', data: 'value1' });
      await cachedDAL.get({ primary: 'test1', sort: 'item1' });

      // Update should invalidate cache
      await cachedDAL.put({ pk: 'test1', sk: 'item1', data: 'value2' });

      // Next get should fetch fresh data
      const result = await cachedDAL.get({ primary: 'test1', sort: 'item1' });
      expect(result).toEqual({ pk: 'test1', sk: 'item1', data: 'value2' });
    });
  });

  describe('CircuitBreakerDataAccessLayer', () => {
    it('should open circuit after failure threshold', async () => {
      const cbConfig = {
        failureThreshold: 3,
        recoveryTimeout: 1000,
        successThreshold: 2,
        timeout: 5000,
        monitoringPeriod: 60000,
        volumeThreshold: 3
      };

      const cbDAL = new CircuitBreakerDataAccessLayer(mockProvider, cbConfig);

      // Set provider to fail
      mockProvider.setFailureMode(true);

      // Trigger failures to open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await cbDAL.get({ primary: 'test', sort: 'item' });
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should be open now
      const stats = cbDAL.getCircuitBreakerStats();
      expect(stats.state).toBe(CircuitBreakerState.OPEN);

      // Next request should be rejected immediately
      try {
        await cbDAL.get({ primary: 'test', sort: 'item' });
        fail('Should have thrown CircuitBreakerOpenError');
      } catch (error) {
        expect((error as Error).name).toBe('CircuitBreakerOpenError');
      }
    });

    it('should recover after successful operations in half-open state', async () => {
      const cbConfig = {
        failureThreshold: 2,
        recoveryTimeout: 100, // Short timeout for testing
        successThreshold: 2,
        timeout: 5000,
        monitoringPeriod: 60000,
        volumeThreshold: 2
      };

      const cbDAL = new CircuitBreakerDataAccessLayer(mockProvider, cbConfig);

      // Trigger failures to open circuit
      mockProvider.setFailureMode(true);
      for (let i = 0; i < 3; i++) {
        try {
          await cbDAL.get({ primary: 'test', sort: 'item' });
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Fix the provider
      mockProvider.setFailureMode(false);

      // Next requests should succeed and close the circuit
      await cbDAL.get({ primary: 'test', sort: 'item' });
      await cbDAL.get({ primary: 'test', sort: 'item' });

      const stats = cbDAL.getCircuitBreakerStats();
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('QueryOptimizer', () => {
    it('should analyze queries and provide recommendations', () => {
      const optimizer = new QueryOptimizer('dynamodb');

      const queryInput: UnifiedQueryInput = {
        keyCondition: {
          field: 'pk',
          operator: '=',
          value: 'test'
        },
        limit: 1000
      };

      const analysis = optimizer.analyzeQuery(queryInput);

      expect(analysis).toBeDefined();
      expect(analysis.queryType).toBe('query');
      expect(analysis.recommendations).toBeDefined();
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });

    it('should recommend against scan operations', () => {
      const optimizer = new QueryOptimizer('dynamodb');

      const scanInput = {
        filterCondition: {
          field: 'status',
          operator: 'contains' as const,
          value: 'active'
        }
      };

      const analysis = optimizer.analyzeScan(scanInput);

      expect(analysis).toBeDefined();
      expect(analysis.queryType).toBe('scan');
      expect(analysis.recommendations.length).toBeGreaterThan(0);
      expect(analysis.recommendations.some(r => r.severity === 'high')).toBe(true);
    });
  });

  describe('BatchOptimizer', () => {
    it('should execute batch operations efficiently', async () => {
      const batchConfig = {
        maxBatchSize: 5,
        maxConcurrentBatches: 2,
        retryAttempts: 1,
        retryDelayMs: 10,
        backoffMultiplier: 1,
        timeoutMs: 5000
      };

      const batchOptimizer = new BatchOptimizer(mockProvider, batchConfig);

      const operations = [
        { type: 'put' as const, data: { pk: 'batch1', sk: 'item1', data: 'value1' } },
        { type: 'put' as const, data: { pk: 'batch2', sk: 'item2', data: 'value2' } },
        { type: 'put' as const, data: { pk: 'batch3', sk: 'item3', data: 'value3' } }
      ];

      const result = await batchOptimizer.executeBatch(operations);

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors.length).toBe(0);
      expect(result.throughput).toBeGreaterThan(0);
    });

    it('should handle batch failures gracefully', async () => {
      const batchOptimizer = new BatchOptimizer(mockProvider);

      // Set provider to fail
      mockProvider.setFailureMode(true);

      const operations = [
        { type: 'put' as const, data: { pk: 'batch1', sk: 'item1', data: 'value1' } },
        { type: 'put' as const, data: { pk: 'batch2', sk: 'item2', data: 'value2' } }
      ];

      const result = await batchOptimizer.executeBatch(operations);

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.errors.length).toBe(2);
    });
  });

  describe('OptimizedDataAccessLayer', () => {
    it('should create optimized DAL with all features', async () => {
      const optimizedDAL = OptimizedDALFactory.createWithDefaults(mockProvider);

      expect(optimizedDAL).toBeInstanceOf(OptimizedDataAccessLayer);

      // Test basic operations
      await optimizedDAL.put({ pk: 'test', sk: 'item', data: 'value' });
      const result = await optimizedDAL.get({ primary: 'test', sort: 'item' });
      expect(result).toEqual({ pk: 'test', sk: 'item', data: 'value' });

      // Test health check with optimization metrics
      const health = await optimizedDAL.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.metrics).toBeDefined();
    });

    it('should provide optimization statistics', async () => {
      const optimizedDAL = OptimizedDALFactory.createWithDefaults(mockProvider);

      // Perform some operations
      await optimizedDAL.put({ pk: 'test', sk: 'item', data: 'value' });
      await optimizedDAL.get({ primary: 'test', sort: 'item' });

      const stats = optimizedDAL.getOptimizationStats();
      expect(stats).toBeDefined();
      expect(stats.cache).toBeDefined();
      expect(stats.circuitBreaker).toBeDefined();
    });

    it('should provide query analysis', () => {
      const optimizedDAL = OptimizedDALFactory.createWithDefaults(mockProvider);

      const queryInput: UnifiedQueryInput = {
        keyCondition: {
          field: 'pk',
          operator: '=',
          value: 'test'
        }
      };

      const analysis = optimizedDAL.analyzeQuery(queryInput);
      expect(analysis).toBeDefined();
      expect(analysis?.queryType).toBe('query');
    });
  });

  describe('InMemoryCacheProvider', () => {
    it('should store and retrieve values', async () => {
      const cacheConfig = {
        enabled: true,
        defaultTtl: 300,
        maxSize: 1000
      };

      const cache = new InMemoryCacheProvider(cacheConfig);

      await cache.set('key1', 'value1');
      const result = await cache.get('key1');
      expect(result).toBe('value1');

      const exists = await cache.exists('key1');
      expect(exists).toBe(true);
    });

    it('should handle TTL expiration', async () => {
      const cacheConfig = {
        enabled: true,
        defaultTtl: 1, // 1 second
        maxSize: 1000
      };

      const cache = new InMemoryCacheProvider(cacheConfig);

      await cache.set('key1', 'value1', 0.1); // 100ms TTL
      
      // Should exist immediately
      let result = await cache.get('key1');
      expect(result).toBe('value1');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      result = await cache.get('key1');
      expect(result).toBeNull();
    });

    it('should provide cache statistics', async () => {
      const cacheConfig = {
        enabled: true,
        defaultTtl: 300,
        maxSize: 1000
      };

      const cache = new InMemoryCacheProvider(cacheConfig);

      // Generate some hits and misses
      await cache.set('key1', 'value1');
      await cache.get('key1'); // Hit
      await cache.get('key2'); // Miss

      const stats = await cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
      expect(stats.size).toBe(1);
    });
  });

  describe('CircuitBreaker', () => {
    it('should track success and failure rates', async () => {
      const cbConfig = {
        failureThreshold: 3,
        recoveryTimeout: 1000,
        successThreshold: 2,
        timeout: 1000,
        monitoringPeriod: 60000,
        volumeThreshold: 3
      };

      const cb = new CircuitBreaker(cbConfig);

      // Execute successful operations
      await cb.execute(async () => 'success');
      await cb.execute(async () => 'success');

      // Execute failing operations
      try {
        await cb.execute(async () => {
          throw new Error('Test failure');
        });
      } catch (error) {
        // Expected
      }

      const stats = cb.getStats();
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.totalRequests).toBe(3);
    });
  });
});

// Helper function for tests
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}