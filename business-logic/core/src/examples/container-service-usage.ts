import { ContainerService, ServerConfig } from '../container-services';
import { Request, Response } from 'express';

/**
 * Example GraphQL API container service implementation
 */
export class ExampleGraphQLService extends ContainerService {
  constructor(config: ServerConfig) {
    super(config);
  }

  protected getServiceName(): string {
    return 'example-graphql-api';
  }

  protected async setupRoutes(): Promise<void> {
    // GraphQL endpoint
    this.addRoute('post', '/graphql', 
      this.getAuthMiddleware().create(),
      async (req: Request, res: Response) => {
        try {
          // GraphQL processing would go here
          const query = req.body.query;
          const variables = req.body.variables;
          
          // Mock response
          const result = {
            data: {
              hello: 'World from GraphQL API'
            }
          };
          
          res.json(result);
        } catch (error) {
          throw error; // Let error middleware handle it
        }
      }
    );

    // GraphQL playground (development only)
    if (process.env.NODE_ENV !== 'production') {
      this.addRoute('get', '/graphql', (req: Request, res: Response) => {
        res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>GraphQL Playground</title>
            </head>
            <body>
              <div id="root">
                <p>GraphQL Playground would be here in a real implementation</p>
                <p>POST to /graphql with query and variables</p>
              </div>
            </body>
          </html>
        `);
      });
    }
  }
}

/**
 * Example REST API container service implementation
 */
export class ExampleRestAPIService extends ContainerService {
  constructor(config: ServerConfig) {
    super(config);
  }

  protected getServiceName(): string {
    return 'example-rest-api';
  }

  protected async setupRoutes(): Promise<void> {
    // Public routes
    this.addRoute('get', '/api/v1/status', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: this.getServiceName()
      });
    });

    // Protected routes
    this.addRoute('get', '/api/v1/users', 
      this.getAuthMiddleware().create(),
      async (req: Request, res: Response) => {
        const user = (req as any).user;
        
        // Mock user data
        const users = [
          { id: '1', email: 'user1@example.com', name: 'User One' },
          { id: '2', email: 'user2@example.com', name: 'User Two' }
        ];
        
        res.json({
          users,
          requestedBy: user.email
        });
      }
    );

    // User-specific routes
    this.addRoute('get', '/api/v1/users/:id',
      this.getAuthMiddleware().create(),
      this.getAuthMiddleware().requirePermission('users:read'),
      async (req: Request, res: Response) => {
        const userId = req.params.id;
        const user = (req as any).user;
        
        // Mock user lookup
        const userData = {
          id: userId,
          email: `user${userId}@example.com`,
          name: `User ${userId}`
        };
        
        res.json({
          user: userData,
          requestedBy: user.email
        });
      }
    );

    // Create user
    this.addRoute('post', '/api/v1/users',
      this.getAuthMiddleware().create(),
      this.getAuthMiddleware().requireRole('admin'),
      async (req: Request, res: Response) => {
        const { email, name } = req.body;
        const user = (req as any).user;
        
        // Validate input
        if (!email || !name) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Email and name are required',
              correlationId: (req as any).correlationId,
              retryable: false
            }
          });
          return;
        }
        
        // Mock user creation
        const newUser = {
          id: Date.now().toString(),
          email,
          name,
          createdAt: new Date().toISOString(),
          createdBy: user.email
        };
        
        res.status(201).json({
          user: newUser,
          message: 'User created successfully'
        });
      }
    );
  }
}

/**
 * Example usage of container services
 */
export async function exampleContainerServiceUsage() {
  // Configuration for GraphQL service
  const graphqlConfig: ServerConfig = {
    port: 4000,
    host: 'localhost',
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:8080'],
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS']
    },
    middleware: {
      requestLogging: true,
      compression: true,
      rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100
      },
      bodyParser: {
        json: { limit: '10mb' },
        urlencoded: { extended: true }
      }
    },
    security: {
      helmet: true,
      trustProxy: true,
      hidePoweredBy: true
    }
  };

  // Configuration for REST API service
  const restConfig: ServerConfig = {
    port: 3000,
    host: 'localhost',
    cors: {
      origin: true,
      credentials: true
    },
    middleware: {
      requestLogging: true,
      compression: true,
      rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000
      }
    }
  };

  try {
    // Create and start GraphQL service
    const graphqlService = new ExampleGraphQLService(graphqlConfig);
    await graphqlService.initialize();
    console.log('GraphQL service started on port 4000');

    // Create and start REST API service
    const restService = new ExampleRestAPIService(restConfig);
    await restService.initialize();
    console.log('REST API service started on port 3000');

    // Setup graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Shutting down services...');
      await Promise.all([
        graphqlService.shutdown(),
        restService.shutdown()
      ]);
      console.log('Services shut down successfully');
      process.exit(0);
    });

    // Health check example
    setTimeout(async () => {
      const graphqlHealth = await graphqlService.getHealthStatus();
      const restHealth = await restService.getHealthStatus();
      
      console.log('GraphQL Health:', graphqlHealth);
      console.log('REST API Health:', restHealth);
    }, 5000);

  } catch (error) {
    console.error('Failed to start services:', error);
    process.exit(1);
  }
}

// Example of extending container service with custom middleware
export class CustomContainerService extends ContainerService {
  constructor(config: ServerConfig) {
    super(config);
  }

  protected getServiceName(): string {
    return 'custom-service';
  }

  protected async setupRoutes(): Promise<void> {
    // Add custom middleware
    this.addMiddleware((req, res, next) => {
      res.setHeader('X-Custom-Header', 'MyTapTrack');
      next();
    });

    // Custom route with business logic
    this.addRoute('get', '/api/custom', async (req: Request, res: Response) => {
      const serviceContext = (req as any).serviceContext;
      
      // Use service context for business operations
      serviceContext.logger.info('Custom endpoint accessed', {
        correlationId: (req as any).correlationId
      });
      
      res.json({
        message: 'Custom endpoint response',
        timestamp: new Date().toISOString()
      });
    });
  }
}