/**
 * Example usage of cache providers in different environments
 */

import {
    CacheProviderFactory,
    ICacheProvider,
    CacheConfig,
    DynamoDBCacheProvider,
    RedisCacheProvider
} from '../cache-providers';

/**
 * Example: Using cache provider factory for different environments
 */
export async function cacheProviderFactoryExample() {
    // AWS Environment - DynamoDB Cache
    const awsProvider = CacheProviderFactory.createForAWS({
        region: 'us-east-1',
        keyPrefix: 'myapp:',
        dynamodb: {
            tableName: 'my-cache-table'
        }
    });

    // Docker Environment - Redis Cache
    const mockRedisClient = createMockRedisClient();
    const dockerProvider = CacheProviderFactory.createForDocker({
        keyPrefix: 'myapp:',
        redis: {
            host: 'redis-server',
            port: 6379
        }
    }, mockRedisClient);

    // Environment-based creation
    const environment = process.env.NODE_ENV === 'production' ? 'aws' : 'docker';
    const provider = CacheProviderFactory.createForEnvironment(environment);

    return { awsProvider, dockerProvider, provider };
}

/**
 * Example: Basic cache operations
 */
export async function basicCacheOperationsExample(cache: ICacheProvider) {
    // Store data with default TTL
    await cache.set('user:123', {
        id: '123',
        name: 'John Doe',
        email: 'john@example.com'
    });

    // Store data with custom TTL (30 minutes)
    await cache.set('session:abc123', {
        userId: '123',
        expires: Date.now() + 1800000
    }, 1800);

    // Retrieve data
    const user = await cache.get<{ id: string; name: string; email: string }>('user:123');
    console.log('Cached user:', user);

    // Delete specific item
    await cache.delete('session:abc123');

    // Clear all user cache entries
    await cache.clear('user:*');

    // Clear all cache entries
    await cache.clear();
}

/**
 * Example: User session caching (Docker environment only)
 * Note: In AWS, Cognito manages sessions and passes user info in Lambda event context
 */
export class UserSessionCache {
    constructor(private cache: ICacheProvider) { }

    async storeSession(sessionId: string, userId: string, ttl: number = 3600): Promise<void> {
        const sessionData = {
            userId,
            createdAt: Date.now(),
            lastAccessed: Date.now()
        };

        await this.cache.set(`session:${sessionId}`, sessionData, ttl);
    }

    async getSession(sessionId: string): Promise<{ userId: string; createdAt: number; lastAccessed: number } | null> {
        const session = await this.cache.get<{ userId: string; createdAt: number; lastAccessed: number }>(`session:${sessionId}`);

        if (session) {
            // Update last accessed time
            session.lastAccessed = Date.now();
            await this.cache.set(`session:${sessionId}`, session, 3600);
        }

        return session;
    }

    async invalidateSession(sessionId: string): Promise<void> {
        await this.cache.delete(`session:${sessionId}`);
    }

    async invalidateUserSessions(userId: string): Promise<void> {
        // This is a simplified example - in practice, you'd need to maintain
        // a separate index of user sessions for efficient cleanup
        await this.cache.clear(`session:*`);
    }
}

/**
 * Example: Database query result caching (useful in both AWS and Docker)
 */
export class DatabaseQueryCache {
    constructor(private cache: ICacheProvider) { }

    async cacheQueryResult<T>(queryKey: string, result: T, ttl: number = 300): Promise<void> {
        await this.cache.set(`query:${queryKey}`, {
            data: result,
            cachedAt: Date.now()
        }, ttl);
    }

    async getCachedQueryResult<T>(queryKey: string): Promise<T | null> {
        const cached = await this.cache.get<{ data: T; cachedAt: number }>(`query:${queryKey}`);
        return cached ? cached.data : null;
    }

    async invalidateQueryPattern(pattern: string): Promise<void> {
        await this.cache.clear(`query:${pattern}*`);
    }
}

/**
 * Example: API response caching (useful in both AWS and Docker)
 */
export class APIResponseCache {
    constructor(private cache: ICacheProvider) { }

    async cacheResponse(endpoint: string, params: Record<string, any>, response: any, ttl: number = 300): Promise<void> {
        const cacheKey = this.buildCacheKey(endpoint, params);
        await this.cache.set(cacheKey, {
            data: response,
            cachedAt: Date.now()
        }, ttl);
    }

    async getCachedResponse<T>(endpoint: string, params: Record<string, any>): Promise<T | null> {
        const cacheKey = this.buildCacheKey(endpoint, params);
        const cached = await this.cache.get<{ data: T; cachedAt: number }>(cacheKey);
        return cached ? cached.data : null;
    }

    async invalidateEndpoint(endpoint: string): Promise<void> {
        const pattern = `api:${endpoint}:*`;
        await this.cache.clear(pattern);
    }

    private buildCacheKey(endpoint: string, params: Record<string, any>): string {
        const sortedParams = Object.keys(params)
            .sort()
            .map(key => `${key}=${params[key]}`)
            .join('&');

        return `api:${endpoint}:${Buffer.from(sortedParams).toString()}`;
    }
}

/**
 * Example: Computed data caching (useful in both AWS and Docker)
 */
export class ComputedDataCache {
    constructor(private cache: ICacheProvider) { }

    async cacheComputedResult<T>(computationKey: string, result: T, ttl: number = 1800): Promise<void> {
        await this.cache.set(`computed:${computationKey}`, {
            result,
            computedAt: Date.now()
        }, ttl);
    }

    async getComputedResult<T>(computationKey: string): Promise<T | null> {
        const cached = await this.cache.get<{ result: T; computedAt: number }>(`computed:${computationKey}`);
        return cached ? cached.result : null;
    }

    async invalidateComputedData(pattern: string): Promise<void> {
        await this.cache.clear(`computed:${pattern}*`);
    }
}

/**
 * Example: Rate limiting with cache (useful in both AWS and Docker)
 */
export class RateLimiter {
    constructor(private cache: ICacheProvider) { }

    async checkRateLimit(identifier: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
        const key = `ratelimit:${identifier}`;
        const now = Date.now();
        const windowStart = Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
        const windowKey = `${key}:${windowStart}`;

        // Get current count
        const currentCount = await this.cache.get<number>(windowKey) || 0;

        if (currentCount >= limit) {
            return {
                allowed: false,
                remaining: 0,
                resetTime: windowStart + (windowSeconds * 1000)
            };
        }

        // Increment count
        await this.cache.set(windowKey, currentCount + 1, windowSeconds);

        return {
            allowed: true,
            remaining: limit - currentCount - 1,
            resetTime: windowStart + (windowSeconds * 1000)
        };
    }
}

/**
 * Example: Configuration with validation
 */
export function createCacheProviderWithValidation(config: CacheConfig): ICacheProvider {
    try {
        // Validate configuration
        CacheProviderFactory.validateConfig(config);

        // Create provider
        return CacheProviderFactory.create(config);
    } catch (error) {
        console.error('Cache configuration error:', error);
        throw error;
    }
}

/**
 * Example: Health check implementation
 */
export async function performCacheHealthCheck(cache: ICacheProvider): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
        // Test connectivity
        const isConnected = await cache.isConnected();
        if (!isConnected) {
            return { healthy: false, error: 'Cache provider not connected' };
        }

        // Test basic operations
        const testKey = '__health_check__';
        const testValue = { timestamp: Date.now() };

        await cache.set(testKey, testValue, 60); // 1 minute TTL
        const retrieved = await cache.get(testKey);
        await cache.delete(testKey);

        const latency = Date.now() - startTime;

        if (JSON.stringify(retrieved) === JSON.stringify(testValue)) {
            return { healthy: true, latency };
        } else {
            return { healthy: false, error: 'Cache operations failed validation' };
        }
    } catch (error) {
        const latency = Date.now() - startTime;
        return {
            healthy: false,
            latency,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Mock Redis client for examples (in real usage, you'd use a real Redis client)
 */
function createMockRedisClient() {
    const storage = new Map<string, string>();

    return {
        async get(key: string): Promise<string | null> {
            return storage.get(key) || null;
        },

        async set(key: string, value: string): Promise<string> {
            storage.set(key, value);
            return 'OK';
        },

        async setex(key: string, seconds: number, value: string): Promise<string> {
            storage.set(key, value);
            // In a real implementation, you'd handle TTL
            setTimeout(() => storage.delete(key), seconds * 1000);
            return 'OK';
        },

        async del(key: string): Promise<number> {
            const existed = storage.has(key);
            storage.delete(key);
            return existed ? 1 : 0;
        },

        async keys(pattern: string): Promise<string[]> {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return Array.from(storage.keys()).filter(key => regex.test(key));
        },

        async ping(): Promise<string> {
            return 'PONG';
        },

        async quit(): Promise<string> {
            storage.clear();
            return 'OK';
        }
    };
}