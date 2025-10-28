/**
 * Health Check Implementation
 * Provides detailed service status and dependency health monitoring
 */

import { 
  IHealthCheck, 
  IHealthCheckManager, 
  HealthCheckResult, 
  HealthCheckResponse, 
  HealthStatus,
  MonitoringConfiguration 
} from './interfaces';
import { ILogger } from './interfaces';

/**
 * Base health check implementation
 */
abstract class BaseHealthCheck implements IHealthCheck {
  constructor(
    public readonly name: string,
    protected logger: ILogger,
    protected timeout: number = 5000
  ) {}
  
  abstract execute(): Promise<HealthCheckResult>;
  
  protected async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), this.timeout)
      )
    ]);
  }
}

/**
 * Database health check
 */
export class DatabaseHealthCheck extends BaseHealthCheck {
  constructor(
    private dataAccess: any,
    logger: ILogger,
    timeout?: number
  ) {
    super('database', logger, timeout);
  }
  
  async execute(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      await this.withTimeout(this.dataAccess.isConnected());
      
      const duration = Date.now() - startTime;
      
      return {
        name: this.name,
        status: 'healthy',
        message: 'Database connection is healthy',
        duration,
        metadata: {
          provider: this.dataAccess.constructor.name,
          connectionTime: duration
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error(`Database health check failed`, error as Error);
      
      return {
        name: this.name,
        status: 'unhealthy',
        message: `Database connection failed: ${(error as Error).message}`,
        duration,
        metadata: {
          error: (error as Error).message
        }
      };
    }
  }
}

/**
 * Message broker health check
 */
export class MessageBrokerHealthCheck extends BaseHealthCheck {
  constructor(
    private messageBroker: any,
    logger: ILogger,
    timeout?: number
  ) {
    super('messageBroker', logger, timeout);
  }
  
  async execute(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      await this.withTimeout(this.messageBroker.isConnected());
      
      const duration = Date.now() - startTime;
      
      return {
        name: this.name,
        status: 'healthy',
        message: 'Message broker connection is healthy',
        duration,
        metadata: {
          provider: this.messageBroker.constructor.name,
          connectionTime: duration
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error(`Message broker health check failed`, error as Error);
      
      return {
        name: this.name,
        status: 'unhealthy',
        message: `Message broker connection failed: ${(error as Error).message}`,
        duration,
        metadata: {
          error: (error as Error).message
        }
      };
    }
  }
}

/**
 * Cache health check
 */
export class CacheHealthCheck extends BaseHealthCheck {
  constructor(
    private cache: any,
    logger: ILogger,
    timeout?: number
  ) {
    super('cache', logger, timeout);
  }
  
  async execute(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test cache with a simple set/get operation
      const testKey = `health-check-${Date.now()}`;
      const testValue = 'test';
      
      await this.withTimeout(this.cache.set(testKey, testValue, 10)); // 10 second TTL
      const retrievedValue = await this.withTimeout(this.cache.get(testKey));
      
      if (retrievedValue !== testValue) {
        throw new Error('Cache set/get operation failed');
      }
      
      // Clean up test key
      await this.cache.delete(testKey);
      
      const duration = Date.now() - startTime;
      
      return {
        name: this.name,
        status: 'healthy',
        message: 'Cache is healthy',
        duration,
        metadata: {
          provider: this.cache.constructor.name,
          operationTime: duration
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error(`Cache health check failed`, error as Error);
      
      return {
        name: this.name,
        status: 'unhealthy',
        message: `Cache operation failed: ${(error as Error).message}`,
        duration,
        metadata: {
          error: (error as Error).message
        }
      };
    }
  }
}

/**
 * Memory health check
 */
export class MemoryHealthCheck extends BaseHealthCheck {
  constructor(
    logger: ILogger,
    private thresholds: { warning: number; critical: number } = { warning: 0.8, critical: 0.9 }
  ) {
    super('memory', logger);
  }
  
  async execute(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const memUsage = process.memoryUsage();
      const totalMemory = memUsage.heapTotal;
      const usedMemory = memUsage.heapUsed;
      const memoryUsageRatio = usedMemory / totalMemory;
      
      let status: HealthStatus = 'healthy';
      let message = 'Memory usage is normal';
      
      if (memoryUsageRatio >= this.thresholds.critical) {
        status = 'unhealthy';
        message = 'Memory usage is critically high';
      } else if (memoryUsageRatio >= this.thresholds.warning) {
        status = 'degraded';
        message = 'Memory usage is elevated';
      }
      
      const duration = Date.now() - startTime;
      
      return {
        name: this.name,
        status,
        message,
        duration,
        metadata: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss,
          usageRatio: memoryUsageRatio,
          thresholds: this.thresholds
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        name: this.name,
        status: 'unhealthy',
        message: `Memory check failed: ${(error as Error).message}`,
        duration,
        metadata: {
          error: (error as Error).message
        }
      };
    }
  }
}

/**
 * Disk space health check
 */
export class DiskSpaceHealthCheck extends BaseHealthCheck {
  constructor(
    logger: ILogger,
    private thresholds: { warning: number; critical: number } = { warning: 0.8, critical: 0.9 }
  ) {
    super('diskSpace', logger);
  }
  
  async execute(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const fs = require('fs');
      const stats = fs.statSync('/');
      
      // This is a simplified check - in production you might want to use statvfs
      const duration = Date.now() - startTime;
      
      return {
        name: this.name,
        status: 'healthy',
        message: 'Disk space check completed',
        duration,
        metadata: {
          note: 'Simplified disk space check - consider implementing statvfs for production'
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        name: this.name,
        status: 'unhealthy',
        message: `Disk space check failed: ${(error as Error).message}`,
        duration,
        metadata: {
          error: (error as Error).message
        }
      };
    }
  }
}

/**
 * Health check manager implementation
 */
export class HealthCheckManager implements IHealthCheckManager {
  private checks: Map<string, IHealthCheck> = new Map();
  private startTime: number = Date.now();
  
  constructor(
    private config: MonitoringConfiguration,
    private logger: ILogger
  ) {}
  
  registerCheck(check: IHealthCheck): void {
    this.checks.set(check.name, check);
    this.logger.info(`Registered health check: ${check.name}`);
  }
  
  async runHealthChecks(): Promise<HealthCheckResponse> {
    const startTime = Date.now();
    const results: HealthCheckResult[] = [];
    
    // Run all health checks in parallel
    const checkPromises = Array.from(this.checks.values()).map(async (check) => {
      try {
        return await check.execute();
      } catch (error) {
        this.logger.error(`Health check ${check.name} threw an error`, error as Error);
        return {
          name: check.name,
          status: 'unhealthy' as HealthStatus,
          message: `Health check failed: ${(error as Error).message}`,
          duration: 0,
          metadata: {
            error: (error as Error).message
          }
        };
      }
    });
    
    const checkResults = await Promise.all(checkPromises);
    results.push(...checkResults);
    
    // Determine overall status
    const overallStatus = this.determineOverallStatus(results);
    
    // Build dependency-specific results
    const dependencies = {
      database: results.find(r => r.name === 'database') || this.createMissingCheckResult('database'),
      messageBroker: results.find(r => r.name === 'messageBroker') || this.createMissingCheckResult('messageBroker'),
      cache: results.find(r => r.name === 'cache') || this.createMissingCheckResult('cache'),
      external: results.filter(r => !['database', 'messageBroker', 'cache', 'memory', 'diskSpace'].includes(r.name))
    };
    
    const response: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: this.config.serviceName,
      version: this.config.version,
      uptime: Date.now() - this.startTime,
      checks: results,
      dependencies
    };
    
    const duration = Date.now() - startTime;
    this.logger.info(`Health check completed`, {
      status: overallStatus,
      duration,
      checksRun: results.length
    });
    
    return response;
  }
  
  async getHealthStatus(): Promise<HealthStatus> {
    const response = await this.runHealthChecks();
    return response.status;
  }
  
  private determineOverallStatus(results: HealthCheckResult[]): HealthStatus {
    if (results.length === 0) {
      return 'unhealthy';
    }
    
    const hasUnhealthy = results.some(r => r.status === 'unhealthy');
    const hasDegraded = results.some(r => r.status === 'degraded');
    
    if (hasUnhealthy) {
      return 'unhealthy';
    }
    
    if (hasDegraded) {
      return 'degraded';
    }
    
    return 'healthy';
  }
  
  private createMissingCheckResult(name: string): HealthCheckResult {
    return {
      name,
      status: 'unhealthy',
      message: `Health check not configured for ${name}`,
      duration: 0,
      metadata: {
        error: 'Health check not registered'
      }
    };
  }
}

/**
 * Health check factory for creating standard health checks
 */
export class HealthCheckFactory {
  static createDatabaseCheck(dataAccess: any, logger: ILogger, timeout?: number): DatabaseHealthCheck {
    return new DatabaseHealthCheck(dataAccess, logger, timeout);
  }
  
  static createMessageBrokerCheck(messageBroker: any, logger: ILogger, timeout?: number): MessageBrokerHealthCheck {
    return new MessageBrokerHealthCheck(messageBroker, logger, timeout);
  }
  
  static createCacheCheck(cache: any, logger: ILogger, timeout?: number): CacheHealthCheck {
    return new CacheHealthCheck(cache, logger, timeout);
  }
  
  static createMemoryCheck(logger: ILogger, thresholds?: { warning: number; critical: number }): MemoryHealthCheck {
    return new MemoryHealthCheck(logger, thresholds);
  }
  
  static createDiskSpaceCheck(logger: ILogger, thresholds?: { warning: number; critical: number }): DiskSpaceHealthCheck {
    return new DiskSpaceHealthCheck(logger, thresholds);
  }
}