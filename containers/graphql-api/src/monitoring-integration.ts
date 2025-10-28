/**
 * GraphQL API Monitoring Integration Example
 * Demonstrates how to integrate comprehensive logging and monitoring
 */

import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import { ContainerMonitoringService, withDatabaseMetrics, withMessageBrokerMetrics, withCacheMetrics } from '../../shared/monitoring-service';

/**
 * GraphQL API service with integrated monitoring
 */
export class GraphQLAPIService {
  private app: express.Application;
  private apolloServer?: ApolloServer;
  private monitoring: ContainerMonitoringService;
  private dependencies: any = {};
  
  constructor() {
    this.app = express();
    this.monitoring = new ContainerMonitoringService('graphql-api');
    this.setupExpress();
  }
  
  /**
   * Initialize the service with dependencies
   */
  async initialize(dependencies: {
    dataAccess: any;
    messageBroker: any;
    cache: any;
    businessServices: any;
  }): Promise<void> {
    this.dependencies = dependencies;
    
    // Register dependencies for health checks
    this.monitoring.registerDependencies({
      dataAccess: dependencies.dataAccess,
      messageBroker: dependencies.messageBroker,
      cache: dependencies.cache
    });
    
    // Setup Apollo Server with monitoring
    await this.setupApolloServer();
    
    // Start metrics server
    this.monitoring.startMetricsServer();
    
    this.monitoring.logger.info('GraphQL API service initialized');
  }
  
  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    const port = parseInt(process.env.PORT || '4500');
    
    await new Promise<void>((resolve) => {
      this.app.listen(port, () => {
        this.monitoring.logger.info(`GraphQL API server started on port ${port}`);
        resolve();
      });
    });
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.monitoring.logger.info('Shutting down GraphQL API service');
    
    if (this.apolloServer) {
      await this.apolloServer.stop();
    }
    
    await this.monitoring.shutdown();
    
    this.monitoring.logger.info('GraphQL API service shutdown complete');
  }
  
  /**
   * Setup Express application with monitoring middleware
   */
  private setupExpress(): void {
    // Setup monitoring middleware
    this.monitoring.setupExpressMiddleware(this.app);
    
    // Setup monitoring endpoints
    this.monitoring.setupMonitoringEndpoints(this.app);
    
    // CORS middleware
    this.app.use((req, res, next) => {
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
   * Setup Apollo Server with monitoring integration
   */
  private async setupApolloServer(): Promise<void> {
    this.apolloServer = new ApolloServer({
      typeDefs: await this.loadGraphQLSchema(),
      resolvers: this.createResolvers(),
      context: ({ req }) => ({
        // Pass monitoring components to resolvers
        logger: this.monitoring.logger,
        metrics: this.monitoring.metrics,
        
        // Pass dependencies
        dataAccess: this.dependencies.dataAccess,
        messageBroker: this.dependencies.messageBroker,
        cache: this.dependencies.cache,
        businessServices: this.dependencies.businessServices,
        
        // Request context
        request: req,
        correlationId: (req as any).correlationId,
        userId: (req as any).userId
      }),
      plugins: [
        // Performance monitoring plugin
        {
          requestDidStart() {
            return {
              willSendResponse(requestContext) {
                const { request, response } = requestContext;
                const duration = Date.now() - (request as any).startTime;
                
                // Log GraphQL operation performance
                if (request.operationName) {
                  requestContext.context.logger.info('GraphQL operation completed', {
                    operationName: request.operationName,
                    duration,
                    errors: response.errors?.length || 0
                  });
                  
                  // Record metrics
                  requestContext.context.metrics.recordApiResponse(
                    'POST',
                    `/graphql/${request.operationName}`,
                    response.errors ? 400 : 200,
                    duration
                  );
                }
              }
            };
          }
        }
      ]
    });
    
    await this.apolloServer.start();
    this.apolloServer.applyMiddleware({ 
      app: this.app, 
      path: '/graphql',
      cors: false // We handle CORS ourselves
    });
  }
  
  /**
   * Load GraphQL schema
   */
  private async loadGraphQLSchema(): Promise<string> {
    // This would load your actual GraphQL schema
    return `
      type Query {
        health: String
        user(id: ID!): User
      }
      
      type User {
        id: ID!
        email: String!
        name: String
      }
    `;
  }
  
  /**
   * Create GraphQL resolvers with monitoring integration
   */
  private createResolvers(): any {
    return {
      Query: {
        health: () => 'OK',
        
        user: async (parent: any, args: any, context: any) => {
          const { logger, metrics, dataAccess } = context;
          
          // Use database operation wrapper with metrics
          return withDatabaseMetrics('get', metrics, 'users')(async () => {
            logger.info('Fetching user', { userId: args.id });
            
            try {
              const user = await dataAccess.get({
                pk: `U#${args.id}`,
                sk: 'P'
              });
              
              if (!user) {
                logger.warn('User not found', { userId: args.id });
                return null;
              }
              
              logger.info('User fetched successfully', { userId: args.id });
              return user;
            } catch (error) {
              logger.error('Failed to fetch user', error as Error, { userId: args.id });
              throw error;
            }
          });
        }
      }
    };
  }
}

/**
 * Example of business service with monitoring integration
 */
export class UserService {
  constructor(
    private dataAccess: any,
    private messageBroker: any,
    private cache: any,
    private logger: any,
    private metrics: any
  ) {}
  
  async createUser(userData: any): Promise<any> {
    const correlationId = this.logger.getContext()?.correlationId;
    
    this.logger.info('Creating user', { email: userData.email, correlationId });
    
    // Use performance timer
    const timer = this.logger.startTimer('user_creation', 'users');
    
    try {
      // Database operation with metrics
      const user = await withDatabaseMetrics('put', this.metrics, 'users')(async () => {
        return this.dataAccess.put({
          pk: `U#${userData.id}`,
          sk: 'P',
          ...userData,
          createdAt: new Date().toISOString()
        });
      });
      
      // Message broker operation with metrics
      await withMessageBrokerMetrics('publish', this.metrics, 'user-events')(async () => {
        await this.messageBroker.publish('user.created', {
          userId: user.id,
          email: user.email,
          correlationId
        });
      });
      
      // Cache operation with metrics
      await withCacheMetrics('set', this.metrics)(async () => {
        await this.cache.set(`user:${user.id}`, user, 3600);
      });
      
      this.logger.info('User created successfully', { userId: user.id, correlationId });
      
      return user;
    } catch (error) {
      this.logger.error('Failed to create user', error as Error, { 
        email: userData.email, 
        correlationId 
      });
      throw error;
    } finally {
      timer.end({ operation: 'user_creation' });
    }
  }
  
  async getUserById(userId: string): Promise<any> {
    this.logger.info('Fetching user by ID', { userId });
    
    try {
      // Try cache first
      let user = await withCacheMetrics('get', this.metrics)(async () => {
        return this.cache.get(`user:${userId}`);
      }, true);
      
      if (user) {
        this.logger.info('User found in cache', { userId });
        return user;
      }
      
      // Fallback to database
      user = await withDatabaseMetrics('get', this.metrics, 'users')(async () => {
        return this.dataAccess.get({
          pk: `U#${userId}`,
          sk: 'P'
        });
      });
      
      if (user) {
        // Update cache
        await withCacheMetrics('set', this.metrics)(async () => {
          await this.cache.set(`user:${userId}`, user, 3600);
        });
        
        this.logger.info('User fetched from database', { userId });
      } else {
        this.logger.warn('User not found', { userId });
      }
      
      return user;
    } catch (error) {
      this.logger.error('Failed to fetch user', error as Error, { userId });
      throw error;
    }
  }
}