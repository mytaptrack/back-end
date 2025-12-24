import Redis from 'ioredis';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret';
console.log('JWT_SECRET being used:', JWT_SECRET);
const TOKEN_EXPIRY = 8 * 60 * 60; // 8 hours in seconds
const REFRESH_EXPIRY = 24 * 60 * 60; // 24 hours in seconds

// Redis client with error handling
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    retryStrategy: (times) => {
        if (times > 3) {
            console.warn('Redis unavailable - running without token persistence');
            return null; // Stop retrying
        }
        return Math.min(times * 50, 2000);
    },
    lazyConnect: true,
    enableOfflineQueue: false
});

// Handle Redis errors
redis.on('error', (err) => {
    console.warn('Redis connection error (tokens will not persist):', err.message);
});

// In-memory fallback when Redis is unavailable
const memoryStore = new Map<string, { value: string, expiry: number }>();

async function setWithExpiry(key: string, value: string, ttl: number): Promise<void> {
    try {
        if (redis.status === 'ready') {
            await redis.setex(key, ttl, value);
        } else {
            memoryStore.set(key, { value, expiry: Date.now() + ttl * 1000 });
        }
    } catch (error) {
        memoryStore.set(key, { value, expiry: Date.now() + ttl * 1000 });
    }
}

async function getValue(key: string): Promise<string | null> {
    try {
        if (redis.status === 'ready') {
            return await redis.get(key);
        }
    } catch (error) {
        // Fall through to memory store
    }
    
    const item = memoryStore.get(key);
    if (item && item.expiry > Date.now()) {
        return item.value;
    }
    memoryStore.delete(key);
    return null;
}

async function delKey(key: string): Promise<void> {
    try {
        if (redis.status === 'ready') {
            await redis.del(key);
        }
    } catch (error) {
        // Ignore
    }
    memoryStore.delete(key);
}

// Try to connect to Redis (non-blocking)
redis.connect().catch(() => {
    console.warn('Redis not available - using in-memory token storage');
});

interface TokenPayload {
    sub: string;
    email: string;
    name?: string;
    'cognito:groups'?: string[];
    iat?: number;
    exp?: number;
}

interface CognitoIdentity {
    sub: string;
    username: string;
    email: string;
    name?: string;
    'cognito:username': string;
    'cognito:groups'?: string[];
    groups?: string[];  // AppSync format
    accountId?: string;
    cognitoIdentityAuthProvider?: string | null;
    userArn?: string;
}

export class AuthManager {
    static async generateToken(
        userId: string, 
        email: string, 
        name?: string, 
        groups?: string[],
        isIAM: boolean = false,
        isDevice: boolean = false
    ): Promise<{ token: string, refreshToken: string }> {
        const payload: TokenPayload = {
            sub: userId,
            email,
            name,
            'cognito:groups': groups
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
        const refreshToken = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });

        // Create complete Cognito-like identity structure
        const identity: CognitoIdentity = {
            sub: userId,
            username: userId,
            email,
            name,
            'cognito:username': userId,
            'cognito:groups': groups || [],
            groups: groups || [],  // AppSync format
            // IAM auth detection fields (null for Cognito user pool auth)
            accountId: isIAM ? 'local-account' : undefined,
            cognitoIdentityAuthProvider: isIAM ? undefined : null,
            // Device/app auth detection field
            userArn: isDevice ? `arn:aws:iot:local:device/${userId}` : undefined
        };

        // Store token and identity in Redis
        await setWithExpiry(`token:${userId}`, token, TOKEN_EXPIRY);
        await setWithExpiry(`refresh:${userId}`, refreshToken, REFRESH_EXPIRY);
        await setWithExpiry(`identity:${userId}`, JSON.stringify(identity), TOKEN_EXPIRY);

        return { token, refreshToken };
    }

    static async getIdentity(userId: string): Promise<CognitoIdentity | null> {
        try {
            const identityStr = await getValue(`identity:${userId}`);
            if (!identityStr) {
                return null;
            }
            return JSON.parse(identityStr);
        } catch (error) {
            return null;
        }
    }

    static async validateToken(token: string): Promise<TokenPayload | null> {
        try {
            console.log('Validating token:', token.substring(0, 50) + '...');
            const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
            console.log('Token decoded successfully for user:', decoded.sub);
            
            // Check if token exists in Redis
            const storedToken = await getValue(`token:${decoded.sub}`);
            console.log('Stored token from Redis:', storedToken ? storedToken.substring(0, 50) + '...' : 'null');
            console.log('Tokens match:', storedToken === token);
            
            if (storedToken !== token) {
                console.log('Token mismatch - validation failed');
                return null;
            }

            console.log('Token validation successful');
            return decoded;
        } catch (error) {
            console.log('Token validation error:', error.message);
            return null;
        }
    }

    static async refreshToken(refreshToken: string): Promise<{ token: string, refreshToken: string } | null> {
        try {
            const decoded = jwt.verify(refreshToken, JWT_SECRET) as { sub: string };
            
            // Check if refresh token exists in Redis
            const storedRefreshToken = await getValue(`refresh:${decoded.sub}`);
            if (storedRefreshToken !== refreshToken) {
                return null;
            }

            // Get existing identity to preserve all fields
            const identity = await this.getIdentity(decoded.sub);
            if (!identity) {
                return null;
            }

            // Generate new tokens with preserved identity
            const isIAM = identity.accountId !== undefined;
            const isDevice = identity.userArn !== undefined;
            
            return await this.generateToken(
                identity.sub, 
                identity.email, 
                identity.name, 
                identity['cognito:groups'],
                isIAM,
                isDevice
            );
        } catch (error) {
            return null;
        }
    }

    static async revokeToken(userId: string): Promise<void> {
        await delKey(`token:${userId}`);
        await delKey(`refresh:${userId}`);
        await delKey(`identity:${userId}`);
    }
}
