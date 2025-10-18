/**
 * Cached Data Access Layer wrapper
 * Provides caching functionality for any database provider implementation
 */

import { 
  IDataAccessLayer, 
  DatabaseKey, 
  UnifiedQueryInput, 
  UnifiedScanInput, 
  UnifiedUpdateInput,
  QueryOptions,
  PutOptions,
  UpdateOptions,
  DeleteOptions,
  BatchOptions,
  TransactionOperation,
  ITransaction,
  HealthStatus,
  DatabaseProviderType
} from '../types/database-abstraction';

import { 
  ICacheProvider, 
  CacheConfig, 
  CacheKeyGenerator,
  InMemoryCacheProvider 
} from './cache-provider';

// Re-export for external use
export { ICacheProvider, CacheConfig, InMemoryCacheProvider } from './cache-provider';

// Cache strategy configuration
export interface CacheStrategy {
  // Operations to cache
  cacheReads: boolean;
  cacheQueries: boolean;
  cacheScans: boolean;
  cacheBatchGets: boolean;
  
  // TTL settings per operation type
  readTtl: number;
  queryTtl: number;
  scanTtl: number;
  batchGetTtl: number;
  
  // Cache invalidation settings
  invalidateOnWrite: boolean;
  invalidateOnUpdate: boolean;
  invalidateOnDelete: boolean;
  
  // Advanced settings
  cacheNullResults: boolean;
  maxQueryResultSize: number; // Don't cache queries with more results than this
}

// Default cache strategy
export const DEFAULT_CACHE_STRATEGY: CacheStrategy = {
  cacheReads: true,
  cacheQueries: true,
  cacheScans: false, // Scans are typically large and change frequently
  cacheBatchGets: true,
  
  readTtl: 300, // 5 minutes
  queryTtl: 180, // 3 minutes
  scanTtl: 60,   // 1 minute
  batchGetTtl: 300, // 5 minutes
  
  invalidateOnWrite: true,
  invalidateOnUpdate: true,
  invalidateOnDelete: true,
  
  cacheNullResults: true,
  maxQueryResultSize: 100
};

/**
 * Cached Data Access Layer implementation
 * Wraps any IDataAccessLayer implementation with caching functionality
 */
export class CachedDataAccessLayer implements IDataAccessLayer {
  private provider: IDataAccessLayer;
  private cache: ICacheProvider;
  private strategy: CacheStrategy;
  private cacheConfig: CacheConfig;

  constructor(
    provider: IDataAccessLayer,
    cacheConfig: CacheConfig,
    strategy: CacheStrategy = DEFAULT_CACHE_STRATEGY
  ) {
    this.provider = provider;
    this.strategy = strategy;
    this.cacheConfig = cacheConfig;
    
    // Create cache provider (could be injected for different implementations)
    this.cache = new InMemoryCacheProvider(cacheConfig);
  }

  // Set custom cache provider (e.g., Redis)
  setCacheProvider(cacheProvider: ICacheProvider): void {
    this.cache = cacheProvider;
  }

  // IDatabaseProvider methods
  async connect(): Promise<void> {
    return this.provider.connect();
  }

  async disconnect(): Promise<void> {
    await this.cache.clear();
    return this.provider.disconnect();
  }

  isConnected(): boolean {
    return this.provider.isConnected();
  }

  getProviderType(): DatabaseProviderType {
    return this.provider.getProviderType();
  }

  async healthCheck(): Promise<HealthStatus> {
    const providerHealth = await this.provider.healthCheck();
    const cacheStats = await this.cache.getStats();
    
    return {
      ...providerHealth,
      metrics: {
        ...providerHealth.metrics
      }
    };
  }

  // CRUD Operations with caching
  async get<TResult>(key: DatabaseKey, options?: QueryOptions): Promise<TResult | null> {
    if (!this.strategy.cacheReads) {
      return this.provider.get<TResult>(key, options);
    }

    const cacheKey = CacheKeyGenerator.generateKey('get', key, options);
    
    // Try cache first
    const cached = await this.cache.get<TResult>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - get from provider
    const result = await this.provider.get<TResult>(key, options);
    
    // Cache the result (including null if configured to do so)
    if (result !== null || this.strategy.cacheNullResults) {
      await this.cache.set(cacheKey, result, this.strategy.readTtl);
    }

    return result;
  }

  async put<TData>(data: TData, options?: PutOptions): Promise<void> {
    await this.provider.put(data, options);
    
    if (this.strategy.invalidateOnWrite) {
      await this.invalidateRelatedCache(data);
    }
  }

  async update(input: UnifiedUpdateInput, options?: UpdateOptions): Promise<any> {
    const result = await this.provider.update(input, options);
    
    if (this.strategy.invalidateOnUpdate) {
      await this.invalidateKeyCache(input.key);
    }

    return result;
  }

  async delete(key: DatabaseKey, options?: DeleteOptions): Promise<void> {
    await this.provider.delete(key, options);
    
    if (this.strategy.invalidateOnDelete) {
      await this.invalidateKeyCache(key);
    }
  }

  // Query Operations with caching
  async query<TResult>(input: UnifiedQueryInput): Promise<TResult[]> {
    if (!this.strategy.cacheQueries) {
      return this.provider.query<TResult>(input);
    }

    const cacheKey = CacheKeyGenerator.generateQueryKey('query', input);
    
    // Try cache first
    const cached = await this.cache.get<TResult[]>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - query from provider
    const result = await this.provider.query<TResult>(input);
    
    // Cache the result if it's not too large
    if (result.length <= this.strategy.maxQueryResultSize) {
      await this.cache.set(cacheKey, result, this.strategy.queryTtl);
    }

    return result;
  }

  async scan<TResult>(input: UnifiedScanInput): Promise<{ items: TResult[], token?: any }> {
    if (!this.strategy.cacheScans) {
      return this.provider.scan<TResult>(input);
    }

    const cacheKey = CacheKeyGenerator.generateQueryKey('scan', input);
    
    // Try cache first
    const cached = await this.cache.get<{ items: TResult[], token?: any }>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - scan from provider
    const result = await this.provider.scan<TResult>(input);
    
    // Cache the result if it's not too large
    if (result.items.length <= this.strategy.maxQueryResultSize) {
      await this.cache.set(cacheKey, result, this.strategy.scanTtl);
    }

    return result;
  }

  async batchGet<TResult>(keys: DatabaseKey[], options?: BatchOptions): Promise<TResult[]> {
    if (!this.strategy.cacheBatchGets) {
      return this.provider.batchGet<TResult>(keys, options);
    }

    // Check cache for each key
    const cacheKeys = keys.map(key => CacheKeyGenerator.generateKey('get', key, options));
    const cachedResults = await this.cache.mget<TResult>(cacheKeys);
    
    const uncachedIndices: number[] = [];
    const uncachedKeys: DatabaseKey[] = [];
    
    cachedResults.forEach((cached, index) => {
      if (cached === null) {
        uncachedIndices.push(index);
        uncachedKeys.push(keys[index]);
      }
    });

    // If all results are cached, return them
    if (uncachedKeys.length === 0) {
      return cachedResults.filter(result => result !== null) as TResult[];
    }

    // Fetch uncached items
    const uncachedResults = await this.provider.batchGet<TResult>(uncachedKeys, options);
    
    // Cache the new results
    const cacheItems = uncachedResults.map((result, index) => ({
      key: cacheKeys[uncachedIndices[index]],
      value: result,
      ttl: this.strategy.batchGetTtl
    }));
    
    await this.cache.mset(cacheItems);

    // Merge cached and uncached results
    const finalResults: TResult[] = [];
    let uncachedIndex = 0;
    
    for (let i = 0; i < keys.length; i++) {
      if (cachedResults[i] !== null) {
        finalResults.push(cachedResults[i] as TResult);
      } else {
        finalResults.push(uncachedResults[uncachedIndex]);
        uncachedIndex++;
      }
    }

    return finalResults;
  }

  // Transaction Operations (no caching for transactions)
  async beginTransaction(): Promise<ITransaction> {
    const transaction = await this.provider.beginTransaction();
    return new CachedTransaction(transaction, this.cache, this.strategy);
  }

  async executeTransaction(operations: TransactionOperation[]): Promise<void> {
    await this.provider.executeTransaction(operations);
    
    // Invalidate cache for all affected keys
    for (const operation of operations) {
      if (operation.key) {
        await this.invalidateKeyCache(operation.key);
      }
    }
  }

  // Provider-specific operations (no caching)
  async executeNative(operation: any): Promise<any> {
    return this.provider.executeNative(operation);
  }

  // Cache management methods
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  async getCacheStats() {
    return this.cache.getStats();
  }

  async invalidateKey(key: DatabaseKey): Promise<void> {
    await this.invalidateKeyCache(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // This would require a more sophisticated cache implementation
    // For now, we'll clear the entire cache
    await this.cache.clear();
  }

  // Private helper methods
  private async invalidateKeyCache(key: DatabaseKey): Promise<void> {
    // Generate possible cache keys for this database key
    const cacheKeys = [
      CacheKeyGenerator.generateKey('get', key),
      CacheKeyGenerator.generateKey('get', key, { consistentRead: true }),
      CacheKeyGenerator.generateKey('get', key, { consistentRead: false })
    ];

    await this.cache.mdel(cacheKeys);
  }

  private async invalidateRelatedCache(data: any): Promise<void> {
    // Extract key information from data object
    if (data && typeof data === 'object') {
      const key: DatabaseKey = {
        primary: data.pk || data.id,
        sort: data.sk
      };
      
      if (key.primary) {
        await this.invalidateKeyCache(key);
      }
    }
  }
}

/**
 * Cached Transaction wrapper
 * Provides cache invalidation for transaction operations
 */
class CachedTransaction implements ITransaction {
  private transaction: ITransaction;
  private cache: ICacheProvider;
  private strategy: CacheStrategy;
  private affectedKeys: DatabaseKey[] = [];

  constructor(transaction: ITransaction, cache: ICacheProvider, strategy: CacheStrategy) {
    this.transaction = transaction;
    this.cache = cache;
    this.strategy = strategy;
  }

  async get<T>(key: DatabaseKey): Promise<T | null> {
    return this.transaction.get<T>(key);
  }

  async put<T>(data: T, options?: PutOptions): Promise<void> {
    await this.transaction.put(data, options);
    
    // Track affected keys for cache invalidation
    if (data && typeof data === 'object') {
      const key: DatabaseKey = {
        primary: (data as any).pk || (data as any).id,
        sort: (data as any).sk
      };
      
      if (key.primary) {
        this.affectedKeys.push(key);
      }
    }
  }

  async update(input: UnifiedUpdateInput): Promise<void> {
    await this.transaction.update(input);
    this.affectedKeys.push(input.key);
  }

  async delete(key: DatabaseKey, options?: DeleteOptions): Promise<void> {
    await this.transaction.delete(key, options);
    this.affectedKeys.push(key);
  }

  async conditionCheck(key: DatabaseKey, condition: any): Promise<void> {
    return this.transaction.conditionCheck(key, condition);
  }

  async commit(): Promise<void> {
    await this.transaction.commit();
    
    // Invalidate cache for all affected keys after successful commit
    for (const key of this.affectedKeys) {
      const cacheKeys = [
        CacheKeyGenerator.generateKey('get', key),
        CacheKeyGenerator.generateKey('get', key, { consistentRead: true }),
        CacheKeyGenerator.generateKey('get', key, { consistentRead: false })
      ];
      
      await this.cache.mdel(cacheKeys);
    }
  }

  async rollback(): Promise<void> {
    await this.transaction.rollback();
    // No cache invalidation needed on rollback
    this.affectedKeys = [];
  }

  isActive(): boolean {
    return this.transaction.isActive();
  }
}