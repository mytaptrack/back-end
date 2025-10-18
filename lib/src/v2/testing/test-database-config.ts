/**
 * Test Database Configuration
 * Provides configuration management for test databases across different providers
 */

import { 
  DatabaseConfig, 
  DynamoDBConfig, 
  MongoDBConfig, 
  DatabaseProviderType 
} from '../types/database-abstraction';

export interface TestDatabaseConfig extends DatabaseConfig {
  testMode: boolean;
  testPrefix: string;
  cleanupAfterTests: boolean;
  testTimeout: number;
}

export interface TestDynamoDBConfig extends DynamoDBConfig {
  testTables: {
    primaryTable: string;
    dataTable: string;
  };
  useLocalDynamoDB?: boolean;
  localEndpoint?: string;
}

export interface TestMongoDBConfig extends MongoDBConfig {
  testDatabase: string;
  testCollections: {
    primary: string;
    data: string;
  };
  dropDatabaseAfterTests?: boolean;
}

export interface TestEnvironmentConfig {
  dynamodb?: TestDynamoDBConfig;
  mongodb?: TestMongoDBConfig;
  defaultProvider: DatabaseProviderType;
  parallelTests?: boolean;
  maxConcurrentTests?: number;
}

/**
 * Manages test database configurations for different providers
 */
export class TestDatabaseConfigManager {
  private static instance: TestDatabaseConfigManager;
  private configs: Map<string, TestDatabaseConfig> = new Map();
  private environmentConfig?: TestEnvironmentConfig;

  private constructor() {}

  static getInstance(): TestDatabaseConfigManager {
    if (!TestDatabaseConfigManager.instance) {
      TestDatabaseConfigManager.instance = new TestDatabaseConfigManager();
    }
    return TestDatabaseConfigManager.instance;
  }

  /**
   * Load test configuration from environment variables
   */
  loadFromEnvironment(): TestEnvironmentConfig {
    const config: TestEnvironmentConfig = {
      defaultProvider: (process.env.TEST_DB_PROVIDER as DatabaseProviderType) || 'dynamodb',
      parallelTests: process.env.TEST_PARALLEL === 'true',
      maxConcurrentTests: parseInt(process.env.TEST_MAX_CONCURRENT || '5')
    };

    // DynamoDB test configuration
    if (process.env.TEST_DYNAMODB_REGION) {
      config.dynamodb = {
        region: process.env.TEST_DYNAMODB_REGION,
        primaryTable: process.env.TEST_DYNAMODB_PRIMARY_TABLE || 'test-primary-table',
        dataTable: process.env.TEST_DYNAMODB_DATA_TABLE || 'test-data-table',
        testTables: {
          primaryTable: process.env.TEST_DYNAMODB_PRIMARY_TABLE || 'test-primary-table',
          dataTable: process.env.TEST_DYNAMODB_DATA_TABLE || 'test-data-table'
        },
        consistentRead: true,
        useLocalDynamoDB: process.env.TEST_DYNAMODB_LOCAL === 'true',
        localEndpoint: process.env.TEST_DYNAMODB_ENDPOINT || 'http://localhost:8000',



      };
    }

    // MongoDB test configuration
    if (process.env.TEST_MONGODB_CONNECTION_STRING) {
      config.mongodb = {
        connectionString: process.env.TEST_MONGODB_CONNECTION_STRING,
        database: process.env.TEST_MONGODB_DATABASE || 'test-database',
        testDatabase: process.env.TEST_MONGODB_TEST_DATABASE || 'test-database',
        collections: {
          primary: process.env.TEST_MONGODB_PRIMARY_COLLECTION || 'test-primary',
          data: process.env.TEST_MONGODB_DATA_COLLECTION || 'test-data'
        },
        testCollections: {
          primary: process.env.TEST_MONGODB_PRIMARY_COLLECTION || 'test-primary',
          data: process.env.TEST_MONGODB_DATA_COLLECTION || 'test-data'
        },
        dropDatabaseAfterTests: process.env.TEST_MONGODB_DROP_DB === 'true',
        options: {
          maxPoolSize: parseInt(process.env.TEST_MONGODB_MAX_POOL_SIZE || '10'),
          minPoolSize: parseInt(process.env.TEST_MONGODB_MIN_POOL_SIZE || '2'),
          maxIdleTimeMS: parseInt(process.env.TEST_MONGODB_MAX_IDLE_TIME || '30000'),
          serverSelectionTimeoutMS: parseInt(process.env.TEST_MONGODB_SERVER_SELECTION_TIMEOUT || '5000')
        }
      };
    }

    this.environmentConfig = config;
    return config;
  }

  /**
   * Create test configuration for DynamoDB
   */
  createDynamoDBTestConfig(overrides?: Partial<TestDynamoDBConfig>): TestDatabaseConfig {
    const envConfig = this.environmentConfig?.dynamodb;
    
    const dynamodbConfig: TestDynamoDBConfig = {
      region: envConfig?.region || 'us-east-1',
      primaryTable: envConfig?.primaryTable || 'test-primary-table',
      dataTable: envConfig?.dataTable || 'test-data-table',
      testTables: {
        primaryTable: envConfig?.testTables?.primaryTable || 'test-primary-table',
        dataTable: envConfig?.testTables?.dataTable || 'test-data-table'
      },
      consistentRead: true,
      useLocalDynamoDB: envConfig?.useLocalDynamoDB || false,
      localEndpoint: envConfig?.localEndpoint || 'http://localhost:8000',
      ...overrides
    };

    // Use local endpoint if specified
    if (dynamodbConfig.useLocalDynamoDB) {
      dynamodbConfig.endpoint = dynamodbConfig.localEndpoint;
    }

    const testConfig: TestDatabaseConfig = {
      provider: 'dynamodb',
      dynamodb: dynamodbConfig,
      testMode: true,
      testPrefix: 'TEST',
      cleanupAfterTests: true,
      testTimeout: 30000
    };

    return testConfig;
  }

  /**
   * Create test configuration for MongoDB
   */
  createMongoDBTestConfig(overrides?: Partial<TestMongoDBConfig>): TestDatabaseConfig {
    const envConfig = this.environmentConfig?.mongodb;
    
    const mongodbConfig: TestMongoDBConfig = {
      connectionString: envConfig?.connectionString || 'mongodb://localhost:27017',
      database: envConfig?.database || 'test-database',
      testDatabase: envConfig?.testDatabase || 'test-database',
      collections: {
        primary: envConfig?.collections?.primary || 'test-primary',
        data: envConfig?.collections?.data || 'test-data'
      },
      testCollections: {
        primary: envConfig?.testCollections?.primary || 'test-primary',
        data: envConfig?.testCollections?.data || 'test-data'
      },
      dropDatabaseAfterTests: envConfig?.dropDatabaseAfterTests || false,
      options: {
        maxPoolSize: envConfig?.options?.maxPoolSize || 10,
        minPoolSize: envConfig?.options?.minPoolSize || 2,
        maxIdleTimeMS: envConfig?.options?.maxIdleTimeMS || 30000,
        serverSelectionTimeoutMS: envConfig?.options?.serverSelectionTimeoutMS || 5000,
        ...envConfig?.options
      },
      ...overrides
    };

    const testConfig: TestDatabaseConfig = {
      provider: 'mongodb',
      mongodb: mongodbConfig,
      testMode: true,
      testPrefix: 'TEST',
      cleanupAfterTests: true,
      testTimeout: 30000
    };

    return testConfig;
  }

  /**
   * Get test configuration for specified provider
   */
  getTestConfig(provider: DatabaseProviderType, configName?: string): TestDatabaseConfig {
    const key = `${provider}-${configName || 'default'}`;
    
    if (this.configs.has(key)) {
      return this.configs.get(key)!;
    }

    let config: TestDatabaseConfig;
    
    switch (provider) {
      case 'dynamodb':
        config = this.createDynamoDBTestConfig();
        break;
      case 'mongodb':
        config = this.createMongoDBTestConfig();
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    this.configs.set(key, config);
    return config;
  }

  /**
   * Register a custom test configuration
   */
  registerTestConfig(name: string, config: TestDatabaseConfig): void {
    this.configs.set(name, config);
  }

  /**
   * Validate test configuration
   */
  validateTestConfig(config: TestDatabaseConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.provider) {
      errors.push('Provider is required');
    }

    if (!config.testPrefix) {
      errors.push('Test prefix is required');
    }

    if (config.provider === 'dynamodb') {
      if (!config.dynamodb) {
        errors.push('DynamoDB configuration is required');
      } else {
        if (!config.dynamodb.region) {
          errors.push('DynamoDB region is required');
        }
        if (!config.dynamodb.primaryTable) {
          errors.push('DynamoDB primary table is required');
        }
        if (!config.dynamodb.dataTable) {
          errors.push('DynamoDB data table is required');
        }
      }
    }

    if (config.provider === 'mongodb') {
      if (!config.mongodb) {
        errors.push('MongoDB configuration is required');
      } else {
        if (!config.mongodb.connectionString) {
          errors.push('MongoDB connection string is required');
        }
        if (!config.mongodb.database) {
          errors.push('MongoDB database is required');
        }
        if (!config.mongodb.collections?.primary) {
          errors.push('MongoDB primary collection is required');
        }
        if (!config.mongodb.collections?.data) {
          errors.push('MongoDB data collection is required');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get environment configuration
   */
  getEnvironmentConfig(): TestEnvironmentConfig | undefined {
    return this.environmentConfig;
  }

  /**
   * Create configuration for integration tests
   */
  createIntegrationTestConfig(): { 
    dynamodb: TestDatabaseConfig; 
    mongodb: TestDatabaseConfig 
  } {
    return {
      dynamodb: this.createDynamoDBTestConfig({
        testTables: {
          primaryTable: 'integration-test-primary',
          dataTable: 'integration-test-data'
        }
      }),
      mongodb: this.createMongoDBTestConfig({
        testDatabase: 'integration-test-database',
        testCollections: {
          primary: 'integration-test-primary',
          data: 'integration-test-data'
        }
      })
    };
  }

  /**
   * Create configuration for performance tests
   */
  createPerformanceTestConfig(): { 
    dynamodb: TestDatabaseConfig; 
    mongodb: TestDatabaseConfig 
  } {
    return {
      dynamodb: this.createDynamoDBTestConfig({
        testTables: {
          primaryTable: 'performance-test-primary',
          dataTable: 'performance-test-data'
        }
      }),
      mongodb: this.createMongoDBTestConfig({
        testDatabase: 'performance-test-database',
        testCollections: {
          primary: 'performance-test-primary',
          data: 'performance-test-data'
        },
        options: {
          maxPoolSize: 50, // Higher pool size for performance tests
          minPoolSize: 10
        }
      })
    };
  }

  /**
   * Clear all cached configurations
   */
  clearConfigs(): void {
    this.configs.clear();
  }
}