import { MessageBrokerFactory } from '../message-broker-factory';
import { EventBridgeMessageBroker } from '../eventbridge-message-broker';
import { RabbitMQMessageBroker } from '../rabbitmq-message-broker';
import { MessageBrokerConfig } from '../../interfaces/service-context';
import { MessageBrokerError } from '../../errors/service-errors';

describe('MessageBrokerFactory', () => {
  describe('create', () => {
    it('should create EventBridge message broker for eventbridge provider', () => {
      const config: MessageBrokerConfig = {
        provider: 'eventbridge',
        region: 'us-east-1',
        eventBusName: 'test-bus'
      };

      const broker = MessageBrokerFactory.create(config);
      expect(broker).toBeInstanceOf(EventBridgeMessageBroker);
    });

    it('should create RabbitMQ message broker for rabbitmq provider', () => {
      const config: MessageBrokerConfig = {
        provider: 'rabbitmq',
        connectionString: 'amqp://localhost:5672'
      };

      const broker = MessageBrokerFactory.create(config);
      expect(broker).toBeInstanceOf(RabbitMQMessageBroker);
    });

    it('should throw error for unsupported provider', () => {
      const config = {
        provider: 'unsupported'
      } as any;

      expect(() => MessageBrokerFactory.create(config)).toThrow(MessageBrokerError);
    });

    it('should throw error for missing configuration', () => {
      expect(() => MessageBrokerFactory.create(null as any)).toThrow(MessageBrokerError);
    });
  });

  describe('validateConfig', () => {
    it('should validate EventBridge configuration', () => {
      const config: MessageBrokerConfig = {
        provider: 'eventbridge',
        region: 'us-east-1'
      };

      const result = MessageBrokerFactory.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate RabbitMQ configuration', () => {
      const config: MessageBrokerConfig = {
        provider: 'rabbitmq',
        connectionString: 'amqp://localhost:5672'
      };

      const result = MessageBrokerFactory.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid configuration', () => {
      const config = {
        provider: 'invalid'
      } as any;

      const result = MessageBrokerFactory.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return errors for missing required fields', () => {
      const config: MessageBrokerConfig = {
        provider: 'eventbridge'
        // Missing region
      };

      // Mock process.env to not have AWS_REGION
      const originalEnv = process.env.AWS_REGION;
      delete process.env.AWS_REGION;

      const result = MessageBrokerFactory.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Region is required for EventBridge provider');

      // Restore environment
      if (originalEnv) {
        process.env.AWS_REGION = originalEnv;
      }
    });
  });

  describe('getSupportedProviders', () => {
    it('should return list of supported providers', () => {
      const providers = MessageBrokerFactory.getSupportedProviders();
      expect(providers).toContain('eventbridge');
      expect(providers).toContain('rabbitmq');
    });
  });
});