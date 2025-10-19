/**
 * Example usage of the message broker abstraction layer
 * This demonstrates how to use the same business logic with different message brokers
 */

import { 
  MessageBrokerFactory, 
  EventBridgeMessageBroker, 
  RabbitMQMessageBroker 
} from '../message-brokers';
import { 
  IMessageBroker, 
  MessageBrokerConfig, 
  BrokerMessage 
} from '../interfaces/service-context';

/**
 * Example service that uses message broker abstraction
 */
export class UserService {
  constructor(private messageBroker: IMessageBroker) {}

  async createUser(userData: any): Promise<any> {
    // Business logic for creating user
    const user = {
      id: 'user-123',
      email: userData.email,
      createdAt: new Date().toISOString()
    };

    // Publish event using abstracted message broker
    // This works identically with EventBridge or RabbitMQ
    await this.messageBroker.publish('user.created', {
      userId: user.id,
      email: user.email,
      timestamp: user.createdAt
    }, {
      correlationId: `user-creation-${user.id}`
    });

    return user;
  }

  async setupEventHandlers(): Promise<void> {
    // Subscribe to user-related events
    await this.messageBroker.subscribe('user.updated', async (message: BrokerMessage) => {
      console.log('Processing user update:', message.payload);
      // Handle user update logic
    });

    await this.messageBroker.subscribe('user.deleted', async (message: BrokerMessage) => {
      console.log('Processing user deletion:', message.payload);
      // Handle user deletion logic
    });
  }
}

/**
 * Example: Using EventBridge in AWS environment
 */
export async function createAWSUserService(): Promise<UserService> {
  const config: MessageBrokerConfig = {
    provider: 'eventbridge',
    region: 'us-east-1',
    eventBusName: 'mytaptrack-events'
  };

  const messageBroker = MessageBrokerFactory.create(config);
  await messageBroker.connect();

  const userService = new UserService(messageBroker);
  await userService.setupEventHandlers();

  return userService;
}

/**
 * Example: Using RabbitMQ in Docker environment
 */
export async function createDockerUserService(): Promise<UserService> {
  const config: MessageBrokerConfig = {
    provider: 'rabbitmq',
    connectionString: 'amqp://admin:password@localhost:5672'
  };

  const messageBroker = MessageBrokerFactory.create(config);
  await messageBroker.connect();

  const userService = new UserService(messageBroker);
  await userService.setupEventHandlers();

  return userService;
}

/**
 * Example: Environment-based configuration
 */
export async function createUserServiceFromEnvironment(): Promise<UserService> {
  // Automatically selects the right message broker based on environment variables:
  // MESSAGE_BROKER_PROVIDER=eventbridge (for AWS)
  // MESSAGE_BROKER_PROVIDER=rabbitmq (for Docker)
  const messageBroker = MessageBrokerFactory.createFromEnvironment();
  await messageBroker.connect();

  const userService = new UserService(messageBroker);
  await userService.setupEventHandlers();

  return userService;
}

/**
 * Example usage in different environments
 */
export async function demonstrateUsage(): Promise<void> {
  console.log('=== Message Broker Abstraction Demo ===');

  // The same business logic works in both environments
  const userData = { email: 'test@example.com' };

  try {
    // AWS Environment
    console.log('\n1. AWS Environment (EventBridge):');
    const awsUserService = await createAWSUserService();
    const awsUser = await awsUserService.createUser(userData);
    console.log('Created user in AWS:', awsUser);

    // Docker Environment  
    console.log('\n2. Docker Environment (RabbitMQ):');
    const dockerUserService = await createDockerUserService();
    const dockerUser = await dockerUserService.createUser(userData);
    console.log('Created user in Docker:', dockerUser);

    // Environment-based
    console.log('\n3. Environment-based configuration:');
    const envUserService = await createUserServiceFromEnvironment();
    const envUser = await envUserService.createUser(userData);
    console.log('Created user with env config:', envUser);

  } catch (error) {
    console.error('Error in demonstration:', error);
  }
}

/**
 * Example: Migrating existing EventBridge code to use abstraction
 */
export class LegacyEventService {
  // Old direct EventBridge usage
  async publishEventOld(eventType: string, data: any): Promise<void> {
    // Direct EventBridge client usage (tightly coupled)
    const eventBridge = new EventBridgeClient({ region: 'us-east-1' });
    await eventBridge.send(new PutEventsCommand({
      Entries: [{
        EventBusName: 'mytaptrack-events',
        Source: 'mytaptrack',
        DetailType: eventType,
        Detail: JSON.stringify(data)
      }]
    }));
  }

  // New abstracted approach
  constructor(private messageBroker: IMessageBroker) {}

  async publishEvent(eventType: string, data: any): Promise<void> {
    // Uses abstraction (works with any message broker)
    await this.messageBroker.publish(eventType, data);
  }
}

// Declare external dependencies for compilation
declare class EventBridgeClient {
  constructor(config: any);
  send(command: any): Promise<any>;
}
declare class PutEventsCommand {
  constructor(input: any);
}