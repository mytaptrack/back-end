// Note: Import statements will be resolved when dependencies are properly installed
// import * as amqp from 'amqplib';
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
declare namespace amqp {
  interface Connection {
    createChannel(): Promise<Channel>;
    on(event: string, callback: (error?: any) => void): void;
    close(): Promise<void>;
  }
  
  interface Channel {
    assertExchange(exchange: string, type: string, options?: any): Promise<void>;
    assertQueue(queue: string, options?: any): Promise<void>;
    bindQueue(queue: string, exchange: string, routingKey: string): Promise<void>;
    publish(exchange: string, routingKey: string, content: Buffer, options?: any): boolean;
    consume(queue: string, callback: (msg: any) => void, options?: any): Promise<void>;
    ack(msg: any): void;
    nack(msg: any, allUpTo?: boolean, requeue?: boolean): void;
    cancel(consumerTag: string): Promise<void>;
    prefetch(count: number): Promise<void>;
    close(): Promise<void>;
  }
  
  namespace Options {
    interface Publish {
      persistent?: boolean;
      messageId?: string;
      timestamp?: number;
      correlationId?: string;
      priority?: number;
      headers?: Record<string, any>;
    }
    
    interface AssertQueue {
      durable?: boolean;
      arguments?: Record<string, any>;
    }
  }
  
  function connect(url: string, options?: any): Promise<Connection>;
}

declare function uuidv4(): string;

/**
 * RabbitMQ implementation of the message broker interface
 * Provides message brokering for Docker deployment
 */
export class RabbitMQMessageBroker implements IMessageBroker {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private connectionString: string;
  private exchangeName: string;
  private deadLetterExchange: string;
  private subscribers: Map<string, { handler: MessageHandler; options?: SubscribeOptions }> = new Map();
  private isConnected: boolean = false;

  constructor(config: MessageBrokerConfig) {
    if (config.provider !== 'rabbitmq') {
      throw new MessageBrokerError('Invalid provider for RabbitMQ message broker');
    }

    this.connectionString = config.connectionString || process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    this.exchangeName = 'mytaptrack.events';
    this.deadLetterExchange = 'mytaptrack.events.dlx';
  }

  async connect(): Promise<void> {
    try {
      // Create connection with retry logic
      this.connection = await this.createConnectionWithRetry();
      
      // Create channel
      this.channel = await this.connection.createChannel();
      
      // Set up exchanges
      await this.setupExchanges();
      
      // Handle connection events
      this.connection.on('error', (error) => {
        console.error('RabbitMQ connection error:', error);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        console.warn('RabbitMQ connection closed');
        this.isConnected = false;
      });

      this.isConnected = true;
      
    } catch (error) {
      throw new MessageBrokerError(
        `Failed to connect to RabbitMQ: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { connectionString: this.connectionString }
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.isConnected = false;
      
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      this.subscribers.clear();
    } catch (error) {
      throw new MessageBrokerError(
        `Failed to disconnect from RabbitMQ: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async publish(eventType: string, payload: any, options?: PublishOptions): Promise<void> {
    if (!this.channel || !this.isConnected) {
      throw new MessageBrokerError('RabbitMQ not connected');
    }

    try {
      const messageId = uuidv4();
      const timestamp = new Date();
      const routingKey = this.eventTypeToRoutingKey(eventType);

      const message: BrokerMessage = {
        eventType,
        payload,
        metadata: {
          messageId,
          timestamp,
          source: 'mytaptrack',
          correlationId: options?.correlationId
        }
      };

      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      const publishOptions: amqp.Options.Publish = {
        persistent: true,
        messageId,
        timestamp: timestamp.getTime(),
        correlationId: options?.correlationId,
        priority: options?.priority || 0
      };

      // Add delay if specified
      if (options?.delay && options.delay > 0) {
        publishOptions.headers = {
          'x-delay': options.delay
        };
      }

      const published = this.channel.publish(
        this.exchangeName,
        routingKey,
        messageBuffer,
        publishOptions
      );

      if (!published) {
        throw new MessageBrokerError('Failed to publish message to RabbitMQ exchange');
      }

    } catch (error) {
      throw new MessageBrokerError(
        `Failed to publish event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        options?.correlationId,
        { eventType, exchange: this.exchangeName }
      );
    }
  }

  async subscribe(eventType: string, handler: MessageHandler, options?: SubscribeOptions): Promise<void> {
    if (!this.channel || !this.isConnected) {
      throw new MessageBrokerError('RabbitMQ not connected');
    }

    try {
      const routingKey = this.eventTypeToRoutingKey(eventType);
      const queueName = `mytaptrack.${eventType}`;
      
      // Store subscriber info
      this.subscribers.set(eventType, { handler, options });

      // Declare queue with dead letter exchange
      const queueOptions: amqp.Options.AssertQueue = {
        durable: options?.durable !== false,
        arguments: {
          'x-dead-letter-exchange': this.deadLetterExchange,
          'x-dead-letter-routing-key': `${routingKey}.failed`
        }
      };

      await this.channel.assertQueue(queueName, queueOptions);
      
      // Bind queue to exchange
      await this.channel.bindQueue(queueName, this.exchangeName, routingKey);
      
      // Set prefetch if specified
      if (options?.prefetch) {
        await this.channel.prefetch(options.prefetch);
      }

      // Start consuming
      await this.channel.consume(queueName, async (msg) => {
        if (!msg) return;

        try {
          const brokerMessage: BrokerMessage = JSON.parse(msg.content.toString());
          
          // Execute handler
          await handler(brokerMessage);
          
          // Acknowledge message if auto-ack is not disabled
          if (options?.autoAck !== false) {
            this.channel?.ack(msg);
          }
          
        } catch (error) {
          console.error(`Error processing message for ${eventType}:`, error);
          
          // Reject message and send to dead letter queue
          this.channel?.nack(msg, false, false);
        }
      }, {
        noAck: options?.autoAck === true
      });

    } catch (error) {
      throw new MessageBrokerError(
        `Failed to subscribe to event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { eventType, exchange: this.exchangeName }
      );
    }
  }

  async unsubscribe(eventType: string): Promise<void> {
    if (!this.channel || !this.isConnected) {
      throw new MessageBrokerError('RabbitMQ not connected');
    }

    try {
      const queueName = `mytaptrack.${eventType}`;
      
      // Cancel consumer
      await this.channel.cancel(queueName);
      
      // Remove from subscribers
      this.subscribers.delete(eventType);
      
    } catch (error) {
      throw new MessageBrokerError(
        `Failed to unsubscribe from event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { eventType }
      );
    }
  }

  /**
   * Create connection with retry logic
   */
  private async createConnectionWithRetry(maxRetries: number = 5, delay: number = 1000): Promise<amqp.Connection> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await amqp.connect(this.connectionString, {
          heartbeat: 60,
          connectionTimeout: 10000,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown connection error');
        
        if (attempt < maxRetries) {
          console.warn(`RabbitMQ connection attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        }
      }
    }
    
    throw lastError || new Error('Failed to connect to RabbitMQ after retries');
  }

  /**
   * Set up exchanges and dead letter exchange
   */
  private async setupExchanges(): Promise<void> {
    if (!this.channel) {
      throw new MessageBrokerError('Channel not available');
    }

    // Main events exchange
    await this.channel.assertExchange(this.exchangeName, 'topic', {
      durable: true
    });

    // Dead letter exchange
    await this.channel.assertExchange(this.deadLetterExchange, 'topic', {
      durable: true
    });

    // Dead letter queue
    await this.channel.assertQueue('mytaptrack.failed', {
      durable: true
    });

    // Bind dead letter queue to dead letter exchange
    await this.channel.bindQueue('mytaptrack.failed', this.deadLetterExchange, '#');
  }

  /**
   * Convert event type to RabbitMQ routing key
   */
  private eventTypeToRoutingKey(eventType: string): string {
    // Convert dots to underscores and ensure lowercase
    return eventType.toLowerCase().replace(/\./g, '_');
  }

  /**
   * Get connection status
   */
  isConnectionActive(): boolean {
    return this.isConnected && this.connection !== null && this.channel !== null;
  }

  /**
   * Get registered subscribers (for testing purposes)
   */
  getSubscribers(): Map<string, { handler: MessageHandler; options?: SubscribeOptions }> {
    return new Map(this.subscribers);
  }
}