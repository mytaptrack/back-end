import express, { Express, Request, Response } from 'express';
import { Server } from 'http';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { ServiceContext } from '../interfaces/service-context';
import { ServiceContextFactory } from '../service-context/service-context-factory';
import { ServiceLifecycleManager } from '../service-context/service-lifecycle';
import { 
  IContainerService, 
  HealthStatus, 
  ServerConfig, 
  ExpressMiddleware 
} from './interfaces';
import { HealthCheckManager, DatabaseHealthCheck, MessageBrokerHealthCheck, CacheHealthCheck, AuthenticationHealthCheck } from './health-check-manager';
import { 
  AuthenticationMiddleware,
  CorsMiddleware,
  ErrorMiddleware,
  LoggingMiddleware,
  RateLimitingMiddleware,
  RequestContextMiddleware
} from './middleware';

/**
 * Abstract base class for container services
 */
export abstract class ContainerService implements IContainerService {
  protected app: Express;
  protected server?: Server;
  protected serviceContext?: ServiceContext;
  protected lifecycleManager: ServiceLifecycleManager;
  protected healthCheckManager: HealthCheckManager;
  protected isInitialized = false;
  protected isShuttingDown = false;

  // Middleware instances
  protected authMiddleware?: AuthenticationMiddleware;
  protected errorMiddleware?: ErrorMiddleware;
  protected loggingMiddleware?: LoggingMiddleware;
  protected rateLimitMiddleware?: RateLimitingMiddleware;
  protected requestContextMiddleware?: RequestContextMiddleware;

  constructor(protected config: ServerConfig) {
    this.app = express();
    this.lifecycleManager = new ServiceLifecycleManager();
    this.healthCheckManager = new HealthCheckManager();
  }

  /**
   * Initialize the container service
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Container service already initialized');
    }

    try {
      // Create service context
      this.serviceContext = await this.createServiceContext();
      
      // Initialize lifecycle manager
      await this.lifecycleManager.initialize(this.serviceContext);
      
      // Setup middleware
      await this.setupMiddleware();
      
      // Setup health checks
      this.setupHealthChecks();
      
      // Setup routes
      await this.setupRoutes();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Start HTTP server
      await this.startServer();
      
      this.isInitialized = true;
      
      this.serviceContext.logger.info('Container service initialized successfully', {
        serviceName: this.getServiceName(),
        port: this.config.port,
        host: this.config.host || 'localhost'
      });
    } catch (error) {
      this.serviceContext?.logger.error('Failed to initialize container service', { error });
      throw error;
    }
  }

  /**
   * Shutdown the container service
   */
  public async shutdown(): Promise<void> {
    if (!this.isInitialized || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    try {
      this.serviceContext?.logger.info('Shutting down container service', {
        serviceName: this.getServiceName()
      });

      // Stop HTTP server
      if (this.server) {
        await new Promise<void>((resolve, reject) => {
          this.server!.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      }

      // Shutdown lifecycle manager
      await this.lifecycleManager.shutdown();

      this.serviceContext?.logger.info('Container service shutdown completed');
    } catch (error) {
      this.serviceContext?.logger.error('Error during container service shutdown', { error });
      throw error;
    } finally {
      this.isInitialized = false;
      this.isShuttingDown = false;
    }
  }

  /**
   * Get health status
   */
  public async getHealthStatus(): Promise<HealthStatus> {
    return this.healthCheckManager.runHealthChecks();
  }

  /**
   * Get service name (to be implemented by subclasses)
   */
  protected abstract getServiceName(): string;

  /**
   * Setup service-specific routes (to be implemented by subclasses)
   */
  protected abstract setupRoutes(): Promise<void>;

  /**
   * Create service context (can be overridden by subclasses)
   */
  protected async createServiceContext(): Promise<ServiceContext> {
    const factory = ServiceContextFactory.getInstance();
    return factory.createContext();
  }

  /**
   * Setup Express middleware
   */
  protected async setupMiddleware(): Promise<void> {
    if (!this.serviceContext) {
      throw new Error('Service context not available');
    }

    // Create middleware instances
    this.requestContextMiddleware = new RequestContextMiddleware(this.serviceContext);
    this.authMiddleware = new AuthenticationMiddleware(this.serviceContext);
    this.loggingMiddleware = new LoggingMiddleware(this.serviceContext);
    this.errorMiddleware = new ErrorMiddleware(this.serviceContext);

    // Security middleware
    if (this.config.security?.helmet !== false) {
      this.app.use(helmet({
        contentSecurityPolicy: false, // Disable CSP for APIs
        crossOriginEmbedderPolicy: false
      }));
    }

    if (this.config.security?.hidePoweredBy !== false) {
      this.app.disable('x-powered-by');
    }

    // Trust proxy if configured
    if (this.config.security?.trustProxy) {
      this.app.set('trust proxy', true);
    }

    // Compression middleware
    if (this.config.middleware?.compression !== false) {
      this.app.use(compression());
    }

    // CORS middleware
    if (this.config.cors) {
      this.app.use(CorsMiddleware.create(this.config.cors));
    }

    // Request context middleware (must be early)
    this.app.use(this.requestContextMiddleware.create());
    this.app.use(this.requestContextMiddleware.createTiming());
    this.app.use(this.requestContextMiddleware.createRequestId());

    // Body parsing middleware
    this.setupBodyParsing();

    // Cookie parser
    this.app.use(cookieParser());

    // Logging middleware
    if (this.config.middleware?.requestLogging !== false) {
      this.app.use(this.loggingMiddleware.create());
    }

    // Rate limiting middleware
    if (this.config.middleware?.rateLimiting) {
      this.rateLimitMiddleware = new RateLimitingMiddleware(
        this.serviceContext,
        this.config.middleware.rateLimiting
      );
      this.app.use(this.rateLimitMiddleware.create());
    }

    // User context middleware (after auth)
    this.app.use(this.requestContextMiddleware.createUserContext());
  }

  /**
   * Setup body parsing middleware
   */
  protected setupBodyParsing(): void {
    const bodyParserConfig = this.config.middleware?.bodyParser || {};

    // JSON body parser
    this.app.use(express.json({
      limit: bodyParserConfig.json?.limit || '10mb',
      strict: bodyParserConfig.json?.strict !== false
    }));

    // URL-encoded body parser
    this.app.use(express.urlencoded({
      extended: bodyParserConfig.urlencoded?.extended !== false,
      limit: bodyParserConfig.urlencoded?.limit || '10mb'
    }));
  }

  /**
   * Setup health checks
   */
  protected setupHealthChecks(): void {
    if (!this.serviceContext) {
      return;
    }

    // Register standard health checks
    this.healthCheckManager.registerCheck(new DatabaseHealthCheck(this.serviceContext));
    this.healthCheckManager.registerCheck(new MessageBrokerHealthCheck(this.serviceContext));
    this.healthCheckManager.registerCheck(new CacheHealthCheck(this.serviceContext));
    this.healthCheckManager.registerCheck(new AuthenticationHealthCheck(this.serviceContext));

    // Setup health check routes
    this.app.get('/health', async (req: Request, res: Response) => {
      try {
        const healthStatus = await this.getHealthStatus();
        const statusCode = healthStatus.healthy ? 200 : 503;
        res.status(statusCode).json(healthStatus);
      } catch (error) {
        this.serviceContext?.logger.error('Health check error', { error });
        res.status(503).json({
          healthy: false,
          error: 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Quick health check (no deep checks)
    this.app.get('/health/quick', (req: Request, res: Response) => {
      const quickStatus = this.healthCheckManager.getQuickStatus();
      res.json(quickStatus);
    });

    // Readiness check
    this.app.get('/ready', (req: Request, res: Response) => {
      const ready = this.isInitialized && !this.isShuttingDown;
      res.status(ready ? 200 : 503).json({
        ready,
        timestamp: new Date().toISOString()
      });
    });

    // Liveness check
    this.app.get('/live', (req: Request, res: Response) => {
      res.json({
        alive: true,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Setup error handling middleware
   */
  protected setupErrorHandling(): void {
    if (!this.errorMiddleware) {
      return;
    }

    // 404 handler
    this.app.use(this.errorMiddleware.createNotFoundHandler());

    // Global error handler (must be last)
    this.app.use(this.errorMiddleware.create());
  }

  /**
   * Start HTTP server
   */
  protected async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const host = this.config.host || 'localhost';
      
      this.server = this.app.listen(this.config.port, host, () => {
        this.serviceContext?.logger.info('HTTP server started', {
          serviceName: this.getServiceName(),
          port: this.config.port,
          host
        });
        resolve();
      });

      if (this.server) {
        this.server.on('error', (error) => {
          this.serviceContext?.logger.error('HTTP server error', { error });
          reject(error);
        });
      }

      // Setup graceful shutdown
      this.setupGracefulShutdown();
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  protected setupGracefulShutdown(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
    
    for (const signal of signals) {
      process.on(signal, () => {
        this.serviceContext?.logger.info(`Received ${signal}, starting graceful shutdown`);
        this.shutdown().then(() => {
          process.exit(0);
        }).catch((error) => {
          this.serviceContext?.logger.error('Graceful shutdown failed', { error });
          process.exit(1);
        });
      });
    }
  }

  /**
   * Get authentication middleware
   */
  protected getAuthMiddleware(): AuthenticationMiddleware {
    if (!this.authMiddleware) {
      throw new Error('Authentication middleware not initialized');
    }
    return this.authMiddleware;
  }

  /**
   * Add custom middleware
   */
  protected addMiddleware(middleware: ExpressMiddleware): void {
    this.app.use(middleware);
  }

  /**
   * Add custom route
   */
  protected addRoute(method: string, path: string, ...handlers: ExpressMiddleware[]): void {
    (this.app as any)[method.toLowerCase()](path, ...handlers);
  }
}