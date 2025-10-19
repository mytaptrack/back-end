import { EventBridgeMessageBroker } from '../eventbridge-message-broker';
import { MessageBrokerConfig, BrokerMessage } from '../../interfaces/service-context';
import { MessageBrokerError } from '../../errors/service-errors';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-eventbridge', () => ({
  EventBridgeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  PutEventsCommand: jest.fn()
}));

describe('EventBridgeMessageBroker', () => {
  let broker: EventBridgeMessageBroker;
  let config: MessageBrokerConfig;

  beforeEach(() => {
    config = {
      provider: 'eventbridge',
      region: 'us-east-1',
      eventBusName: 'test-bus'
    };
    broker = new EventBridgeMessageBroker(config);
  });

  describe('constructor', () => {
    it('should create instance with valid configuration', () => {
      expect(broker).toBeInstanceOf(EventBridgeMessageBroker);
    });

    it('should throw error for invalid provider', () => {
      const invalidConfig = {
        provider: 'invalid'
      } as any;

      expect(() => new EventBridgeMessageBroker(invalidConfig)).toThrow(MessageBrokerError);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      (broker as any).client.send = mockSend;

      await expect(broker.connect()).resolves.not.toThrow();
      expect(mockSend).toHaveBeenCalled();
    });

    it('should throw error on connection failure', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('Connection failed'));
      (broker as any).client.send = mockSend;

      await expect(broker.connect()).rejects.toThrow(MessageBrokerError);
    });
  });

  describe('publish', () => {
    it('should publish event successfully', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      (broker as any).client.send = mockSend;

      const eventType = 'test-event';
      const payload = { data: 'test' };

      await expect(broker.publish(eventType, payload)).resolves.not.toThrow();
      expect(mockSend).toHaveBeenCalled();
    });

    it('should publish event with options', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      (broker as any).client.send = mockSend;

      const eventType = 'test-event';
      const payload = { data: 'test' };
      const options = { correlationId: 'test-correlation-id' };

      await expect(broker.publish(eventType, payload, options)).resolves.not.toThrow();
      expect(mockSend).toHaveBeenCalled();
    });

    it('should throw error on publish failure', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('Publish failed'));
      (broker as any).client.send = mockSend;

      const eventType = 'test-event';
      const payload = { data: 'test' };

      await expect(broker.publish(eventType, payload)).rejects.toThrow(MessageBrokerError);
    });
  });

  describe('subscribe', () => {
    it('should register subscriber', async () => {
      const handler = jest.fn();
      const eventType = 'test-event';

      await broker.subscribe(eventType, handler);

      const subscribers = broker.getSubscribers();
      expect(subscribers.has(eventType)).toBe(true);
      expect(subscribers.get(eventType)).toBe(handler);
    });
  });

  describe('unsubscribe', () => {
    it('should remove subscriber', async () => {
      const handler = jest.fn();
      const eventType = 'test-event';

      await broker.subscribe(eventType, handler);
      await broker.unsubscribe(eventType);

      const subscribers = broker.getSubscribers();
      expect(subscribers.has(eventType)).toBe(false);
    });
  });

  describe('processEventBridgeEvent', () => {
    it('should process EventBridge event correctly', async () => {
      const handler = jest.fn();
      const eventType = 'test-event';
      
      await broker.subscribe(eventType, handler);

      const eventBridgeEvent = {
        'detail-type': eventType,
        detail: {
          payload: { data: 'test' },
          metadata: {
            messageId: 'test-id',
            correlationId: 'test-correlation'
          }
        },
        id: 'event-id',
        time: '2023-01-01T00:00:00Z',
        source: 'mytaptrack'
      };

      await broker.processEventBridgeEvent(eventBridgeEvent);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        eventType,
        payload: { data: 'test' },
        metadata: expect.objectContaining({
          messageId: 'event-id',
          correlationId: 'test-correlation'
        })
      }));
    });

    it('should handle event with no registered handler', async () => {
      const eventBridgeEvent = {
        'detail-type': 'unregistered-event',
        detail: { payload: { data: 'test' } }
      };

      // Should not throw error
      await expect(broker.processEventBridgeEvent(eventBridgeEvent)).resolves.not.toThrow();
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      await expect(broker.disconnect()).resolves.not.toThrow();
    });
  });
});