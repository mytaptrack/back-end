/**
 * Optimized Data Access Layer
 * Combines all optimization features into a single, high-performance DAL wrapper
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
  DatabaseProviderType,
  DatabaseConfig
} from '../types/database-abstraction';

import {
  CachedDataAccessLayer,
  CacheConfig,
  CacheStrategy,
  DEFAULT_CACHE_STRATEGY,
  InMemoryCacheProvider,
  ICacheProvider
} from './cached-dal';

import {
  CircuitBreakerDataAccessLayer,
  CircuitBreakerConfig,
  CircuitBreakerConfigFactory,
  CircuitBreakerStats
} from './circuit-breaker';

import {
  QueryOptimizer,
  QueryAnalysis,
  OptimizationRecommendation
} from './query-optimizer';

import {
  BatchOptimizer,
  BatchConfig,
  BatchOperation,
  BatchResult,
  BatchStats
} from './batch-optimizer';

import {
  ConnectionPool,
  ConnectionPoolConfig,
  MongoDBConnectionFactory,
  MongoDBConnection
} from './connection-pool';

// Optimization configuration
export interface OptimizationConfig {
  cache?: {
    enabled: boolean;
    config: CacheConfig;
    strategy: CacheStrategy;
    provider?: ICacheProvider;
  };
  circuitBreaker?: {
    enabled: boolean;
    config: CircuitBreakerConfig;
  };
  queryOptimization?: {
    enabled: boolean;
    autoOptimize: boolean;
    logRecommendations: boolean;
  };
  batchOptimization?: {
    enabled: boolean;
    config: BatchConfig;
  };
  connectionPooling?: {
    enabled: boolean;
    config: ConnectionPoolConfig;
  };
}

// Default optimization configuration
export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  cache: {
    enabled: true,
    config: {
      enabled: true,
      defaultTtl: 300, // 5 minutes
      maxSize: 10000,
      keyPrefix: 'dal',
      compressionEnabled: false
    },
    strategy: DEFAULT_CACHE_STRATEGY
  },
  circuitBreaker: {
    enabled: true,
    config: {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      successThreshold: 3,
      timeout: 30000,
      monitoringPeriod: 300000,
      volumeThreshold: 10
    }
  },
  queryOptimization: {
    enabled: true,
    autoOptimize: false,
    logRecommendations: true
  },
  batchOptimization: {
    enabled: true,
    config: {
      maxBatchSize: 25,
      maxConcurrentBatches: 10,
      retryAttempts: 3,
      retryDelayMs: 100,
      backoffMultiplier: 2,
      timeoutMs: 30000
    }
  },
  connectionPooling: {
    enabled: false, // Only for MongoDB
    config: {
      minConnections: 2,
      maxConnections: 10,
      acquireTimeoutMs: 10000,
      idleTimeoutMs: 300000,
      maxLifetimeMs: 1800000,
      testOnBorrow: true,
      testOnReturn: false
    }
  }
};

/**
 * Optimized Data Access Layer that combines all optimization features
 */
export class OptimizedDataAccessLayer implements IDataAccessLayer {
  private baseProvider: IDataAccessLayer;
  private optimizedProvider: IDataAccessLayer;
  private queryOptimizer?: QueryOptimizer;
  private batchOptimizer?: BatchOptimizer;
  private connectionPool?: ConnectionPool<MongoDBConnection>;
  private config: OptimizationConfig;
  private circuitBreakerLayer?: CircuitBreakerDataAccessLayer;
  private cachedLayer?: CachedDataAccessLayer;

  constructor(baseProvider: IDataAccessLayer, config?: Partial<OptimizationConfig>) {
    this.baseProvider = baseProvider;
    this.config = this.mergeConfig(config);
    
    // Build the optimization chain
    this.optimizedProvider = this.buildOptimizationChain(baseProvider);
    
    // Initialize additional optimizers
    this.initializeOptimizers();
  }

  // IDatabaseProvider methods
  async connect(): Promise<void> {
    if (this.connectionPool) {
      // Connection pool handles connections for MongoDB
      return;
    }
    return this.optimizedProvider.connect();
  }

  async disconnect(): Promise<void> {
    if (this.connectionPool) {
      await this.connectionPool.close();
    }
    return this.optimizedProvider.disconnect();
  }

  isConnected(): boolean {
    return this.optimizedProvider.isConnected();
  }

  getProviderType(): DatabaseProviderType {
    return this.optimizedProvider.getProviderType();
  }

  async healthCheck(): Promise<HealthStatus> {
    const baseHealth = await this.optimizedProvider.healthCheck();
    
    // Add optimization-specific metrics
    const optimizationMetrics: any = {};
    
    if (this.config.cache?.enabled && this.cachedLayer) {
      const cacheStats = await this.cachedLayer.getCacheStats();
      optimizationMetrics.cacheHitRate = cacheStats.hitRate;
      optimizationMetrics.cacheSize = cacheStats.size;
    }
    
    if (this.config.circuitBreaker?.enabled && this.circuitBreakerLayer) {
      const cbStats = this.circuitBreakerLayer.getCircuitBreakerStats();
      optimizationMetrics.circuitBreakerState = cbStats.state;
      optimizationMetrics.circuitBreakerFailureRate = cbStats.failureRate;
    }
    
    if (this.batchOptimizer) {
      const batchStats = this.batchOptimizer.getStats();
      optimizationMetrics.batchThroughput = batchStats.throughput;
      optimizationMetrics.batchErrorRate = batchStats.errorRate;
    }
    
    if (this.connectionPool) {
      const poolStats = this.connectionPool.getStats();
      optimizationMetrics.connectionPoolSize = poolStats.totalConnections;
      optimizationMetrics.activeConnections = poolStats.activeConnections;
    }

    return {
      ...baseHealth,
      metrics: {
        ...baseHealth.metrics,
        ...optimizationMetrics
      }
    };
  }

  // IDataAccessLayer methods with optimization
  async get<TResult>(key: DatabaseKey, options?: QueryOptions): Promise<TResult | null> {
    return this.optimizedProvider.get<TResult>(key, options);
  }

  async put<TData>(data: TData, options?: PutOptions): Promise<void> {
    return this.optimizedProvider.put(data, options);
  }

  async update(input: UnifiedUpdateInput, options?: UpdateOptions): Promise<any> {
    return this.optimizedProvider.update(input, options);
  }

  async delete(key: DatabaseKey, options?: DeleteOptions): Promise<void> {
    return this.optimizedProvider.delete(key, options);
  }

  async query<TResult>(input: UnifiedQueryInput): Promise<TResult[]> {
    // Apply query optimization if enabled
    if (this.queryOptimizer && this.config.queryOptimization?.enabled) {
      const analysis = this.queryOptimizer.analyzeQuery(input);
      
      if (this.config.queryOptimization.logRecommendations && analysis.recommendations.length > 0) {
        console.log('Query optimization recommendations:', analysis.recommendations);
      }
      
      if (this.config.queryOptimization.autoOptimize && analysis.optimizedQuery) {
        return this.optimizedProvider.query<TResult>(analysis.optimizedQuery);
      }
    }
    
    return this.optimizedProvider.query<TResult>(input);
  }

  async scan<TResult>(input: UnifiedScanInput): Promise<{ items: TResult[], token?: any }> {
    // Log scan warnings if query optimizer is enabled
    if (this.queryOptimizer && this.config.queryOptimization?.enabled) {
      const analysis = this.queryOptimizer.analyzeScan(input);
      
      if (this.config.queryOptimization.logRecommendations && analysis.recommendations.length > 0) {
        console.warn('Scan operation detected - consider optimization:', analysis.recommendations);
      }
    }
    
    return this.optimizedProvider.scan<TResult>(input);
  }

  async batchGet<TResult>(keys: DatabaseKey[], options?: BatchOptions): Promise<TResult[]> {
    // Use batch optimizer if available and beneficial
    if (this.batchOptimizer && keys.length > 10) {
      return this.batchOptimizer.executeBatchGet<TResult>(keys);
    }
    
    return this.optimizedProvider.batchGet<TResult>(keys, options);
  }

  async beginTransaction(): Promise<ITransaction> {
    return this.optimizedProvider.beginTransaction();
  }

  async executeTransaction(operations: TransactionOperation[]): Promise<void> {
    return this.optimizedProvider.executeTransaction(operations);
  }

  async executeNative(operation: any): Promise<any> {
    return this.optimizedProvider.executeNative(operation);
  }

  // Batch operations with optimization
  async executeBatchOperations(operations: BatchOperation[]): Promise<BatchResult> {
    if (!this.batchOptimizer) {
      throw new Error('Batch optimization is not enabled');
    }
    
    return this.batchOptimizer.executeBatch(operations);
  }

  // Query analysis
  analyzeQuery(input: UnifiedQueryInput): QueryAnalysis | null {
    return this.queryOptimizer?.analyzeQuery(input) || null;
  }

  analyzeScan(input: UnifiedScanInput): QueryAnalysis | null {
    return this.queryOptimizer?.analyzeScan(input) || null;
  }

  // Get optimization recommendations
  getIndexRecommendations(tableName: string): OptimizationRecommendation[] {
    return this.queryOptimizer?.getIndexRecommendations(tableName) || [];
  }

  // Statistics and monitoring
  getOptimizationStats(): {
    cache?: any;
    circuitBreaker?: CircuitBreakerStats;
    batch?: BatchStats;
    connectionPool?: any;
  } {
    const stats: any = {};
    
    if (this.config.cache?.enabled && this.cachedLayer) {
      stats.cache = this.cachedLayer.getCacheStats();
    }
    
    if (this.config.circuitBreaker?.enabled && this.circuitBreakerLayer) {
      stats.circuitBreaker = this.circuitBreakerLayer.getCircuitBreakerStats();
    }
    
    if (this.batchOptimizer) {
      stats.batch = this.batchOptimizer.getStats();
    }
    
    if (this.connectionPool) {
      stats.connectionPool = this.connectionPool.getStats();
    }
    
    return stats;
  }

  // Cache management
  async clearCache(): Promise<void> {
    if (this.optimizedProvider instanceof CachedDataAccessLayer) {
      await this.optimizedProvider.clearCache();
    }
  }

  async invalidateKey(key: DatabaseKey): Promise<void> {
    if (this.optimizedProvider instanceof CachedDataAccessLayer) {
      await this.optimizedProvider.invalidateKey(key);
    }
  }

  // Circuit breaker management
  resetCircuitBreaker(): void {
    if (this.optimizedProvider instanceof CircuitBreakerDataAccessLayer) {
      this.optimizedProvider.resetCircuitBreaker();
    }
  }

  // Private methods

  private mergeConfig(userConfig?: Partial<OptimizationConfig>): OptimizationConfig {
    const merged = { ...DEFAULT_OPTIMIZATION_CONFIG };
    
    if (userConfig) {
      if (userConfig.cache) {
        merged.cache = { ...merged.cache!, ...userConfig.cache };
      }
      if (userConfig.circuitBreaker) {
        merged.circuitBreaker = { ...merged.circuitBreaker!, ...userConfig.circuitBreaker };
      }
      if (userConfig.queryOptimization) {
        merged.queryOptimization = { ...merged.queryOptimization!, ...userConfig.queryOptimization };
      }
      if (userConfig.batchOptimization) {
        merged.batchOptimization = { ...merged.batchOptimization!, ...userConfig.batchOptimization };
      }
      if (userConfig.connectionPooling) {
        merged.connectionPooling = { ...merged.connectionPooling!, ...userConfig.connectionPooling };
      }
    }
    
    // Adjust config based on provider type
    const providerType = this.baseProvider.getProviderType();
    
    if (providerType === 'dynamodb') {
      // DynamoDB-specific optimizations
      merged.connectionPooling!.enabled = false; // DynamoDB doesn't need connection pooling
      merged.batchOptimization!.config.maxBatchSize = 25; // DynamoDB batch limit
    } else if (providerType === 'mongodb') {
      // MongoDB-specific optimizations
      merged.connectionPooling!.enabled = true; // MongoDB benefits from connection pooling
      merged.batchOptimization!.config.maxBatchSize = 1000; // MongoDB can handle larger batches
    }
    
    return merged;
  }

  private buildOptimizationChain(provider: IDataAccessLayer): IDataAccessLayer {
    let optimizedProvider = provider;
    
    // Apply connection pooling first (if enabled and applicable)
    if (this.config.connectionPooling?.enabled && provider.getProviderType() === 'mongodb') {
      // Connection pooling would be integrated at the provider level
      // For now, we'll note that it should be applied
    }
    
    // Apply circuit breaker
    if (this.config.circuitBreaker?.enabled) {
      const cbConfig = this.config.circuitBreaker.config || 
        CircuitBreakerConfigFactory.createForProvider(provider.getProviderType());
      this.circuitBreakerLayer = new CircuitBreakerDataAccessLayer(optimizedProvider, cbConfig);
      optimizedProvider = this.circuitBreakerLayer;
    }
    
    // Apply caching (outermost layer)
    if (this.config.cache?.enabled) {
      const cacheProvider = this.config.cache.provider || new InMemoryCacheProvider(this.config.cache.config);
      this.cachedLayer = new CachedDataAccessLayer(
        optimizedProvider,
        this.config.cache.config,
        this.config.cache.strategy
      );
      
      if (this.config.cache.provider) {
        this.cachedLayer.setCacheProvider(this.config.cache.provider);
      }
      
      optimizedProvider = this.cachedLayer;
    }
    
    return optimizedProvider;
  }

  private initializeOptimizers(): void {
    // Initialize query optimizer
    if (this.config.queryOptimization?.enabled) {
      this.queryOptimizer = new QueryOptimizer(this.baseProvider.getProviderType());
    }
    
    // Initialize batch optimizer
    if (this.config.batchOptimization?.enabled) {
      this.batchOptimizer = new BatchOptimizer(
        this.optimizedProvider,
        this.config.batchOptimization.config
      );
    }
    
    // Initialize connection pool for MongoDB
    if (this.config.connectionPooling?.enabled && this.baseProvider.getProviderType() === 'mongodb') {
      // This would be initialized with actual MongoDB connection details
      // For now, we'll note that it should be created
    }
  }
}

/**
 * Factory for creating optimized DAL instances
 */
export class OptimizedDALFactory {
  static create(
    baseProvider: IDataAccessLayer,
    config?: Partial<OptimizationConfig>
  ): OptimizedDataAccessLayer {
    return new OptimizedDataAccessLayer(baseProvider, config);
  }

  static createWithDefaults(baseProvider: IDataAccessLayer): OptimizedDataAccessLayer {
    const providerType = baseProvider.getProviderType();
    
    // Create provider-specific optimized configuration
    const config: Partial<OptimizationConfig> = {};
    
    if (providerType === 'dynamodb') {
      config.circuitBreaker = {
        enabled: true,
        config: CircuitBreakerConfigFactory.createForProvider('dynamodb')
      };
      config.batchOptimization = {
        enabled: true,
        config: {
          maxBatchSize: 25,
          maxConcurrentBatches: 10,
          retryAttempts: 3,
          retryDelayMs: 100,
          backoffMultiplier: 2,
          timeoutMs: 30000
        }
      };
    } else if (providerType === 'mongodb') {
      config.connectionPooling = {
        enabled: true,
        config: {
          minConnections: 2,
          maxConnections: 20,
          acquireTimeoutMs: 10000,
          idleTimeoutMs: 300000,
          maxLifetimeMs: 1800000,
          testOnBorrow: true,
          testOnReturn: false
        }
      };
    }
    
    return new OptimizedDataAccessLayer(baseProvider, config);
  }
}