import { ConfigurationLoader } from '../configuration-loader';
import { ConfigurationError } from '../../errors/service-errors';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigurationLoader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfiguration', () => {
    it('should load configuration from environment variables', async () => {
      process.env.ENVIRONMENT = 'docker';
      process.env.DATABASE_PROVIDER = 'mongodb';
      process.env.MESSAGE_BROKER_PROVIDER = 'rabbitmq';
      process.env.AUTH_PROVIDER = 'jwt';
      process.env.CACHE_PROVIDER = 'redis';

      mockFs.existsSync.mockReturnValue(false);

      const config = await ConfigurationLoader.loadConfiguration();

      expect(config.environment).toBe('docker');
      expect(config.database.provider).toBe('mongodb');
      expect(config.messageBroker.provider).toBe('rabbitmq');
      expect(config.authentication.provider).toBe('jwt');
      expect(config.cache.provider).toBe('redis');
    });

    it('should load configuration from JSON config file', async () => {
      const configData = {
        environment: 'docker',
        database: { provider: 'mongodb' },
        messageBroker: { provider: 'rabbitmq' },
        authentication: { provider: 'jwt' },
        cache: { provider: 'redis' }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(configData));

      const config = await ConfigurationLoader.loadConfiguration();

      expect(config.environment).toBe('docker');
      expect(config.database.provider).toBe('mongodb');
    });

    it('should apply overrides to configuration', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const overrides = {
        environment: 'docker' as const,
        database: { provider: 'mongodb' as const }
      };

      const config = await ConfigurationLoader.loadConfiguration(overrides);

      expect(config.environment).toBe('docker');
      expect(config.database.provider).toBe('mongodb');
    });

    it('should use default configuration when no other sources available', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const config = await ConfigurationLoader.loadConfiguration();

      expect(config.environment).toBe('aws');
      expect(config.database.provider).toBe('dynamodb');
      expect(config.messageBroker.provider).toBe('eventbridge');
      expect(config.authentication.provider).toBe('cognito');
      expect(config.cache.provider).toBe('dynamodb');
    });
  });

  describe('environment variable loading', () => {
    it('should load database configuration from environment', async () => {
      process.env.DATABASE_PROVIDER = 'mongodb';
      process.env.DATABASE_CONNECTION_STRING = 'mongodb://localhost:27017';
      process.env.DATABASE_REGION = 'us-west-2';
      process.env.DYNAMODB_PRIMARY_TABLE = 'test-table';

      mockFs.existsSync.mockReturnValue(false);

      const config = await ConfigurationLoader.loadConfiguration();

      expect(config.database.provider).toBe('mongodb');
      expect(config.database.connectionString).toBe('mongodb://localhost:27017');
      expect(config.database.region).toBe('us-west-2');
      expect(config.database.tables?.primary).toBe('test-table');
    });

    it('should load message broker configuration from environment', async () => {
      process.env.MESSAGE_BROKER_PROVIDER = 'rabbitmq';
      process.env.MESSAGE_BROKER_CONNECTION_STRING = 'amqp://localhost:5672';
      process.env.EVENTBRIDGE_BUS_NAME = 'test-bus';

      mockFs.existsSync.mockReturnValue(false);

      const config = await ConfigurationLoader.loadConfiguration();

      expect(config.messageBroker.provider).toBe('rabbitmq');
      expect(config.messageBroker.connectionString).toBe('amqp://localhost:5672');
      expect(config.messageBroker.eventBusName).toBe('test-bus');
    });

    it('should load authentication configuration from environment', async () => {
      process.env.AUTH_PROVIDER = 'jwt';
      process.env.JWT_PUBLIC_KEY = 'test-key';
      process.env.JWT_ISSUER = 'test-issuer';
      process.env.JWT_AUDIENCE = 'test-audience';

      mockFs.existsSync.mockReturnValue(false);

      const config = await ConfigurationLoader.loadConfiguration();

      expect(config.authentication.provider).toBe('jwt');
      expect(config.authentication.publicKey).toBe('test-key');
      expect(config.authentication.issuer).toBe('test-issuer');
      expect(config.authentication.audience).toBe('test-audience');
    });

    it('should load cache configuration from environment', async () => {
      process.env.CACHE_PROVIDER = 'redis';
      process.env.CACHE_CONNECTION_STRING = 'redis://localhost:6379';
      process.env.CACHE_KEY_PREFIX = 'test:';

      mockFs.existsSync.mockReturnValue(false);

      const config = await ConfigurationLoader.loadConfiguration();

      expect(config.cache.provider).toBe('redis');
      expect(config.cache.connectionString).toBe('redis://localhost:6379');
      expect(config.cache.keyPrefix).toBe('test:');
    });
  });

  describe('validateConfiguration', () => {
    it('should validate valid configuration', () => {
      const validConfig = {
        environment: 'aws' as const,
        database: { provider: 'dynamodb' as const },
        messageBroker: { provider: 'eventbridge' as const },
        authentication: { provider: 'cognito' as const },
        cache: { provider: 'dynamodb' as const }
      };

      expect(() => ConfigurationLoader.validateConfiguration(validConfig)).not.toThrow();
    });

    it('should throw ConfigurationError for invalid environment', () => {
      const invalidConfig = {
        environment: 'invalid' as any,
        database: { provider: 'dynamodb' as const },
        messageBroker: { provider: 'eventbridge' as const },
        authentication: { provider: 'cognito' as const },
        cache: { provider: 'dynamodb' as const }
      };

      expect(() => ConfigurationLoader.validateConfiguration(invalidConfig)).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for missing required fields', () => {
      const invalidConfigs = [
        { environment: 'aws' }, // missing other fields
        { environment: 'aws', database: { provider: 'invalid' } }, // invalid provider
        { environment: 'aws', database: { provider: 'dynamodb' }, messageBroker: { provider: 'invalid' } }
      ];

      for (const config of invalidConfigs) {
        expect(() => ConfigurationLoader.validateConfiguration(config as any)).toThrow(ConfigurationError);
      }
    });
  });
});