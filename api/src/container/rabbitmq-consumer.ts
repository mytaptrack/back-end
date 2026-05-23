import amqp from 'amqplib';
import { validateDynamoDB } from './local-env-setup';
import { processData as trackProcessor } from '../graphql/resolver/mutations/report/process';
import { LoggingLevel, MttLogger } from '@mytaptrack/lib';

const logger = new MttLogger('RabbitMQ-Consumer', LoggingLevel.debug);

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://mytaptrack:mytaptrack@localhost:5672';

export class RabbitMQConsumer {
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  async connect() {
    try {
      logger.log('Connecting to RabbitMQ...', RABBITMQ_URL);
      this.connection = await amqp.connect(RABBITMQ_URL);
      this.channel = await this.connection.createChannel();
      
      // Set up error handlers
      this.connection.on('error', (err) => {
        logger.error('RabbitMQ connection error:', err);
      });
      
      this.connection.on('close', () => {
        logger.log('RabbitMQ connection closed');
      });
      
      logger.log('✓ Connected to RabbitMQ');
    } catch (error) {
      logger.error('✗ Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  async startReportDataConsumer() {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const queueName = 'report-data-queue';
    await this.channel.assertQueue(queueName, { durable: true });
    
    // Set prefetch to 1 to process messages one at a time
    await this.channel.prefetch(1);
    
    logger.log(`Starting consumer for queue: ${queueName}`);
    
    this.channel.consume(queueName, async (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString());
          logger.log('Processing report data message:', data);
                    
          await trackProcessor(data, data.studentId);
          logger.log('✓ Successfully processed report data message');
          
          this.channel!.ack(msg);
        } catch (error) {
          logger.error('✗ Error processing report data message:', error.message);
          this.channel!.nack(msg, false, false); // Don't requeue on error
        }
      }
    });
    
    logger.log('✓ Report data consumer started');
  }

  async close() {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}

// Start consumer if run directly
if (require.main === module) {
  async function start() {
    try {
      logger.log('Starting RabbitMQ consumer service...');
      
      // Validate DynamoDB connection first
      await validateDynamoDB();
      
      const consumer = new RabbitMQConsumer();
      await consumer.connect();
      await consumer.startReportDataConsumer();
      
      logger.log('RabbitMQ consumer service is running...');
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        logger.log('Shutting down RabbitMQ consumer...');
        await consumer.close();
        process.exit(0);
      });
      
    } catch (error) {
      logger.error('Failed to start RabbitMQ consumer:', error);
      process.exit(1);
    }
  }
  
  start();
}
