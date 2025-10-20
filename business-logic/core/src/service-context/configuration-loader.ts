import { ServiceConfig, DatabaseConfig, MessageBrokerConfig, CacheConfig } from '../interfaces/service-context';
import { AuthConfig } from '../authentication/interfaces';
import { ConfigurationError } from '../errors/service-errors';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration loader that reads from environment variables and config files
 */
export class ConfigurationLoader {
  private static readonly CONFIG_FILE_PATHS = [
    './config/config.yml',
    './config/config.yaml',
    './config/config.json',
    './config.yml',
    './config.yaml',
    './config.json'
  ];

  /**
   * Load configuration from environment variables and config files
   */
  public static async loadConfiguration(overrides?: Partial<ServiceConfig>): Promise<ServiceConfig> {
    try {
      // Start with environment-based configuration
      const envConfig = this.loadFromEnvironment();
      
      // Try to load from config files
      const fileConfig = await this.loadFromConfigFile();
      
      // Merge configurations (overrides > env > file > defaults)
      const config: ServiceConfig = {
        ...this.getDefaultConfiguration(),
        ...fileConfig,
        ...envConfig,
        ...overrides
      };

      return config;
    } catch (error) {
      throw new ConfigurationError(
        `Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { overrides }
      );
    }
  }

  /**
   * Load configuration from environment variables
   */
  private static loadFromEnvironment(): Partial<ServiceConfig> {
    const config: Partial<ServiceConfig> = {};

    // Environment
    if (process.env.ENVIRONMENT) {
      config.environment = process.env.ENVIRONMENT as 'aws' | 'docker';
    }

    // Database configuration
    const dbConfig = this.loadDatabaseConfigFromEnv();
    if (Object.keys(dbConfig).length > 0) {
      config.database = dbConfig as DatabaseConfig;
    }

    // Message broker configuration
    const mbConfig = this.loadMessageBrokerConfigFromEnv();
    if (Object.keys(mbConfig).length > 0) {
      config.messageBroker = mbConfig as MessageBrokerConfig;
    }

    // Authentication configuration
    const authConfig = this.loadAuthConfigFromEnv();
    if (Object.keys(authConfig).length > 0) {
      config.authentication = authConfig as AuthConfig;
    }

    // Cache configuration
    const cacheConfig = this.loadCacheConfigFromEnv();
    if (Object.keys(cacheConfig).length > 0) {
      config.cache = cacheConfig as CacheConfig;
    }

    return config;
  }

  private static loadDatabaseConfigFromEnv(): Partial<DatabaseConfig> {
    const config: Partial<DatabaseConfig> = {};

    if (process.env.DATABASE_PROVIDER) {
      config.provider = process.env.DATABASE_PROVIDER as 'dynamodb' | 'mongodb';
    }

    if (process.env.DATABASE_CONNECTION_STRING) {
      config.connectionString = process.env.DATABASE_CONNECTION_STRING;
    }

    if (process.env.DATABASE_REGION || process.env.AWS_REGION) {
      config.region = process.env.DATABASE_REGION || process.env.AWS_REGION;
    }

    // DynamoDB table names
    if (process.env.DYNAMODB_PRIMARY_TABLE) {
      config.tables = {
        primary: process.env.DYNAMODB_PRIMARY_TABLE,
        data: process.env.DYNAMODB_DATA_TABLE || process.env.DYNAMODB_PRIMARY_TABLE
      };
    }

    return config;
  }

  private static loadMessageBrokerConfigFromEnv(): Partial<MessageBrokerConfig> {
    const config: Partial<MessageBrokerConfig> = {};

    if (process.env.MESSAGE_BROKER_PROVIDER) {
      config.provider = process.env.MESSAGE_BROKER_PROVIDER as 'eventbridge' | 'rabbitmq';
    }

    if (process.env.MESSAGE_BROKER_CONNECTION_STRING) {
      config.connectionString = process.env.MESSAGE_BROKER_CONNECTION_STRING;
    }

    if (process.env.MESSAGE_BROKER_REGION || process.env.AWS_REGION) {
      config.region = process.env.MESSAGE_BROKER_REGION || process.env.AWS_REGION;
    }

    if (process.env.EVENTBRIDGE_BUS_NAME) {
      config.eventBusName = process.env.EVENTBRIDGE_BUS_NAME;
    }

    return config;
  }

  private static loadAuthConfigFromEnv(): Partial<AuthConfig> {
    const config: Partial<AuthConfig> = {};

    if (process.env.AUTH_PROVIDER) {
      config.provider = process.env.AUTH_PROVIDER as 'cognito' | 'jwt' | 'oidc';
    }

    if (process.env.AUTH_REGION || process.env.AWS_REGION) {
      config.region = process.env.AUTH_REGION || process.env.AWS_REGION;
    }

    // Cognito configuration
    if (process.env.COGNITO_USER_POOL_ID) {
      config.userPoolId = process.env.COGNITO_USER_POOL_ID;
      config.clientId = process.env.COGNITO_CLIENT_ID || '';
      config.region = process.env.AUTH_REGION || process.env.AWS_REGION || 'us-east-1';
    }

    // JWT configuration
    if (process.env.JWT_PUBLIC_KEY || process.env.JWT_ISSUER) {
      config.publicKey = process.env.JWT_PUBLIC_KEY || '';
      config.issuer = process.env.JWT_ISSUER || '';
      config.audience = process.env.JWT_AUDIENCE || '';
    }

    // OIDC configuration (using same fields as JWT for now)
    if (process.env.OIDC_DISCOVERY_URL) {
      config.jwksUri = process.env.OIDC_DISCOVERY_URL;
      config.issuer = process.env.OIDC_ISSUER || '';
      config.audience = process.env.OIDC_AUDIENCE || '';
    }

    return config;
  }

  private static loadCacheConfigFromEnv(): Partial<CacheConfig> {
    const config: Partial<CacheConfig> = {};

    if (process.env.CACHE_PROVIDER) {
      config.provider = process.env.CACHE_PROVIDER as 'dynamodb' | 'redis';
    }

    if (process.env.CACHE_CONNECTION_STRING) {
      config.connectionString = process.env.CACHE_CONNECTION_STRING;
    }

    if (process.env.CACHE_REGION || process.env.AWS_REGION) {
      config.region = process.env.CACHE_REGION || process.env.AWS_REGION;
    }

    if (process.env.CACHE_KEY_PREFIX) {
      config.keyPrefix = process.env.CACHE_KEY_PREFIX;
    }

    return config;
  }

  /**
   * Load configuration from config files
   */
  private static async loadFromConfigFile(): Promise<Partial<ServiceConfig>> {
    for (const configPath of this.CONFIG_FILE_PATHS) {
      try {
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          
          if (configPath.endsWith('.json')) {
            return JSON.parse(content);
          } else if (configPath.endsWith('.yml') || configPath.endsWith('.yaml')) {
            // For now, we'll skip YAML parsing to avoid additional dependencies
            // In a real implementation, you'd use a YAML parser like 'js-yaml'
            console.warn(`YAML config files not yet supported: ${configPath}`);
            continue;
          }
        }
      } catch (error) {
        console.warn(`Failed to load config file ${configPath}:`, error);
        continue;
      }
    }

    return {};
  }

  /**
   * Get default configuration values
   */
  private static getDefaultConfiguration(): ServiceConfig {
    return {
      environment: 'aws',
      database: {
        provider: 'dynamodb',
        region: 'us-east-1',
        tables: {
          primary: 'mytaptrack-primary',
          data: 'mytaptrack-data'
        }
      },
      messageBroker: {
        provider: 'eventbridge',
        region: 'us-east-1',
        eventBusName: 'default'
      },
      authentication: {
        provider: 'cognito',
        region: 'us-east-1'
      },
      cache: {
        provider: 'dynamodb',
        region: 'us-east-1',
        keyPrefix: 'mytaptrack:'
      }
    };
  }

  /**
   * Validate configuration values
   */
  public static validateConfiguration(config: ServiceConfig): void {
    const errors: string[] = [];

    // Validate environment
    if (!['aws', 'docker'].includes(config.environment)) {
      errors.push('Environment must be either "aws" or "docker"');
    }

    // Validate database configuration
    if (!config.database?.provider) {
      errors.push('Database provider is required');
    } else if (!['dynamodb', 'mongodb'].includes(config.database.provider)) {
      errors.push('Database provider must be either "dynamodb" or "mongodb"');
    }

    // Validate message broker configuration
    if (!config.messageBroker?.provider) {
      errors.push('Message broker provider is required');
    } else if (!['eventbridge', 'rabbitmq'].includes(config.messageBroker.provider)) {
      errors.push('Message broker provider must be either "eventbridge" or "rabbitmq"');
    }

    // Validate authentication configuration
    if (!config.authentication?.provider) {
      errors.push('Authentication provider is required');
    } else if (!['cognito', 'jwt', 'oidc'].includes(config.authentication.provider)) {
      errors.push('Authentication provider must be "cognito", "jwt", or "oidc"');
    }

    // Validate cache configuration
    if (!config.cache?.provider) {
      errors.push('Cache provider is required');
    } else if (!['dynamodb', 'redis'].includes(config.cache.provider)) {
      errors.push('Cache provider must be either "dynamodb" or "redis"');
    }

    if (errors.length > 0) {
      throw new ConfigurationError(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }
}