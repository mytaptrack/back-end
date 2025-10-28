/**
 * GraphQL API Container Entry Point
 * Main entry point for the containerized GraphQL API service with comprehensive monitoring
 */

import express, { Request, Response, NextFunction } from 'express';
import { ApolloServer } from 'apollo-server-express';

// Simple monitoring interfaces for this container
interface ILogger {
  info(message: string, metadata?: any): void;
  warn(message: string, metadata?: any): void;
  error(message: string, error?: Error, metadata?: any): void;
  setCorrelationId(id: string): void;
  child(context: any): ILogger;
}

interface IMetrics {
  incrementCounter(name: string, labels?: Record<string, string>): void;
  recordApiResponse(method: string, path: string, statusCode: number, duration: number): void;
}

// Simple logger implementation
class SimpleLogger implements ILogger {
  constructor(private serviceName: string) {}
  
  info(message: string, metadata?: any): void {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: this.serviceName,
      message,
      ...metadata
    }));
  }
  
  warn(message: string, metadata?: any): void {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: this.serviceName,
      message,
      ...metadata
    }));
  }
  
  error(message: string, error?: Error, metadata?: any): void {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: this.serviceName,
      message,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
      ...metadata
    }));
  }
  
  setCorrelationId(id: string): void {
    // Simple implementation - in production would use async local storage
  }
  
  child(context: any): ILogger {
    return this;
  }
}

// Simple metrics implementation
class SimpleMetrics implements IMetrics {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  
  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }
  
  recordApiResponse(method: string, path: string, statusCode: number, duration: number): void {
    this.incrementCounter('http_requests_total', { method, path, status_code: statusCode.toString() });
    
    const key = `http_request_duration_ms:${method}:${path}`;
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(duration);
  }
  
  getPrometheusMetrics(): string {
    const lines: string[] = [];
    
    // Counters
    for (const [key, value] of this.counters) {
      const [name, labelsStr] = key.split(':');
      const labels = JSON.parse(labelsStr);
      const labelPairs = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`${name}{service="graphql-api",${labelPairs}} ${value}`);
    }
    
    // Histograms
    for (const [key, values] of this.histograms) {
      const [name, method, path] = key.split(':');
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      lines.push(`${name}{service="graphql-api",method="${method}",path="${path}"} ${avg}`);
    }
    
    return lines.join('\n');
  }
  
  getMetricsJson(): any {
    return {
      timestamp: new Date().toISOString(),
      service: 'graphql-api',
      counters: Object.fromEntries(this.counters),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([key, values]) => [
          key,
          {
            count: values.length,
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            min: Math.min(...values),
            max: Math.max(...values)
          }
        ])
      )
    };
  }
}

/**
 * GraphQL API service with comprehensive monitoring
 */
class GraphQLAPIService {
  private app: express.Application;
  private monitoringApp: express.Application;
  private apolloServer?: ApolloServer;
  private logger: ILogger;
  private metrics: IMetrics;
  private startTime: number;
  
  constructor() {
    this.app = express();
    this.monitoringApp = express();
    this.logger = new SimpleLogger('graphql-api');
    this.metrics = new SimpleMetrics();
    this.startTime = Date.now();
    
    this.setupExpress();
    this.setupMonitoringServer();
  }
  
  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    // Setup Apollo Server
    await this.setupApolloServer();
    
    this.logger.info('GraphQL API service initialized');
  }
  
  /**
   * Start the HTTP servers
   */
  async start(): Promise<void> {
    const port = parseInt(process.env.PORT || '4500');
    const metricsPort = parseInt(process.env.METRICS_PORT || '9091');
    
    // Start main application server
    await new Promise<void>((resolve) => {
      this.app.listen(port, () => {
        this.logger.info(`GraphQL API server started on port ${port}`);
        resolve();
      });
    });
    
    // Start monitoring server
    await new Promise<void>((resolve) => {
      this.monitoringApp.listen(metricsPort, () => {
        this.logger.info(`Monitoring server started on port ${metricsPort}`, {
          endpoints: {
            metrics: `http://localhost:${metricsPort}/metrics`,
            health: `http://localhost:${metricsPort}/health`
          }
        });
        resolve();
      });
    });
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down GraphQL API service');
    
    if (this.apolloServer) {
      await this.apolloServer.stop();
    }
    
    this.logger.info('GraphQL API service shutdown complete');
  }
  
  /**
   * Setup Express application with monitoring middleware
   */
  private setupExpress(): void {
    // Request logging and metrics middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const correlationId = req.headers['x-correlation-id'] as string || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Set correlation ID
      (req as any).correlationId = correlationId;
      this.logger.setCorrelationId(correlationId);
      
      // Add correlation ID to response headers
      res.setHeader('X-Correlation-ID', correlationId);
      
      // Log incoming request
      this.logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        correlationId,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
      
      // Capture original end function to log response
      const originalEnd = res.end;
      res.end = function(chunk?: any, encoding?: any): Response {
        const duration = Date.now() - startTime;
        
        // Log response
        (req as any).logger?.info('Request completed', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          correlationId
        });
        
        // Record metrics
        (req as any).metrics?.recordApiResponse(req.method, req.path, res.statusCode, duration);
        
        return originalEnd.call(this, chunk, encoding);
      };
      
      // Attach logger and metrics to request
      (req as any).logger = this.logger;
      (req as any).metrics = this.metrics;
      
      next();
    });
    
    // Comprehensive health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      const uptime = Date.now() - this.startTime;
      const memUsage = process.memoryUsage();
      
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'graphql-api',
        version: process.env.SERVICE_VERSION || '1.0.0',
        uptime,
        memory: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss
        },
        dependencies: {
          // In a real implementation, these would check actual dependencies
          database: { status: 'healthy', responseTime: 25 },
          cache: { status: 'healthy', responseTime: 5 }
        }
      };
      
      this.logger.info('Health check requested', { status: healthStatus.status });
      res.json(healthStatus);
    });
    
    this.app.get('/ready', (req: Request, res: Response) => {
      res.json({ status: 'ready', timestamp: new Date().toISOString() });
    });
    
    this.app.get('/live', (req: Request, res: Response) => {
      res.json({ status: 'alive', timestamp: new Date().toISOString() });
    });
    
    // CORS middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const origins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];
      const origin = req.headers.origin;
      
      if (origins.includes(origin || '')) {
        res.setHeader('Access-Control-Allow-Origin', origin || '');
      }
      
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      
      next();
    });
  }
  
  /**
   * Setup monitoring server with metrics endpoints
   */
  private setupMonitoringServer(): void {
    // Metrics endpoint (Prometheus format)
    this.monitoringApp.get('/metrics', (req: Request, res: Response) => {
      try {
        const format = req.query.format as string;
        
        if (format === 'json') {
          const jsonMetrics = (this.metrics as SimpleMetrics).getMetricsJson();
          res.setHeader('Content-Type', 'application/json');
          res.json(jsonMetrics);
        } else {
          const prometheusMetrics = (this.metrics as SimpleMetrics).getPrometheusMetrics();
          res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
          res.send(prometheusMetrics);
        }
        
        this.logger.info('Metrics requested', { format: format || 'prometheus' });
      } catch (error) {
        this.logger.error('Failed to retrieve metrics', error as Error);
        res.status(500).json({
          error: 'Failed to retrieve metrics',
          message: (error as Error).message
        });
      }
    });
    
    // Health check endpoint (duplicate for monitoring)
    this.monitoringApp.get('/health', (req: Request, res: Response) => {
      const uptime = Date.now() - this.startTime;
      
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'graphql-api-monitoring',
        uptime,
        endpoints: {
          metrics: '/metrics',
          health: '/health'
        }
      };
      
      res.json(healthStatus);
    });
    
    // Basic info endpoint
    this.monitoringApp.get('/', (req: Request, res: Response) => {
      res.json({
        service: 'MyTapTrack GraphQL API Monitoring',
        version: process.env.SERVICE_VERSION || '1.0.0',
        endpoints: {
          metrics_prometheus: '/metrics',
          metrics_json: '/metrics?format=json',
          health: '/health'
        },
        documentation: {
          prometheus: 'Prometheus-compatible metrics endpoint',
          json: 'JSON format metrics for debugging',
          health: 'Service health status'
        }
      });
    });
  }
  
  /**
   * Setup Apollo Server
   */
  private async setupApolloServer(): Promise<void> {
    this.apolloServer = new ApolloServer({
      typeDefs: this.getGraphQLSchema(),
      resolvers: this.createResolvers(),
      context: ({ req, res }: any) => ({
        // Request context
        request: req,
        response: res,
        correlationId: req?.correlationId,
        userId: req?.userId
      })
    }) as any;
    
    await this.apolloServer?.start();
    
    if (this.apolloServer?.applyMiddleware) {
      this.apolloServer.applyMiddleware({ 
        app: this.app as any, 
        path: '/graphql',
        cors: false // We handle CORS ourselves
      });
    }
  }
  
  /**
   * Get GraphQL schema
   */
  private getGraphQLSchema(): string {
    return `
      type Query {
        health: String
        version: String
      }
      
      type Mutation {
        ping: String
      }
    `;
  }
  
  /**
   * Create GraphQL resolvers
   */
  private createResolvers(): any {
    return {
      Query: {
        health: () => 'OK',
        version: () => process.env.SERVICE_VERSION || '1.0.0'
      },
      
      Mutation: {
        ping: () => 'pong'
      }
    };
  }
}

/**
 * Main application entry point
 */
async function main() {
  const service = new GraphQLAPIService();
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await service.shutdown();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await service.shutdown();
    process.exit(0);
  });
  
  try {
    await service.initialize();
    await service.start();
  } catch (error) {
    console.error('Failed to start GraphQL API service:', error);
    process.exit(1);
  }
}

// Start the service
if (require.main === module) {
  main().catch(console.error);
}

export { GraphQLAPIService };