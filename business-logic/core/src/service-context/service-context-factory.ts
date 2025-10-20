import { ServiceContext, ServiceConfig, IDataAccessLayer, IMessageBroker, IAuthenticationProvider, ICacheProvider, ILogger } from '../interfaces/service-context';
import { MessageBrokerFactory } from '../message-brokers/message-broker-factory';
import { AuthProviderFactory } from '../authentication/auth-provider-factory';
import { CacheProviderFactory } from '../cache-providers/cache-provider-factory';
import { ConfigurationLoader } from './configuration-loader';
import { DependencyContainer } from './dependency-container';
import { ServiceLogger } from './service-logger';
import { ConfigurationError } from '../errors/service-errors';

/**
 * Factory for creating ServiceContext instances based on environment configuration
 */
export class ServiceContextFactory {
  private static instance: ServiceContextFactory;
  private dependencyContainer: DependencyContainer;

  private constructor() {
    this.dependencyContainer = new DependencyContainer();
  }

  /**
   * Get singleton instance of ServiceContextFactory
   */
  public static getInstance(): ServiceContextFactory {
    if (!ServiceContextFactory.instance) {
      ServiceContextFactory.instance = new ServiceContextFactory();
    }
    return ServiceContextFactory.instance;
  }

  /**
   * Create ServiceContext based on environment configuration
   */
  public async createContext(configOverrides?: Partial<ServiceConfig>): Promise<ServiceContext> {
    try {
      // Load configuration
      const config = await ConfigurationLoader.loadConfiguration(configOverrides);
      
      // Validate configuration
      this.validateConfiguration(config);

      // Create or get cached service instances
      const dataAccess = await this.getOrCreateDataAccess(config);
      const messageBroker = await this.getOrCreateMessageBroker(config);
      const authentication = await this.getOrCreateAuthentication(config);
      const cache = await this.getOrCreateCache(config);
      const logger = await this.getOrCreateLogger(config);

      const context: ServiceContext = {
        dataAccess,
        messageBroker,
        authentication,
        cache,
        logger,
        config
      };

      return context;
    } catch (error) {
      throw new ConfigurationError(
        `Failed to create service context: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { configOverrides }
      );
    }
  }

  /**
   * Create ServiceContext for AWS environment
   */
  public async createAWSContext(configOverrides?: Partial<ServiceConfig>): Promise<ServiceContext> {
    const awsConfig: Partial<ServiceConfig> = {
      environment: 'aws',
      database: { provider: 'dynamodb' },
      messageBroker: { provider: 'eventbridge' },
      authentication: { provider: 'cognito' },
      cache: { provider: 'dynamodb' },
      ...configOverrides
    };

    return this.createContext(awsConfig);
  }

  /**
   * Create ServiceContext for Docker environment
   */
  public async createDockerContext(configOverrides?: Partial<ServiceConfig>): Promise<ServiceContext> {
    const dockerConfig: Partial<ServiceConfig> = {
      environment: 'docker',
      database: { provider: 'mongodb' },
      messageBroker: { provider: 'rabbitmq' },
      authentication: { provider: 'jwt' },
      cache: { provider: 'redis' },
      ...configOverrides
    };

    return this.createContext(dockerConfig);
  }

  /**
   * Shutdown all services and clean up resources
   */
  public async shutdown(): Promise<void> {
    await this.dependencyContainer.shutdown();
  }

  private validateConfiguration(config: ServiceConfig): void {
    if (!config.environment) {
      throw new ConfigurationError('Environment must be specified');
    }

    if (!config.database?.provider) {
      throw new ConfigurationError('Database provider must be specified');
    }

    if (!config.messageBroker?.provider) {
      throw new ConfigurationError('Message broker provider must be specified');
    }

    if (!config.authentication?.provider) {
      throw new ConfigurationError('Authentication provider must be specified');
    }

    if (!config.cache?.provider) {
      throw new ConfigurationError('Cache provider must be specified');
    }
  }

  private async getOrCreateDataAccess(config: ServiceConfig): Promise<IDataAccessLayer> {
    const key = `dataAccess:${config.database.provider}`;
    
    return this.dependencyContainer.getOrCreate(key, async () => {
      return this.createDataAccessProvider(config);
    });
  }

  private async getOrCreateMessageBroker(config: ServiceConfig): Promise<IMessageBroker> {
    const key = `messageBroker:${config.messageBroker.provider}`;
    
    return this.dependencyContainer.getOrCreate(key, async () => {
      const broker = MessageBrokerFactory.create(config.messageBroker);
      await broker.connect();
      return broker;
    });
  }

  private async getOrCreateAuthentication(config: ServiceConfig): Promise<IAuthenticationProvider> {
    const key = `authentication:${config.authentication.provider}`;
    
    return this.dependencyContainer.getOrCreate(key, async () => {
      return AuthProviderFactory.create(config.authentication);
    });
  }

  private async getOrCreateCache(config: ServiceConfig): Promise<ICacheProvider> {
    const key = `cache:${config.cache.provider}`;
    
    return this.dependencyContainer.getOrCreate(key, async () => {
      return this.createCacheProvider(config);
    });
  }

  private async getOrCreateLogger(config: ServiceConfig): Promise<ILogger> {
    const key = 'logger';
    
    return this.dependencyContainer.getOrCreate(key, async () => {
      return new ServiceLogger(config);
    });
  }

  private async createDataAccessProvider(config: ServiceConfig): Promise<IDataAccessLayer> {
    // This will be implemented when data access abstraction is available
    // For now, throw an error indicating the provider needs to be implemented
    throw new ConfigurationError(
      `Data access provider '${config.database.provider}' not yet implemented. ` +
      'This will be available after the data access abstraction layer is implemented.'
    );
  }

  private async createCacheProvider(config: ServiceConfig): Promise<ICacheProvider> {
    try {
      // Validate cache configuration
      CacheProviderFactory.validateConfig(config.cache);
      
      // Create cache provider based on environment
      return CacheProviderFactory.createForEnvironment(
        config.environment,
        config.cache
      );
    } catch (error) {
      throw new ConfigurationError(
        `Failed to create cache provider: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { cacheConfig: config.cache }
      );
    }
  }
}

/**
 * Simple in-memory cache provider for development/testing
 */
class InMemoryCacheProvider implements ICacheProvider {
  private cache = new Map<string, { value: any; expires?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (item.expires && Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expires = ttl ? Date.now() + (ttl * 1000) : undefined;
    this.cache.set(key, { value, expires });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(pattern?: string): Promise<void> {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  async isConnected(): Promise<boolean> {
    return true; // In-memory cache is always "connected"
  }
}