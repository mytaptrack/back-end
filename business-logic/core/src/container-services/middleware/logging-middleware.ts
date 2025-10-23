import { Request, Response, NextFunction } from 'express';
import { ServiceContext } from '../../interfaces/service-context';
import { ExpressMiddleware } from '../interfaces';

/**
 * Logging middleware for container services
 */
export class LoggingMiddleware {
  constructor(private serviceContext: ServiceContext) {}

  /**
   * Create request logging middleware
   */
  public create(): ExpressMiddleware {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const correlationId = (req as any).correlationId;

      // Log incoming request
      this.serviceContext.logger.info('Incoming request', {
        correlationId,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
        remoteAddress: this.getRemoteAddress(req)
      });

      // Override res.end to log response
      const originalEnd = res.end.bind(res);
      res.end = function(chunk?: any, encoding?: any, cb?: any) {
        const duration = Date.now() - startTime;
        
        // Log response
        const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
        const serviceContext = (req as any).serviceContext as ServiceContext;
        
        if (serviceContext?.logger) {
          serviceContext.logger[logLevel]('Request completed', {
            correlationId,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
            contentLength: res.get('content-length'),
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
   * Create detailed logging middleware (includes request/response bodies)
   */
  public createDetailed(): ExpressMiddleware {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const correlationId = (req as any).correlationId;

      // Capture request body if it exists
      const requestBody = req.body ? this.sanitizeBody(req.body) : undefined;

      // Log incoming request with body
      this.serviceContext.logger.debug('Detailed incoming request', {
        correlationId,
        method: req.method,
        url: req.url,
        headers: this.sanitizeHeaders(req.headers),
        query: req.query,
        body: requestBody,
        userAgent: req.headers['user-agent'],
        remoteAddress: this.getRemoteAddress(req)
      });

      // Capture response data
      const originalJson = res.json;
      let responseBody: any;

      res.json = function(body: any) {
        responseBody = body;
        return originalJson.call(this, body);
      };

      // Override res.end to log detailed response
      const originalEnd = res.end.bind(res);
      res.end = function(chunk?: any, encoding?: any, cb?: any) {
        const duration = Date.now() - startTime;
        
        // Log detailed response
        const logLevel = res.statusCode >= 400 ? 'warn' : 'debug';
        const serviceContext = (req as any).serviceContext as ServiceContext;
        
        if (serviceContext?.logger) {
          serviceContext.logger[logLevel]('Detailed request completed', {
            correlationId,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
            responseHeaders: res.getHeaders(),
            responseBody: responseBody,
            userAgent: req.headers['user-agent']
          });
        }

        // Call original end method
        return originalEnd(chunk, encoding, cb);
      };

      next();
    };
  }

  private getRemoteAddress(req: Request): string {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress || 
           (req.connection as any)?.socket?.remoteAddress ||
           'unknown';
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    
    // Remove sensitive headers
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}