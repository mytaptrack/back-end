/**
 * Caching layer interface and implementations for database abstraction layer
 * Provides consistent caching across different database providers
 */

import { DatabaseKey } from '../types/database-abstraction';

// Cache configuration interface
export interface CacheConfig {
  enabled: boolean;
  defaultTtl: number; // Default TTL in seconds
  maxSize?: number; // Maximum number of items in cache
  keyPrefix?: string; // Prefix for cache keys
  compressionEnabled?: boolean; // Enable compression for large values
}

// Cache provider interface
export interface ICacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  exists(key: string): Promise<boolean>;
  increment(key: string, amount?: number): Promise<number>;
  expire(key: string, ttl: number): Promise<void>;
  
  // Batch operations
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  mset<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<void>;
  mdel(keys: string[]): Promise<void>;
  
  // Cache statistics
  getStats(): Promise<CacheStats>;
}

// Cache statistics interface
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  memoryUsage?: number;
}

// In-memory cache implementation
export class InMemoryCacheProvider implements ICacheProvider {
  private cache = new Map<string, { value: any; expires: number }>();
  private stats = { hits: 0, misses: 0 };
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
    
    // Cleanup expired items periodically
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.config.enabled) return null;

    const item = this.cache.get(key);
    if (!item) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > item.expires) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.config.enabled) return;

    const expires = Date.now() + (ttl || this.config.defaultTtl) * 1000;
    
    // Check max size limit
    if (this.config.maxSize && this.cache.size >= this.config.maxSize) {
      // Remove oldest item (simple LRU)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { value, expires });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  async exists(key: string): Promise<boolean> {
    const item = this.cache.get(key);
    if (!item) return false;
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  async increment(key: string, amount = 1): Promise<number> {
    const current = await this.get<number>(key) || 0;
    const newValue = current + amount;
    await this.set(key, newValue);
    return newValue;
  }

  async expire(key: string, ttl: number): Promise<void> {
    const item = this.cache.get(key);
    if (item) {
      item.expires = Date.now() + ttl * 1000;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)));
  }

  async mset<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    await Promise.all(items.map(item => this.set(item.key, item.value, item.ttl)));
  }

  async mdel(keys: string[]): Promise<void> {
    keys.forEach(key => this.cache.delete(key));
  }

  async getStats(): Promise<CacheStats> {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.cache.size,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key);
      }
    }
  }

  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage
    let size = 0;
    for (const [key, item] of this.cache.entries()) {
      size += key.length * 2; // UTF-16 characters
      size += JSON.stringify(item.value).length * 2;
      size += 16; // Overhead for expires timestamp
    }
    return size;
  }
}

// Redis cache implementation (for production use)
export class RedisCacheProvider implements ICacheProvider {
  private client: any; // Redis client
  private config: CacheConfig;
  private stats = { hits: 0, misses: 0 };

  constructor(config: CacheConfig, redisClient: any) {
    this.config = config;
    this.client = redisClient;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.config.enabled) return null;

    try {
      const value = await this.client.get(this.prefixKey(key));
      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const serialized = JSON.stringify(value);
      const prefixedKey = this.prefixKey(key);
      const expiry = ttl || this.config.defaultTtl;

      await this.client.setex(prefixedKey, expiry, serialized);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(this.prefixKey(key));
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const pattern = this.prefixKey('*');
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      this.stats = { hits: 0, misses: 0 };
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(this.prefixKey(key));
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  async increment(key: string, amount = 1): Promise<number> {
    try {
      return await this.client.incrby(this.prefixKey(key), amount);
    } catch (error) {
      console.error('Cache increment error:', error);
      return 0;
    }
  }

  async expire(key: string, ttl: number): Promise<void> {
    try {
      await this.client.expire(this.prefixKey(key), ttl);
    } catch (error) {
      console.error('Cache expire error:', error);
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const prefixedKeys = keys.map(key => this.prefixKey(key));
      const values = await this.client.mget(...prefixedKeys);
      
      return values.map((value: string | null) => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }
        this.stats.hits++;
        return JSON.parse(value) as T;
      });
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  async mset<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    try {
      const pipeline = this.client.pipeline();
      
      for (const item of items) {
        const serialized = JSON.stringify(item.value);
        const prefixedKey = this.prefixKey(item.key);
        const expiry = item.ttl || this.config.defaultTtl;
        
        pipeline.setex(prefixedKey, expiry, serialized);
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('Cache mset error:', error);
    }
  }

  async mdel(keys: string[]): Promise<void> {
    try {
      const prefixedKeys = keys.map(key => this.prefixKey(key));
      if (prefixedKeys.length > 0) {
        await this.client.del(...prefixedKeys);
      }
    } catch (error) {
      console.error('Cache mdel error:', error);
    }
  }

  async getStats(): Promise<CacheStats> {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: 0, // Would need Redis INFO command to get actual size
      memoryUsage: 0
    };
  }

  private prefixKey(key: string): string {
    return this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;
  }
}

// Cache key generator utility
export class CacheKeyGenerator {
  static generateKey(operation: string, key: DatabaseKey, options?: any): string {
    const keyParts = [operation, key.primary];
    
    if (key.sort !== undefined) {
      keyParts.push(key.sort.toString());
    }
    
    // Add additional key parts from the key object
    Object.entries(key).forEach(([k, v]) => {
      if (k !== 'primary' && k !== 'sort' && v !== undefined) {
        keyParts.push(`${k}:${v}`);
      }
    });
    
    // Add options hash if present
    if (options) {
      const optionsHash = this.hashOptions(options);
      keyParts.push(optionsHash);
    }
    
    return keyParts.join(':');
  }

  static generateQueryKey(operation: string, input: any): string {
    const inputHash = this.hashOptions(input);
    return `${operation}:${inputHash}`;
  }

  private static hashOptions(options: any): string {
    // Simple hash function for options
    const str = JSON.stringify(options, Object.keys(options).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}