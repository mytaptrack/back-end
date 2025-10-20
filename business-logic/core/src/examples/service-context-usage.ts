/**
 * Example usage of the Service Context and Dependency Injection system
 * 
 * Expected Environment Variables:
 * 
 * AWS Environment:
 * - AWS_REGION: AWS region (default: us-east-1)
 * - PRIMARY_TABLE_NAME: Primary DynamoDB table name (default: mytaptrack-primary)
 * - DATA_TABLE_NAME: Data DynamoDB table name (default: mytaptrack-data)
 * - CACHE_TABLE_NAME: Cache DynamoDB table name (default: mytaptrack-cache)
 * - EVENT_BUS_NAME: EventBridge event bus name (default: mytaptrack-events)
 * - COGNITO_USER_POOL_ID: Cognito User Pool ID
 * - COGNITO_CLIENT_ID: Cognito Client ID
 * 
 * Docker Environment:
 * - MONGODB_CONNECTION_STRING: MongoDB connection string (default: mongodb://localhost:27017/mytaptrack-dev)
 * - RABBITMQ_CONNECTION_STRING: RabbitMQ connection string (default: amqp://localhost:5672)
 * - REDIS_CONNECTION_STRING: Redis connection string (default: redis://localhost:6379)
 * - CACHE_KEY_PREFIX: Cache key prefix (default: mytaptrack:)
 * - JWT_PUBLIC_KEY: JWT public key for token verification
 * - JWT_ISSUER: JWT issuer (default: mytaptrack-dev)
 * - JWT_AUDIENCE: JWT audience (default: mytaptrack-api)
 */

import {
  ServiceContextFactory,
  ServiceLifecycleManager,
  DependencyContainer,
  ServiceConfig,
  ServiceContext,
  IBusinessService
} from '../index';

/**
 * Example: Creating a service context for AWS environment
 */
export async function createAWSServiceContext(): Promise<ServiceContext> {
  const factory = ServiceContextFactory.getInstance();

  // Create AWS-specific context
  const context = await factory.createAWSContext({
    // Optional overrides
    database: {
      provider: 'dynamodb',
      region: process.env.AWS_REGION || 'us-east-1',
      tables: {
        primary: process.env.PRIMARY_TABLE_NAME || 'mytaptrack-primary',
        data: process.env.DATA_TABLE_NAME || 'mytaptrack-data'
      }
    }
  });

  return context;
}

/**
 * Example: Creating a service context for Docker environment
 */
export async function createDockerServiceContext(): Promise<ServiceContext> {
  const factory = ServiceContextFactory.getInstance();

  // Create Docker-specific context
  const context = await factory.createDockerContext({
    // Optional overrides
    database: {
      provider: 'mongodb',
      connectionString: process.env.MONGODB_CONNECTION_STRING || 'mongodb://localhost:27017/mytaptrack'
    },
    messageBroker: {
      provider: 'rabbitmq',
      connectionString: process.env.RABBITMQ_CONNECTION_STRING || 'amqp://localhost:5672'
    },
    cache: {
      provider: 'redis',
      connectionString: process.env.REDIS_CONNECTION_STRING || 'redis://localhost:6379',
      keyPrefix: process.env.CACHE_KEY_PREFIX || 'mytaptrack:'
    }
  });

  return context;
}

/**
 * Example: Using service lifecycle manager for graceful startup/shutdown
 */
export async function runServiceWithLifecycleManagement(): Promise<void> {
  const lifecycleManager = new ServiceLifecycleManager();

  try {
    // Create service context
    const factory = ServiceContextFactory.getInstance();
    const context = await factory.createContext();

    // Initialize services with lifecycle management
    await lifecycleManager.initialize(context);

    // Add custom shutdown handler
    lifecycleManager.addShutdownHandler(async () => {
      console.log('Performing custom cleanup...');
      // Custom cleanup logic here
    });

    // Your application logic here
    console.log('Service is running...');

    // The lifecycle manager will handle graceful shutdown on process signals

  } catch (error) {
    console.error('Failed to start service:', error);
    await lifecycleManager.shutdown();
    throw error;
  }
}

/**
 * Example: Custom business service implementation
 */
export class ExampleBusinessService implements IBusinessService {
  private context?: ServiceContext;
  private isInitialized = false;

  async initialize(context: ServiceContext): Promise<void> {
    this.context = context;

    // Initialize service-specific resources
    this.context.logger.info('Initializing ExampleBusinessService');

    // Example: Subscribe to events
    await this.context.messageBroker.subscribe('user.created', async (message) => {
      this.context?.logger.info('Received user.created event', { message });
      // Handle user creation event
    });

    this.isInitialized = true;
    this.context.logger.info('ExampleBusinessService initialized successfully');
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized || !this.context) {
      return;
    }

    this.context.logger.info('Shutting down ExampleBusinessService');

    // Cleanup resources
    await this.context.messageBroker.unsubscribe('user.created');

    this.isInitialized = false;
    this.context.logger.info('ExampleBusinessService shutdown completed');
  }

  async createUser(userData: any): Promise<any> {
    if (!this.context) {
      throw new Error('Service not initialized');
    }

    // Use data access layer
    await this.context.dataAccess.put(userData);

    // Publish event
    await this.context.messageBroker.publish('user.created', { userId: userData.userId });

    // Log operation
    this.context.logger.info('User created successfully', { userId: userData.userId });

    return userData;
  }
}

/**
 * Example: Using dependency container for custom services
 */
export async function setupCustomServices(): Promise<DependencyContainer> {
  const container = new DependencyContainer();

  // Register a singleton service
  container.register('userService', async () => {
    const service = new ExampleBusinessService();
    // Service will be initialized when retrieved
    return service;
  }, { singleton: true });

  // Register a factory service (new instance each time)
  container.register('requestHandler', async () => {
    return {
      handleRequest: (request: any) => {
        console.log('Handling request:', request);
      }
    };
  }, { singleton: false });

  // Register an instance directly
  const configService = {
    getConfig: () => ({ environment: 'production' })
  };
  container.registerInstance('configService', configService);

  return container;
}

/**
 * Example: Environment-specific configuration
 */
export function getEnvironmentSpecificConfig(): Partial<ServiceConfig> {
  const environment = process.env.NODE_ENV || 'development';

  switch (environment) {
    case 'production':
      return {
        environment: 'aws',
        database: {
          provider: 'dynamodb',
          region: process.env.AWS_REGION || 'us-east-1',
          tables: {
            primary: process.env.PRIMARY_TABLE_NAME || 'mytaptrack-primary',
            data: process.env.DATA_TABLE_NAME || 'mytaptrack-data',
            cache: process.env.CACHE_TABLE_NAME || 'mytaptrack-cache'
          }
        },
        messageBroker: {
          provider: 'eventbridge',
          region: process.env.AWS_REGION || 'us-east-1',
          eventBusName: process.env.EVENT_BUS_NAME || 'mytaptrack-events'
        },
        authentication: {
          provider: 'cognito',
          region: process.env.AWS_REGION || 'us-east-1',
          userPoolId: process.env.COGNITO_USER_POOL_ID || '',
          clientId: process.env.COGNITO_CLIENT_ID || ''
        },
        cache: {
          provider: 'dynamodb',
          region: process.env.AWS_REGION || 'us-east-1',
          dynamodb: {
            tableName: process.env.CACHE_TABLE_NAME || 'mytaptrack-cache'
          }
        }
      };

    case 'development':
      return {
        environment: 'docker',
        database: {
          provider: 'mongodb',
          connectionString: process.env.MONGODB_CONNECTION_STRING || 'mongodb://localhost:27017/mytaptrack-dev'
        },
        messageBroker: {
          provider: 'rabbitmq',
          connectionString: process.env.RABBITMQ_CONNECTION_STRING || 'amqp://localhost:5672'
        },
        authentication: {
          provider: 'jwt',
          publicKey: process.env.JWT_PUBLIC_KEY || '',
          issuer: process.env.JWT_ISSUER || 'mytaptrack-dev',
          audience: process.env.JWT_AUDIENCE || 'mytaptrack-api'
        },
        cache: {
          provider: 'redis',
          connectionString: process.env.REDIS_CONNECTION_STRING || 'redis://localhost:6379',
          keyPrefix: process.env.CACHE_KEY_PREFIX || 'mytaptrack:'
        }
      };

    default:
      throw new Error(`Unknown environment: ${environment}`);
  }
}

/**
 * Example: Complete application setup
 */
export async function setupApplication(): Promise<{
  context: ServiceContext;
  lifecycleManager: ServiceLifecycleManager;
  container: DependencyContainer;
}> {
  // Get environment-specific configuration
  const envConfig = getEnvironmentSpecificConfig();

  // Create service context
  const factory = ServiceContextFactory.getInstance();
  const context = await factory.createContext(envConfig);

  // Setup lifecycle management
  const lifecycleManager = new ServiceLifecycleManager();
  await lifecycleManager.initialize(context);

  // Setup custom services
  const container = await setupCustomServices();

  // Register business services in the container
  container.register('exampleService', async () => {
    const service = new ExampleBusinessService();
    await service.initialize(context);
    return service;
  });

  context.logger.info('Application setup completed successfully');

  return { context, lifecycleManager, container };
}

/**
 * Example: Graceful application shutdown
 */
export async function shutdownApplication(
  lifecycleManager: ServiceLifecycleManager,
  container: DependencyContainer
): Promise<void> {
  console.log('Starting application shutdown...');

  try {
    // Shutdown custom services
    await container.shutdown();

    // Shutdown core services
    await lifecycleManager.shutdown();

    // Shutdown service context factory
    const factory = ServiceContextFactory.getInstance();
    await factory.shutdown();

    console.log('Application shutdown completed successfully');
  } catch (error) {
    console.error('Error during application shutdown:', error);
    throw error;
  }
}