import { IMessageBroker, MessageBrokerConfig } from '../interfaces/service-context';
import { EventBridgeMessageBroker } from './eventbridge-message-broker';
import { RabbitMQMessageBroker } from './rabbitmq-message-broker';
import { MessageBrokerError } from '../errors/service-errors';

/**
 * Factory for creating message broker instances based on configuration
 */
export class MessageBrokerFactory {
  /**
   * Create a message broker instance based on the provided configuration
   */
  static create(config: MessageBrokerConfig): IMessageBroker {
    if (!config || !config.provider) {
      throw new MessageBrokerError(
        'Message broker configuration is required',
        undefined,
        { config }
      );
    }

    switch (config.provider) {
      case 'eventbridge':
        return new EventBridgeMessageBroker(config);
      
      case 'rabbitmq':
        return new RabbitMQMessageBroker(config);
      
      default:
        throw new MessageBrokerError(
          `Unsupported message broker provider: ${config.provider}`,
          undefined,
          { provider: config.provider, supportedProviders: ['eventbridge', 'rabbitmq'] }
        );
    }
  }

  /**
   * Create message broker from environment variables
   */
  static createFromEnvironment(): IMessageBroker {
    const provider = (process.env.MESSAGE_BROKER_PROVIDER || 'eventbridge') as 'eventbridge' | 'rabbitmq';
    
    const config: MessageBrokerConfig = {
      provider,
      connectionString: process.env.MESSAGE_BROKER_CONNECTION_STRING,
      region: process.env.AWS_REGION,
      eventBusName: process.env.EVENT_BUS
    };

    // Validate required configuration based on provider
    if (provider === 'eventbridge') {
      if (!config.region && !process.env.AWS_REGION) {
        throw new MessageBrokerError(
          'AWS region is required for EventBridge message broker',
          undefined,
          { provider, config }
        );
      }
    } else if (provider === 'rabbitmq') {
      if (!config.connectionString && !process.env.RABBITMQ_URL) {
        throw new MessageBrokerError(
          'Connection string is required for RabbitMQ message broker',
          undefined,
          { provider, config }
        );
      }
    }

    return MessageBrokerFactory.create(config);
  }

  /**
   * Validate message broker configuration
   */
  static validateConfig(config: MessageBrokerConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config) {
      errors.push('Configuration is required');
      return { valid: false, errors };
    }

    if (!config.provider) {
      errors.push('Provider is required');
    } else if (!['eventbridge', 'rabbitmq'].includes(config.provider)) {
      errors.push(`Unsupported provider: ${config.provider}`);
    }

    // Provider-specific validation
    if (config.provider === 'eventbridge') {
      if (!config.region && !process.env.AWS_REGION) {
        errors.push('Region is required for EventBridge provider');
      }
    } else if (config.provider === 'rabbitmq') {
      if (!config.connectionString && !process.env.RABBITMQ_URL) {
        errors.push('Connection string is required for RabbitMQ provider');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get supported providers
   */
  static getSupportedProviders(): string[] {
    return ['eventbridge', 'rabbitmq'];
  }
}