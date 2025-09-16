/**
 * Database configuration helper utilities
 * Provides convenient functions for common configuration scenarios
 */

import { DatabaseConfig, DatabaseProviderType } from '../types/database-abstraction';
import { DatabaseConfigLoader, DB_CONFIG_ENV_VARS } from './database-config';
import { ConfigurationError } from '../types/database-errors';

/**
 * Configuration helper class with convenient methods for common scenarios
 */
export class DatabaseConfigHelper {
  /**
   * Create a quick DynamoDB configuration for development
   */
  static createDynamoDBConfig(options: {
    region?: string;
    primaryTable: string;
    dataTable: string;
    consistentRead?: boolean;
    endpoint?: string; // For local DynamoDB
  }): DatabaseConfig {
    return {
      provider: 'dynamodb',
      dynamodb: {
        region: options.region || 'us-east-1',
        primaryTable: options.primaryTable,
        dataTable: options.dataTable,
        consistentRead: options.consistentRead || false,
        endpoint: options.endpoint
      },
      migration: {
        enabled: false,
        batchSize: 100,
        validateAfterMigration: true
      }
    };
  }

  /**
   * Create a quick MongoDB configuration for development
   */
  static createMongoDBConfig(options: {
    connectionString: string;
    database: string;
    primaryCollection?: string;
    dataCollection?: string;
    maxPoolSize?: number;
  }): DatabaseConfig {
    return {
      provider: 'mongodb',
      mongodb: {
        connectionString: options.connectionString,
        database: options.database,
        collections: {
          primary: options.primaryCollection || 'primary_data',
          data: options.dataCollection || 'application_data'
        },
        options: {
          maxPoolSize: options.maxPoolSize || 10,
          minPoolSize: 2,
          maxIdleTimeMS: 30000,
          serverSelectionTimeoutMS: 5000
        }
      },
      migration: {
        enabled: false,
        batchSize: 100,
        validateAfterMigration: true
      }
    };
  }

  /**
   * Create configuration for local development with DynamoDB Local
   */
  static createLocalDynamoDBConfig(options: {
    primaryTable: string;
    dataTable: string;
    port?: number;
  }): DatabaseConfig {
    const port = options.port || 8000;
    return this.createDynamoDBConfig({
      region: 'local',
      primaryTable: options.primaryTable,
      dataTable: options.dataTable,
      consistentRead: true,
      endpoint: `http://localhost:${port}`
    });
  }

  /**
   * Create configuration for local development with MongoDB
   */
  static createLocalMongoDBConfig(options: {
    database: string;
    port?: number;
    host?: string;
  }): DatabaseConfig {
    const host = options.host || 'localhost';
    const port = options.port || 27017;
    const connectionString = `mongodb://${host}:${port}`;

    return this.createMongoDBConfig({
      connectionString,
      database: options.database
    });
  }

  /**
   * Load configuration with fallback options
   */
  static loadConfigWithFallback(options?: {
    configFile?: string;
    fallbackProvider?: DatabaseProviderType;
    fallbackConfig?: Partial<DatabaseConfig>;
  }): Promise<DatabaseConfig> {
    return new Promise(async (resolve, reject) => {
      try {
        // Try loading from file first if specified
        if (options?.configFile) {
          try {
            const config = await DatabaseConfigLoader.loadFromFile(options.configFile);
            resolve(config);
            return;
          } catch (error) {
            console.warn(`Failed to load config from file ${options.configFile}, trying environment variables`);
          }
        }

        // Try loading from environment variables
        try {
          const config = DatabaseConfigLoader.loadFromEnvironment();
          resolve(config);
          return;
        } catch (error) {
          console.warn('Failed to load config from environment variables, trying fallback');
        }

        // Use fallback configuration if provided
        if (options?.fallbackConfig) {
          const config = DatabaseConfigLoader.loadFromConfig(options.fallbackConfig);
          resolve(config);
          return;
        }

        // Use fallback provider with minimal configuration
        if (options?.fallbackProvider) {
          const config = this.createMinimalConfig(options.fallbackProvider);
          resolve(config);
          return;
        }

        reject(new ConfigurationError(
          'Unable to load database configuration. Please provide configuration via environment variables, config file, or fallback options.'
        ));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Validate environment variables are set for a specific provider
   */
  static validateEnvironmentForProvider(provider: DatabaseProviderType): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    switch (provider) {
      case 'dynamodb':
        if (!process.env[DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE]) {
          missing.push(DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE);
        }
        if (!process.env[DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE]) {
          missing.push(DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE);
        }
        break;

      case 'mongodb':
        if (!process.env[DB_CONFIG_ENV_VARS.MONGODB_CONNECTION_STRING]) {
          missing.push(DB_CONFIG_ENV_VARS.MONGODB_CONNECTION_STRING);
        }
        if (!process.env[DB_CONFIG_ENV_VARS.MONGODB_DATABASE]) {
          missing.push(DB_CONFIG_ENV_VARS.MONGODB_DATABASE);
        }
        break;
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Generate environment variable template for a provider
   */
  static generateEnvironmentTemplate(provider: DatabaseProviderType): Record<string, string> {
    const template: Record<string, string> = {
      [DB_CONFIG_ENV_VARS.PROVIDER]: provider
    };

    switch (provider) {
      case 'dynamodb':
        template[DB_CONFIG_ENV_VARS.DYNAMODB_REGION] = 'us-east-1';
        template[DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE] = 'your-primary-table';
        template[DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE] = 'your-data-table';
        template[DB_CONFIG_ENV_VARS.DYNAMODB_CONSISTENT_READ] = 'false';
        template[`${DB_CONFIG_ENV_VARS.DYNAMODB_ENDPOINT}_COMMENT`] = '# Optional: for local DynamoDB';
        template[DB_CONFIG_ENV_VARS.DYNAMODB_ENDPOINT] = 'http://localhost:8000';
        break;

      case 'mongodb':
        template[DB_CONFIG_ENV_VARS.MONGODB_CONNECTION_STRING] = 'mongodb://localhost:27017';
        template[DB_CONFIG_ENV_VARS.MONGODB_DATABASE] = 'your-database';
        template[DB_CONFIG_ENV_VARS.MONGODB_PRIMARY_COLLECTION] = 'primary_data';
        template[DB_CONFIG_ENV_VARS.MONGODB_DATA_COLLECTION] = 'application_data';
        template[DB_CONFIG_ENV_VARS.MONGODB_MAX_POOL_SIZE] = '10';
        template[DB_CONFIG_ENV_VARS.MONGODB_MIN_POOL_SIZE] = '2';
        break;
    }

    // Add migration settings
    template[DB_CONFIG_ENV_VARS.MIGRATION_ENABLED] = 'false';
    template[DB_CONFIG_ENV_VARS.MIGRATION_BATCH_SIZE] = '100';
    template[DB_CONFIG_ENV_VARS.MIGRATION_VALIDATE_AFTER] = 'true';

    return template;
  }

  /**
   * Create configuration from connection string (for MongoDB)
   */
  static createConfigFromConnectionString(connectionString: string, database: string): DatabaseConfig {
    if (!connectionString.startsWith('mongodb://') && !connectionString.startsWith('mongodb+srv://')) {
      throw new ConfigurationError('Invalid MongoDB connection string format');
    }

    return this.createMongoDBConfig({
      connectionString,
      database
    });
  }

  /**
   * Create configuration for AWS environment
   */
  static createAWSConfig(options: {
    region: string;
    primaryTable: string;
    dataTable: string;
    consistentRead?: boolean;
  }): DatabaseConfig {
    return this.createDynamoDBConfig({
      region: options.region,
      primaryTable: options.primaryTable,
      dataTable: options.dataTable,
      consistentRead: options.consistentRead || false
    });
  }

  /**
   * Merge multiple configuration sources
   */
  static mergeConfigurations(configs: Partial<DatabaseConfig>[]): DatabaseConfig {
    if (configs.length === 0) {
      throw new ConfigurationError('At least one configuration must be provided');
    }

    let merged: Partial<DatabaseConfig> = {};

    for (const config of configs) {
      merged = {
        ...merged,
        ...config,
        dynamodb: config.dynamodb ? { ...merged.dynamodb, ...config.dynamodb } : merged.dynamodb,
        mongodb: config.mongodb ? { ...merged.mongodb, ...config.mongodb } : merged.mongodb,
        migration: config.migration ? { ...merged.migration, ...config.migration } : merged.migration
      };
    }

    if (!merged.provider) {
      throw new ConfigurationError('Provider must be specified in at least one configuration');
    }

    return DatabaseConfigLoader.loadFromConfig(merged);
  }

  /**
   * Create minimal configuration for testing
   */
  static createTestConfig(provider: DatabaseProviderType): DatabaseConfig {
    switch (provider) {
      case 'dynamodb':
        return this.createLocalDynamoDBConfig({
          primaryTable: 'test-primary',
          dataTable: 'test-data'
        });
      case 'mongodb':
        return this.createLocalMongoDBConfig({
          database: 'test-database'
        });
      default:
        throw new ConfigurationError(`Unsupported provider for test config: ${provider}`);
    }
  }

  /**
   * Create minimal configuration with required fields only
   */
  private static createMinimalConfig(provider: DatabaseProviderType): DatabaseConfig {
    switch (provider) {
      case 'dynamodb':
        return {
          provider: 'dynamodb',
          dynamodb: {
            region: 'us-east-1',
            primaryTable: 'default-primary',
            dataTable: 'default-data',
            consistentRead: false
          },
          migration: {
            enabled: false,
            batchSize: 100
          }
        };
      case 'mongodb':
        return {
          provider: 'mongodb',
          mongodb: {
            connectionString: 'mongodb://localhost:27017',
            database: 'default-database',
            collections: {
              primary: 'primary_data',
              data: 'application_data'
            }
          },
          migration: {
            enabled: false,
            batchSize: 100
          }
        };
      default:
        throw new ConfigurationError(`Unsupported provider: ${provider}`);
    }
  }
}

/**
 * Configuration preset manager for common scenarios
 */
export class DatabaseConfigPresets {
  /**
   * Development preset with local databases
   */
  static development(provider: DatabaseProviderType): DatabaseConfig {
    switch (provider) {
      case 'dynamodb':
        return DatabaseConfigHelper.createLocalDynamoDBConfig({
          primaryTable: 'dev-primary',
          dataTable: 'dev-data'
        });
      case 'mongodb':
        return DatabaseConfigHelper.createLocalMongoDBConfig({
          database: 'dev-database'
        });
      default:
        throw new ConfigurationError(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Testing preset with isolated test databases
   */
  static testing(provider: DatabaseProviderType): DatabaseConfig {
    const config = DatabaseConfigHelper.createTestConfig(provider);
    
    // Enable migration for testing scenarios
    config.migration = {
      enabled: true,
      batchSize: 50,
      validateAfterMigration: true
    };

    return config;
  }

  /**
   * Production preset with optimized settings
   */
  static production(provider: DatabaseProviderType, options: any): DatabaseConfig {
    switch (provider) {
      case 'dynamodb':
        return DatabaseConfigHelper.createAWSConfig({
          region: options.region || 'us-east-1',
          primaryTable: options.primaryTable,
          dataTable: options.dataTable,
          consistentRead: false // Eventually consistent for better performance
        });
      case 'mongodb':
        const config = DatabaseConfigHelper.createMongoDBConfig({
          connectionString: options.connectionString,
          database: options.database,
          maxPoolSize: 20 // Higher pool size for production
        });
        
        // Optimize for production
        if (config.mongodb?.options) {
          config.mongodb.options.maxPoolSize = 20;
          config.mongodb.options.minPoolSize = 5;
          config.mongodb.options.maxIdleTimeMS = 60000;
          config.mongodb.options.serverSelectionTimeoutMS = 10000;
        }
        
        return config;
      default:
        throw new ConfigurationError(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Migration preset with migration-optimized settings
   */
  static migration(baseConfig: DatabaseConfig): DatabaseConfig {
    return {
      ...baseConfig,
      migration: {
        enabled: true,
        batchSize: 500, // Larger batch size for migration
        validateAfterMigration: true
      }
    };
  }
}