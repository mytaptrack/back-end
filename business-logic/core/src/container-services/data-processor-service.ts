import { ServiceContext } from '../interfaces/service-context';
import { ContainerService } from './container-service';
import { ServerConfig } from './interfaces';
import { BrokerMessage, MessageHandler } from '../interfaces/service-context';
import { ServiceUnavailableError } from '../errors/service-errors';
import { BatchProcessor, BatchProcessorConfig } from './batch-processor';
import { EventProcessor } from './event-processor';
import { 
  LicenseToUserProcessor, 
  LicenseToS3Processor, 
  LicenseToStudentProcessor 
} from './event-handlers/license-event-handlers';
import { 
  StudentToS3Processor, 
  AppToS3Processor, 
  StudentRemovalProcessor, 
  StudentOrphanCleanupProcessor 
} from './event-handlers/student-event-handlers';
import { NotificationToUserProcessor } from './event-handlers/notification-event-handlers';

/**
 * Data processing container service that handles background event processing
 * Replaces Lambda-based event handlers with containerized event processing
 */
export class DataProcessorService extends ContainerService {
  private eventHandlers: Map<string, EventProcessor> = new Map();
  private batchProcessor: BatchProcessor;
  private isProcessing = false;
  private processingStats = {
    totalProcessed: 0,
    totalErrors: 0,
    lastProcessedAt: null as Date | null,
    startedAt: new Date()
  };

  constructor(config: ServerConfig, batchConfig?: BatchProcessorConfig) {
    super(config);
    // Initialize batch processor when service context is available
    this.batchProcessor = null as any; // Will be initialized in initialize()
  }

  /**
   * Get service name
   */
  protected getServiceName(): string {
    return 'data-processor';
  }

  /**
   * Initialize the data processor service
   */
  public async initialize(): Promise<void> {
    await super.initialize();
    
    // Initialize batch processor
    this.batchProcessor = new BatchProcessor(this.serviceContext!, {
      batchSize: 10,
      batchTimeout: 5000,
      maxRetries: 3,
      retryDelay: 1000
    });
    
    // Register event processors
    await this.registerEventProcessors();
    
    // Start batch processing
    await this.batchProcessor.startBatchProcessing();
    
    // Start event processing
    await this.startEventProcessing();
    
    this.serviceContext?.logger.info('Data processor service initialized', {
      registeredProcessors: Array.from(this.eventHandlers.keys())
    });
  }

  /**
   * Setup service-specific routes
   */
  protected async setupRoutes(): Promise<void> {
    // Processing stats endpoint
    this.app.get('/stats', (req, res) => {
      const batchStats = this.batchProcessor?.getStatistics() || {};
      res.json({
        ...this.processingStats,
        uptime: Date.now() - this.processingStats.startedAt.getTime(),
        isProcessing: this.isProcessing,
        registeredProcessors: Array.from(this.eventHandlers.keys()),
        batchProcessing: batchStats
      });
    });

    // Trigger reprocessing endpoint (for manual operations)
    this.app.post('/reprocess/:eventType', async (req, res) => {
      try {
        const { eventType } = req.params;
        const processor = this.eventHandlers.get(eventType);
        
        if (!processor) {
          return res.status(404).json({ error: 'Event processor not found' });
        }

        // Trigger reprocessing if supported
        if (processor.reprocess) {
          await processor.reprocess();
          res.json({ message: `Reprocessing triggered for ${eventType}` });
        } else {
          res.status(400).json({ error: 'Reprocessing not supported for this event type' });
        }
      } catch (error) {
        this.serviceContext?.logger.error('Reprocessing error', { error, eventType: req.params.eventType });
        res.status(500).json({ error: 'Reprocessing failed' });
      }
    });

    // Flush batch processing endpoint
    this.app.post('/flush', async (req, res) => {
      try {
        await this.batchProcessor.flush();
        res.json({ message: 'Batch processing flushed successfully' });
      } catch (error) {
        this.serviceContext?.logger.error('Batch flush error', { error });
        res.status(500).json({ error: 'Batch flush failed' });
      }
    });
  }

  /**
   * Register all event processors
   */
  private async registerEventProcessors(): Promise<void> {
    if (!this.serviceContext) {
      throw new ServiceUnavailableError('Service context not available');
    }

    // Register license event processors (ported from Lambda functions)
    this.eventHandlers.set('license.to.user', new LicenseToUserProcessor(this.serviceContext));
    this.eventHandlers.set('license.to.s3', new LicenseToS3Processor(this.serviceContext));
    this.eventHandlers.set('license.to.student', new LicenseToStudentProcessor(this.serviceContext));

    // Register student event processors (ported from Lambda functions)
    this.eventHandlers.set('student.to.s3', new StudentToS3Processor(this.serviceContext));
    this.eventHandlers.set('app.to.s3', new AppToS3Processor(this.serviceContext));
    this.eventHandlers.set('student.removal', new StudentRemovalProcessor(this.serviceContext));
    this.eventHandlers.set('student.orphan.cleanup', new StudentOrphanCleanupProcessor(this.serviceContext));

    // Register notification processors (ported from Lambda functions)
    this.eventHandlers.set('notification.to.user', new NotificationToUserProcessor(this.serviceContext));

    // Register generic event processors
    this.eventHandlers.set('user', new UserEventProcessor(this.serviceContext));
    this.eventHandlers.set('user.created', new UserCreatedProcessor(this.serviceContext));
    this.eventHandlers.set('user.updated', new UserUpdatedProcessor(this.serviceContext));
    this.eventHandlers.set('user.deleted', new UserDeletedProcessor(this.serviceContext));

    this.eventHandlers.set('student', new StudentEventProcessor(this.serviceContext));
    this.eventHandlers.set('student.created', new StudentCreatedProcessor(this.serviceContext));
    this.eventHandlers.set('student.updated', new StudentUpdatedProcessor(this.serviceContext));
    this.eventHandlers.set('student.documents.updated', new StudentDocumentsProcessor(this.serviceContext));

    this.eventHandlers.set('license', new LicenseEventProcessor(this.serviceContext));
    this.eventHandlers.set('license.created', new LicenseCreatedProcessor(this.serviceContext));
    this.eventHandlers.set('license.updated', new LicenseUpdatedProcessor(this.serviceContext));

    this.eventHandlers.set('app', new AppEventProcessor(this.serviceContext));
    this.eventHandlers.set('app.created', new AppCreatedProcessor(this.serviceContext));
    this.eventHandlers.set('app.updated', new AppUpdatedProcessor(this.serviceContext));

    // Register DynamoDB stream processor (for AWS compatibility)
    this.eventHandlers.set('dynamodb.stream', new DynamoDBStreamProcessor(this.serviceContext));

    this.serviceContext.logger.info('Event processors registered', {
      count: this.eventHandlers.size,
      processors: Array.from(this.eventHandlers.keys())
    });
  }

  /**
   * Start event processing by subscribing to message broker
   */
  private async startEventProcessing(): Promise<void> {
    if (!this.serviceContext) {
      throw new ServiceUnavailableError('Service context not available');
    }

    this.isProcessing = true;

    // Subscribe to all registered event types
    for (const [eventType, processor] of this.eventHandlers) {
      await this.subscribeToEvent(eventType, processor);
    }

    this.serviceContext.logger.info('Event processing started', {
      subscribedEvents: Array.from(this.eventHandlers.keys())
    });
  }

  /**
   * Subscribe to a specific event type
   */
  private async subscribeToEvent(eventType: string, processor: EventProcessor): Promise<void> {
    if (!this.serviceContext) {
      return;
    }

    const handler: MessageHandler = async (message: BrokerMessage) => {
      const startTime = Date.now();
      const correlationId = message.metadata.correlationId || `proc-${Date.now()}`;

      try {
        this.serviceContext?.logger.debug('Processing event', {
          eventType: message.eventType,
          correlationId,
          messageId: message.metadata.messageId
        });

        // Process the event
        await processor.process(message);

        // Update stats
        this.processingStats.totalProcessed++;
        this.processingStats.lastProcessedAt = new Date();

        const processingTime = Date.now() - startTime;
        this.serviceContext?.logger.info('Event processed successfully', {
          eventType: message.eventType,
          correlationId,
          processingTime
        });

      } catch (error) {
        this.processingStats.totalErrors++;
        
        this.serviceContext?.logger.error('Event processing failed', {
          eventType: message.eventType,
          correlationId,
          error,
          processingTime: Date.now() - startTime
        });

        // Re-throw to trigger dead letter queue handling
        throw error;
      }
    };

    // Subscribe with retry and dead letter queue options
    await this.serviceContext.messageBroker.subscribe(eventType, handler, {
      durable: true,
      autoAck: false,
      prefetch: 10 // Process up to 10 messages concurrently
    });
  }

  /**
   * Shutdown event processing
   */
  public async shutdown(): Promise<void> {
    this.isProcessing = false;

    // Flush any pending batches
    if (this.batchProcessor) {
      try {
        await this.batchProcessor.flush();
      } catch (error) {
        this.serviceContext?.logger.warn('Error flushing batches during shutdown', { error });
      }
    }

    // Unsubscribe from all events
    if (this.serviceContext) {
      for (const eventType of this.eventHandlers.keys()) {
        try {
          await this.serviceContext.messageBroker.unsubscribe(eventType);
        } catch (error) {
          this.serviceContext.logger.warn('Error unsubscribing from event', { eventType, error });
        }
      }
    }

    await super.shutdown();
  }
}

// Re-export EventProcessor for convenience
export { EventProcessor };

/**
 * User event processors
 */
export class UserEventProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing user event', {
      eventType: message.eventType,
      userId: payload.userId
    });

    // Handle generic user events
    // This could trigger additional processing like updating caches, 
    // sending notifications, etc.
  }
}

export class UserCreatedProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing user created event', {
      userId: payload.userId,
      email: payload.email
    });

    // Example processing:
    // 1. Send welcome email
    // 2. Initialize user preferences
    // 3. Update analytics
    // 4. Sync with external systems
  }
}

export class UserUpdatedProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing user updated event', {
      userId: payload.userId
    });

    // Example processing:
    // 1. Invalidate user cache
    // 2. Update search indexes
    // 3. Sync changes with external systems
  }
}

export class UserDeletedProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing user deleted event', {
      userId: payload.userId
    });

    // Example processing:
    // 1. Clean up user data
    // 2. Remove from external systems
    // 3. Update analytics
  }
}

/**
 * Student event processors
 */
export class StudentEventProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing student event', {
      eventType: message.eventType,
      studentId: payload.studentId
    });

    // Handle generic student events
  }
}

export class StudentCreatedProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing student created event', {
      studentId: payload.studentId,
      license: payload.license
    });

    // Example processing:
    // 1. Initialize student analytics
    // 2. Set up default configurations
    // 3. Sync with external systems
  }
}

export class StudentUpdatedProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing student updated event', {
      studentId: payload.studentId
    });

    // Example processing:
    // 1. Update search indexes
    // 2. Invalidate caches
    // 3. Sync changes
  }
}

export class StudentDocumentsProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing student documents updated event', {
      studentId: payload.studentId,
      documentCount: payload.documentCount
    });

    // Example processing:
    // 1. Process document changes
    // 2. Update document indexes
    // 3. Generate reports
  }
}

/**
 * License event processors
 */
export class LicenseEventProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing license event', {
      eventType: message.eventType,
      license: payload.license
    });

    // Handle generic license events
  }
}

export class LicenseCreatedProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing license created event', {
      license: payload.license
    });

    // Example processing:
    // 1. Set up license configurations
    // 2. Initialize billing
    // 3. Send notifications
  }
}

export class LicenseUpdatedProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing license updated event', {
      license: payload.license
    });

    // Example processing:
    // 1. Update user permissions
    // 2. Sync license changes
    // 3. Update billing
  }
}

/**
 * App event processors
 */
export class AppEventProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing app event', {
      eventType: message.eventType,
      appId: payload.appId
    });

    // Handle generic app events
  }
}

export class AppCreatedProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing app created event', {
      appId: payload.appId
    });

    // Example processing:
    // 1. Initialize app configurations
    // 2. Set up monitoring
    // 3. Send notifications
  }
}

export class AppUpdatedProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing app updated event', {
      appId: payload.appId
    });

    // Example processing:
    // 1. Update app configurations
    // 2. Invalidate caches
    // 3. Sync changes
  }
}

/**
 * DynamoDB stream processor for AWS compatibility
 * Processes DynamoDB stream events and converts them to standard events
 */
export class DynamoDBStreamProcessor extends EventProcessor {
  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    this.context.logger.info('Processing DynamoDB stream event', {
      recordCount: payload.Records?.length || 0
    });

    // Process DynamoDB stream records
    if (payload.Records) {
      for (const record of payload.Records) {
        await this.processStreamRecord(record);
      }
    }
  }

  private async processStreamRecord(record: any): Promise<void> {
    try {
      // Convert DynamoDB stream record to standard event
      const event = this.convertStreamRecordToEvent(record);
      
      if (event) {
        // Publish the converted event
        await this.context.messageBroker.publish(event.type, event.data, {
          correlationId: `stream-${record.eventID}`
        });
      }
    } catch (error) {
      this.context.logger.error('Error processing stream record', { error, record });
      throw error;
    }
  }

  private convertStreamRecordToEvent(record: any): { type: string; data: any } | null {
    // This mirrors the logic from the existing from-dynamo.ts Lambda
    const newData = record.dynamodb?.NewImage;
    const oldData = record.dynamodb?.OldImage;
    const data = newData || oldData;

    if (!data || !data.pk) {
      return null;
    }

    let eventType = 'unknown';
    
    // Convert DynamoDB attribute values to regular objects
    const convertedNewData = newData ? this.unmarshallDynamoDBItem(newData) : undefined;
    const convertedOldData = oldData ? this.unmarshallDynamoDBItem(oldData) : undefined;

    // Determine event type based on pk/sk pattern
    if (data.pk.S?.match(/^U#[0-9|a-z|\-]+$/)) {
      if (data.sk.S === 'P') {
        eventType = 'user';
      }
    } else if (data.pk.S?.match(/^S#[0-9|a-z|\-]+$/)) {
      if (data.sk.S === 'P') {
        eventType = 'student';
      }
    } else if (data.pk.S === 'L' && data.sk.S?.startsWith('P#')) {
      eventType = 'license';
    }

    return {
      type: eventType,
      data: {
        new: convertedNewData,
        old: convertedOldData
      }
    };
  }

  private unmarshallDynamoDBItem(item: any): any {
    // Simple unmarshalling - in production, use AWS SDK's unmarshall
    const result: any = {};
    
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === 'object' && value !== null) {
        const attrValue = value as any;
        if (attrValue.S !== undefined) {
          result[key] = attrValue.S;
        } else if (attrValue.N !== undefined) {
          result[key] = Number(attrValue.N);
        } else if (attrValue.BOOL !== undefined) {
          result[key] = attrValue.BOOL;
        } else if (attrValue.L !== undefined) {
          result[key] = attrValue.L.map((item: any) => this.unmarshallDynamoDBItem({ temp: item }).temp);
        } else if (attrValue.M !== undefined) {
          result[key] = this.unmarshallDynamoDBItem(attrValue.M);
        }
      }
    }
    
    return result;
  }
}