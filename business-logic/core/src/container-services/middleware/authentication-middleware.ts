import { Request, Response, NextFunction } from 'express';
import { ServiceContext } from '../../interfaces/service-context';
import { ExpressMiddleware, AuthMiddlewareContext, ErrorResponse } from '../interfaces';

/**
 * Authentication middleware for container services
 */
export class AuthenticationMiddleware {
  constructor(private serviceContext: ServiceContext) {}

  /**
   * Create authentication middleware
   */
  public create(): ExpressMiddleware {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = this.extractToken(req);
        
        if (!token) {
          return this.sendUnauthorized(res, 'No authentication token provided');
        }

        // Validate token using authentication provider
        const authResult = await this.serviceContext.authentication.validateToken(token);
        
        if (!authResult.valid) {
          return this.sendUnauthorized(res, authResult.error || 'Invalid token');
        }

        // Add authentication context to request
        const authContext: AuthMiddlewareContext = {
          user: authResult.userContext,
          token,
          correlationId: (req as any).correlationId
        };

        (req as any).auth = authContext;
        (req as any).user = authResult.userContext;

        next();
      } catch (error) {
        this.serviceContext.logger.error('Authentication middleware error', {
          error,
          correlationId: (req as any).correlationId
        });
        
        return this.sendInternalError(res, 'Authentication service error');
      }
    };
  }

  /**
   * Create optional authentication middleware (doesn't fail if no token)
   */
  public createOptional(): ExpressMiddleware {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = this.extractToken(req);
        
        if (token) {
          const authResult = await this.serviceContext.authentication.validateToken(token);
          
          if (authResult.valid) {
            const authContext: AuthMiddlewareContext = {
              user: authResult.userContext,
              token,
              correlationId: (req as any).correlationId
            };

            (req as any).auth = authContext;
            (req as any).user = authResult.userContext;
          }
        }

        next();
      } catch (error) {
        this.serviceContext.logger.warn('Optional authentication middleware error', {
          error,
          correlationId: (req as any).correlationId
        });
        
        // Continue without authentication for optional middleware
        next();
      }
    };
  }

  /**
   * Create role-based authorization middleware
   */
  public requireRole(requiredRole: string): ExpressMiddleware {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;
      
      if (!user) {
        return this.sendUnauthorized(res, 'Authentication required');
      }

      if (!user.roles || !user.roles.includes(requiredRole)) {
        return this.sendForbidden(res, `Role '${requiredRole}' required`);
      }

      next();
    };
  }

  /**
   * Create permission-based authorization middleware
   */
  public requirePermission(requiredPermission: string): ExpressMiddleware {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;
      
      if (!user) {
        return this.sendUnauthorized(res, 'Authentication required');
      }

      if (!user.permissions || !user.permissions.includes(requiredPermission)) {
        return this.sendForbidden(res, `Permission '${requiredPermission}' required`);
      }

      next();
    };
  }

  private extractToken(req: Request): string | null {
    // Try Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try query parameter
    const queryToken = req.query.token as string;
    if (queryToken) {
      return queryToken;
    }

    // Try cookie
    const cookieToken = req.cookies?.token;
    if (cookieToken) {
      return cookieToken;
    }

    return null;
  }

  private sendUnauthorized(res: Response, message: string): void {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'UNAUTHORIZED',
        message,
        correlationId: (res.locals as any).correlationId,
        retryable: false
      }
    };

    res.status(401).json(errorResponse);
  }

  private sendForbidden(res: Response, message: string): void {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'FORBIDDEN',
        message,
        correlationId: (res.locals as any).correlationId,
        retryable: false
      }
    };

    res.status(403).json(errorResponse);
  }

  private sendInternalError(res: Response, message: string): void {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message,
        correlationId: (res.locals as any).correlationId,
        retryable: false
      }
    };

    res.status(500).json(errorResponse);
  }
}