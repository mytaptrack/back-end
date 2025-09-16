/**
 * Tests for database configuration management system
 */

import {
  DatabaseConfigLoader,
  DatabaseConfigValidator,
  DB_CONFIG_ENV_VARS,
  DEFAULT_CONFIG
} from './database-config';

import {
  DatabaseProviderFactory,
  DatabaseConfigurationManager,
  DatabaseProviderRegistry
} from './database-factory';

import {
  DatabaseConfigHelper,
  DatabaseConfigPresets
} from './database-config-helper';

import {
  DatabaseConfig,
  DatabaseProviderType,
  DynamoDBConfig,
  MongoDBConfig
} from '../types/database-abstraction';

import {
  ConfigurationError,
  ValidationError
} from '../types/database-errors';

describe('DatabaseConfigLoader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadFromEnvironment', () => {
    it('should load DynamoDB configuration from environment variables', () => {
      process.env[DB_CONFIG_ENV_VARS.PROVIDER] = 'dynamodb';
      process.env[DB_CONFIG_ENV_VARS.DYNAMODB_REGION] = 'us-west-2';
      process.env[DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE] = 'test-primary';
      process.env[DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE] = 'test-data';
      process.env[DB_CONFIG_ENV_VARS.DYNAMODB_CONSISTENT_READ] = 'true';

      const config = DatabaseConfigLoader.loadFromEnvironment();

      expect(config.provider).toBe('dynamodb');
      expect(config.dynamodb).toEqual({
        region: 'us-west-2',
        primaryTable: 'test-primary',
        dataTable: 'test-data',
        consistentRead: true,
        endpoint: undefined
      });
    });

    it('should load MongoDB configuration from environment variables', () => {
      process.env[DB_CONFIG_ENV_VARS.PROVIDER] = 'mongodb';
      process.env[DB_CONFIG_ENV_VARS.MONGODB_CONNECTION_STRING] = 'mongodb://localhost:27017';
      process.env[DB_CONFIG_ENV_VARS.MONGODB_DATABASE] = 'testdb';
      process.env[DB_CONFIG_ENV_VARS.MONGODB_PRIMARY_COLLECTION] = 'primary';
      process.env[DB_CONFIG_ENV_VARS.MONGODB_DATA_COLLECTION] = 'data';

      const config = DatabaseConfigLoader.loadFromEnvironment();

      expect(config.provider).toBe('mongodb');
      expect(config.mongodb).toEqual({
        connectionString: 'mongodb://localhost:27017',
        database: 'testdb',
        collections: {
          primary: 'primary',
          data: 'data'
        },
        options: {
          maxPoolSize: DEFAULT_CONFIG.mongodb.options.maxPoolSize,
          minPoolSize: DEFAULT_CONFIG.mongodb.options.minPoolSize,
          maxIdleTimeMS: DEFAULT_CONFIG.mongodb.options.maxIdleTimeMS,
          serverSelectionTimeoutMS: DEFAULT_CONFIG.mongodb.options.serverSelectionTimeoutMS
        }
      });
    });

    it('should throw error when provider is not specified', () => {
      delete process.env[DB_CONFIG_ENV_VARS.PROVIDER];

      expect(() => {
        DatabaseConfigLoader.loadFromEnvironment();
      }).toThrow(ConfigurationError);
    });

    it('should throw error when provider is invalid', () => {
      process.env[DB_CONFIG_ENV_VARS.PROVIDER] = 'invalid-provider';

      expect(() => {
        DatabaseConfigLoader.loadFromEnvironment();
      }).toThrow(ConfigurationError);
    });

    it('should throw error when DynamoDB required fields are missing', () => {
      process.env[DB_CONFIG_ENV_VARS.PROVIDER] = 'dynamodb';
      // Missing required tables

      expect(() => {
        DatabaseConfigLoader.loadFromEnvironment();
      }).toThrow(ConfigurationError);
    });

    it('should throw error when MongoDB required fields are missing', () => {
      process.env[DB_CONFIG_ENV_VARS.PROVIDER] = 'mongodb';
      // Missing connection string and database

      expect(() => {
        DatabaseConfigLoader.loadFromEnvironment();
      }).toThrow(ConfigurationError);
    });
  });

  describe('loadFromConfig', () => {
    it('should load configuration from object', () => {
      // Set required environment variables for fallback
      process.env[DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE] = 'env-primary';
      process.env[DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE] = 'env-data';

      const configData = {
        provider: 'dynamodb',
        dynamodb: {
          region: 'us-east-1',
          primaryTable: 'test-primary',
          dataTable: 'test-data'
        }
      };

      const config = DatabaseConfigLoader.loadFromConfig(configData);

      expect(config.provider).toBe('dynamodb');
      expect(config.dynamodb?.primaryTable).toBe('test-primary');
    });

    it('should throw error for null config data', () => {
      expect(() => {
        DatabaseConfigLoader.loadFromConfig(null);
      }).toThrow(ConfigurationError);
    });

    it('should throw error for invalid provider in config', () => {
      const configData = {
        provider: 'invalid-provider'
      };

      expect(() => {
        DatabaseConfigLoader.loadFromConfig(configData);
      }).toThrow(ConfigurationError);
    });
  });
});

describe('DatabaseConfigValidator', () => {
  describe('validate', () => {
    it('should validate valid DynamoDB configuration', () => {
      const config: DatabaseConfig = {
        provider: 'dynamodb',
        dynamodb: {
          region: 'us-east-1',
          primaryTable: 'test-primary',
          dataTable: 'test-data',
          consistentRead: false
        }
      };

      expect(() => {
        DatabaseConfigValidator.validate(config);
      }).not.toThrow();
    });

    it('should validate valid MongoDB configuration', () => {
      const config: DatabaseConfig = {
        provider: 'mongodb',
        mongodb: {
          connectionString: 'mongodb://localhost:27017',
          database: 'testdb',
          collections: {
            primary: 'primary',
            data: 'data'
          }
        }
      };

      expect(() => {
        DatabaseConfigValidator.validate(config);
      }).not.toThrow();
    });

    it('should throw error for missing configuration', () => {
      expect(() => {
        DatabaseConfigValidator.validate(null as any);
      }).toThrow(ValidationError);
    });

    it('should throw error for missing provider', () => {
      const config = {} as DatabaseConfig;

      expect(() => {
        DatabaseConfigValidator.validate(config);
      }).toThrow(ValidationError);
    });

    it('should throw error for invalid provider', () => {
      const config = {
        provider: 'invalid-provider'
      } as any;

      expect(() => {
        DatabaseConfigValidator.validate(config);
      }).toThrow(ValidationError);
    });

    it('should throw error for missing DynamoDB config when provider is dynamodb', () => {
      const config: DatabaseConfig = {
        provider: 'dynamodb'
      };

      expect(() => {
        DatabaseConfigValidator.validate(config);
      }).toThrow(ValidationError);
    });

    it('should throw error for missing MongoDB config when provider is mongodb', () => {
      const config: DatabaseConfig = {
        provider: 'mongodb'
      };

      expect(() => {
        DatabaseConfigValidator.validate(config);
      }).toThrow(ValidationError);
    });
  });

  describe('validateDynamoDBConfig', () => {
    it('should validate valid DynamoDB configuration', () => {
      const config: DynamoDBConfig = {
        region: 'us-east-1',
        primaryTable: 'test-primary',
        dataTable: 'test-data',
        consistentRead: false
      };

      expect(() => {
        DatabaseConfigValidator.validateDynamoDBConfig(config);
      }).not.toThrow();
    });

    it('should throw error for missing region', () => {
      const config = {
        primaryTable: 'test-primary',
        dataTable: 'test-data'
      } as DynamoDBConfig;

      expect(() => {
        DatabaseConfigValidator.validateDynamoDBConfig(config);
      }).toThrow(ValidationError);
    });

    it('should throw error for invalid region format', () => {
      const config: DynamoDBConfig = {
        region: 'invalid region!',
        primaryTable: 'test-primary',
        dataTable: 'test-data'
      };

      expect(() => {
        DatabaseConfigValidator.validateDynamoDBConfig(config);
      }).toThrow(ValidationError);
    });

    it('should throw error for invalid endpoint URL', () => {
      const config: DynamoDBConfig = {
        region: 'us-east-1',
        primaryTable: 'test-primary',
        dataTable: 'test-data',
        endpoint: 'invalid-url'
      };

      expect(() => {
        DatabaseConfigValidator.validateDynamoDBConfig(config);
      }).toThrow(ValidationError);
    });
  });

  describe('validateMongoDBConfig', () => {
    it('should validate valid MongoDB configuration', () => {
      const config: MongoDBConfig = {
        connectionString: 'mongodb://localhost:27017',
        database: 'testdb',
        collections: {
          primary: 'primary',
          data: 'data'
        }
      };

      expect(() => {
        DatabaseConfigValidator.validateMongoDBConfig(config);
      }).not.toThrow();
    });

    it('should throw error for invalid connection string', () => {
      const config: MongoDBConfig = {
        connectionString: 'invalid-connection-string',
        database: 'testdb',
        collections: {
          primary: 'primary',
          data: 'data'
        }
      };

      expect(() => {
        DatabaseConfigValidator.validateMongoDBConfig(config);
      }).toThrow(ValidationError);
    });

    it('should throw error for invalid pool size options', () => {
      const config: MongoDBConfig = {
        connectionString: 'mongodb://localhost:27017',
        database: 'testdb',
        collections: {
          primary: 'primary',
          data: 'data'
        },
        options: {
          maxPoolSize: -1, // Invalid
          minPoolSize: 2
        }
      };

      expect(() => {
        DatabaseConfigValidator.validateMongoDBConfig(config);
      }).toThrow(ValidationError);
    });

    it('should throw error when minPoolSize > maxPoolSize', () => {
      const config: MongoDBConfig = {
        connectionString: 'mongodb://localhost:27017',
        database: 'testdb',
        collections: {
          primary: 'primary',
          data: 'data'
        },
        options: {
          maxPoolSize: 5,
          minPoolSize: 10 // Greater than max
        }
      };

      expect(() => {
        DatabaseConfigValidator.validateMongoDBConfig(config);
      }).toThrow(ValidationError);
    });
  });
});

describe('DatabaseConfigHelper', () => {
  describe('createDynamoDBConfig', () => {
    it('should create valid DynamoDB configuration', () => {
      const config = DatabaseConfigHelper.createDynamoDBConfig({
        primaryTable: 'test-primary',
        dataTable: 'test-data',
        region: 'us-west-2',
        consistentRead: true
      });

      expect(config.provider).toBe('dynamodb');
      expect(config.dynamodb).toEqual({
        region: 'us-west-2',
        primaryTable: 'test-primary',
        dataTable: 'test-data',
        consistentRead: true,
        endpoint: undefined
      });
    });

    it('should use default values when not specified', () => {
      const config = DatabaseConfigHelper.createDynamoDBConfig({
        primaryTable: 'test-primary',
        dataTable: 'test-data'
      });

      expect(config.dynamodb?.region).toBe('us-east-1');
      expect(config.dynamodb?.consistentRead).toBe(false);
    });
  });

  describe('createMongoDBConfig', () => {
    it('should create valid MongoDB configuration', () => {
      const config = DatabaseConfigHelper.createMongoDBConfig({
        connectionString: 'mongodb://localhost:27017',
        database: 'testdb',
        primaryCollection: 'users',
        dataCollection: 'app_data',
        maxPoolSize: 15
      });

      expect(config.provider).toBe('mongodb');
      expect(config.mongodb?.collections.primary).toBe('users');
      expect(config.mongodb?.collections.data).toBe('app_data');
      expect(config.mongodb?.options?.maxPoolSize).toBe(15);
    });

    it('should use default collection names when not specified', () => {
      const config = DatabaseConfigHelper.createMongoDBConfig({
        connectionString: 'mongodb://localhost:27017',
        database: 'testdb'
      });

      expect(config.mongodb?.collections.primary).toBe('primary_data');
      expect(config.mongodb?.collections.data).toBe('application_data');
    });
  });

  describe('validateEnvironmentForProvider', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should validate DynamoDB environment variables', () => {
      process.env[DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE] = 'test-primary';
      process.env[DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE] = 'test-data';

      const result = DatabaseConfigHelper.validateEnvironmentForProvider('dynamodb');

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should detect missing DynamoDB environment variables', () => {
      delete process.env[DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE];
      delete process.env[DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE];

      const result = DatabaseConfigHelper.validateEnvironmentForProvider('dynamodb');

      expect(result.valid).toBe(false);
      expect(result.missing).toContain(DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE);
      expect(result.missing).toContain(DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE);
    });

    it('should validate MongoDB environment variables', () => {
      process.env[DB_CONFIG_ENV_VARS.MONGODB_CONNECTION_STRING] = 'mongodb://localhost:27017';
      process.env[DB_CONFIG_ENV_VARS.MONGODB_DATABASE] = 'testdb';

      const result = DatabaseConfigHelper.validateEnvironmentForProvider('mongodb');

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });

  describe('generateEnvironmentTemplate', () => {
    it('should generate DynamoDB environment template', () => {
      const template = DatabaseConfigHelper.generateEnvironmentTemplate('dynamodb');

      expect(template[DB_CONFIG_ENV_VARS.PROVIDER]).toBe('dynamodb');
      expect(template[DB_CONFIG_ENV_VARS.DYNAMODB_REGION]).toBe('us-east-1');
      expect(template[DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE]).toBe('your-primary-table');
      expect(template[DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE]).toBe('your-data-table');
    });

    it('should generate MongoDB environment template', () => {
      const template = DatabaseConfigHelper.generateEnvironmentTemplate('mongodb');

      expect(template[DB_CONFIG_ENV_VARS.PROVIDER]).toBe('mongodb');
      expect(template[DB_CONFIG_ENV_VARS.MONGODB_CONNECTION_STRING]).toBe('mongodb://localhost:27017');
      expect(template[DB_CONFIG_ENV_VARS.MONGODB_DATABASE]).toBe('your-database');
    });
  });
});

describe('DatabaseConfigPresets', () => {
  describe('development', () => {
    it('should create development DynamoDB configuration', () => {
      const config = DatabaseConfigPresets.development('dynamodb');

      expect(config.provider).toBe('dynamodb');
      expect(config.dynamodb?.primaryTable).toBe('dev-primary');
      expect(config.dynamodb?.dataTable).toBe('dev-data');
      expect(config.dynamodb?.endpoint).toBe('http://localhost:8000');
    });

    it('should create development MongoDB configuration', () => {
      const config = DatabaseConfigPresets.development('mongodb');

      expect(config.provider).toBe('mongodb');
      expect(config.mongodb?.database).toBe('dev-database');
      expect(config.mongodb?.connectionString).toBe('mongodb://localhost:27017');
    });
  });

  describe('testing', () => {
    it('should create testing configuration with migration enabled', () => {
      const config = DatabaseConfigPresets.testing('dynamodb');

      expect(config.provider).toBe('dynamodb');
      expect(config.migration?.enabled).toBe(true);
      expect(config.migration?.batchSize).toBe(50);
      expect(config.migration?.validateAfterMigration).toBe(true);
    });
  });

  describe('production', () => {
    it('should create production DynamoDB configuration', () => {
      const config = DatabaseConfigPresets.production('dynamodb', {
        region: 'us-west-2',
        primaryTable: 'prod-primary',
        dataTable: 'prod-data'
      });

      expect(config.provider).toBe('dynamodb');
      expect(config.dynamodb?.region).toBe('us-west-2');
      expect(config.dynamodb?.primaryTable).toBe('prod-primary');
      expect(config.dynamodb?.consistentRead).toBe(false); // Optimized for production
    });

    it('should create production MongoDB configuration with optimized settings', () => {
      const config = DatabaseConfigPresets.production('mongodb', {
        connectionString: 'mongodb://prod-cluster:27017',
        database: 'prod-database'
      });

      expect(config.provider).toBe('mongodb');
      expect(config.mongodb?.options?.maxPoolSize).toBe(20); // Higher for production
      expect(config.mongodb?.options?.minPoolSize).toBe(5);
    });
  });
});

describe('DatabaseProviderFactory', () => {
  describe('getSupportedProviders', () => {
    it('should return list of supported providers', () => {
      const providers = DatabaseProviderFactory.getSupportedProviders();

      expect(providers).toContain('dynamodb');
      expect(providers).toContain('mongodb');
    });
  });

  describe('isProviderSupported', () => {
    it('should return true for supported providers', () => {
      expect(DatabaseProviderFactory.isProviderSupported('dynamodb')).toBe(true);
      expect(DatabaseProviderFactory.isProviderSupported('mongodb')).toBe(true);
    });

    it('should return false for unsupported providers', () => {
      expect(DatabaseProviderFactory.isProviderSupported('invalid-provider')).toBe(false);
    });
  });

  describe('create', () => {
    it('should throw error for unsupported provider', () => {
      const config = {
        provider: 'unsupported-provider'
      } as any;

      expect(() => {
        DatabaseProviderFactory.create(config);
      }).toThrow(ValidationError); // ValidationError is thrown first during validation
    });

    it('should throw error when provider implementation is not available', () => {
      const config = DatabaseConfigHelper.createDynamoDBConfig({
        primaryTable: 'test-primary',
        dataTable: 'test-data'
      });

      // This should throw an error since providers aren't implemented yet
      expect(() => {
        DatabaseProviderFactory.create(config);
      }).toThrow(ConfigurationError);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = DatabaseProviderFactory.getCacheStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('connected');
      expect(stats).toHaveProperty('disconnected');
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.connected).toBe('number');
      expect(typeof stats.disconnected).toBe('number');
    });
  });
});

describe('DatabaseProviderRegistry', () => {
  beforeEach(() => {
    DatabaseProviderRegistry.clear();
  });

  describe('register and get', () => {
    it('should register and retrieve provider', () => {
      const mockProvider = class MockProvider {};
      
      DatabaseProviderRegistry.register('dynamodb', mockProvider);
      
      const retrieved = DatabaseProviderRegistry.get('dynamodb');
      expect(retrieved).toBe(mockProvider);
    });

    it('should throw error for unregistered provider', () => {
      expect(() => {
        DatabaseProviderRegistry.get('dynamodb');
      }).toThrow(ConfigurationError);
    });
  });

  describe('isRegistered', () => {
    it('should return true for registered provider', () => {
      const mockProvider = class MockProvider {};
      DatabaseProviderRegistry.register('dynamodb', mockProvider);

      expect(DatabaseProviderRegistry.isRegistered('dynamodb')).toBe(true);
    });

    it('should return false for unregistered provider', () => {
      expect(DatabaseProviderRegistry.isRegistered('dynamodb')).toBe(false);
    });
  });

  describe('getRegisteredProviders', () => {
    it('should return list of registered providers', () => {
      const mockProvider = class MockProvider {};
      DatabaseProviderRegistry.register('dynamodb', mockProvider);
      DatabaseProviderRegistry.register('mongodb', mockProvider);

      const providers = DatabaseProviderRegistry.getRegisteredProviders();
      expect(providers).toContain('dynamodb');
      expect(providers).toContain('mongodb');
    });
  });
});

describe('DatabaseConfigurationManager', () => {
  beforeEach(() => {
    // Reset manager state
    DatabaseConfigurationManager.shutdown();
  });

  describe('isInitialized', () => {
    it('should return false when not initialized', () => {
      expect(DatabaseConfigurationManager.isInitialized()).toBe(false);
    });
  });

  describe('getCurrentConfig', () => {
    it('should return null when not initialized', () => {
      expect(DatabaseConfigurationManager.getCurrentConfig()).toBe(null);
    });
  });

  describe('getCurrentProvider', () => {
    it('should return null when not initialized', () => {
      expect(DatabaseConfigurationManager.getCurrentProvider()).toBe(null);
    });
  });

  // Note: initialize() tests would require actual provider implementations
  // These will be tested in integration tests once providers are implemented
});