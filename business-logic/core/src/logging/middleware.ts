/**
 * Logging and Monitoring Middleware
 * Express middleware for correlation ID tracking and request logging
 */

import { Request, Response, NextFunction } from 'express';
import { ILogger, IMetricsCollector } from './interfaces';
import { CorrelationUtils } from './logger';

/**
 * Extended request interface with logging context
 */
export interface LoggingRequest extends Request {
  correlationId: string;
  requestId: string;
  userId?: string;
  startTime: number;
  logger: ILogger;
}

/**
 * Correlation ID middleware
 * Extracts or generates correlation ID and sets up request context
 */
export function correlationMiddleware(logger: ILogger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const loggingReq = req as LoggingRequest;
    
    // Extract or generate correlation ID
    loggingReq.correlationId = CorrelationUtils.extractFromHeaders(req.headers);
    
    // Generate request ID
    loggingReq.requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Extract user ID if available
    loggingReq.userId = CorrelationUtils.extractUserId(req.headers);
    
    // Set start time for performance tracking
    loggingReq.startTime = Date.now();
    
    // Create child logger with request context
    loggingReq.logger = logger.child({
      correlationId: loggingReq.correlationId,
      requestId: loggingReq.requestId,
      userId: loggingReq.userId
    });
    
    // Set correlation context
    logger.setCorrelationId(loggingReq.correlationId);
    if (loggingReq.userId) {
      logger.setUserId(loggingReq.userId);
    }
    logger.setRequestId(loggingReq.requestId);
    
    // Add correlation ID to response headers
    res.setHeader('X-Correlation-ID', loggingReq.correlationId);
    res.setHeader('X-Request-ID', loggingReq.requestId);
    
    next();
  };
}

/**
 * Request logging middleware
 * Logs incoming requests and responses with performance metrics
 */
export function requestLoggingMiddleware(logger: ILogger, metrics?: IMetricsCollector) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const loggingReq = req as LoggingRequest;
    
    // Log incoming request
    loggingReq.logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      query: req.query,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      contentLength: req.get('Content-Length')
    });
    
    // Capture original end function
    const originalEnd = res.end;
    
    // Override end function to log response
    res.end = function(chunk?: any, encoding?: any): Response {
      const duration = Date.now() - loggingReq.startTime;
      
      // Log response
      loggingReq.logger.info('Request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('Content-Length')
      });
      
      // Record metrics if available
      if (metrics) {
        metrics.recordApiResponse(req.method, req.path, res.statusCode, duration);
      }
      
      // Call original end function
      return originalEnd.call(this, chunk, encoding);
    };
    
    next();
  };
}

/**
 * Error logging middleware
 * Logs errors with full context and correlation tracking
 */
export function errorLoggingMiddleware(logger: ILogger) {
  return (error: Error, req: Request, res: Response, next: NextFunction): void => {
    const loggingReq = req as LoggingRequest;
    const requestLogger = loggingReq.logger || logger;
    
    // Log error with full context
    requestLogger.error('Request error', error, {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
      statusCode: res.statusCode,
      duration: Date.now() - loggingReq.startTime
    });
    
    next(error);
  };
}

/**
 * Performance monitoring middleware
 * Tracks slow requests and performance metrics
 */
export function performanceMiddleware(
  logger: ILogger, 
  metrics: IMetricsCollector,
  slowRequestThreshold: number = 1000
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const loggingReq = req as LoggingRequest;
    
    // Capture original end function
    const originalEnd = res.end;
    
    res.end = function(chunk?: any, encoding?: any): Response {
      const duration = Date.now() - loggingReq.startTime;
      
      // Log slow requests
      if (duration > slowRequestThreshold) {
        loggingReq.logger.warn('Slow request detected', {
          method: req.method,
          path: req.path,
          duration,
          threshold: slowRequestThreshold
        });
      }
      
      // Record performance metrics
      metrics.recordApiResponse(req.method, req.path, res.statusCode, duration);
      
      return originalEnd.call(this, chunk, encoding);
    };
    
    next();
  };
}

/**
 * Health check endpoint middleware
 * Provides standardized health check endpoint
 */
export function healthCheckEndpoint(healthCheckManager: any) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const healthStatus = await healthCheckManager.runHealthChecks();
      
      const statusCode = healthStatus.status === 'healthy' ? 200 : 
                        healthStatus.status === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json(healthStatus);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: (error as Error).message
      });
    }
  };
}

/**
 * Metrics endpoint middleware
 * Provides Prometheus-compatible metrics endpoint
 */
export function metricsEndpoint(metrics: IMetricsCollector) {
  return (req: Request, res: Response): void => {
    try {
      const format = req.query.format as string;
      
      if (format === 'json') {
        // Return JSON format
        const jsonMetrics = (metrics as any).getMetricsJson?.() || { error: 'JSON format not supported' };
        res.setHeader('Content-Type', 'application/json');
        res.json(jsonMetrics);
      } else {
        // Return Prometheus format (default)
        const prometheusMetrics = (metrics as any).getPrometheusMetrics?.() || '# No metrics available';
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(prometheusMetrics);
      }
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve metrics',
        message: (error as Error).message
      });
    }
  };
}

/**
 * Request timeout middleware
 * Adds timeout handling with proper logging
 */
export function timeoutMiddleware(timeoutMs: number, logger: ILogger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const loggingReq = req as LoggingRequest;
    
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        loggingReq.logger.warn('Request timeout', {
          method: req.method,
          path: req.path,
          timeout: timeoutMs,
          duration: Date.now() - loggingReq.startTime
        });
        
        res.status(408).json({
          error: 'Request timeout',
          timeout: timeoutMs,
          correlationId: loggingReq.correlationId
        });
      }
    }, timeoutMs);
    
    // Clear timeout when response is sent
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any): Response {
      clearTimeout(timeout);
      return originalEnd.call(this, chunk, encoding);
    };
    
    next();
  };
}

/**
 * Rate limiting middleware with logging
 */
export function rateLimitMiddleware(
  windowMs: number,
  maxRequests: number,
  logger: ILogger,
  keyGenerator?: (req: Request) => string
) {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const loggingReq = req as LoggingRequest;
    const key = keyGenerator ? keyGenerator(req) : req.ip || 'unknown';
    const now = Date.now();
    
    // Clean up expired entries
    for (const [k, v] of requests.entries()) {
      if (now > v.resetTime) {
        requests.delete(k);
      }
    }
    
    // Get or create request tracking
    let requestData = requests.get(key);
    if (!requestData || now > requestData.resetTime) {
      requestData = { count: 0, resetTime: now + windowMs };
      requests.set(key, requestData);
    }
    
    requestData.count++;
    
    // Check rate limit
    if (requestData.count > maxRequests) {
      loggingReq.logger.warn('Rate limit exceeded', {
        key,
        count: requestData.count,
        limit: maxRequests,
        windowMs,
        resetTime: new Date(requestData.resetTime).toISOString()
      });
      
      res.status(429).json({
        error: 'Rate limit exceeded',
        limit: maxRequests,
        windowMs,
        resetTime: new Date(requestData.resetTime).toISOString(),
        correlationId: loggingReq.correlationId
      });
      return;
    }
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - requestData.count));
    res.setHeader('X-RateLimit-Reset', new Date(requestData.resetTime).toISOString());
    
    next();
  };
}