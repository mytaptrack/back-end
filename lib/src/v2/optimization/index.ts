/**
 * Database optimization features
 * Exports all optimization components for the database abstraction layer
 */

// Cache provider exports
export {
  ICacheProvider,
  CacheConfig,
  CacheStats,
  InMemoryCacheProvider,
  RedisCacheProvider,
  CacheKeyGenerator
} from './cache-provider';

// Cached DAL exports
export {
  CachedDataAccessLayer,
  CacheStrategy,
  DEFAULT_CACHE_STRATEGY
} from './cached-dal';

// Connection pooling exports
export {
  ConnectionPool,
  ConnectionPoolConfig,
  PoolStats,
  IConnection,
  IConnectionFactory,
  MongoDBConnection,
  MongoDBConnectionFactory,
  DynamoDBConnection
} from './connection-pool';

// Query optimization exports
export {
  QueryOptimizer,
  OptimizationRecommendation,
  QueryAnalysis,
  IndexUsageInfo,
  QueryMetrics,
  QueryHints
} from './query-optimizer';

// Batch optimization exports
export {
  BatchOptimizer,
  BatchConfig,
  BatchOperation,
  BatchResult,
  BatchError,
  BatchStats
} from './batch-optimizer';

// Circuit breaker exports
export {
  CircuitBreaker,
  CircuitBreakerDataAccessLayer,
  CircuitBreakerState,
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitBreakerEvent,
  CircuitBreakerEventListener,
  CircuitBreakerError,
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
  CircuitBreakerConfigFactory
} from './circuit-breaker';

// Optimized DAL exports
export {
  OptimizedDataAccessLayer,
  OptimizedDALFactory,
  OptimizationConfig,
  DEFAULT_OPTIMIZATION_CONFIG
} from './optimized-dal';