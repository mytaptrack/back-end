/**
 * Database configuration management system
 * Handles loading, validation, and management of database provider configurations
 */

import { 
  DatabaseConfig, 
  DynamoDBConfig, 
  MongoDBConfig, 
  MigrationConfig,
  DatabaseProviderType 
} from '../types/database-abstraction';
import { ConfigurationError, ValidationError } from '../types/database-errors';

/**
 * Environment variable names for database configuration
 */
export const DB_CONFIG_ENV_VARS = {
  // Provider selection
  PROVIDER: 'DB_PROVIDER',
  
  // DynamoDB configuration
  DYNAMODB_REGION: 'DYNAMODB_REGION',
  DYNAMODB_PRIMARY_TABLE: 'DYNAMODB_PRIMARY_TABLE',
  DYNAMODB_DATA_TABLE: 'DYNAMODB_DATA_TABLE',
  DYNAMODB_CONSISTENT_READ: 'DYNAMODB_CONSISTENT_READ',
  DYNAMODB_ENDPOINT: 'DYNAMODB_ENDPOINT',
  
  // MongoDB configuration
  MONGODB_CONNECTION_STRING: 'MONGODB_CONNECTION_STRING',
  MONGODB_DATABASE: 'MONGODB_DATABASE',
  MONGODB_PRIMARY_COLLECTION: 'MONGODB_PRIMARY_COLLECTION',
  MONGODB_DATA_COLLECTION: 'MONGODB_DATA_COLLECTION',
  MONGODB_MAX_POOL_SIZE: 'MONGODB_MAX_POOL_SIZE',
  MONGODB_MIN_POOL_SIZE: 'MONGODB_MIN_POOL_SIZE',
  MONGODB_MAX_IDLE_TIME_MS: 'MONGODB_MAX_IDLE_TIME_MS',
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: 'MONGODB_SERVER_SELECTION_TIMEOUT_MS',
  
  // Migration configuration
  MIGRATION_ENABLED: 'MIGRATION_ENABLED',
  MIGRATION_BATCH_SIZE: 'MIGRATION_BATCH_SIZE',
  MIGRATION_VALIDATE_AFTER: 'MIGRATION_VALIDATE_AFTER'
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  dynamodb: {
    region: 'us-east-1',
    consistentRead: false
  },
  mongodb: {
    collections: {
      primary: 'primary_data',
      data: 'application_data'
    },
    options: {
      maxPoolSize: 10,
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
} as const;

/**
 * Configuration loader class that handles loading database configuration
 * from environment variables and configuration files
 */
export class DatabaseConfigLoader {
  /**
   * Load database configuration from environment variables
   */
  static loadFromEnvironment(): DatabaseConfig {
    const provider = this.getProviderFromEnvironment();
    
    const config: DatabaseConfig = {
      provider,
      migration: this.loadMigrationConfig()
    };

    switch (provider) {
      case 'dynamodb':
        config.dynamodb = this.loadDynamoDBConfig();
        break;
      case 'mongodb':
        config.mongodb = this.loadMongoDBConfig();
        break;
      default:
        throw new ConfigurationError(`Unsupported database provider: ${provider}`);
    }

    return config;
  }

  /**
   * Load database configuration from a configuration object
   */
  static loadFromConfig(configData: any): DatabaseConfig {
    if (!configData || typeof configData !== 'object') {
      throw new ConfigurationError('Configuration data must be a non-null object');
    }

    const config: DatabaseConfig = {
      provider: configData.provider || this.getProviderFromEnvironment(),
      migration: configData.migration || this.loadMigrationConfig()
    };

    // Validate provider
    if (!this.isValidProvider(config.provider)) {
      throw new ConfigurationError(
        `Invalid database provider: ${config.provider}. Must be 'dynamodb' or 'mongodb'`
      );
    }

    switch (config.provider) {
      case 'dynamodb':
        config.dynamodb = this.mergeDynamoDBConfig(configData.dynamodb);
        break;
      case 'mongodb':
        config.mongodb = this.mergeMongoDBConfig(configData.mongodb);
        break;
    }

    return config;
  }

  /**
   * Load configuration from a JSON file
   */
  static async loadFromFile(filePath: string): Promise<DatabaseConfig> {
    try {
      const fs = await import('fs');
      const configData = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
      return this.loadFromConfig(configData);
    } catch (error) {
      if (error instanceof Error) {
        throw new ConfigurationError(`Failed to load configuration from file ${filePath}: ${error.message}`);
      }
      throw new ConfigurationError(`Failed to load configuration from file ${filePath}: Unknown error`);
    }
  }

  /**
   * Get database provider from environment variables
   */
  private static getProviderFromEnvironment(): DatabaseProviderType {
    const provider = process.env[DB_CONFIG_ENV_VARS.PROVIDER];
    
    if (!provider) {
      throw new ConfigurationError(
        `Database provider not specified. Set ${DB_CONFIG_ENV_VARS.PROVIDER} environment variable to 'dynamodb' or 'mongodb'`
      );
    }

    if (!this.isValidProvider(provider)) {
      throw new ConfigurationError(
        `Invalid database provider: ${provider}. Must be 'dynamodb' or 'mongodb'`
      );
    }

    return provider as DatabaseProviderType;
  }

  /**
   * Load DynamoDB configuration from environment variables
   */
  private static loadDynamoDBConfig(): DynamoDBConfig {
    const region = process.env[DB_CONFIG_ENV_VARS.DYNAMODB_REGION] || DEFAULT_CONFIG.dynamodb.region;
    const primaryTable = process.env[DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE];
    const dataTable = process.env[DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE];
    const consistentRead = process.env[DB_CONFIG_ENV_VARS.DYNAMODB_CONSISTENT_READ] === 'true';
    const endpoint = process.env[DB_CONFIG_ENV_VARS.DYNAMODB_ENDPOINT];

    if (!primaryTable) {
      throw new ConfigurationError(
        `DynamoDB primary table not specified. Set ${DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE} environment variable`
      );
    }

    if (!dataTable) {
      throw new ConfigurationError(
        `DynamoDB data table not specified. Set ${DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE} environment variable`
      );
    }

    return {
      region,
      primaryTable,
      dataTable,
      consistentRead,
      endpoint
    };
  }

  /**
   * Load MongoDB configuration from environment variables
   */
  private static loadMongoDBConfig(): MongoDBConfig {
    const connectionString = process.env[DB_CONFIG_ENV_VARS.MONGODB_CONNECTION_STRING];
    const database = process.env[DB_CONFIG_ENV_VARS.MONGODB_DATABASE];
    const primaryCollection = process.env[DB_CONFIG_ENV_VARS.MONGODB_PRIMARY_COLLECTION] || 
                             DEFAULT_CONFIG.mongodb.collections.primary;
    const dataCollection = process.env[DB_CONFIG_ENV_VARS.MONGODB_DATA_COLLECTION] || 
                          DEFAULT_CONFIG.mongodb.collections.data;

    if (!connectionString) {
      throw new ConfigurationError(
        `MongoDB connection string not specified. Set ${DB_CONFIG_ENV_VARS.MONGODB_CONNECTION_STRING} environment variable`
      );
    }

    if (!database) {
      throw new ConfigurationError(
        `MongoDB database not specified. Set ${DB_CONFIG_ENV_VARS.MONGODB_DATABASE} environment variable`
      );
    }

    // Parse optional connection options
    const maxPoolSize = this.parseIntegerEnvVar(
      DB_CONFIG_ENV_VARS.MONGODB_MAX_POOL_SIZE, 
      DEFAULT_CONFIG.mongodb.options.maxPoolSize
    );
    const minPoolSize = this.parseIntegerEnvVar(
      DB_CONFIG_ENV_VARS.MONGODB_MIN_POOL_SIZE, 
      DEFAULT_CONFIG.mongodb.options.minPoolSize
    );
    const maxIdleTimeMS = this.parseIntegerEnvVar(
      DB_CONFIG_ENV_VARS.MONGODB_MAX_IDLE_TIME_MS, 
      DEFAULT_CONFIG.mongodb.options.maxIdleTimeMS
    );
    const serverSelectionTimeoutMS = this.parseIntegerEnvVar(
      DB_CONFIG_ENV_VARS.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 
      DEFAULT_CONFIG.mongodb.options.serverSelectionTimeoutMS
    );

    return {
      connectionString,
      database,
      collections: {
        primary: primaryCollection,
        data: dataCollection
      },
      options: {
        maxPoolSize,
        minPoolSize,
        maxIdleTimeMS,
        serverSelectionTimeoutMS
      }
    };
  }

  /**
   * Load migration configuration from environment variables
   */
  private static loadMigrationConfig(): MigrationConfig {
    const enabled = process.env[DB_CONFIG_ENV_VARS.MIGRATION_ENABLED] === 'true';
    const batchSize = this.parseIntegerEnvVar(
      DB_CONFIG_ENV_VARS.MIGRATION_BATCH_SIZE, 
      DEFAULT_CONFIG.migration.batchSize
    );
    const validateAfterMigration = process.env[DB_CONFIG_ENV_VARS.MIGRATION_VALIDATE_AFTER] !== 'false';

    return {
      enabled,
      batchSize,
      validateAfterMigration
    };
  }

  /**
   * Merge DynamoDB configuration with defaults
   */
  private static mergeDynamoDBConfig(configData?: any): DynamoDBConfig {
    if (!configData) {
      return this.loadDynamoDBConfig();
    }

    const envConfig = this.loadDynamoDBConfig();
    
    return {
      region: configData.region || envConfig.region,
      primaryTable: configData.primaryTable || envConfig.primaryTable,
      dataTable: configData.dataTable || envConfig.dataTable,
      consistentRead: configData.consistentRead !== undefined ? configData.consistentRead : envConfig.consistentRead,
      endpoint: configData.endpoint || envConfig.endpoint
    };
  }

  /**
   * Merge MongoDB configuration with defaults
   */
  private static mergeMongoDBConfig(configData?: any): MongoDBConfig {
    if (!configData) {
      return this.loadMongoDBConfig();
    }

    const envConfig = this.loadMongoDBConfig();
    
    return {
      connectionString: configData.connectionString || envConfig.connectionString,
      database: configData.database || envConfig.database,
      collections: {
        primary: configData.collections?.primary || envConfig.collections.primary,
        data: configData.collections?.data || envConfig.collections.data
      },
      options: {
        maxPoolSize: configData.options?.maxPoolSize || envConfig.options?.maxPoolSize,
        minPoolSize: configData.options?.minPoolSize || envConfig.options?.minPoolSize,
        maxIdleTimeMS: configData.options?.maxIdleTimeMS || envConfig.options?.maxIdleTimeMS,
        serverSelectionTimeoutMS: configData.options?.serverSelectionTimeoutMS || envConfig.options?.serverSelectionTimeoutMS
      }
    };
  }

  /**
   * Parse integer environment variable with default fallback
   */
  private static parseIntegerEnvVar(envVarName: string, defaultValue: number): number {
    const value = process.env[envVarName];
    if (!value) {
      return defaultValue;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new ConfigurationError(
        `Invalid value for ${envVarName}: ${value}. Must be a positive integer`
      );
    }

    return parsed;
  }

  /**
   * Check if provider is valid
   */
  private static isValidProvider(provider: string): provider is DatabaseProviderType {
    return provider === 'dynamodb' || provider === 'mongodb';
  }
}

/**
 * Configuration validator class
 */
export class DatabaseConfigValidator {
  /**
   * Validate complete database configuration
   */
  static validate(config: DatabaseConfig): void {
    if (!config) {
      throw new ValidationError('Database configuration is required');
    }

    if (!config.provider) {
      throw new ValidationError('Database provider is required');
    }

    if (!['dynamodb', 'mongodb'].includes(config.provider)) {
      throw new ValidationError(
        `Invalid database provider: ${config.provider}. Must be 'dynamodb' or 'mongodb'`
      );
    }

    switch (config.provider) {
      case 'dynamodb':
        this.validateDynamoDBConfig(config.dynamodb);
        break;
      case 'mongodb':
        this.validateMongoDBConfig(config.mongodb);
        break;
    }

    if (config.migration) {
      this.validateMigrationConfig(config.migration);
    }
  }

  /**
   * Validate DynamoDB configuration
   */
  static validateDynamoDBConfig(config?: DynamoDBConfig): void {
    if (!config) {
      throw new ValidationError('DynamoDB configuration is required when provider is dynamodb');
    }

    if (!config.region) {
      throw new ValidationError('DynamoDB region is required');
    }

    if (!config.primaryTable) {
      throw new ValidationError('DynamoDB primary table name is required');
    }

    if (!config.dataTable) {
      throw new ValidationError('DynamoDB data table name is required');
    }

    // Validate region format (basic check)
    if (!/^[a-z0-9-]+$/.test(config.region)) {
      throw new ValidationError(`Invalid DynamoDB region format: ${config.region}`);
    }

    // Validate table names (basic check)
    if (!/^[a-zA-Z0-9_.-]+$/.test(config.primaryTable)) {
      throw new ValidationError(`Invalid DynamoDB primary table name: ${config.primaryTable}`);
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(config.dataTable)) {
      throw new ValidationError(`Invalid DynamoDB data table name: ${config.dataTable}`);
    }

    // Validate endpoint if provided (for local development)
    if (config.endpoint) {
      try {
        new URL(config.endpoint);
      } catch {
        throw new ValidationError(`Invalid DynamoDB endpoint URL: ${config.endpoint}`);
      }
    }
  }

  /**
   * Validate MongoDB configuration
   */
  static validateMongoDBConfig(config?: MongoDBConfig): void {
    if (!config) {
      throw new ValidationError('MongoDB configuration is required when provider is mongodb');
    }

    if (!config.connectionString) {
      throw new ValidationError('MongoDB connection string is required');
    }

    if (!config.database) {
      throw new ValidationError('MongoDB database name is required');
    }

    if (!config.collections) {
      throw new ValidationError('MongoDB collections configuration is required');
    }

    if (!config.collections.primary) {
      throw new ValidationError('MongoDB primary collection name is required');
    }

    if (!config.collections.data) {
      throw new ValidationError('MongoDB data collection name is required');
    }

    // Validate connection string format (basic check)
    if (!config.connectionString.startsWith('mongodb://') && !config.connectionString.startsWith('mongodb+srv://')) {
      throw new ValidationError('MongoDB connection string must start with mongodb:// or mongodb+srv://');
    }

    // Validate database name (basic check)
    if (!/^[a-zA-Z0-9_-]+$/.test(config.database)) {
      throw new ValidationError(`Invalid MongoDB database name: ${config.database}`);
    }

    // Validate collection names (basic check)
    if (!/^[a-zA-Z0-9_.-]+$/.test(config.collections.primary)) {
      throw new ValidationError(`Invalid MongoDB primary collection name: ${config.collections.primary}`);
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(config.collections.data)) {
      throw new ValidationError(`Invalid MongoDB data collection name: ${config.collections.data}`);
    }

    // Validate connection options if provided
    if (config.options) {
      this.validateMongoDBOptions(config.options);
    }
  }

  /**
   * Validate MongoDB connection options
   */
  private static validateMongoDBOptions(options: NonNullable<MongoDBConfig['options']>): void {
    if (options.maxPoolSize !== undefined) {
      if (!Number.isInteger(options.maxPoolSize) || options.maxPoolSize <= 0) {
        throw new ValidationError('MongoDB maxPoolSize must be a positive integer');
      }
    }

    if (options.minPoolSize !== undefined) {
      if (!Number.isInteger(options.minPoolSize) || options.minPoolSize < 0) {
        throw new ValidationError('MongoDB minPoolSize must be a non-negative integer');
      }
    }

    if (options.maxPoolSize !== undefined && options.minPoolSize !== undefined) {
      if (options.minPoolSize > options.maxPoolSize) {
        throw new ValidationError('MongoDB minPoolSize cannot be greater than maxPoolSize');
      }
    }

    if (options.maxIdleTimeMS !== undefined) {
      if (!Number.isInteger(options.maxIdleTimeMS) || options.maxIdleTimeMS <= 0) {
        throw new ValidationError('MongoDB maxIdleTimeMS must be a positive integer');
      }
    }

    if (options.serverSelectionTimeoutMS !== undefined) {
      if (!Number.isInteger(options.serverSelectionTimeoutMS) || options.serverSelectionTimeoutMS <= 0) {
        throw new ValidationError('MongoDB serverSelectionTimeoutMS must be a positive integer');
      }
    }
  }

  /**
   * Validate migration configuration
   */
  static validateMigrationConfig(config: MigrationConfig): void {
    if (typeof config.enabled !== 'boolean') {
      throw new ValidationError('Migration enabled flag must be a boolean');
    }

    if (!Number.isInteger(config.batchSize) || config.batchSize <= 0) {
      throw new ValidationError('Migration batch size must be a positive integer');
    }

    if (config.validateAfterMigration !== undefined && typeof config.validateAfterMigration !== 'boolean') {
      throw new ValidationError('Migration validateAfterMigration flag must be a boolean');
    }
  }
}