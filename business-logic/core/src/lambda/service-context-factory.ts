import { ServiceContext, IDataAccessLayer, IMessageBroker, IAuthenticationProvider, ICacheProvider, ILogger } from '../interfaces/service-context';

/**
 * Factory for creating service context in AWS Lambda environment
 */
export class LambdaServiceContextFactory {
  private static instance: ServiceContext | null = null;

  /**
   * Create or get cached service context for Lambda functions
   */
  static async createServiceContext(): Promise<ServiceContext> {
    // Use singleton pattern for Lambda container reuse
    if (LambdaServiceContextFactory.instance) {
      return LambdaServiceContextFactory.instance;
    }

    // Load configuration - use a simple config for Lambda
    const config = {
      database: {
        provider: 'dynamodb' as const,
        region: process.env.AWS_REGION || 'us-east-1',
        tables: {
          primary: process.env.PRIMARY_TABLE || 'primary',
          data: process.env.DATA_TABLE || 'data'
        }
      },
      messageBroker: {
        provider: 'eventbridge' as const,
        region: process.env.AWS_REGION || 'us-east-1',
        eventBusName: process.env.EVENT_BUS_NAME || 'default'
      },
      authentication: {
        provider: 'cognito' as const,
        userPoolId: process.env.USER_POOL_ID || '',
        region: process.env.AWS_REGION || 'us-east-1'
      },
      cache: {
        provider: 'dynamodb' as const,
        region: process.env.AWS_REGION || 'us-east-1'
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info'
      }
    };

    // Create service context
    const context: ServiceContext = {
      dataAccess: await LambdaServiceContextFactory.createDataAccessLayer(config),
      messageBroker: await LambdaServiceContextFactory.createMessageBroker(config),
      authentication: await LambdaServiceContextFactory.createAuthenticationProvider(config),
      cache: await LambdaServiceContextFactory.createCacheProvider(config),
      logger: LambdaServiceContextFactory.createLogger(config),
      config: {
        environment: 'aws',
        database: config.database,
        messageBroker: config.messageBroker,
        authentication: config.authentication,
        cache: config.cache,
        correlationId: process.env.AWS_REQUEST_ID || 'lambda-' + Date.now()
      }
    };

    // Cache the instance
    LambdaServiceContextFactory.instance = context;

    return context;
  }

  /**
   * Create data access layer for AWS environment
   */
  private static async createDataAccessLayer(config: any): Promise<IDataAccessLayer> {
    // Import dynamically to avoid loading unused providers
    const { DynamoDBProvider } = await import('../data-access/dynamodb-provider');
    return new DynamoDBProvider(config.database);
  }

  /**
   * Create message broker for AWS environment
   */
  private static async createMessageBroker(config: any): Promise<IMessageBroker> {
    // Import dynamically to avoid loading unused providers
    const { EventBridgeMessageBroker } = await import('../message-brokers/eventbridge-broker');
    return new EventBridgeMessageBroker(config.messageBroker);
  }

  /**
   * Create authentication provider for AWS environment
   */
  private static async createAuthenticationProvider(config: any): Promise<IAuthenticationProvider> {
    // Import dynamically to avoid loading unused providers
    const { CognitoAuthenticationProvider } = await import('../authentication/cognito-provider');
    return new CognitoAuthenticationProvider(config.authentication);
  }

  /**
   * Create cache provider for AWS environment
   */
  private static async createCacheProvider(config: any): Promise<ICacheProvider> {
    // Import dynamically to avoid loading unused providers
    const { DynamoDBCacheProvider } = await import('../cache-providers/dynamodb-cache-provider');
    return new DynamoDBCacheProvider(config.cache);
  }

  /**
   * Create logger for AWS environment
   */
  private static createLogger(config: any): ILogger {
    // Import dynamically to avoid loading unused providers
    const { LambdaLogger } = require('../logging/lambda-logger');
    return new LambdaLogger(config.logging);
  }

  /**
   * Reset the cached instance (useful for testing)
   */
  static reset(): void {
    LambdaServiceContextFactory.instance = null;
  }
}

/**
 * Convenience function for Lambda handlers
 */
export async function createLambdaServiceContext(): Promise<ServiceContext> {
  return LambdaServiceContextFactory.createServiceContext();
}