// GraphQL dependencies - will be available when packages are installed
// import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
// import { GraphQLError } from 'graphql';

// Placeholder types
interface ApolloServerPlugin<T> {
  requestDidStart?(): any;
}

interface GraphQLRequestListener<T> {
  willSendResponse?: (requestContext: any) => Promise<void>;
}

class GraphQLError extends Error {
  extensions?: any;
  constructor(message: string, options?: { extensions?: any }) {
    super(message);
    this.extensions = options?.extensions;
  }
}
import { ServiceContext } from '../../../interfaces/service-context';
import { GraphQLContext } from '../context';

export interface GraphQLRateLimitConfig {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (context: GraphQLContext) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (context: GraphQLContext, resetTime: Date) => void;
}

interface RateLimitEntry {
  count: number;
  resetTime: Date;
}

/**
 * GraphQL rate limiting plugin
 * Implements rate limiting per user/IP to prevent abuse
 */
export class GraphQLRateLimitPlugin implements ApolloServerPlugin<GraphQLContext> {
  private config: Required<GraphQLRateLimitConfig>;
  private serviceContext: ServiceContext;

  constructor(serviceContext: ServiceContext, config: GraphQLRateLimitConfig = {}) {
    this.serviceContext = serviceContext;
    this.config = {
      windowMs: config.windowMs || 60 * 1000, // 1 minute
      maxRequests: config.maxRequests || 100,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      onLimitReached: config.onLimitReached || this.defaultOnLimitReached
    };
  }

  requestDidStart(): GraphQLRequestListener<GraphQLContext> {
    return {
      willSendResponse: async (requestContext) => {
        const { contextValue, response } = requestContext;

        // Skip rate limiting for certain conditions
        if (this.shouldSkipRateLimit(contextValue, response)) {
          return;
        }

        try {
          await this.checkRateLimit(contextValue);
        } catch (error) {
          // Rate limit exceeded - modify response
          if (error instanceof GraphQLError) {
            response.body = {
              kind: 'single',
              singleResult: {
                errors: [error],
                data: null
              }
            };
            response.http.status = 429;
          }
        }
      }
    };
  }

  /**
   * Check rate limit for the request
   */
  private async checkRateLimit(context: GraphQLContext): Promise<void> {
    const key = this.config.keyGenerator(context);
    const now = new Date();
    
    try {
      // Get current rate limit data from cache
      const rateLimitKey = `rate_limit:${key}`;
      const existing = await this.serviceContext.cache.get<RateLimitEntry>(rateLimitKey);

      let entry: RateLimitEntry;

      if (existing && existing.resetTime > now) {
        // Within current window
        entry = {
          count: existing.count + 1,
          resetTime: existing.resetTime
        };
      } else {
        // New window
        entry = {
          count: 1,
          resetTime: new Date(now.getTime() + this.config.windowMs)
        };
      }

      // Check if limit exceeded
      if (entry.count > this.config.maxRequests) {
        this.config.onLimitReached(context, entry.resetTime);

        throw new GraphQLError('Rate limit exceeded', {
          extensions: {
            code: 'RATE_LIMIT_EXCEEDED',
            maxRequests: this.config.maxRequests,
            windowMs: this.config.windowMs,
            resetTime: entry.resetTime.toISOString(),
            retryAfter: Math.ceil((entry.resetTime.getTime() - now.getTime()) / 1000)
          }
        });
      }

      // Update rate limit data
      const ttlSeconds = Math.ceil((entry.resetTime.getTime() - now.getTime()) / 1000);
      await this.serviceContext.cache.set(rateLimitKey, entry, ttlSeconds);

      // Add rate limit headers info to context for potential use
      (context as any).rateLimitInfo = {
        limit: this.config.maxRequests,
        remaining: Math.max(0, this.config.maxRequests - entry.count),
        resetTime: entry.resetTime,
        retryAfter: ttlSeconds
      };

    } catch (error) {
      // If it's already a GraphQLError (rate limit exceeded), re-throw
      if (error instanceof GraphQLError) {
        throw error;
      }

      // Log cache errors but don't block requests
      context.logger.error('Rate limit check failed', {
        error: error instanceof Error ? error.message : String(error),
        key,
        correlationId: context.correlationId
      });

      // In production, fail open (allow request) if rate limiting fails
      if (process.env.NODE_ENV === 'production') {
        return;
      }

      throw new GraphQLError('Rate limit check failed', {
        extensions: {
          code: 'RATE_LIMIT_ERROR',
          originalError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Default key generator - uses user ID or IP address
   */
  private defaultKeyGenerator = (context: GraphQLContext): string => {
    // Prefer user ID for authenticated requests
    if (context.userContext?.userId) {
      return `user:${context.userContext.userId}`;
    }

    // Fall back to IP address
    const ip = context.req.ip || 
               context.req.connection.remoteAddress || 
               context.req.headers['x-forwarded-for'] as string ||
               'unknown';

    return `ip:${ip}`;
  };

  /**
   * Default callback when rate limit is reached
   */
  private defaultOnLimitReached = (context: GraphQLContext, resetTime: Date): void => {
    context.logger.warn('GraphQL rate limit exceeded', {
      userId: context.userContext?.userId,
      ip: context.req.ip,
      resetTime: resetTime.toISOString(),
      correlationId: context.correlationId,
      userAgent: context.req.headers['user-agent']
    });
  };

  /**
   * Determine if rate limiting should be skipped for this request
   */
  private shouldSkipRateLimit(context: GraphQLContext, response: any): boolean {
    // Skip for introspection queries in development
    if (process.env.NODE_ENV !== 'production') {
      const query = context.req.body?.query || '';
      if (query.includes('__schema') || query.includes('__type')) {
        return true;
      }
    }

    // Skip based on response status if configured
    const hasErrors = response.body?.kind === 'single' && 
                     response.body.singleResult?.errors?.length > 0;

    if (hasErrors && this.config.skipFailedRequests) {
      return true;
    }

    if (!hasErrors && this.config.skipSuccessfulRequests) {
      return true;
    }

    return false;
  }
}