import { Request, Response, NextFunction } from 'express';
import { ServiceContext } from '../../interfaces/service-context';
import { ExpressMiddleware, RequestContext } from '../interfaces';
import { v4 as uuidv4 } from 'uuid';

/**
 * Request context middleware for container services
 */
export class RequestContextMiddleware {
  constructor(private serviceContext: ServiceContext) {}

  /**
   * Create request context middleware
   */
  public create(): ExpressMiddleware {
    return (req: Request, res: Response, next: NextFunction) => {
      // Generate or extract correlation ID
      const correlationId = this.extractOrGenerateCorrelationId(req);
      
      // Create request context
      const requestContext: RequestContext = {
        correlationId,
        startTime: Date.now(),
        serviceContext: this.serviceContext
      };

      // Attach context to request
      (req as any).correlationId = correlationId;
      (req as any).requestContext = requestContext;
      (req as any).serviceContext = this.serviceContext;

      // Add correlation ID to response headers
      res.setHeader('X-Correlation-ID', correlationId);

      // Store correlation ID in response locals for error handling
      res.locals.correlationId = correlationId;

      next();
    };
  }

  /**
   * Create request timing middleware
   */
  public createTiming(): ExpressMiddleware {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = process.hrtime.bigint();
      
      // Override res.end to calculate timing
      const originalEnd = res.end.bind(res);
      res.end = function(chunk?: any, encoding?: any, cb?: any) {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        
        // Add timing headers
        res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
        
        // Log performance metrics
        const serviceContext = (req as any).serviceContext as ServiceContext;
        if (serviceContext?.logger) {
          serviceContext.logger.debug('Request timing', {
            correlationId: (req as any).correlationId,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: Math.round(duration),
            userAgent: req.headers['user-agent']
          });
        }

        // Call original end method
        return originalEnd(chunk, encoding, cb);
      };

      next();
    };
  }

  /**
   * Create request ID middleware (for tracking individual requests)
   */
  public createRequestId(): ExpressMiddleware {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestId = uuidv4();
      
      (req as any).requestId = requestId;
      res.setHeader('X-Request-ID', requestId);
      
      next();
    };
  }

  /**
   * Create user context middleware (extracts user info from auth)
   */
  public createUserContext(): ExpressMiddleware {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;
      const requestContext = (req as any).requestContext as RequestContext;
      
      if (user && requestContext) {
        requestContext.user = user;
        
        // Log user context
        this.serviceContext.logger.debug('User context attached', {
          correlationId: requestContext.correlationId,
          userId: user.userId,
          email: user.email,
          roles: user.roles
        });
      }

      next();
    };
  }

  private extractOrGenerateCorrelationId(req: Request): string {
    // Try to extract from headers
    const headerCorrelationId = req.headers['x-correlation-id'] as string;
    if (headerCorrelationId) {
      return headerCorrelationId;
    }

    // Try to extract from query parameters
    const queryCorrelationId = req.query.correlationId as string;
    if (queryCorrelationId) {
      return queryCorrelationId;
    }

    // Generate new correlation ID
    return uuidv4();
  }
}