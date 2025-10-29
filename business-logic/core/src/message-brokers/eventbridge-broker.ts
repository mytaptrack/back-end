import { IMessageBroker, MessageHandler, PublishOptions, SubscribeOptions, BrokerMessage } from '../interfaces/service-context';

/**
 * Simple EventBridge message broker for Lambda functions
 */
export class EventBridgeMessageBroker implements IMessageBroker {
  constructor(private config: any) {}

  async connect(): Promise<void> {
    // No connection needed for EventBridge
  }

  async disconnect(): Promise<void> {
    // No disconnection needed for EventBridge
  }

  async publish(eventType: string, payload: any, options?: PublishOptions): Promise<void> {
    // Use existing v2 library for now
    const { v2 } = require('@mytaptrack/lib');
    return v2.EventDal.sendEvents('lambda', [{
      type: eventType as any,
      data: payload
    }]);
  }

  async subscribe(eventType: string, handler: MessageHandler, options?: SubscribeOptions): Promise<void> {
    // EventBridge subscriptions are handled via Lambda triggers, not programmatically
    throw new Error('EventBridge subscriptions are configured via infrastructure, not at runtime');
  }

  async unsubscribe(eventType: string): Promise<void> {
    // EventBridge subscriptions are handled via Lambda triggers, not programmatically
    throw new Error('EventBridge subscriptions are configured via infrastructure, not at runtime');
  }
}