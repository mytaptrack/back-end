import { Request, Response, NextFunction } from 'express';
import { ServiceContext } from '../../interfaces/service-context';
import { RateLimitConfig, ExpressMiddleware, ErrorResponse } from '../interfaces';

/**
 * Rate limiting middleware for container services
 */
export class RateLimitingMiddleware {
  private windowCounts = new Map<string, { count: number; resetTime: number }>();

  constructor(
    private serviceContext: ServiceContext,
    private config: RateLimitConfig
  ) {}

  /**
   * Create rate limiting middleware
   */
  public create(): ExpressMiddleware {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const key = this.generateKey(req);
        const now = Date.now();
        
        // Check if request should be rate limited
        const allowed = await this.isRequestAllowed(key, now);
        
        if (!allowed) {
          return this.sendRateLimitError(res, req);
        }

        // Add rate limit headers
        this.addRateLimitHeaders(res, key, now);
        
        next();
      } catch (error) {
        this.serviceContext.logger.error('Rate limiting middleware error', {
          error,
          correlationId: (req as any).correlationId
        });
        
        // Continue on error to avoid blocking requests
        next();
      }
    };
  }

  /**
   * Create rate limiting middleware with Redis backend
   */
  public createWithRedis(): ExpressMiddleware {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const key = this.generateKey(req);
        const cacheKey = `rate_limit:${key}`;
        const now = Date.now();
        
        // Get current count from Redis
        const currentCount = await this.serviceContext.cache.get<number>(cacheKey) || 0;
        
        if (currentCount >= this.config.maxRequests) {
          return this.sendRateLimitError(res, req);
        }

        // Increment count in Redis
        const newCount = currentCount + 1;
        const ttl = Math.ceil(this.config.windowMs / 1000);
        await this.serviceContext.cache.set(cacheKey, newCount, ttl);

        // Add rate limit headers
        res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, this.config.maxRequests - newCount));
        res.setHeader('X-RateLimit-Reset', new Date(now + this.config.windowMs).toISOString());
        
        next();
      } catch (error) {
        this.serviceContext.logger.error('Redis rate limiting middleware error', {
          error,
          correlationId: (req as any).correlationId
        });
        
        // Continue on error to avoid blocking requests
        next();
      }
    };
  }

  /**
   * Create per-user rate limiting middleware
   */
  public createPerUser(): ExpressMiddleware {
    return async (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;
      
      if (!user) {
        // No user context, skip rate limiting
        return next();
      }

      const key = `user:${user.userId}`;
      const now = Date.now();
      
      try {
        const allowed = await this.isRequestAllowed(key, now);
        
        if (!allowed) {
          return this.sendRateLimitError(res, req);
        }

        this.addRateLimitHeaders(res, key, now);
        next();
      } catch (error) {
        this.serviceContext.logger.error('Per-user rate limiting error', {
          error,
          userId: user.userId,
          correlationId: (req as any).correlationId
        });
        
        next();
      }
    };
  }

  private generateKey(req: Request): string {
    // Use IP address as default key
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  private async isRequestAllowed(key: string, now: number): Promise<boolean> {
    const windowData = this.windowCounts.get(key);
    
    if (!windowData || now >= windowData.resetTime) {
      // New window or expired window
      this.windowCounts.set(key, {
        count: 1,
        resetTime: now + this.config.windowMs
      });
      return true;
    }

    if (windowData.count >= this.config.maxRequests) {
      return false;
    }

    // Increment count
    windowData.count++;
    return true;
  }

  private addRateLimitHeaders(res: Response, key: string, now: number): void {
    const windowData = this.windowCounts.get(key);
    
    if (windowData) {
      res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.config.maxRequests - windowData.count));
      res.setHeader('X-RateLimit-Reset', new Date(windowData.resetTime).toISOString());
    }
  }

  private sendRateLimitError(res: Response, req: Request): void {
    const correlationId = (req as any).correlationId;
    
    this.serviceContext.logger.warn('Rate limit exceeded', {
      correlationId,
      method: req.method,
      url: req.url,
      ip: req.ip
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        correlationId,
        retryable: true
      }
    };

    res.status(429).json(errorResponse);
  }

  /**
   * Clean up expired entries (should be called periodically)
   */
  public cleanup(): void {
    const now = Date.now();
    
    for (const [key, windowData] of this.windowCounts.entries()) {
      if (now >= windowData.resetTime) {
        this.windowCounts.delete(key);
      }
    }
  }
}