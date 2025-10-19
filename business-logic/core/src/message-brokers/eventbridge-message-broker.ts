// Note: Import statements will be resolved when dependencies are properly installed
// import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
// import { v4 as uuidv4 } from 'uuid';

import { 
  IMessageBroker, 
  BrokerMessage, 
  MessageHandler, 
  PublishOptions, 
  SubscribeOptions,
  MessageBrokerConfig 
} from '../interfaces/service-context';
import { MessageBrokerError } from '../errors/service-errors';

// Temporary type definitions for compilation
declare class EventBridgeClient {
  constructor(config?: any);
  send(command: any): Promise<any>;
}
declare class PutEventsCommand {
  constructor(input: any);
}
declare function uuidv4(): string;

/**
 * EventBridge implementation of the message broker interface
 * Wraps AWS EventBridge functionality for serverless deployment
 */
export class EventBridgeMessageBroker implements IMessageBroker {
  private client: EventBridgeClient;
  private eventBusName: string;
  private source: string;
  private subscribers: Map<string, MessageHandler> = new Map();

  constructor(config: MessageBrokerConfig) {
    if (config.provider !== 'eventbridge') {
      throw new MessageBrokerError('Invalid provider for EventBridge message broker');
    }

    this.client = new EventBridgeClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1'
    });
    
    this.eventBusName = config.eventBusName || process.env.EVENT_BUS || 'default';
    this.source = 'mytaptrack';
  }

  async connect(): Promise<void> {
    // EventBridge doesn't require explicit connection
    // Validate configuration by attempting to describe the event bus
    try {
      // Test connection by sending a test event (this will be filtered out)
      await this.client.send(new PutEventsCommand({
        Entries: [{
          EventBusName: this.eventBusName,
          Source: this.source,
          DetailType: 'connection-test',
          Detail: JSON.stringify({ test: true, timestamp: new Date().toISOString() })
        }]
      }));
    } catch (error) {
      throw new MessageBrokerError(
        `Failed to connect to EventBridge: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { eventBusName: this.eventBusName, source: this.source }
      );
    }
  }

  async disconnect(): Promise<void> {
    // EventBridge doesn't require explicit disconnection
    this.subscribers.clear();
  }

  async publish(eventType: string, payload: any, options?: PublishOptions): Promise<void> {
    try {
      const messageId = uuidv4();
      const timestamp = new Date();

      const entry = {
        EventBusName: this.eventBusName,
        Source: this.source,
        DetailType: eventType,
        Detail: JSON.stringify({
          payload,
          metadata: {
            messageId,
            timestamp: timestamp.toISOString(),
            source: this.source,
            correlationId: options?.correlationId
          }
        })
      };

      await this.client.send(new PutEventsCommand({
        Entries: [entry]
      }));

    } catch (error) {
      throw new MessageBrokerError(
        `Failed to publish event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        options?.correlationId,
        { eventType, eventBusName: this.eventBusName }
      );
    }
  }

  async subscribe(eventType: string, handler: MessageHandler, options?: SubscribeOptions): Promise<void> {
    // EventBridge subscriptions are handled through Lambda event source mappings
    // This method stores the handler for potential local testing or hybrid scenarios
    this.subscribers.set(eventType, handler);
    
    // In a real AWS environment, this would be configured through CDK/CloudFormation
    // The Lambda functions would be configured with EventBridge rules that filter by DetailType
    console.warn(
      `EventBridge subscription for ${eventType} registered locally. ` +
      `Ensure Lambda event source mapping is configured in infrastructure code.`
    );
  }

  async unsubscribe(eventType: string): Promise<void> {
    this.subscribers.delete(eventType);
    
    // In a real AWS environment, this would remove the EventBridge rule
    console.warn(
      `EventBridge subscription for ${eventType} removed locally. ` +
      `Ensure Lambda event source mapping is removed in infrastructure code.`
    );
  }

  /**
   * Process an EventBridge event (used by Lambda handlers)
   * This method converts EventBridge events to the standard BrokerMessage format
   */
  async processEventBridgeEvent(event: any): Promise<void> {
    try {
      const eventType = event['detail-type'] || event.DetailType;
      const detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      
      const brokerMessage: BrokerMessage = {
        eventType,
        payload: detail.payload || detail,
        metadata: {
          messageId: event.id || uuidv4(),
          timestamp: new Date(event.time || Date.now()),
          source: event.source || this.source,
          correlationId: detail.metadata?.correlationId
        }
      };

      const handler = this.subscribers.get(eventType);
      if (handler) {
        await handler(brokerMessage);
      } else {
        console.warn(`No handler registered for event type: ${eventType}`);
      }
    } catch (error) {
      throw new MessageBrokerError(
        `Failed to process EventBridge event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { event }
      );
    }
  }

  /**
   * Get registered subscribers (for testing purposes)
   */
  getSubscribers(): Map<string, MessageHandler> {
    return new Map(this.subscribers);
  }
}