import { Request, Response, NextFunction } from 'express';
import { ContainerService } from './container-service';
import { ServerConfig } from './interfaces';
import { ServiceContext } from '../interfaces/service-context';
// Business logic imports - these will be available when packages are built
// import { UserOperations } from '@mytaptrack/business-logic-user';
// import { StudentOperations } from '@mytaptrack/business-logic-student';
// import { LicenseOperations } from '@mytaptrack/business-logic-license';
// import { ReportOperations } from '@mytaptrack/business-logic-report';
// import { AppOperations } from '@mytaptrack/business-logic-app';

import { 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError, 
  ServiceUnavailableError 
} from '../errors/service-errors';

// Placeholder operations for when packages are not available
const UserOperations = {
  getUserById: async (userId: string, context: any) => null,
  createUser: async (userData: any, context: any) => userData,
  updateUser: async (userId: string, updateData: any, context: any) => updateData
};

const StudentOperations = {
  getStudentById: async (studentId: string, context: any, userId?: string) => null,
  createStudent: async (studentData: any, context: any) => studentData
};

const LicenseOperations = {};
const ReportOperations = {};
const AppOperations = {};

/**
 * REST API container service
 * Provides Express.js-based REST endpoints that delegate to business logic services
 */
export class RestAPIService extends ContainerService {
  
  constructor(config: ServerConfig) {
    super(config);
  }

  protected getServiceName(): string {
    return 'REST API Service';
  }

  /**
   * Setup REST API routes
   */
  protected async setupRoutes(): Promise<void> {
    if (!this.serviceContext) {
      throw new Error('Service context not available');
    }

    // Setup API versioning middleware
    this.setupApiVersioning();

    // Setup user routes
    this.setupUserRoutes();

    // Setup student routes
    this.setupStudentRoutes();

    // Setup license routes
    this.setupLicenseRoutes();

    // Setup report routes
    this.setupReportRoutes();

    // Setup app routes
    this.setupAppRoutes();

    // Setup utility routes
    this.setupUtilityRoutes();

    this.serviceContext.logger.info('REST API routes configured', {
      userRoutes: '/api/v2/user/*',
      studentRoutes: '/api/v2/student/*',
      licenseRoutes: '/api/v2/license/*',
      reportRoutes: '/api/v2/report/*',
      appRoutes: '/api/v2/app/*'
    });
  }

  /**
   * Setup API versioning middleware
   */
  private setupApiVersioning(): void {
    // Add API version header
    this.app.use('/api/v2', (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-API-Version', '2.0');
      res.setHeader('X-Service-Type', 'container');
      next();
    });

    // Request validation middleware
    this.app.use('/api/v2', this.createRequestValidationMiddleware());
  }

  /**
   * Setup user-related routes
   */
  private setupUserRoutes(): void {
    const router = this.createAuthenticatedRouter();

    // GET /api/v2/user - Get current user
    router.get('/user', this.asyncHandler(async (req: Request, res: Response) => {
      const userContext = this.getUserContext(req);
      const user = await UserOperations.getUserById(userContext.userId, this.serviceContext!);
      
      if (!user) {
        // Create user if not exists (matching Lambda behavior)
        const createUserData = {
          userId: userContext.userId,
          email: userContext.email,
          firstName: userContext.firstName || '',
          lastName: userContext.lastName || '',
          name: userContext.name || '',
          license: userContext.licenses?.[0]
        };
        
        const newUser = await UserOperations.createUser(createUserData, this.serviceContext!);
        return res.json(newUser);
      }
      
      res.json(user);
    }));

    // PUT /api/v2/user - Update user
    router.put('/user', this.asyncHandler(async (req: Request, res: Response) => {
      const userContext = this.getUserContext(req);
      const updateData = req.body;
      
      const user = await UserOperations.updateUser(userContext.userId, updateData, this.serviceContext!);
      res.json(user);
    }));

    // GET /api/v2/user/alerts - Get user alert stats
    router.get('/user/alerts', this.asyncHandler(async (req: Request, res: Response) => {
      const userContext = this.getUserContext(req);
      
      // This would need to be implemented in UserOperations
      // For now, return empty stats
      const alertStats = {
        totalAlerts: 0,
        unreadAlerts: 0,
        criticalAlerts: 0
      };
      
      res.json(alertStats);
    }));

    this.app.use('/api/v2', router);
  }

  /**
   * Setup student-related routes
   */
  private setupStudentRoutes(): void {
    const router = this.createAuthenticatedRouter();

    // PUT /api/v2/student - Create/Update student
    router.put('/student', this.asyncHandler(async (req: Request, res: Response) => {
      const userContext = this.getUserContext(req);
      const studentData = req.body;
      
      // Add user context to student data
      studentData.userId = userContext.userId;
      studentData.license = studentData.license || userContext.licenses?.[0];
      
      const student = await StudentOperations.createStudent(studentData, this.serviceContext!);
      res.json(student);
    }));

    // GET /api/v2/student - Get student
    router.get('/student', this.asyncHandler(async (req: Request, res: Response) => {
      const userContext = this.getUserContext(req);
      const studentId = req.query.studentId as string;
      
      if (!studentId || studentId === 'null') {
        return res.status(400).json({ error: 'Student ID is required' });
      }
      
      const student = await StudentOperations.getStudentById(studentId, this.serviceContext!, userContext.userId);
      
      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }
      
      res.json(student);
    }));

    // Document routes
    router.get('/student/document', this.asyncHandler(async (req: Request, res: Response) => {
      // Document retrieval logic would go here
      res.json({ message: 'Document retrieval not yet implemented' });
    }));

    router.put('/student/document', this.asyncHandler(async (req: Request, res: Response) => {
      // Document upload logic would go here
      res.json({ message: 'Document upload not yet implemented' });
    }));

    router.delete('/student/document', this.asyncHandler(async (req: Request, res: Response) => {
      // Document deletion logic would go here
      res.json({ message: 'Document deletion not yet implemented' });
    }));

    // Subscription routes
    router.get('/student/subscriptions', this.asyncHandler(async (req: Request, res: Response) => {
      // Subscription retrieval logic would go here
      res.json([]);
    }));

    router.put('/student/subscriptions', this.asyncHandler(async (req: Request, res: Response) => {
      // Subscription update logic would go here
      res.json({ message: 'Subscription updated' });
    }));

    // Notification routes
    router.get('/student/notification', this.asyncHandler(async (req: Request, res: Response) => {
      // Notification retrieval logic would go here
      res.json([]);
    }));

    router.delete('/student/notification', this.asyncHandler(async (req: Request, res: Response) => {
      // Notification deletion logic would go here
      res.json({ message: 'Notification deleted' });
    }));

    // Behavior routes
    router.put('/student/behavior', this.asyncHandler(async (req: Request, res: Response) => {
      // Behavior update logic would go here
      res.json({ message: 'Behavior updated' });
    }));

    router.delete('/student/behavior', this.asyncHandler(async (req: Request, res: Response) => {
      // Behavior deletion logic would go here
      res.json({ message: 'Behavior deleted' });
    }));

    // Response routes
    router.put('/student/response', this.asyncHandler(async (req: Request, res: Response) => {
      // Response update logic would go here
      res.json({ message: 'Response updated' });
    }));

    router.delete('/student/response', this.asyncHandler(async (req: Request, res: Response) => {
      // Response deletion logic would go here
      res.json({ message: 'Response deleted' });
    }));

    // ABC routes
    router.put('/student/abc', this.asyncHandler(async (req: Request, res: Response) => {
      // ABC update logic would go here
      res.json({ message: 'ABC updated' });
    }));

    router.delete('/student/abc', this.asyncHandler(async (req: Request, res: Response) => {
      // ABC deletion logic would go here
      res.json({ message: 'ABC deleted' });
    }));

    // Team routes
    router.get('/student/team', this.asyncHandler(async (req: Request, res: Response) => {
      // Team retrieval logic would go here
      res.json([]);
    }));

    router.put('/student/team', this.asyncHandler(async (req: Request, res: Response) => {
      // Team update logic would go here
      res.json({ message: 'Team updated' });
    }));

    router.post('/student/team', this.asyncHandler(async (req: Request, res: Response) => {
      // Team creation logic would go here
      res.json({ message: 'Team created' });
    }));

    router.delete('/student/team', this.asyncHandler(async (req: Request, res: Response) => {
      // Team deletion logic would go here
      res.json({ message: 'Team deleted' });
    }));

    // Schedule routes
    router.get('/student/schedules', this.asyncHandler(async (req: Request, res: Response) => {
      // Schedule retrieval logic would go here
      res.json([]);
    }));

    router.put('/student/schedule', this.asyncHandler(async (req: Request, res: Response) => {
      // Schedule update logic would go here
      res.json({ message: 'Schedule updated' });
    }));

    router.delete('/student/schedule', this.asyncHandler(async (req: Request, res: Response) => {
      // Schedule deletion logic would go here
      res.json({ message: 'Schedule deleted' });
    }));

    this.app.use('/api/v2', router);
  }

  /**
   * Setup license-related routes
   */
  private setupLicenseRoutes(): void {
    const router = this.createAuthenticatedRouter();

    // License routes would be implemented here
    router.get('/license', this.asyncHandler(async (req: Request, res: Response) => {
      res.json({ message: 'License routes not yet implemented' });
    }));

    this.app.use('/api/v2', router);
  }

  /**
   * Setup report-related routes
   */
  private setupReportRoutes(): void {
    const router = this.createAuthenticatedRouter();

    // Report routes would be implemented here
    router.get('/report', this.asyncHandler(async (req: Request, res: Response) => {
      res.json({ message: 'Report routes not yet implemented' });
    }));

    this.app.use('/api/v2', router);
  }

  /**
   * Setup app-related routes
   */
  private setupAppRoutes(): void {
    const router = this.createAuthenticatedRouter();

    // App routes would be implemented here
    router.get('/app', this.asyncHandler(async (req: Request, res: Response) => {
      res.json({ message: 'App routes not yet implemented' });
    }));

    this.app.use('/api/v2', router);
  }

  /**
   * Setup utility routes
   */
  private setupUtilityRoutes(): void {
    // Browser error reporting (no auth required)
    this.app.post('/api/user/error', this.asyncHandler(async (req: Request, res: Response) => {
      const errorData = req.body;
      
      this.serviceContext?.logger.error('Browser error reported', {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        error: errorData
      });
      
      res.json({ message: 'Error reported successfully' });
    }));
  }

  /**
   * Create authenticated router with auth middleware
   */
  private createAuthenticatedRouter() {
    const router = require('express').Router();
    
    // Apply authentication middleware
    router.use(this.getAuthMiddleware().create());
    
    return router;
  }

  /**
   * Create request validation middleware
   */
  private createRequestValidationMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Add request ID if not present
      if (!(req as any).requestId) {
        (req as any).requestId = require('crypto').randomUUID();
      }

      // Add correlation ID if not present
      if (!(req as any).correlationId) {
        (req as any).correlationId = (req as any).requestId;
      }

      // Validate content type for POST/PUT requests
      if (['POST', 'PUT'].includes(req.method) && req.headers['content-type']) {
        if (!req.headers['content-type'].includes('application/json')) {
          return res.status(400).json({
            error: {
              code: 'INVALID_CONTENT_TYPE',
              message: 'Content-Type must be application/json',
              correlationId: (req as any).correlationId
            }
          });
        }
      }

      next();
    };
  }

  /**
   * Get user context from request
   */
  private getUserContext(req: Request): any {
    const userContext = (req as any).userContext;
    if (!userContext) {
      throw new BusinessLogicError('User context not available', (req as any).correlationId);
    }
    return userContext;
  }

  /**
   * Async handler wrapper for Express routes
   */
  private asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Transform Lambda-style parameters to Express query/body
   */
  private transformLambdaParameters(req: Request): any {
    // Combine query parameters and body for compatibility
    return {
      ...req.query,
      ...req.body
    };
  }

  /**
   * Transform response to match Lambda format
   */
  private transformResponse(data: any, req: Request, res: Response): void {
    // Add standard headers
    res.setHeader('X-Request-ID', (req as any).requestId);
    res.setHeader('X-Correlation-ID', (req as any).correlationId);
    
    // Return data in Lambda-compatible format
    res.json(data);
  }

  /**
   * Handle business logic errors
   */
  private handleBusinessLogicError(error: Error, req: Request, res: Response): void {
    const correlationId = (req as any).correlationId;
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          correlationId,
          details: (error as any).context
        }
      });
    } else if (error instanceof NotFoundError) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: error.message,
          correlationId
        }
      });
    } else if (error instanceof BusinessLogicError) {
      res.status(400).json({
        error: {
          code: 'BUSINESS_LOGIC_ERROR',
          message: error.message,
          correlationId,
          details: (error as any).context
        }
      });
    } else if (error instanceof ServiceUnavailableError) {
      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: error.message,
          correlationId,
          retryable: true
        }
      });
    } else {
      // Log unexpected errors
      this.serviceContext?.logger.error('Unexpected REST API error', { error, correlationId });
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
          correlationId
        }
      });
    }
  }

  /**
   * Setup error handling for REST API
   */
  protected setupErrorHandling(): void {
    // Call parent error handling first
    super.setupErrorHandling();

    // Add REST API specific error handling
    this.app.use('/api', (error: Error, req: Request, res: Response, next: NextFunction) => {
      this.handleBusinessLogicError(error, req, res);
    });
  }
}