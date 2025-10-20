import { ICacheProvider, CacheConfig } from './interfaces';

// Redis client interface (to avoid direct dependency)
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<string>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  ping(): Promise<string>;
  quit(): Promise<string>;
}

/**
 * Redis-based cache provider for Docker deployment
 * Provides high-performance caching with TTL support
 */
export class RedisCacheProvider implements ICacheProvider {
  private client: RedisClient;
  private keyPrefix: string;
  private defaultTtl: number;
  private connected: boolean = false;

  constructor(config: CacheConfig, redisClient?: RedisClient) {
    if (config.provider !== 'redis') {
      throw new Error('Invalid provider for RedisCacheProvider');
    }

    if (redisClient) {
      this.client = redisClient;
      this.connected = true;
    } else {
      // In a real implementation, you would create the Redis client here
      // For now, we'll throw an error to indicate Redis client is required
      throw new Error('Redis client must be provided to RedisCacheProvider constructor');
    }
    
    this.keyPrefix = config.keyPrefix || 'cache:';
    this.defaultTtl = config.defaultTtl || 3600; // 1 hour default
  }

  /**
   * Initialize Redis connection (if not already connected)
   */
  async connect(): Promise<void> {
    if (!this.connected) {
      try {
        await this.client.ping();
        this.connected = true;
      } catch (error) {
        console.error('Redis connection failed:', error);
        throw error;
      }
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      try {
        await this.client.quit();
        this.connected = false;
      } catch (error) {
        console.error('Redis disconnect error:', error);
      }
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      const cacheKey = this.buildCacheKey(key);
      const value = await this.client.get(cacheKey);
      
      if (value === null) {
        return null;
      }

      try {
        return JSON.parse(value) as T;
      } catch (parseError) {
        console.error('Redis cache parse error:', parseError);
        // Delete corrupted entry
        await this.delete(key);
        return null;
      }
    } catch (error) {
      console.error('Redis cache get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      const cacheKey = this.buildCacheKey(key);
      const serializedValue = JSON.stringify(value);
      const effectiveTtl = ttl !== undefined ? ttl : this.defaultTtl;

      if (effectiveTtl > 0) {
        await this.client.setex(cacheKey, effectiveTtl, serializedValue);
      } else {
        // Set without expiration
        await this.client.set(cacheKey, serializedValue);
      }
    } catch (error) {
      console.error('Redis cache set error:', error);
      throw error;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      const cacheKey = this.buildCacheKey(key);
      await this.client.del(cacheKey);
    } catch (error) {
      console.error('Redis cache delete error:', error);
      throw error;
    }
  }

  /**
   * Clear cache entries matching pattern
   */
  async clear(pattern?: string): Promise<void> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      let searchPattern: string;
      if (pattern) {
        searchPattern = this.buildCacheKey(pattern);
        // Ensure pattern ends with wildcard for Redis KEYS command
        if (!searchPattern.endsWith('*')) {
          searchPattern += '*';
        }
      } else {
        // Clear all cache entries with our prefix
        searchPattern = `${this.keyPrefix}*`;
      }

      const keys = await this.client.keys(searchPattern);
      
      if (keys.length > 0) {
        // Delete keys in batches to avoid blocking Redis
        const batchSize = 100;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          await Promise.all(batch.map(key => this.client.del(key)));
        }
      }
    } catch (error) {
      console.error('Redis cache clear error:', error);
      throw error;
    }
  }

  /**
   * Check if cache provider is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      if (!this.connected) {
        return false;
      }
      
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis connection check failed:', error);
      this.connected = false;
      return false;
    }
  }

  /**
   * Build cache key with prefix
   */
  private buildCacheKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}