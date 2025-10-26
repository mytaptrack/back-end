/**
 * Example usage of the Data Processor Service
 * This demonstrates how to use the containerized data processing service
 * that replaces Lambda-based event handlers
 */

import { DataProcessorService } from '../container-services/data-processor-service';
import { ServiceContextFactory } from '../service-context/service-context-factory';
import { ServerConfig } from '../container-services/interfaces';

/**
 * Example: Starting the data processor service in Docker environment
 */
export async function startDataProcessorInDocker(): Promise<DataProcessorService> {
  // Configure for Docker environment
  const config: ServerConfig = {
    port: 3003,
    host: '0.0.0.0',
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true
    },
    middleware: {
      requestLogging: true,
      compression: true,
      rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000
      }
    },
    security: {
      helmet: true,
      trustProxy: true
    }
  };

  // Create and initialize the service
  const dataProcessor = new DataProcessorService(config, {
    batchSize: 10,
    batchTimeout: 5000,
    maxRetries: 3,
    retryDelay: 1000
  });

  await dataProcessor.initialize();

  console.log('Data processor service started on port 3003');
  console.log('Available endpoints:');
  console.log('  GET  /health - Health check');
  console.log('  GET  /stats - Processing statistics');
  console.log('  POST /reprocess/:eventType - Trigger reprocessing');
  console.log('  POST /flush - Flush pending batches');

  return dataProcessor;
}

/**
 * Example: Starting the data processor service in AWS environment
 */
export async function startDataProcessorInAWS(): Promise<DataProcessorService> {
  // Configure for AWS environment
  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '3003'),
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['*'],
      credentials: true
    },
    middleware: {
      requestLogging: true,
      rateLimiting: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 2000 // Higher limit for AWS
      }
    }
  };

  const dataProcessor = new DataProcessorService(config, {
    batchSize: 25, // Larger batches for AWS
    batchTimeout: 3000,
    maxRetries: 5,
    retryDelay: 2000
  });

  await dataProcessor.initialize();

  console.log(`Data processor service started on port ${config.port}`);
  return dataProcessor;
}

/**
 * Example: Publishing events that will be processed
 */
export async function publishTestEvents(): Promise<void> {
  // Get service context to access message broker
  const factory = ServiceContextFactory.getInstance();
  const context = await factory.createContext();

  console.log('Publishing test events...');

  // Publish user events
  await context.messageBroker.publish('user.created', {
    userId: 'test-user-123',
    email: 'test@example.com',
    license: 'test-license',
    timestamp: new Date().toISOString()
  });

  // Publish student events
  await context.messageBroker.publish('student.created', {
    studentId: 'test-student-456',
    license: 'test-license',
    firstName: 'Test',
    lastName: 'Student',
    timestamp: new Date().toISOString()
  });

  // Publish license events (will trigger license-to-user processing)
  await context.messageBroker.publish('license.to.user', {
    data: {
      new: {
        license: 'test-license',
        details: {
          admins: ['test@example.com', 'admin@example.com']
        }
      },
      old: {
        license: 'test-license',
        details: {
          admins: ['test@example.com']
        }
      }
    }
  });

  // Publish notification events
  await context.messageBroker.publish('notification.to.user', {
    data: {
      new: {
        notificationId: 'test-notification-789',
        userId: 'test-user-123',
        type: 'student_update',
        title: 'Student Update',
        message: 'Your student has been updated',
        timestamp: new Date().toISOString()
      }
    }
  });

  console.log('Test events published successfully');
}

/**
 * Example: Monitoring data processor service
 */
export async function monitorDataProcessor(service: DataProcessorService): Promise<void> {
  console.log('Starting data processor monitoring...');

  // Check health every 30 seconds
  const healthInterval = setInterval(async () => {
    try {
      const health = await service.getHealthStatus();
      console.log('Health check:', {
        healthy: health.healthy,
        uptime: health.uptime,
        timestamp: health.timestamp
      });
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }, 30000);

  // Get processing stats every minute
  const statsInterval = setInterval(async () => {
    try {
      // Make HTTP request to stats endpoint
      const response = await fetch('http://localhost:3003/stats');
      const stats = await response.json();
      
      console.log('Processing stats:', {
        totalProcessed: stats.totalProcessed,
        totalErrors: stats.totalErrors,
        uptime: Math.round(stats.uptime / 1000) + 's',
        batchProcessing: stats.batchProcessing
      });
    } catch (error) {
      console.error('Stats check failed:', error);
    }
  }, 60000);

  // Clean up on shutdown
  process.on('SIGTERM', () => {
    clearInterval(healthInterval);
    clearInterval(statsInterval);
  });
}

/**
 * Example: Complete data processor setup and testing
 */
export async function demonstrateDataProcessor(): Promise<void> {
  console.log('=== Data Processor Service Demo ===');

  try {
    // Start the service
    console.log('\n1. Starting data processor service...');
    const service = await startDataProcessorInDocker();

    // Start monitoring
    console.log('\n2. Starting monitoring...');
    monitorDataProcessor(service);

    // Wait a bit for service to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Publish test events
    console.log('\n3. Publishing test events...');
    await publishTestEvents();

    // Wait for processing
    console.log('\n4. Waiting for event processing...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Trigger manual reprocessing
    console.log('\n5. Triggering manual reprocessing...');
    await fetch('http://localhost:3003/reprocess/student.to.s3', { method: 'POST' });

    // Flush pending batches
    console.log('\n6. Flushing pending batches...');
    await fetch('http://localhost:3003/flush', { method: 'POST' });

    console.log('\nDemo completed successfully!');
    console.log('Data processor service is running and processing events.');
    console.log('Check the logs for processing details.');

  } catch (error) {
    console.error('Demo failed:', error);
  }
}

/**
 * Example: Environment-specific configuration
 */
export function getEnvironmentConfig(): ServerConfig {
  const environment = process.env.NODE_ENV || 'development';
  
  const baseConfig: ServerConfig = {
    port: parseInt(process.env.PORT || '3003'),
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    },
    middleware: {
      requestLogging: true,
      compression: true
    },
    security: {
      helmet: true,
      trustProxy: environment === 'production'
    }
  };

  // Environment-specific overrides
  switch (environment) {
    case 'production':
      return {
        ...baseConfig,
        middleware: {
          ...baseConfig.middleware,
          rateLimiting: {
            windowMs: 15 * 60 * 1000,
            maxRequests: 5000
          }
        }
      };
    
    case 'test':
      return {
        ...baseConfig,
        port: 0, // Use random port for tests
        middleware: {
          ...baseConfig.middleware,
          requestLogging: false
        }
      };
    
    default: // development
      return {
        ...baseConfig,
        middleware: {
          ...baseConfig.middleware,
          rateLimiting: {
            windowMs: 15 * 60 * 1000,
            maxRequests: 100
          }
        }
      };
  }
}

// Run demo if this file is executed directly
if (require.main === module) {
  demonstrateDataProcessor().catch(console.error);
}