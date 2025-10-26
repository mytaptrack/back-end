import { ServiceContext, BrokerMessage } from '../interfaces/service-context';
import { EventProcessor } from './event-processor';
import { ServiceUnavailableError } from '../errors/service-errors';

/**
 * Batch processing utility for handling multiple events efficiently
 * Provides retry logic, dead letter queue handling, and performance optimization
 */
export class BatchProcessor {
  private processingQueue: ProcessingBatch[] = [];
  private isProcessing = false;
  private batchSize: number;
  private batchTimeout: number;
  private maxRetries: number;
  private retryDelay: number;

  constructor(
    private context: ServiceContext,
    private config: BatchProcessorConfig = {}
  ) {
    this.batchSize = config.batchSize || 10;
    this.batchTimeout = config.batchTimeout || 5000; // 5 seconds
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000; // 1 second
  }

  /**
   * Add message to batch processing queue
   */
  async addToBatch(
    eventType: string,
    message: BrokerMessage,
    processor: EventProcessor
  ): Promise<void> {
    const batch = this.findOrCreateBatch(eventType, processor);
    batch.messages.push(message);

    // Process batch if it reaches the size limit
    if (batch.messages.length >= this.batchSize) {
      await this.processBatch(batch);
    }
  }

  /**
   * Start batch processing with timeout
   */
  async startBatchProcessing(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    // Set up periodic batch processing
    const intervalId = setInterval(async () => {
      try {
        await this.processAllBatches();
      } catch (error) {
        this.context.logger.error('Error in batch processing interval', { error });
      }
    }, this.batchTimeout);

    // Clean up on shutdown
    process.on('SIGTERM', () => {
      clearInterval(intervalId);
      this.isProcessing = false;
    });

    process.on('SIGINT', () => {
      clearInterval(intervalId);
      this.isProcessing = false;
    });
  }

  /**
   * Process all pending batches
   */
  async processAllBatches(): Promise<void> {
    const batchesToProcess = [...this.processingQueue];
    this.processingQueue = [];

    const processingPromises = batchesToProcess.map(batch => 
      this.processBatchWithRetry(batch)
    );

    await Promise.allSettled(processingPromises);
  }

  /**
   * Process a single batch with retry logic
   */
  private async processBatchWithRetry(batch: ProcessingBatch): Promise<void> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.maxRetries) {
      try {
        await this.processBatch(batch);
        return; // Success
      } catch (error) {
        attempt++;
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        this.context.logger.warn('Batch processing attempt failed', {
          eventType: batch.eventType,
          attempt,
          maxRetries: this.maxRetries,
          messageCount: batch.messages.length,
          error: lastError.message
        });

        if (attempt < this.maxRetries) {
          // Wait before retry with exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    // All retries failed - send to dead letter queue
    await this.sendToDeadLetterQueue(batch, lastError);
  }

  /**
   * Process a batch of messages
   */
  private async processBatch(batch: ProcessingBatch): Promise<void> {
    const startTime = Date.now();
    
    this.context.logger.info('Processing batch', {
      eventType: batch.eventType,
      messageCount: batch.messages.length
    });

    try {
      // Check if processor supports batch processing
      if (batch.processor.batchProcess) {
        await batch.processor.batchProcess(batch.messages);
      } else {
        // Fall back to sequential processing
        for (const message of batch.messages) {
          await batch.processor.process(message);
        }
      }

      const processingTime = Date.now() - startTime;
      
      this.context.logger.info('Batch processed successfully', {
        eventType: batch.eventType,
        messageCount: batch.messages.length,
        processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.context.logger.error('Batch processing failed', {
        eventType: batch.eventType,
        messageCount: batch.messages.length,
        processingTime,
        error
      });

      throw error;
    }
  }

  /**
   * Send failed batch to dead letter queue
   */
  private async sendToDeadLetterQueue(batch: ProcessingBatch, error: Error | null): Promise<void> {
    this.context.logger.error('Sending batch to dead letter queue', {
      eventType: batch.eventType,
      messageCount: batch.messages.length,
      error: error?.message
    });

    try {
      // Send each message to dead letter queue
      for (const message of batch.messages) {
        await this.context.messageBroker.publish(`${batch.eventType}.failed`, {
          originalMessage: message,
          error: error?.message,
          failedAt: new Date().toISOString(),
          retryCount: this.maxRetries
        }, {
          correlationId: message.metadata.correlationId
        });
      }

      // Log dead letter queue activity
      await this.logDeadLetterActivity(batch, error);

    } catch (dlqError) {
      this.context.logger.error('Failed to send batch to dead letter queue', {
        eventType: batch.eventType,
        messageCount: batch.messages.length,
        originalError: error?.message,
        dlqError
      });
    }
  }

  /**
   * Log dead letter queue activity for monitoring
   */
  private async logDeadLetterActivity(batch: ProcessingBatch, error: Error | null): Promise<void> {
    try {
      const dlqRecord = {
        pk: `DLQ#${batch.eventType}`,
        sk: `${Date.now()}`,
        eventType: batch.eventType,
        messageCount: batch.messages.length,
        error: error?.message,
        timestamp: new Date().toISOString(),
        messages: batch.messages.map(m => ({
          messageId: m.metadata.messageId,
          correlationId: m.metadata.correlationId,
          timestamp: m.metadata.timestamp
        }))
      };

      await this.context.dataAccess.put(dlqRecord);

    } catch (logError) {
      this.context.logger.error('Failed to log dead letter queue activity', { logError });
      // Don't throw - this is not critical
    }
  }

  /**
   * Find existing batch or create new one
   */
  private findOrCreateBatch(eventType: string, processor: EventProcessor): ProcessingBatch {
    let batch = this.processingQueue.find(b => b.eventType === eventType);
    
    if (!batch) {
      batch = {
        eventType,
        processor,
        messages: [],
        createdAt: new Date()
      };
      this.processingQueue.push(batch);
    }

    return batch;
  }

  /**
   * Get batch processing statistics
   */
  getStatistics(): BatchProcessorStats {
    const totalMessages = this.processingQueue.reduce((sum, batch) => sum + batch.messages.length, 0);
    const oldestBatch = this.processingQueue.reduce((oldest, batch) => 
      !oldest || batch.createdAt < oldest.createdAt ? batch : oldest, 
      null as ProcessingBatch | null
    );

    return {
      queuedBatches: this.processingQueue.length,
      queuedMessages: totalMessages,
      isProcessing: this.isProcessing,
      oldestBatchAge: oldestBatch ? Date.now() - oldestBatch.createdAt.getTime() : 0,
      batchSize: this.batchSize,
      batchTimeout: this.batchTimeout
    };
  }

  /**
   * Flush all pending batches immediately
   */
  async flush(): Promise<void> {
    this.context.logger.info('Flushing all pending batches', {
      batchCount: this.processingQueue.length
    });

    await this.processAllBatches();
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Configuration for batch processor
 */
export interface BatchProcessorConfig {
  batchSize?: number;
  batchTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Processing batch structure
 */
interface ProcessingBatch {
  eventType: string;
  processor: EventProcessor;
  messages: BrokerMessage[];
  createdAt: Date;
}

/**
 * Batch processor statistics
 */
export interface BatchProcessorStats {
  queuedBatches: number;
  queuedMessages: number;
  isProcessing: boolean;
  oldestBatchAge: number;
  batchSize: number;
  batchTimeout: number;
}

/**
 * Enhanced event processor with batch processing capabilities
 */
export abstract class BatchEventProcessor extends EventProcessor {
  protected batchProcessor: BatchProcessor;

  constructor(context: ServiceContext, batchConfig?: BatchProcessorConfig) {
    super(context);
    this.batchProcessor = new BatchProcessor(context, batchConfig);
  }

  /**
   * Initialize batch processing
   */
  async initialize(): Promise<void> {
    await this.batchProcessor.startBatchProcessing();
  }

  /**
   * Add message to batch queue instead of processing immediately
   */
  async queueForBatch(eventType: string, message: BrokerMessage): Promise<void> {
    await this.batchProcessor.addToBatch(eventType, message, this);
  }

  /**
   * Get batch processing statistics
   */
  getBatchStats(): BatchProcessorStats {
    return this.batchProcessor.getStatistics();
  }

  /**
   * Flush pending batches
   */
  async flushBatches(): Promise<void> {
    await this.batchProcessor.flush();
  }
}

/**
 * Retry policy for failed message processing
 */
export class RetryPolicy {
  constructor(
    private maxRetries: number = 3,
    private baseDelay: number = 1000,
    private maxDelay: number = 30000,
    private backoffMultiplier: number = 2
  ) {}

  /**
   * Calculate delay for retry attempt
   */
  calculateDelay(attempt: number): number {
    const delay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.maxDelay);
  }

  /**
   * Check if should retry based on attempt count
   */
  shouldRetry(attempt: number): boolean {
    return attempt < this.maxRetries;
  }

  /**
   * Get retry configuration
   */
  getConfig(): { maxRetries: number; baseDelay: number; maxDelay: number; backoffMultiplier: number } {
    return {
      maxRetries: this.maxRetries,
      baseDelay: this.baseDelay,
      maxDelay: this.maxDelay,
      backoffMultiplier: this.backoffMultiplier
    };
  }
}