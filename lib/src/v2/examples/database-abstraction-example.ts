/**
 * Example usage of the database abstraction layer interfaces
 * This file demonstrates how to use the new abstraction interfaces
 */

import {
  DatabaseKey,
  UnifiedQueryInput,
  UnifiedUpdateInput,
  IDataAccessLayer,
  DatabaseProviderType,
  KeyCondition,
  FilterCondition,
  DatabaseConfig
} from '../types/database-abstraction';

import {
  DatabaseKeyUtils,
  QueryTransformUtils,
  ValidationUtils
} from '../utils/database-utils';

import {
  ErrorTranslatorFactory,
  ItemNotFoundError
} from '../types/database-errors';

import {
  DatabaseConfigLoader,
  DatabaseConfigValidator,
  DB_CONFIG_ENV_VARS
} from '../utils/database-config';

import {
  DatabaseProviderFactory,
  DatabaseConfigurationManager
} from '../utils/database-factory';

import {
  DatabaseConfigHelper,
  DatabaseConfigPresets
} from '../utils/database-config-helper';

// Example: Creating a database key
export function createUserKey(userId: string): DatabaseKey {
  return {
    primary: `U#${userId}`,
    sort: 'P'
  };
}

// Example: Creating a query for user data
export function createUserQuery(userId: string): UnifiedQueryInput {
  const keyCondition: KeyCondition = {
    field: 'pk',
    operator: '=',
    value: `U#${userId}`
  };

  const filterCondition: FilterCondition = {
    field: 'status',
    operator: '=',
    value: 'active'
  };

  return {
    keyCondition,
    filterCondition,
    projection: ['userId', 'email', 'name', 'createdAt'],
    limit: 10
  };
}

// Example: Creating an update operation
export function createUserUpdate(userId: string, updates: any): UnifiedUpdateInput {
  const key = createUserKey(userId);
  
  return {
    key,
    updates: {
      ...updates,
      updatedAt: new Date().toISOString()
    },
    condition: {
      field: 'pk',
      operator: 'exists'
    }
  };
}

// Example: Using the abstraction layer (pseudo-implementation)
export class ExampleUserService {
  constructor(private dataAccess: IDataAccessLayer) {}

  async getUser(userId: string): Promise<any> {
    try {
      // Validate input
      if (!userId) {
        throw new Error('User ID is required');
      }

      // Create database key
      const key = createUserKey(userId);
      
      // Validate the key
      ValidationUtils.validateDatabaseKey(key);

      // Get user data
      const user = await this.dataAccess.get(key);
      
      if (!user) {
        throw new ItemNotFoundError(`User not found: ${userId}`);
      }

      return user;
    } catch (error) {
      // Translate database-specific errors to unified errors
      const providerType = this.dataAccess.getProviderType();
      const translatedError = ErrorTranslatorFactory.translateError(error, providerType);
      throw translatedError;
    }
  }

  async updateUser(userId: string, updates: any): Promise<void> {
    try {
      // Create update input
      const updateInput = createUserUpdate(userId, updates);
      
      // Perform update
      await this.dataAccess.update(updateInput);
    } catch (error) {
      const providerType = this.dataAccess.getProviderType();
      const translatedError = ErrorTranslatorFactory.translateError(error, providerType);
      throw translatedError;
    }
  }

  async queryUsers(userId: string): Promise<any[]> {
    try {
      // Create query input
      const queryInput = createUserQuery(userId);
      
      // Validate query input
      ValidationUtils.validateQueryInput(queryInput);

      // Execute query
      const users = await this.dataAccess.query(queryInput);
      
      return users;
    } catch (error) {
      const providerType = this.dataAccess.getProviderType();
      const translatedError = ErrorTranslatorFactory.translateError(error, providerType);
      throw translatedError;
    }
  }
}

// Example: Key transformation utilities
export function demonstrateKeyTransformations() {
  const unifiedKey: DatabaseKey = {
    primary: 'U#12345',
    sort: 'P'
  };

  // Convert to DynamoDB format
  const dynamoKey = DatabaseKeyUtils.toDynamoDBKey(unifiedKey);
  console.log('DynamoDB Key:', dynamoKey);

  // Convert to MongoDB format
  const mongoKey = DatabaseKeyUtils.toMongoDBKey(unifiedKey);
  console.log('MongoDB Key:', mongoKey);

  // Generate composite key
  const compositeKey = DatabaseKeyUtils.generateCompositeKey(unifiedKey.primary, unifiedKey.sort);
  console.log('Composite Key:', compositeKey);

  // Parse composite key
  const parsed = DatabaseKeyUtils.parseCompositeKey(compositeKey);
  console.log('Parsed Key:', parsed);
}

// Example: Query transformation
export function demonstrateQueryTransformation() {
  const unifiedQuery: UnifiedQueryInput = {
    keyCondition: {
      field: 'pk',
      operator: '=',
      value: 'U#12345'
    },
    filterCondition: {
      field: 'status',
      operator: '=',
      value: 'active'
    },
    projection: ['userId', 'email', 'name'],
    limit: 10
  };

  // Convert to DynamoDB query format
  const dynamoQuery = QueryTransformUtils.toDynamoDBQuery(unifiedQuery);
  console.log('DynamoDB Query:', dynamoQuery);

  return dynamoQuery;
}

// Example: Error handling
export function demonstrateErrorHandling() {
  try {
    // Simulate a DynamoDB error
    const dynamoError = {
      name: 'ResourceNotFoundException',
      message: 'Requested resource not found'
    };

    // Translate to unified error
    const unifiedError = ErrorTranslatorFactory.translateError(dynamoError, 'dynamodb');
    console.log('Unified Error:', {
      code: unifiedError.code,
      message: unifiedError.message,
      retryable: unifiedError.retryable
    });

  } catch (error) {
    console.error('Error handling failed:', error);
  }
}

// Example: Provider type checking
export function getProviderSpecificBehavior(provider: DatabaseProviderType): string {
  switch (provider) {
    case 'dynamodb':
      return 'Using DynamoDB-specific optimizations';
    case 'mongodb':
      return 'Using MongoDB-specific optimizations';
    default:
      return 'Using generic database behavior';
  }
}

// ===== CONFIGURATION MANAGEMENT EXAMPLES =====

// Example: Loading configuration from environment variables
export function demonstrateEnvironmentConfig(): DatabaseConfig {
  try {
    // Load configuration from environment variables
    const config = DatabaseConfigLoader.loadFromEnvironment();
    console.log('Loaded configuration:', {
      provider: config.provider,
      migrationEnabled: config.migration?.enabled
    });
    return config;
  } catch (error) {
    console.error('Failed to load environment config:', error);
    throw error;
  }
}

// Example: Creating configuration programmatically
export function demonstrateProgrammaticConfig(): DatabaseConfig {
  // Create DynamoDB configuration
  const dynamoConfig = DatabaseConfigHelper.createDynamoDBConfig({
    region: 'us-east-1',
    primaryTable: 'MyApp-Primary',
    dataTable: 'MyApp-Data',
    consistentRead: false
  });

  // Validate the configuration
  DatabaseConfigValidator.validate(dynamoConfig);
  
  console.log('Created DynamoDB config:', dynamoConfig);
  return dynamoConfig;
}

// Example: Creating MongoDB configuration
export function demonstrateMongoDBConfig(): DatabaseConfig {
  const mongoConfig = DatabaseConfigHelper.createMongoDBConfig({
    connectionString: 'mongodb://localhost:27017',
    database: 'myapp',
    primaryCollection: 'users',
    dataCollection: 'app_data',
    maxPoolSize: 15
  });

  DatabaseConfigValidator.validate(mongoConfig);
  
  console.log('Created MongoDB config:', mongoConfig);
  return mongoConfig;
}

// Example: Using configuration presets
export function demonstrateConfigPresets(): void {
  // Development preset
  const devConfig = DatabaseConfigPresets.development('dynamodb');
  console.log('Development config:', devConfig);

  // Testing preset
  const testConfig = DatabaseConfigPresets.testing('mongodb');
  console.log('Testing config:', testConfig);

  // Production preset (requires options)
  const prodConfig = DatabaseConfigPresets.production('dynamodb', {
    region: 'us-west-2',
    primaryTable: 'Prod-Primary',
    dataTable: 'Prod-Data'
  });
  console.log('Production config:', prodConfig);
}

// Example: Loading configuration with fallback
export async function demonstrateConfigWithFallback(): Promise<DatabaseConfig> {
  try {
    const config = await DatabaseConfigHelper.loadConfigWithFallback({
      configFile: './config/database.json',
      fallbackProvider: 'dynamodb',
      fallbackConfig: {
        provider: 'dynamodb',
        dynamodb: {
          region: 'us-east-1',
          primaryTable: 'Fallback-Primary',
          dataTable: 'Fallback-Data'
        }
      }
    });

    console.log('Loaded config with fallback:', config);
    return config;
  } catch (error) {
    console.error('Failed to load config with fallback:', error);
    throw error;
  }
}

// Example: Validating environment variables
export function demonstrateEnvironmentValidation(): void {
  const providers: DatabaseProviderType[] = ['dynamodb', 'mongodb'];
  
  for (const provider of providers) {
    const validation = DatabaseConfigHelper.validateEnvironmentForProvider(provider);
    
    if (validation.valid) {
      console.log(`✅ Environment is valid for ${provider}`);
    } else {
      console.log(`❌ Environment missing variables for ${provider}:`, validation.missing);
      
      // Generate template
      const template = DatabaseConfigHelper.generateEnvironmentTemplate(provider);
      console.log(`Environment template for ${provider}:`, template);
    }
  }
}

// Example: Using the database provider factory
export async function demonstrateProviderFactory(): Promise<void> {
  try {
    // Create configuration
    const config = DatabaseConfigHelper.createLocalDynamoDBConfig({
      primaryTable: 'Test-Primary',
      dataTable: 'Test-Data'
    });

    // Validate configuration
    DatabaseConfigValidator.validate(config);

    // Note: This will throw an error since providers aren't implemented yet
    try {
      const provider = DatabaseProviderFactory.create(config);
      console.log('Created provider:', provider.getProviderType());
    } catch (error) {
      console.log('Expected error (providers not implemented yet):', error.message);
    }

    // Check supported providers
    const supportedProviders = DatabaseProviderFactory.getSupportedProviders();
    console.log('Supported providers:', supportedProviders);

    // Check if provider is supported
    const isSupported = DatabaseProviderFactory.isProviderSupported('dynamodb');
    console.log('Is DynamoDB supported:', isSupported);

  } catch (error) {
    console.error('Provider factory demo failed:', error);
  }
}

// Example: Using configuration manager
export async function demonstrateConfigurationManager(): Promise<void> {
  try {
    // Create test configuration
    const config = DatabaseConfigHelper.createTestConfig('dynamodb');
    
    console.log('Configuration manager initialized:', DatabaseConfigurationManager.isInitialized());
    
    // Note: This will fail since providers aren't implemented yet
    try {
      await DatabaseConfigurationManager.initialize(config);
      console.log('Configuration manager initialized successfully');
      
      const currentConfig = DatabaseConfigurationManager.getCurrentConfig();
      console.log('Current config provider:', currentConfig?.provider);
      
      // Shutdown
      await DatabaseConfigurationManager.shutdown();
    } catch (error) {
      console.log('Expected error (providers not implemented yet):', error.message);
    }

  } catch (error) {
    console.error('Configuration manager demo failed:', error);
  }
}

// Example: Configuration validation errors
export function demonstrateConfigValidation(): void {
  try {
    // Test invalid configuration
    const invalidConfig = {
      provider: 'invalid-provider',
      dynamodb: {
        region: '',
        primaryTable: '',
        dataTable: ''
      }
    } as any;

    DatabaseConfigValidator.validate(invalidConfig);
  } catch (error) {
    console.log('Validation error (expected):', error.message);
  }

  try {
    // Test missing MongoDB config
    const incompleteConfig: DatabaseConfig = {
      provider: 'mongodb'
      // Missing mongodb configuration
    };

    DatabaseConfigValidator.validate(incompleteConfig);
  } catch (error) {
    console.log('Validation error for incomplete config (expected):', error.message);
  }
}

// Example: Environment variable reference
export function demonstrateEnvironmentVariables(): void {
  console.log('Database configuration environment variables:');
  console.log('Provider:', DB_CONFIG_ENV_VARS.PROVIDER);
  console.log('DynamoDB Region:', DB_CONFIG_ENV_VARS.DYNAMODB_REGION);
  console.log('DynamoDB Primary Table:', DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE);
  console.log('MongoDB Connection String:', DB_CONFIG_ENV_VARS.MONGODB_CONNECTION_STRING);
  console.log('Migration Enabled:', DB_CONFIG_ENV_VARS.MIGRATION_ENABLED);
}

// Example: Complete configuration workflow
export async function demonstrateCompleteWorkflow(): Promise<void> {
  console.log('=== Complete Configuration Management Workflow ===');

  // 1. Validate environment
  console.log('\n1. Validating environment...');
  demonstrateEnvironmentValidation();

  // 2. Create configuration
  console.log('\n2. Creating configuration...');
  const config = demonstrateProgrammaticConfig();

  // 3. Use presets
  console.log('\n3. Using configuration presets...');
  demonstrateConfigPresets();

  // 4. Demonstrate factory
  console.log('\n4. Using provider factory...');
  await demonstrateProviderFactory();

  // 5. Show validation errors
  console.log('\n5. Demonstrating validation...');
  demonstrateConfigValidation();

  // 6. Show environment variables
  console.log('\n6. Environment variables reference...');
  demonstrateEnvironmentVariables();

  console.log('\n=== Workflow Complete ===');
}