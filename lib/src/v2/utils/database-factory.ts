/**
 * Database provider factory
 * Creates appropriate database provider instances based on configuration
 */

import { 
  DatabaseConfig, 
  IDataAccessLayer, 
  DatabaseProviderType 
} from '../types/database-abstraction';
import { ConfigurationError } from '../types/database-errors';
import { DatabaseConfigValidator } from './database-config';

/**
 * Database provider factory class
 * Responsible for creating database provider instances based on configuration
 */
export class DatabaseProviderFactory {
  private static instances: Map<string, IDataAccessLayer> = new Map();

  /**
   * Create a database provider instance based on configuration
   */
  static create(config: DatabaseConfig): IDataAccessLayer {
    // Validate configuration first
    DatabaseConfigValidator.validate(config);

    // Generate cache key based on configuration
    const cacheKey = this.generateCacheKey(config);
    
    // Return cached instance if available
    if (this.instances.has(cacheKey)) {
      const instance = this.instances.get(cacheKey)!;
      if (instance.isConnected()) {
        return instance;
      } else {
        // Remove disconnected instance from cache
        this.instances.delete(cacheKey);
      }
    }

    // Create new instance based on provider type
    let provider: IDataAccessLayer;

    switch (config.provider) {
      case 'dynamodb':
        provider = this.createDynamoDBProvider(config);
        break;
      case 'mongodb':
        provider = this.createMongoDBProvider(config);
        break;
      default:
        throw new ConfigurationError(
          `Unsupported database provider: ${config.provider}. Supported providers: dynamodb, mongodb`
        );
    }

    // Cache the instance
    this.instances.set(cacheKey, provider);

    return provider;
  }

  /**
   * Create a database provider instance without caching
   */
  static createUncached(config: DatabaseConfig): IDataAccessLayer {
    // Validate configuration first
    DatabaseConfigValidator.validate(config);

    switch (config.provider) {
      case 'dynamodb':
        return this.createDynamoDBProvider(config);
      case 'mongodb':
        return this.createMongoDBProvider(config);
      default:
        throw new ConfigurationError(
          `Unsupported database provider: ${config.provider}. Supported providers: dynamodb, mongodb`
        );
    }
  }

  /**
   * Get a cached provider instance by configuration
   */
  static getCached(config: DatabaseConfig): IDataAccessLayer | null {
    const cacheKey = this.generateCacheKey(config);
    const instance = this.instances.get(cacheKey);
    
    if (instance && instance.isConnected()) {
      return instance;
    }

    // Remove disconnected instance from cache
    if (instance) {
      this.instances.delete(cacheKey);
    }

    return null;
  }

  /**
   * Clear all cached instances
   */
  static async clearCache(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];

    for (const [key, instance] of this.instances.entries()) {
      if (instance.isConnected()) {
        disconnectPromises.push(instance.disconnect());
      }
    }

    await Promise.all(disconnectPromises);
    this.instances.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { total: number; connected: number; disconnected: number } {
    let connected = 0;
    let disconnected = 0;

    for (const instance of this.instances.values()) {
      if (instance.isConnected()) {
        connected++;
      } else {
        disconnected++;
      }
    }

    return {
      total: this.instances.size,
      connected,
      disconnected
    };
  }

  /**
   * Validate provider availability
   */
  static validateProviderAvailability(provider: DatabaseProviderType): void {
    switch (provider) {
      case 'dynamodb':
        this.validateDynamoDBAvailability();
        break;
      case 'mongodb':
        this.validateMongoDBAvailability();
        break;
      default:
        throw new ConfigurationError(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Get list of supported providers
   */
  static getSupportedProviders(): DatabaseProviderType[] {
    return ['dynamodb', 'mongodb'];
  }

  /**
   * Check if a provider is supported
   */
  static isProviderSupported(provider: string): provider is DatabaseProviderType {
    return this.getSupportedProviders().includes(provider as DatabaseProviderType);
  }

  /**
   * Create DynamoDB provider instance
   */
  private static createDynamoDBProvider(config: DatabaseConfig): IDataAccessLayer {
    if (!config.dynamodb) {
      throw new ConfigurationError('DynamoDB configuration is required');
    }

    try {
      // Import DynamoDB provider dynamically to avoid circular dependencies
      // Note: This will be implemented in a future task
      throw new ConfigurationError('DynamoDB provider implementation not yet available. This will be implemented in task 3.');
    } catch (error) {
      if (error instanceof Error) {
        throw new ConfigurationError(`Failed to create DynamoDB provider: ${error.message}`);
      }
      throw new ConfigurationError('Failed to create DynamoDB provider: Unknown error');
    }
  }

  /**
   * Create MongoDB provider instance
   */
  private static createMongoDBProvider(config: DatabaseConfig): IDataAccessLayer {
    if (!config.mongodb) {
      throw new ConfigurationError('MongoDB configuration is required');
    }

    try {
      // Import MongoDB provider
      const { MongoDBProvider } = require('../providers/mongodb-provider');
      return new MongoDBProvider(config.mongodb);
    } catch (error) {
      if (error instanceof Error) {
        throw new ConfigurationError(`Failed to create MongoDB provider: ${error.message}`);
      }
      throw new ConfigurationError('Failed to create MongoDB provider: Unknown error');
    }
  }

  /**
   * Generate cache key for configuration
   */
  private static generateCacheKey(config: DatabaseConfig): string {
    const keyParts: string[] = [config.provider];

    switch (config.provider) {
      case 'dynamodb':
        if (config.dynamodb) {
          keyParts.push(
            config.dynamodb.region,
            config.dynamodb.primaryTable,
            config.dynamodb.dataTable,
            String(config.dynamodb.consistentRead),
            config.dynamodb.endpoint || 'default'
          );
        }
        break;
      case 'mongodb':
        if (config.mongodb) {
          keyParts.push(
            config.mongodb.connectionString,
            config.mongodb.database,
            config.mongodb.collections.primary,
            config.mongodb.collections.data
          );
        }
        break;
    }

    return keyParts.join('|');
  }

  /**
   * Validate DynamoDB availability
   */
  private static validateDynamoDBAvailability(): void {
    try {
      // Check if AWS SDK is available
      require('@aws-sdk/client-dynamodb');
    } catch (error) {
      throw new ConfigurationError(
        'DynamoDB provider requires @aws-sdk/client-dynamodb to be installed. ' +
        'Run: npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb'
      );
    }
  }

  /**
   * Validate MongoDB availability
   */
  private static validateMongoDBAvailability(): void {
    try {
      // Check if MongoDB driver is available
      require('mongodb');
    } catch (error) {
      throw new ConfigurationError(
        'MongoDB provider requires mongodb driver to be installed. ' +
        'Run: npm install mongodb'
      );
    }
  }
}

/**
 * Provider registry for managing available database providers
 */
export class DatabaseProviderRegistry {
  private static providers: Map<DatabaseProviderType, any> = new Map();

  /**
   * Register a database provider implementation
   */
  static register(providerType: DatabaseProviderType, providerClass: any): void {
    this.providers.set(providerType, providerClass);
  }

  /**
   * Get a registered provider implementation
   */
  static get(providerType: DatabaseProviderType): any {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new ConfigurationError(`Provider ${providerType} is not registered`);
    }
    return provider;
  }

  /**
   * Check if a provider is registered
   */
  static isRegistered(providerType: DatabaseProviderType): boolean {
    return this.providers.has(providerType);
  }

  /**
   * Get all registered providers
   */
  static getRegisteredProviders(): DatabaseProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Unregister a provider
   */
  static unregister(providerType: DatabaseProviderType): void {
    this.providers.delete(providerType);
  }

  /**
   * Clear all registered providers
   */
  static clear(): void {
    this.providers.clear();
  }
}

/**
 * Configuration manager for handling database configuration lifecycle
 */
export class DatabaseConfigurationManager {
  private static currentConfig: DatabaseConfig | null = null;
  private static currentProvider: IDataAccessLayer | null = null;

  /**
   * Initialize database configuration and provider
   */
  static async initialize(config: DatabaseConfig): Promise<IDataAccessLayer> {
    // Validate configuration
    DatabaseConfigValidator.validate(config);

    // Create provider
    const provider = DatabaseProviderFactory.create(config);

    // Connect to database
    await provider.connect();

    // Store current configuration and provider
    this.currentConfig = config;
    this.currentProvider = provider;

    return provider;
  }

  /**
   * Get current configuration
   */
  static getCurrentConfig(): DatabaseConfig | null {
    return this.currentConfig;
  }

  /**
   * Get current provider
   */
  static getCurrentProvider(): IDataAccessLayer | null {
    return this.currentProvider;
  }

  /**
   * Switch to a different database provider
   */
  static async switchProvider(newConfig: DatabaseConfig): Promise<IDataAccessLayer> {
    // Disconnect current provider if exists
    if (this.currentProvider && this.currentProvider.isConnected()) {
      await this.currentProvider.disconnect();
    }

    // Initialize new provider
    return this.initialize(newConfig);
  }

  /**
   * Shutdown current provider
   */
  static async shutdown(): Promise<void> {
    if (this.currentProvider && this.currentProvider.isConnected()) {
      await this.currentProvider.disconnect();
    }

    this.currentConfig = null;
    this.currentProvider = null;

    // Clear factory cache
    await DatabaseProviderFactory.clearCache();
  }

  /**
   * Check if configuration manager is initialized
   */
  static isInitialized(): boolean {
    return this.currentConfig !== null && this.currentProvider !== null;
  }

  /**
   * Validate current provider health
   */
  static async validateHealth(): Promise<boolean> {
    if (!this.currentProvider) {
      return false;
    }

    try {
      const health = await this.currentProvider.healthCheck();
      return health.healthy;
    } catch {
      return false;
    }
  }
}