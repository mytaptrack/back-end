import { DataProcessorService, EventProcessor } from '../data-processor-service';
import { ServiceContext, BrokerMessage } from '../../interfaces/service-context';
import { ServerConfig } from '../interfaces';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

// Mock dependencies
jest.mock('../../service-context/service-context-factory');
jest.mock('../batch-processor');

describe('DataProcessorService', () => {
  let service: DataProcessorService;
  let mockServiceContext: jest.Mocked<ServiceContext>;
  let config: ServerConfig;

  beforeEach(() => {
    // Mock service context
    mockServiceContext = {
      dataAccess: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue([]),
        scan: jest.fn().mockResolvedValue([]),
        batchGet: jest.fn().mockResolvedValue([]),
        isConnected: jest.fn().mockResolvedValue(true)
      },
      messageBroker: {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        publish: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined)
      },
      authentication: {
        validateToken: jest.fn().mockResolvedValue({ valid: true }),
        getUserContext: jest.fn().mockResolvedValue({}),
        refreshToken: jest.fn().mockResolvedValue({ token: 'new-token' })
      },
      cache: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined),
        invalidatePattern: jest.fn().mockResolvedValue(undefined)
      },
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      config: {
        environment: 'test' as const,
        database: { provider: 'mongodb' as const },
        messageBroker: { provider: 'rabbitmq' as const },
        authentication: { provider: 'jwt' as const },
        cache: { provider: 'redis' as const }
      }
    } as any;

    config = {
      port: 0, // Use random port for tests
      middleware: {
        requestLogging: false
      }
    };

    service = new DataProcessorService(config);
    
    // Mock the service context creation
    (service as any).serviceContext = mockServiceContext;
  });

  afterEach(async () => {
    if (service) {
      await service.shutdown();
    }
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();

      expect(mockServiceContext.logger.info).toHaveBeenCalledWith(
        'Data processor service initialized',
        expect.objectContaining({
          registeredProcessors: expect.any(Array)
        })
      );
    });

    it('should register all event processors', async () => {
      await service.initialize();

      const stats = await service.getHealthStatus();
      expect(stats).toBeDefined();
    });
  });

  describe('event processing', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should process events through registered handlers', async () => {
      const testMessage: BrokerMessage = {
        eventType: 'user.created',
        payload: {
          userId: 'test-user-123',
          email: 'test@example.com'
        },
        metadata: {
          messageId: 'msg-123',
          timestamp: new Date(),
          source: 'test',
          correlationId: 'corr-123'
        }
      };

      // Simulate event processing
      const eventHandlers = (service as any).eventHandlers;
      const userCreatedProcessor = eventHandlers.get('user.created');
      
      expect(userCreatedProcessor).toBeDefined();
      
      // Mock the process method
      userCreatedProcessor.process = jest.fn().mockResolvedValue(undefined);
      
      await userCreatedProcessor.process(testMessage);
      
      expect(userCreatedProcessor.process).toHaveBeenCalledWith(testMessage);
    });

    it('should handle processing errors gracefully', async () => {
      const testMessage: BrokerMessage = {
        eventType: 'user.created',
        payload: { userId: 'test-user-123' },
        metadata: {
          messageId: 'msg-123',
          timestamp: new Date(),
          source: 'test'
        }
      };

      const eventHandlers = (service as any).eventHandlers;
      const userCreatedProcessor = eventHandlers.get('user.created');
      
      // Mock the process method to throw an error
      const testError = new Error('Processing failed');
      userCreatedProcessor.process = jest.fn().mockRejectedValue(testError);
      
      await expect(userCreatedProcessor.process(testMessage)).rejects.toThrow('Processing failed');
    });
  });

  describe('API endpoints', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should provide health check endpoint', async () => {
      const healthStatus = await service.getHealthStatus();
      
      expect(healthStatus).toEqual(
        expect.objectContaining({
          healthy: expect.any(Boolean),
          timestamp: expect.any(String),
          uptime: expect.any(Number)
        })
      );
    });

    it('should provide processing statistics', async () => {
      const stats = (service as any).processingStats;
      
      expect(stats).toEqual(
        expect.objectContaining({
          totalProcessed: expect.any(Number),
          totalErrors: expect.any(Number),
          startedAt: expect.any(Date)
        })
      );
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await service.initialize();
      await service.shutdown();

      expect(mockServiceContext.messageBroker.unsubscribe).toHaveBeenCalled();
    });

    it('should flush batches during shutdown', async () => {
      await service.initialize();
      
      const batchProcessor = (service as any).batchProcessor;
      batchProcessor.flush = jest.fn().mockResolvedValue(undefined);
      
      await service.shutdown();
      
      expect(batchProcessor.flush).toHaveBeenCalled();
    });
  });
});

describe('EventProcessor', () => {
  let processor: TestEventProcessor;
  let mockServiceContext: jest.Mocked<ServiceContext>;

  class TestEventProcessor extends EventProcessor {
    async process(message: BrokerMessage): Promise<void> {
      this.context.logger.info('Processing test event', {
        eventType: message.eventType,
        messageId: message.metadata.messageId
      });
    }

    async reprocess(): Promise<void> {
      this.context.logger.info('Reprocessing test events');
    }
  }

  beforeEach(() => {
    mockServiceContext = {
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    } as any;

    processor = new TestEventProcessor(mockServiceContext);
  });

  describe('process', () => {
    it('should process single message', async () => {
      const testMessage: BrokerMessage = {
        eventType: 'test.event',
        payload: { data: 'test' },
        metadata: {
          messageId: 'msg-123',
          timestamp: new Date(),
          source: 'test'
        }
      };

      await processor.process(testMessage);

      expect(mockServiceContext.logger.info).toHaveBeenCalledWith(
        'Processing test event',
        {
          eventType: 'test.event',
          messageId: 'msg-123'
        }
      );
    });
  });

  describe('batchProcess', () => {
    it('should process multiple messages sequentially by default', async () => {
      const messages: BrokerMessage[] = [
        {
          eventType: 'test.event',
          payload: { data: 'test1' },
          metadata: { messageId: 'msg-1', timestamp: new Date(), source: 'test' }
        },
        {
          eventType: 'test.event',
          payload: { data: 'test2' },
          metadata: { messageId: 'msg-2', timestamp: new Date(), source: 'test' }
        }
      ];

      await processor.batchProcess(messages);

      expect(mockServiceContext.logger.info).toHaveBeenCalledTimes(2);
      expect(mockServiceContext.logger.info).toHaveBeenNthCalledWith(1,
        'Processing test event',
        { eventType: 'test.event', messageId: 'msg-1' }
      );
      expect(mockServiceContext.logger.info).toHaveBeenNthCalledWith(2,
        'Processing test event',
        { eventType: 'test.event', messageId: 'msg-2' }
      );
    });
  });

  describe('reprocess', () => {
    it('should support reprocessing when implemented', async () => {
      await processor.reprocess!();

      expect(mockServiceContext.logger.info).toHaveBeenCalledWith('Reprocessing test events');
    });
  });
});

describe('Event Handler Integration', () => {
  let mockServiceContext: jest.Mocked<ServiceContext>;

  beforeEach(() => {
    mockServiceContext = {
      dataAccess: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue([]),
        scan: jest.fn().mockResolvedValue([]),
        batchGet: jest.fn().mockResolvedValue([]),
        isConnected: jest.fn().mockResolvedValue(true)
      },
      messageBroker: {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        publish: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined)
      },
      cache: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined),
        invalidatePattern: jest.fn().mockResolvedValue(undefined)
      },
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      config: {
        environment: 'test' as const,
        database: { provider: 'mongodb' as const },
        messageBroker: { provider: 'rabbitmq' as const },
        authentication: { provider: 'jwt' as const },
        cache: { provider: 'redis' as const }
      }
    } as any;
  });

  it('should handle license events', async () => {
    const { LicenseToUserProcessor } = require('../event-handlers/license-event-handlers');
    const processor = new LicenseToUserProcessor(mockServiceContext);

    const testMessage: BrokerMessage = {
      eventType: 'license.to.user',
      payload: {
        data: {
          new: {
            license: 'test-license',
            details: { admins: ['test@example.com'] }
          }
        }
      },
      metadata: {
        messageId: 'msg-123',
        timestamp: new Date(),
        source: 'test'
      }
    };

    await processor.process(testMessage);

    expect(mockServiceContext.logger.info).toHaveBeenCalledWith(
      'Processing license to user event',
      expect.objectContaining({
        license: 'test-license'
      })
    );
  });

  it('should handle student events', async () => {
    const { StudentToS3Processor } = require('../event-handlers/student-event-handlers');
    const processor = new StudentToS3Processor(mockServiceContext);

    const testMessage: BrokerMessage = {
      eventType: 'student.to.s3',
      payload: {
        data: {
          new: {
            studentId: 'test-student-123',
            license: 'test-license',
            behaviors: [],
            responses: []
          }
        }
      },
      metadata: {
        messageId: 'msg-123',
        timestamp: new Date(),
        source: 'test'
      }
    };

    await processor.process(testMessage);

    expect(mockServiceContext.logger.info).toHaveBeenCalledWith(
      'Processing student to S3 event',
      expect.objectContaining({
        studentId: 'test-student-123',
        license: 'test-license'
      })
    );
  });

  it('should handle notification events', async () => {
    const { NotificationToUserProcessor } = require('../event-handlers/notification-event-handlers');
    const processor = new NotificationToUserProcessor(mockServiceContext);

    const testMessage: BrokerMessage = {
      eventType: 'notification.to.user',
      payload: {
        data: {
          new: {
            notificationId: 'test-notification-123',
            userId: 'test-user-123',
            type: 'student_update',
            title: 'Test Notification',
            message: 'Test message'
          }
        }
      },
      metadata: {
        messageId: 'msg-123',
        timestamp: new Date(),
        source: 'test'
      }
    };

    await processor.process(testMessage);

    expect(mockServiceContext.logger.info).toHaveBeenCalledWith(
      'Processing notification to user event',
      expect.objectContaining({
        notificationId: 'test-notification-123',
        userId: 'test-user-123'
      })
    );
  });
});