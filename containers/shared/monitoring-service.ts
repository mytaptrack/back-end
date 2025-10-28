/**
 * Monitoring Service Integration
 * Provides monitoring setup for container services
 */

import express from 'express';
import { 
  createMonitoringSetupFromEnv,
  MonitoringSetup,
  correlationMiddleware,
  requestLoggingMiddleware,
  errorLoggingMiddleware,
  performanceMiddleware,
  healthCheckEndpoint,
  metricsEndpoint,
  timeoutMiddleware,
  rateLimitMiddleware,
  HealthCheckFactory
} from '../../business-logic/core/src/logging';

/**
 * Monitoring service for container applications
 */
export class ContainerMonitoringService {
  private monitoring: MonitoringSetup;
  private metricsServer?: express.Application;
  
  constructor(private serviceName: string) {
    this.monitoring = createMonitoringSetupFromEnv(serviceName);
    this.setupHealthChecks();
  }
  
  /**
   * Get the logger instance
   */
  get logger() {
    return this.monitoring.logger;
  }
  
  /**
   * Get the metrics collector instance
   */
  get metrics() {
    return this.monitoring.metrics;
  }
  
  /**
   * Get the health check manager instance
   */
  get healthCheckManager() {
    return this.monitoring.healthCheckManager;
  }
  
  /**
   * Setup Express middleware for monitoring
   */
  setupExpressMiddleware(app: express.Application): void {
    // Correlation ID middleware (must be first)
    app.use(correlationMiddleware(this.monitoring.logger));
    
    // Request timeout middleware
    const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT || '30000');
    app.use(timeoutMiddleware(timeoutMs, this.monitoring.logger));
    
    // Rate limiting middleware
    if (process.env.RATE_LIMIT_ENABLED === 'true') {
      const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW || '60000');
      const maxRequests = parseInt(process.env.RATE_LIMIT_MAX || '100');
      app.use(rateLimitMiddleware(windowMs, maxRequests, this.monitoring.logger));
    }
    
    // Request logging middleware
    app.use(requestLoggingMiddleware(this.monitoring.logger, this.monitoring.metrics));
    
    // Performance monitoring middleware
    const slowRequestThreshold = parseInt(process.env.SLOW_REQUEST_THRESHOLD || '1000');
    app.use(performanceMiddleware(this.monitoring.logger, this.monitoring.metrics, slowRequestThreshold));
    
    // Error logging middleware (should be after routes)
    app.use(errorLoggingMiddleware(this.monitoring.logger));
  }
  
  /**
   * Setup health check and metrics endpoints
   */
  setupMonitoringEndpoints(app: express.Application): void {
    // Health check endpoint
    app.get('/health', healthCheckEndpoint(this.monitoring.healthCheckManager));
    
    // Readiness probe endpoint
    app.get('/ready', async (req, res) => {
      try {
        const status = await this.monitoring.healthCheckManager.getHealthStatus();
        if (status === 'healthy' || status === 'degraded') {
          res.status(200).json({ status: 'ready' });
        } else {
          res.status(503).json({ status: 'not ready' });
        }
      } catch (error) {
        res.status(503).json({ status: 'not ready', error: (error as Error).message });
      }
    });
    
    // Liveness probe endpoint
    app.get('/live', (req, res) => {
      res.status(200).json({ status: 'alive' });
    });
    
    // Metrics endpoint
    app.get('/metrics', metricsEndpoint(this.monitoring.metrics));
  }
  
  /**
   * Start separate metrics server if configured
   */
  startMetricsServer(): void {
    const metricsPort = parseInt(process.env.METRICS_PORT || '9091');
    
    if (metricsPort && metricsPort !== parseInt(process.env.PORT || '4500')) {
      this.metricsServer = express();
      
      // Basic middleware for metrics server
      this.metricsServer.use(correlationMiddleware(this.monitoring.logger));
      
      // Monitoring endpoints
      this.setupMonitoringEndpoints(this.metricsServer);
      
      this.metricsServer.listen(metricsPort, () => {
        this.monitoring.logger.info(`Metrics server started on port ${metricsPort}`);
      });
    }
  }
  
  /**
   * Register service dependencies for health checks
   */
  registerDependencies(dependencies: {
    dataAccess?: any;
    messageBroker?: any;
    cache?: any;
  }): void {
    const timeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000');
    
    if (dependencies.dataAccess) {
      const dbHealthCheck = HealthCheckFactory.createDatabaseCheck(
        dependencies.dataAccess,
        this.monitoring.logger,
        timeout
      );
      this.monitoring.healthCheckManager.registerCheck(dbHealthCheck);
    }
    
    if (dependencies.messageBroker) {
      const brokerHealthCheck = HealthCheckFactory.createMessageBrokerCheck(
        dependencies.messageBroker,
        this.monitoring.logger,
        timeout
      );
      this.monitoring.healthCheckManager.registerCheck(brokerHealthCheck);
    }
    
    if (dependencies.cache) {
      const cacheHealthCheck = HealthCheckFactory.createCacheCheck(
        dependencies.cache,
        this.monitoring.logger,
        timeout
      );
      this.monitoring.healthCheckManager.registerCheck(cacheHealthCheck);
    }
  }
  
  /**
   * Setup default health checks
   */
  private setupHealthChecks(): void {
    // Memory health check
    const memoryCheck = HealthCheckFactory.createMemoryCheck(this.monitoring.logger);
    this.monitoring.healthCheckManager.registerCheck(memoryCheck);
    
    // Disk space health check
    const diskCheck = HealthCheckFactory.createDiskSpaceCheck(this.monitoring.logger);
    this.monitoring.healthCheckManager.registerCheck(diskCheck);
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.monitoring.logger.info('Shutting down monitoring service');
    
    if (this.metricsServer) {
      // Close metrics server
      await new Promise<void>((resolve) => {
        const server = this.metricsServer!.listen();
        server.close(() => resolve());
      });
    }
    
    this.monitoring.logger.info('Monitoring service shutdown complete');
  }
}

/**
 * Database operation wrapper with metrics
 */
export function withDatabaseMetrics<T>(
  operation: string,
  metrics: any,
  table?: string
) {
  return async (fn: () => Promise<T>): Promise<T> => {
    const startTime = Date.now();
    let success = false;
    
    try {
      const result = await fn();
      success = true;
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      metrics.recordDatabaseOperation(operation, duration, success, table);
    }
  };
}

/**
 * Message broker operation wrapper with metrics
 */
export function withMessageBrokerMetrics<T>(
  operation: string,
  metrics: any,
  queue?: string
) {
  return async (fn: () => Promise<T>): Promise<T> => {
    const startTime = Date.now();
    let success = false;
    
    try {
      const result = await fn();
      success = true;
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      metrics.recordMessageOperation(operation, duration, success, queue);
    }
  };
}

/**
 * Cache operation wrapper with metrics
 */
export function withCacheMetrics<T>(
  operation: string,
  metrics: any
) {
  return async (fn: () => Promise<T>, hit?: boolean): Promise<T> => {
    const startTime = Date.now();
    
    try {
      const result = await fn();
      return result;
    } finally {
      const duration = Date.now() - startTime;
      metrics.recordCacheOperation(operation, duration, hit ?? false);
    }
  };
}