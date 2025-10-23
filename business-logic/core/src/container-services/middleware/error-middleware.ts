import { Request, Response, NextFunction } from 'express';
import { ServiceContext } from '../../interfaces/service-context';
import { ServiceError } from '../../errors/service-errors';
import { ErrorResponse } from '../interfaces';

/**
 * Error handling middleware for container services
 */
export class ErrorMiddleware {
  constructor(private serviceContext: ServiceContext) {}

  /**
   * Create error handling middleware
   */
  public create() {
    return (error: Error, req: Request, res: Response, next: NextFunction) => {
      const correlationId = (req as any).correlationId || 'unknown';
      
      // Log the error
      this.serviceContext.logger.error('Request error', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        correlationId,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent']
      });

      // Handle different error types
      if (error instanceof ServiceError) {
        this.handleServiceError(error, res, correlationId);
      } else if (error.name === 'ValidationError') {
        this.handleValidationError(error, res, correlationId);
      } else if (error.name === 'SyntaxError' && 'body' in error) {
        this.handleJsonSyntaxError(error, res, correlationId);
      } else if (error.name === 'UnauthorizedError') {
        this.handleUnauthorizedError(error, res, correlationId);
      } else {
        this.handleUnknownError(error, res, correlationId);
      }
    };
  }

  /**
   * Create 404 handler middleware
   */
  public createNotFoundHandler() {
    return (req: Request, res: Response) => {
      const correlationId = (req as any).correlationId || 'unknown';
      
      this.serviceContext.logger.warn('Route not found', {
        correlationId,
        method: req.method,
        url: req.url
      });

      const errorResponse: ErrorResponse = {
        error: {
          code: 'NOT_FOUND',
          message: `Route ${req.method} ${req.url} not found`,
          correlationId,
          retryable: false
        }
      };

      res.status(404).json(errorResponse);
    };
  }

  private handleServiceError(error: ServiceError, res: Response, correlationId: string): void {
    const errorResponse: ErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        correlationId,
        retryable: error.retryable,
        details: error.context
      }
    };

    res.status(error.statusCode).json(errorResponse);
  }

  private handleValidationError(error: Error, res: Response, correlationId: string): void {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        correlationId,
        retryable: false
      }
    };

    res.status(400).json(errorResponse);
  }

  private handleJsonSyntaxError(error: Error, res: Response, correlationId: string): void {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
        correlationId,
        retryable: false
      }
    };

    res.status(400).json(errorResponse);
  }

  private handleUnauthorizedError(error: Error, res: Response, correlationId: string): void {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'UNAUTHORIZED',
        message: error.message || 'Unauthorized',
        correlationId,
        retryable: false
      }
    };

    res.status(401).json(errorResponse);
  }

  private handleUnknownError(error: Error, res: Response, correlationId: string): void {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        correlationId,
        retryable: false
      }
    };

    res.status(500).json(errorResponse);
  }
}