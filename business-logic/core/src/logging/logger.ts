/**
 * Structured Logger Implementation
 * Provides consistent logging format across all container services
 */

import { AsyncLocalStorage } from 'async_hooks';
import { 
  ILogger, 
  LogEntry, 
  LogLevel, 
  PerformanceTimer, 
  CorrelationContext,
  MonitoringConfiguration 
} from './interfaces';

/**
 * Async local storage for correlation context
 */
const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Performance timer implementation
 */
class Timer implements PerformanceTimer {
  private startTime: number;
  
  constructor(
    private logger: ContainerLogger,
    private operation: string,
    private resource?: string
  ) {
    this.startTime = Date.now();
  }
  
  end(metadata?: any): void {
    const duration = Date.now() - this.startTime;
    this.logger.logPerformance(this.operation, duration, this.resource, metadata);
  }
}

/**
 * Container logger with structured logging and correlation ID support
 */
export class ContainerLogger implements ILogger {
  private serviceName: string;
  private environment: string;
  private version?: string;
  private logLevel: LogLevel;
  private format: 'json' | 'pretty';
  private includeStack: boolean;
  private childContext: Record<string, any> = {};
  
  constructor(config: MonitoringConfiguration) {
    this.serviceName = config.serviceName;
    this.environment = config.environment;
    this.version = config.version;
    this.logLevel = config.logging.level;
    this.format = config.logging.format;
    this.includeStack = config.logging.includeStack;
  }
  
  debug(message: string, metadata?: any): void {
    if (this.shouldLog('debug')) {
      this.writeLog('debug', message, undefined, metadata);
    }
  }
  
  info(message: string, metadata?: any): void {
    if (this.shouldLog('info')) {
      this.writeLog('info', message, undefined, metadata);
    }
  }
  
  warn(message: string, metadata?: any): void {
    if (this.shouldLog('warn')) {
      this.writeLog('warn', message, undefined, metadata);
    }
  }
  
  error(message: string, error?: Error, metadata?: any): void {
    if (this.shouldLog('error')) {
      this.writeLog('error', message, error, metadata);
    }
  }
  
  startTimer(operation: string, resource?: string): PerformanceTimer {
    return new Timer(this, operation, resource);
  }
  
  logPerformance(operation: string, duration: number, resource?: string, metadata?: any): void {
    this.info(`Performance: ${operation}`, {
      ...metadata,
      performance: {
        operation,
        resource,
        duration
      }
    });
  }
  
  setCorrelationId(correlationId: string): void {
    const context = correlationStorage.getStore() || {} as CorrelationContext;
    context.correlationId = correlationId;
    correlationStorage.enterWith(context);
  }
  
  setUserId(userId: string): void {
    const context = correlationStorage.getStore() || {} as CorrelationContext;
    context.userId = userId;
    correlationStorage.enterWith(context);
  }
  
  setRequestId(requestId: string): void {
    const context = correlationStorage.getStore() || {} as CorrelationContext;
    context.requestId = requestId;
    correlationStorage.enterWith(context);
  }
  
  clearContext(): void {
    correlationStorage.enterWith({} as CorrelationContext);
  }
  
  child(context: Record<string, any>): ILogger {
    const childLogger = new ContainerLogger({
      serviceName: this.serviceName,
      environment: this.environment,
      version: this.version,
      logging: {
        level: this.logLevel,
        format: this.format,
        destinations: [],
        includeStack: this.includeStack,
        correlationId: true
      },
      metrics: { enabled: false },
      healthChecks: { enabled: false, interval: 0, timeout: 0, retries: 0 }
    });
    
    childLogger.childContext = { ...this.childContext, ...context };
    return childLogger;
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }
  
  private writeLog(level: LogLevel, message: string, error?: Error, metadata?: any): void {
    const context = correlationStorage.getStore();
    
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      correlationId: context?.correlationId,
      userId: context?.userId,
      requestId: context?.requestId,
      metadata: {
        ...this.childContext,
        ...metadata,
        environment: this.environment,
        version: this.version
      }
    };
    
    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: this.includeStack ? error.stack : undefined,
        code: (error as any).code
      };
    }
    
    if (this.format === 'json') {
      console.log(JSON.stringify(logEntry));
    } else {
      this.prettyPrint(logEntry);
    }
  }
  
  private prettyPrint(entry: LogEntry): void {
    const timestamp = entry.timestamp;
    const level = entry.level.toUpperCase().padEnd(5);
    const service = entry.service;
    const correlationId = entry.correlationId ? ` [${entry.correlationId}]` : '';
    const userId = entry.userId ? ` (user:${entry.userId})` : '';
    
    let output = `${timestamp} ${level} [${service}]${correlationId}${userId} ${entry.message}`;
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += `\n  Metadata: ${JSON.stringify(entry.metadata, null, 2)}`;
    }
    
    if (entry.error) {
      output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }
    
    console.log(output);
  }
}

/**
 * Logger factory for creating configured loggers
 */
export class LoggerFactory {
  static create(config: MonitoringConfiguration): ILogger {
    return new ContainerLogger(config);
  }
  
  static createFromEnv(serviceName: string): ILogger {
    const config: MonitoringConfiguration = {
      serviceName,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.SERVICE_VERSION,
      logging: {
        level: (process.env.LOG_LEVEL as LogLevel) || 'info',
        format: (process.env.LOG_FORMAT as 'json' | 'pretty') || 'json',
        destinations: [],
        includeStack: process.env.LOG_INCLUDE_STACK === 'true',
        correlationId: true
      },
      metrics: {
        enabled: process.env.METRICS_ENABLED === 'true'
      },
      healthChecks: {
        enabled: true,
        interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
        timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),
        retries: parseInt(process.env.HEALTH_CHECK_RETRIES || '3')
      }
    };
    
    return new ContainerLogger(config);
  }
}

/**
 * Correlation ID utilities
 */
export class CorrelationUtils {
  /**
   * Generate a new correlation ID
   */
  static generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get current correlation context
   */
  static getContext(): CorrelationContext | undefined {
    return correlationStorage.getStore();
  }
  
  /**
   * Run function with correlation context
   */
  static async runWithContext<T>(
    context: CorrelationContext, 
    fn: () => Promise<T>
  ): Promise<T> {
    return correlationStorage.run(context, fn);
  }
  
  /**
   * Extract correlation ID from HTTP headers
   */
  static extractFromHeaders(headers: Record<string, string | string[] | undefined>): string {
    const correlationId = headers['x-correlation-id'] || 
                         headers['X-Correlation-ID'] ||
                         headers['correlation-id'];
    
    if (Array.isArray(correlationId)) {
      return correlationId[0] || this.generateId();
    }
    
    return correlationId || this.generateId();
  }
  
  /**
   * Extract user ID from HTTP headers or token
   */
  static extractUserId(headers: Record<string, string | string[] | undefined>): string | undefined {
    const userId = headers['x-user-id'] || headers['X-User-ID'];
    
    if (Array.isArray(userId)) {
      return userId[0];
    }
    
    return userId;
  }
}