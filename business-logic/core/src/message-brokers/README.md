# Message Broker Abstraction Layer

This module provides a unified interface for message brokering that works with both AWS EventBridge (for serverless deployment) and RabbitMQ (for Docker deployment). The abstraction allows the same business logic to work in both environments without code changes.

## Features

- **Unified Interface**: Single `IMessageBroker` interface for all message broker implementations
- **Environment Agnostic**: Same business logic works with EventBridge or RabbitMQ
- **Factory Pattern**: Automatic selection of message broker based on configuration
- **Error Handling**: Comprehensive error handling with retry logic
- **Type Safety**: Full TypeScript support with proper type definitions
- **Testing Support**: Mockable interfaces for unit testing

## Supported Message Brokers

### EventBridge (AWS)
- Used in AWS serverless deployment
- Integrates with existing Lambda event source mappings
- Supports EventBridge rules and targets
- Automatic retry and dead letter queue handling

### RabbitMQ (Docker)
- Used in Docker containerized deployment
- Topic-based message routing
- Dead letter queue support
- Connection retry with exponential backoff
- Configurable prefetch and acknowledgment

## Quick Start

### Basic Usage

```typescript
import { MessageBrokerFactory, IMessageBroker } from '@mytaptrack/business-logic-core';

// Create message broker from configuration
const config = {
  provider: 'eventbridge', // or 'rabbitmq'
  region: 'us-east-1',     // for EventBridge
  eventBusName: 'mytaptrack-events'
};

const messageBroker = MessageBrokerFactory.create(config);
await messageBroker.connect();

// Publish events
await messageBroker.publish('user.created', {
  userId: '123',
  email: 'user@example.com'
});

// Subscribe to events
await messageBroker.subscribe('user.created', async (message) => {
  console.log('User created:', message.payload);
});
```

### Environment-Based Configuration

```typescript
// Automatically selects broker based on environment variables
const messageBroker = MessageBrokerFactory.createFromEnvironment();
await messageBroker.connect();
```

Set environment variables:
```bash
# For EventBridge
MESSAGE_BROKER_PROVIDER=eventbridge
AWS_REGION=us-east-1
EVENT_BUS=mytaptrack-events

# For RabbitMQ
MESSAGE_BROKER_PROVIDER=rabbitmq
RABBITMQ_URL=amqp://admin:password@localhost:5672
```

## Configuration

### EventBridge Configuration

```typescript
interface EventBridgeConfig {
  provider: 'eventbridge';
  region: string;           // AWS region
  eventBusName?: string;    // EventBridge event bus name (default: 'default')
}
```

### RabbitMQ Configuration

```typescript
interface RabbitMQConfig {
  provider: 'rabbitmq';
  connectionString: string; // AMQP connection URL
}
```

## API Reference

### IMessageBroker Interface

```typescript
interface IMessageBroker {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(eventType: string, payload: any, options?: PublishOptions): Promise<void>;
  subscribe(eventType: string, handler: MessageHandler, options?: SubscribeOptions): Promise<void>;
  unsubscribe(eventType: string): Promise<void>;
}
```

### Message Format

All messages follow a standardized format:

```typescript
interface BrokerMessage {
  eventType: string;
  payload: any;
  metadata: {
    messageId: string;
    timestamp: Date;
    source: string;
    correlationId?: string;
  };
}
```

### Publish Options

```typescript
interface PublishOptions {
  correlationId?: string;  // For request tracing
  delay?: number;          // Delay in milliseconds (RabbitMQ only)
  priority?: number;       // Message priority (0-255)
}
```

### Subscribe Options

```typescript
interface SubscribeOptions {
  durable?: boolean;       // Durable queue (RabbitMQ only)
  autoAck?: boolean;       // Auto-acknowledge messages
  prefetch?: number;       // Prefetch count (RabbitMQ only)
}
```

## Implementation Details

### EventBridge Implementation

- Uses AWS SDK v3 EventBridge client
- Publishes events to specified event bus
- Subscriptions are handled through Lambda event source mappings
- Supports correlation ID tracking
- Automatic retry through EventBridge configuration

### RabbitMQ Implementation

- Uses amqplib for AMQP protocol
- Topic exchange for flexible routing
- Dead letter exchange for failed messages
- Connection retry with exponential backoff
- Configurable prefetch and acknowledgment modes

### Message Routing

#### EventBridge
- Events are published with `DetailType` set to the event type
- Lambda functions filter events using EventBridge rules
- Source is always set to 'mytaptrack'

#### RabbitMQ
- Event types are converted to routing keys (dots to underscores)
- Queues are named `mytaptrack.{eventType}`
- Topic exchange allows flexible subscription patterns

## Error Handling

All message broker operations throw `MessageBrokerError` on failure:

```typescript
try {
  await messageBroker.publish('user.created', userData);
} catch (error) {
  if (error instanceof MessageBrokerError) {
    console.error('Message broker error:', error.message);
    console.error('Correlation ID:', error.correlationId);
    console.error('Context:', error.context);
  }
}
```

## Testing

### Unit Testing

Mock the message broker interface for unit tests:

```typescript
const mockMessageBroker: jest.Mocked<IMessageBroker> = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  publish: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn()
};

const userService = new UserService(mockMessageBroker);
```

### Integration Testing

Use the factory to create real instances for integration tests:

```typescript
// Test with EventBridge
const eventBridgeBroker = MessageBrokerFactory.create({
  provider: 'eventbridge',
  region: 'us-east-1'
});

// Test with RabbitMQ
const rabbitMQBroker = MessageBrokerFactory.create({
  provider: 'rabbitmq',
  connectionString: 'amqp://localhost:5672'
});
```

## Migration Guide

### From Direct EventBridge Usage

**Before:**
```typescript
const eventBridge = new EventBridgeClient({ region: 'us-east-1' });
await eventBridge.send(new PutEventsCommand({
  Entries: [{
    EventBusName: 'mytaptrack-events',
    Source: 'mytaptrack',
    DetailType: 'user.created',
    Detail: JSON.stringify(userData)
  }]
}));
```

**After:**
```typescript
const messageBroker = MessageBrokerFactory.create({
  provider: 'eventbridge',
  region: 'us-east-1',
  eventBusName: 'mytaptrack-events'
});
await messageBroker.publish('user.created', userData);
```

### From Direct RabbitMQ Usage

**Before:**
```typescript
const connection = await amqp.connect('amqp://localhost:5672');
const channel = await connection.createChannel();
await channel.assertExchange('events', 'topic');
channel.publish('events', 'user.created', Buffer.from(JSON.stringify(userData)));
```

**After:**
```typescript
const messageBroker = MessageBrokerFactory.create({
  provider: 'rabbitmq',
  connectionString: 'amqp://localhost:5672'
});
await messageBroker.publish('user.created', userData);
```

## Best Practices

1. **Use Factory Pattern**: Always use `MessageBrokerFactory.create()` instead of direct instantiation
2. **Environment Configuration**: Use `createFromEnvironment()` for environment-based configuration
3. **Error Handling**: Always wrap message broker operations in try-catch blocks
4. **Connection Management**: Call `connect()` once during service initialization
5. **Graceful Shutdown**: Call `disconnect()` during service shutdown
6. **Correlation IDs**: Use correlation IDs for request tracing across services
7. **Event Naming**: Use consistent event naming conventions (e.g., `entity.action`)

## Dependencies

- `@aws-sdk/client-eventbridge`: AWS EventBridge client
- `amqplib`: RabbitMQ AMQP client
- `uuid`: For generating unique message IDs

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MESSAGE_BROKER_PROVIDER` | Message broker type (`eventbridge` or `rabbitmq`) | `eventbridge` |
| `AWS_REGION` | AWS region for EventBridge | `us-east-1` |
| `EVENT_BUS` | EventBridge event bus name | `default` |
| `RABBITMQ_URL` | RabbitMQ connection URL | `amqp://localhost:5672` |

## Troubleshooting

### EventBridge Issues

- **Permission Errors**: Ensure Lambda execution role has EventBridge permissions
- **Event Bus Not Found**: Verify event bus name and region
- **Events Not Received**: Check EventBridge rules and Lambda event source mappings

### RabbitMQ Issues

- **Connection Failures**: Verify RabbitMQ server is running and connection string is correct
- **Message Not Delivered**: Check exchange and queue bindings
- **Performance Issues**: Adjust prefetch settings and connection pooling

### General Issues

- **Type Errors**: Ensure all dependencies are properly installed
- **Configuration Errors**: Use `MessageBrokerFactory.validateConfig()` to validate configuration
- **Network Issues**: Implement retry logic and connection monitoring