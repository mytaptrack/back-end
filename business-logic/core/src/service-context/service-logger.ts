import { ILogger, ServiceConfig } from '../interfaces/service-context';

/**
 * Service logger implementation with structured logging
 */
export class ServiceLogger implements ILogger {
  private serviceName: string;
  private environment: string;
  private correlationId?: string;

  constructor(config: ServiceConfig) {
    this.serviceName = process.env.SERVICE_NAME || 'unknown-service';
    this.environment = config.environment;
  }

  /**
   * Set correlation ID for request tracing
   */
  public setCorrelationId(correlationId: string): void {
    this.correlationId = correlationId;
  }

  /**
   * Clear correlation ID
   */
  public clearCorrelationId(): void {
    this.correlationId = undefined;
  }

  /**
   * Log debug message
   */
  public debug(message: string, metadata?: any): void {
    this.log('debug', message, metadata);
  }

  /**
   * Log info message
   */
  public info(message: string, metadata?: any): void {
    this.log('info', message, metadata);
  }

  /**
   * Log warning message
   */
  public warn(message: string, metadata?: any): void {
    this.log('warn', message, metadata);
  }

  /**
   * Log error message
   */
  public error(message: string, metadata?: any): void {
    this.log('error', message, metadata);
  }

  /**
   * Log with structured format
   */
  private log(level: string, message: string, metadata?: any): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level as LogLevel,
      service: this.serviceName,
      environment: this.environment,
      message,
      correlationId: this.correlationId,
      metadata: this.sanitizeMetadata(metadata)
    };

    // In production, you might want to use a proper logging library
    // For now, we'll use console with structured JSON output
    const output = JSON.stringify(logEntry);

    switch (level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Sanitize metadata to ensure it's serializable
   */
  private sanitizeMetadata(metadata: any): any {
    if (!metadata) return undefined;

    try {
      // Handle Error objects specially
      if (metadata instanceof Error) {
        return {
          name: metadata.name,
          message: metadata.message,
          stack: metadata.stack,
          ...(metadata as any) // Include any additional properties
        };
      }

      // Handle objects with circular references
      return JSON.parse(JSON.stringify(metadata, this.getCircularReplacer()));
    } catch (error) {
      return { 
        error: 'Failed to serialize metadata',
        originalType: typeof metadata,
        stringValue: String(metadata)
      };
    }
  }

  /**
   * Replacer function to handle circular references in JSON.stringify
   */
  private getCircularReplacer() {
    const seen = new WeakSet();
    return (key: string, value: any) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    };
  }
}

/**
 * Log entry structure
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  environment: string;
  message: string;
  correlationId?: string;
  metadata?: any;
}

/**
 * Log levels
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Create a logger with correlation ID support
 */
export function createCorrelatedLogger(config: ServiceConfig, correlationId?: string): ILogger {
  const logger = new ServiceLogger(config);
  if (correlationId) {
    logger.setCorrelationId(correlationId);
  }
  return logger;
}