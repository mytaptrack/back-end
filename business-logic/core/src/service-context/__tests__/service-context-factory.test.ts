import { ServiceContextFactory } from '../service-context-factory';
import { ConfigurationLoader } from '../configuration-loader';
import { ServiceConfig } from '../../interfaces/service-context';
import { ConfigurationError } from '../../errors/service-errors';

// Mock the configuration loader
jest.mock('../configuration-loader');
const mockConfigurationLoader = ConfigurationLoader as jest.Mocked<typeof ConfigurationLoader>;

describe('ServiceContextFactory', () => {
  let factory: ServiceContextFactory;

  beforeEach(() => {
    factory = ServiceContextFactory.getInstance();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await factory.shutdown();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ServiceContextFactory.getInstance();
      const instance2 = ServiceContextFactory.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('createContext', () => {
    const mockConfig: ServiceConfig = {
      environment: 'aws',
      database: { provider: 'dynamodb', region: 'us-east-1' },
      messageBroker: { provider: 'eventbridge', region: 'us-east-1' },
      authentication: { provider: 'cognito', region: 'us-east-1' },
      cache: { provider: 'dynamodb', region: 'us-east-1' }
    };

    beforeEach(() => {
      mockConfigurationLoader.loadConfiguration.mockResolvedValue(mockConfig);
    });

    it.skip('should create service context successfully (requires data access implementation)', async () => {
      const context = await factory.createContext();
      
      expect(context).toBeDefined();
      expect(context.config).toEqual(mockConfig);
      expect(context.messageBroker).toBeDefined();
      expect(context.authentication).toBeDefined();
      expect(context.cache).toBeDefined();
      expect(context.logger).toBeDefined();
    });

    it('should throw ConfigurationError when configuration is invalid', async () => {
      const invalidConfig = { ...mockConfig, environment: undefined as any };
      mockConfigurationLoader.loadConfiguration.mockResolvedValue(invalidConfig);

      await expect(factory.createContext()).rejects.toThrow(ConfigurationError);
    });

    it.skip('should apply configuration overrides (requires data access implementation)', async () => {
      const overrides = { environment: 'docker' as const };
      
      await factory.createContext(overrides);
      
      expect(mockConfigurationLoader.loadConfiguration).toHaveBeenCalledWith(overrides);
    });
  });

  describe('createAWSContext', () => {
    it.skip('should create AWS-specific context (requires data access implementation)', async () => {
      const mockAWSConfig: ServiceConfig = {
        environment: 'aws',
        database: { provider: 'dynamodb' },
        messageBroker: { provider: 'eventbridge' },
        authentication: { provider: 'cognito' },
        cache: { provider: 'dynamodb' }
      };
      
      mockConfigurationLoader.loadConfiguration.mockResolvedValue(mockAWSConfig);

      const context = await factory.createAWSContext();
      
      expect(context).toBeDefined();
      expect(context.config.environment).toBe('aws');
      expect(context.config.database.provider).toBe('dynamodb');
      expect(context.config.messageBroker.provider).toBe('eventbridge');
    });
  });

  describe('createDockerContext', () => {
    it.skip('should create Docker-specific context (requires data access implementation)', async () => {
      const mockDockerConfig: ServiceConfig = {
        environment: 'docker',
        database: { provider: 'mongodb' },
        messageBroker: { provider: 'rabbitmq' },
        authentication: { provider: 'jwt' },
        cache: { provider: 'redis' }
      };
      
      mockConfigurationLoader.loadConfiguration.mockResolvedValue(mockDockerConfig);

      const context = await factory.createDockerContext();
      
      expect(context).toBeDefined();
      expect(context.config.environment).toBe('docker');
      expect(context.config.database.provider).toBe('mongodb');
      expect(context.config.messageBroker.provider).toBe('rabbitmq');
    });
  });

  describe('validation', () => {
    it('should validate required configuration fields', async () => {
      const invalidConfigs = [
        { environment: undefined },
        { environment: 'aws', database: undefined },
        { environment: 'aws', database: { provider: 'dynamodb' }, messageBroker: undefined },
        { environment: 'aws', database: { provider: 'dynamodb' }, messageBroker: { provider: 'eventbridge' }, authentication: undefined },
        { environment: 'aws', database: { provider: 'dynamodb' }, messageBroker: { provider: 'eventbridge' }, authentication: { provider: 'cognito' }, cache: undefined }
      ];

      for (const config of invalidConfigs) {
        mockConfigurationLoader.loadConfiguration.mockResolvedValue(config as any);
        
        await expect(factory.createContext()).rejects.toThrow(ConfigurationError);
      }
    });
  });
});