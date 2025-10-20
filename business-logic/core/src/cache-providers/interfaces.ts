/**
 * Cache provider interfaces and types
 */

/**
 * Cache provider interface for unified caching operations
 */
export interface ICacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(pattern?: string): Promise<void>;
  isConnected(): Promise<boolean>;
}

/**
 * Cache configuration interface
 */
export interface CacheConfig {
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

/**
 * Cache entry metadata
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
  createdAt: number;
}

/**
 * Cache operation options
 */
export interface CacheOptions {
  ttl?: number;
  overwrite?: boolean;
}

/**
 * Cache statistics interface
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}