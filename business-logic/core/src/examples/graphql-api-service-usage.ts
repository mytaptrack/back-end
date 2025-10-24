import { GraphQLAPIService } from '../container-services/graphql-api-service';
import { ServerConfig } from '../container-services/interfaces';

/**
 * Example usage of GraphQL API Service
 */
async function createGraphQLAPIService() {
  // Configuration for GraphQL API service
  const config: ServerConfig = {
    port: 4000,
    host: 'localhost',
    
    // CORS configuration
    cors: {
      origin: ['http://localhost:3000', 'https://app.mytaptrack.com'],
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    },
    
    // Security configuration
    security: {
      helmet: true,
      trustProxy: true,
      hidePoweredBy: true
    },
    
    // Middleware configuration
    middleware: {
      requestLogging: true,
      compression: true,
      rateLimiting: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 100,
        skipSuccessfulRequests: false
      },
      bodyParser: {
        json: {
          limit: '10mb',
          strict: true
        }
      }
    },
    
    // GraphQL-specific configuration
    graphql: {
      schemaPath: './api/src/graphql/schema.graphql',
      playground: process.env.NODE_ENV !== 'production',
      introspection: process.env.NODE_ENV !== 'production',
      
      // Query complexity limits
      complexity: {
        maximumComplexity: 1000,
        scalarCost: 1,
        objectCost: 2,
        listFactor: 10
      },
      
      // Rate limiting for GraphQL
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 50 // Lower limit for GraphQL
      },
      
      // Logging configuration
      logging: {
        logRequests: true,
        logResponses: false, // Don't log responses in production
        logErrors: true,
        logSlowQueries: true,
        slowQueryThreshold: 1000 // 1 second
      }
    }
  };

  // Create and initialize the service
  const graphqlService = new GraphQLAPIService(config);
  
  try {
    await graphqlService.initialize();
    console.log('GraphQL API Service started successfully');
    console.log(`GraphQL endpoint: http://${config.host}:${config.port}/graphql`);
    
    if (config.graphql?.playground) {
      console.log(`GraphQL Playground: http://${config.host}:${config.port}/graphql`);
    }
    
    // Setup graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down gracefully');
      await graphqlService.shutdown();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('Received SIGINT, shutting down gracefully');
      await graphqlService.shutdown();
      process.exit(0);
    });
    
    return graphqlService;
    
  } catch (error) {
    console.error('Failed to start GraphQL API Service:', error);
    throw error;
  }
}

/**
 * Example with Docker environment configuration
 */
async function createDockerGraphQLAPIService() {
  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '4000'),
    host: '0.0.0.0', // Bind to all interfaces in container
    
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['*'],
      credentials: true
    },
    
    security: {
      helmet: true,
      trustProxy: true
    },
    
    middleware: {
      requestLogging: true,
      compression: true,
      rateLimiting: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
      }
    },
    
    graphql: {
      schemaPath: process.env.GRAPHQL_SCHEMA_PATH || './schema/schema.graphql',
      playground: process.env.NODE_ENV !== 'production',
      introspection: process.env.NODE_ENV !== 'production',
      
      complexity: {
        maximumComplexity: parseInt(process.env.GRAPHQL_MAX_COMPLEXITY || '1000')
      },
      
      rateLimit: {
        windowMs: parseInt(process.env.GRAPHQL_RATE_LIMIT_WINDOW_MS || '60000'),
        maxRequests: parseInt(process.env.GRAPHQL_RATE_LIMIT_MAX_REQUESTS || '50')
      },
      
      logging: {
        logRequests: process.env.GRAPHQL_LOG_REQUESTS === 'true',
        logResponses: process.env.GRAPHQL_LOG_RESPONSES === 'true',
        logErrors: true,
        logSlowQueries: true,
        slowQueryThreshold: parseInt(process.env.GRAPHQL_SLOW_QUERY_THRESHOLD || '1000')
      }
    }
  };

  const graphqlService = new GraphQLAPIService(config);
  await graphqlService.initialize();
  
  return graphqlService;
}

/**
 * Health check example
 */
async function checkGraphQLServiceHealth(service: GraphQLAPIService) {
  try {
    const healthStatus = await service.getHealthStatus();
    
    console.log('GraphQL Service Health Status:', {
      healthy: healthStatus.healthy,
      uptime: healthStatus.uptime,
      checks: healthStatus.checks,
      timestamp: healthStatus.timestamp
    });
    
    return healthStatus.healthy;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

// Export examples
export {
  createGraphQLAPIService,
  createDockerGraphQLAPIService,
  checkGraphQLServiceHealth
};

// Example usage (commented out to prevent execution during import)
/*
async function main() {
  try {
    const service = await createGraphQLAPIService();
    
    // Check health periodically
    setInterval(async () => {
      await checkGraphQLServiceHealth(service);
    }, 30000); // Every 30 seconds
    
  } catch (error) {
    console.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Uncomment to run
// main().catch(console.error);
*/