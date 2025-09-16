/**
 * Structured logging system for database operations
 * Provides consistent logging format across all database providers
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

export interface LogContext {
  provider?: string;
  operation?: string;
  table?: string;
  key?: any;
  duration?: number;
  correlationId?: string;
  userId?: string;
  requestId?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: any;
}

export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: any, context?: LogContext): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  child(context: LogContext): ILogger;
}

export class DatabaseLogger implements ILogger {
  private level: LogLevel;
  private baseContext: LogContext;

  constructor(level: LogLevel = LogLevel.WARN, baseContext: LogContext = {}) {
    this.level = level;
    this.baseContext = { ...baseContext };
  }

  debug(message: string, context: LogContext = {}): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log(LogLevel.DEBUG, message, context);
    }
  }

  info(message: string, context: LogContext = {}): void {
    if (this.level <= LogLevel.INFO) {
      this.log(LogLevel.INFO, message, context);
    }
  }

  warn(message: string, context: LogContext = {}): void {
    if (this.level <= LogLevel.WARN) {
      this.log(LogLevel.WARN, message, context);
    }
  }

  error(message: string, error?: any, context: LogContext = {}): void {
    if (this.level <= LogLevel.ERROR) {
      this.log(LogLevel.ERROR, message, context, error);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  child(context: LogContext): ILogger {
    return new DatabaseLogger(this.level, { ...this.baseContext, ...context });
  }

  private log(level: LogLevel, message: string, context: LogContext, error?: any): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context: { ...this.baseContext, ...context },
      error: error ? this.serializeError(error) : undefined
    };

    const logOutput = this.formatLogEntry(entry);
    
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logOutput);
        break;
      case LogLevel.INFO:
        console.info(logOutput);
        break;
      case LogLevel.WARN:
        console.warn(logOutput);
        break;
      case LogLevel.ERROR:
        console.error(logOutput);
        break;
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    const timestamp = entry.timestamp.toISOString();
    
    const logObject: any = {
      timestamp,
      level: levelName,
      message: entry.message,
      ...entry.context
    };

    if (entry.error) {
      logObject.error = entry.error;
    }

    return JSON.stringify(logObject);
  }

  private serializeError(error: any): any {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error as any) // Include any additional properties
      };
    }
    return error;
  }
}

// Performance logging utilities
export interface PerformanceMetrics {
  operation: string;
  provider: string;
  duration: number;
  success: boolean;
  itemCount?: number;
  bytesProcessed?: number;
}

export class PerformanceLogger {
  private logger: ILogger;
  private slowOperationThreshold: number;

  constructor(logger: ILogger, slowOperationThreshold: number = 1000) {
    this.logger = logger;
    this.slowOperationThreshold = slowOperationThreshold;
  }

  logOperation(metrics: PerformanceMetrics): void {
    const context: LogContext = {
      provider: metrics.provider,
      operation: metrics.operation,
      duration: metrics.duration,
      success: metrics.success,
      itemCount: metrics.itemCount,
      bytesProcessed: metrics.bytesProcessed
    };

    if (metrics.duration > this.slowOperationThreshold) {
      this.logger.warn(`Slow database operation detected`, context);
    } else if (metrics.success) {
      this.logger.debug(`Database operation completed`, context);
    } else {
      this.logger.error(`Database operation failed`, undefined, context);
    }
  }

  logSlowQuery(operation: string, provider: string, duration: number, query?: any): void {
    this.logger.warn(`Slow query detected`, {
      provider,
      operation,
      duration,
      query: query ? JSON.stringify(query) : undefined,
      threshold: this.slowOperationThreshold
    });
  }
}

// Connection logging utilities
export class ConnectionLogger {
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  logConnectionAttempt(provider: string, config?: any): void {
    this.logger.info(`Attempting database connection`, {
      provider,
      config: config ? this.sanitizeConfig(config) : undefined
    });
  }

  logConnectionSuccess(provider: string, duration?: number): void {
    this.logger.info(`Database connection established`, {
      provider,
      duration
    });
  }

  logConnectionFailure(provider: string, error: any, duration?: number): void {
    this.logger.error(`Database connection failed`, error, {
      provider,
      duration
    });
  }

  logConnectionClosed(provider: string): void {
    this.logger.info(`Database connection closed`, {
      provider
    });
  }

  logRetryAttempt(provider: string, attempt: number, maxAttempts: number, delay: number): void {
    this.logger.warn(`Connection retry attempt`, {
      provider,
      attempt,
      maxAttempts,
      delay
    });
  }

  private sanitizeConfig(config: any): any {
    const sanitized = { ...config };
    
    // Remove sensitive information
    const sensitiveKeys = ['password', 'connectionString', 'accessKey', 'secretKey', 'token'];
    sensitiveKeys.forEach(key => {
      if (sanitized[key]) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}

// Logger factory
export class LoggerFactory {
  private static defaultLevel: LogLevel = LogLevel.WARN;
  private static loggers: Map<string, ILogger> = new Map();

  static setDefaultLevel(level: LogLevel): void {
    this.defaultLevel = level;
  }

  static getLogger(name: string, context?: LogContext): ILogger {
    const key = `${name}:${JSON.stringify(context || {})}`;
    
    if (!this.loggers.has(key)) {
      const level = this.parseLogLevel(process.env.DATABASE_LOG_LEVEL) || this.defaultLevel;
      const logger = new DatabaseLogger(level, { component: name, ...context });
      this.loggers.set(key, logger);
    }

    return this.loggers.get(key)!;
  }

  static createPerformanceLogger(name: string, threshold?: number): PerformanceLogger {
    const logger = this.getLogger(name);
    return new PerformanceLogger(logger, threshold);
  }

  static createConnectionLogger(name: string): ConnectionLogger {
    const logger = this.getLogger(name);
    return new ConnectionLogger(logger);
  }

  private static parseLogLevel(level?: string): LogLevel | undefined {
    if (!level) return undefined;
    
    switch (level.toUpperCase()) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'NONE': return LogLevel.NONE;
      default: return undefined;
    }
  }
}

// Utility functions for common logging patterns
export function withLogging<T>(
  logger: ILogger,
  operation: string,
  provider: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const startTime = Date.now();
  const operationContext = { operation, provider, ...context };

  logger.debug(`Starting ${operation}`, operationContext);

  return fn()
    .then(result => {
      const duration = Date.now() - startTime;
      logger.debug(`Completed ${operation}`, { ...operationContext, duration, success: true });
      return result;
    })
    .catch(error => {
      const duration = Date.now() - startTime;
      logger.error(`Failed ${operation}`, error, { ...operationContext, duration, success: false });
      throw error;
    });
}

export function logDatabaseOperation(
  logger: ILogger,
  operation: string,
  provider: string,
  key?: any,
  options?: any
): LogContext {
  const context: LogContext = {
    operation,
    provider,
    key: key ? JSON.stringify(key) : undefined,
    options: options ? JSON.stringify(options) : undefined
  };

  logger.debug(`Database operation: ${operation}`, context);
  return context;
}