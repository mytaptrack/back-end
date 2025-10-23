import { Request, Response, NextFunction } from 'express';
import { CorsConfig, ExpressMiddleware } from '../interfaces';

/**
 * CORS middleware for container services
 */
export class CorsMiddleware {
  /**
   * Create CORS middleware with configuration
   */
  public static create(config: CorsConfig): ExpressMiddleware {
    return (req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;
      
      // Handle origin
      if (config.origin === true) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      } else if (config.origin === false) {
        // No CORS headers
      } else if (typeof config.origin === 'string') {
        if (origin === config.origin) {
          res.setHeader('Access-Control-Allow-Origin', config.origin);
        }
      } else if (Array.isArray(config.origin)) {
        if (origin && config.origin.includes(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
        }
      }

      // Handle methods
      if (config.methods) {
        res.setHeader('Access-Control-Allow-Methods', config.methods.join(', '));
      } else {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      }

      // Handle allowed headers
      if (config.allowedHeaders) {
        res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
      } else {
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID');
      }

      // Handle credentials
      if (config.credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      // Handle max age
      if (config.maxAge) {
        res.setHeader('Access-Control-Max-Age', config.maxAge.toString());
      }

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }

      next();
    };
  }

  /**
   * Create permissive CORS middleware for development
   */
  public static createPermissive(): ExpressMiddleware {
    return CorsMiddleware.create({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Requested-With'],
      credentials: true,
      maxAge: 86400 // 24 hours
    });
  }

  /**
   * Create restrictive CORS middleware for production
   */
  public static createRestrictive(allowedOrigins: string[]): ExpressMiddleware {
    return CorsMiddleware.create({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
      credentials: true,
      maxAge: 3600 // 1 hour
    });
  }
}