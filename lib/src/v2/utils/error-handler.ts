/**
 * Enhanced error handling system with comprehensive error processing
 * Integrates with existing error types and provides additional error context
 */

import {
  DatabaseError,
  ErrorTranslatorFactory,
  ConnectionError,
  ValidationError,
  TransactionError,
  TimeoutError,
  InternalServerError
} from '../types/database-errors';

import { ILogger, LoggerFactory, LogContext } from './database-logger';

export interface ErrorContext {
  operation: string;
  provider: string;
  table?: string;
  key?: any;
  query?: any;
  duration?: number;
  attempt?: number;
  correlationId?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export interface ErrorReport {
  error: DatabaseError;
  context: ErrorContext;
  timestamp: Date;
  severity: ErrorSeverity;
  actionable: boolean;
  suggestions: string[];
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface IErrorHandler {
  handleError(error: any, context: ErrorContext): DatabaseError;
  reportError(error: DatabaseError, context: ErrorContext): ErrorReport;
  shouldRetry(error: DatabaseError, attempt: number): boolean;
  getSuggestions(error: DatabaseError, context: ErrorContext): string[];
}

export class DatabaseErrorHandler implements IErrorHandler {
  private logger: ILogger;
  private errorCounts: Map<string, number> = new Map();
  private lastErrorTime: Map<string, Date> = new Map();

  constructor(logger?: ILogger) {
    this.logger = logger || LoggerFactory.getLogger('DatabaseErrorHandler');
  }

  handleError(error: any, context: ErrorContext): DatabaseError {
    // Translate the error using the appropriate translator
    const translatedError = ErrorTranslatorFactory.translateError(error, context.provider);
    
    // Add additional context to the error
    this.enrichError(translatedError, context);
    
    // Log the error with full context
    this.logError(translatedError, context);
    
    // Track error patterns
    this.trackError(translatedError, context);
    
    return translatedError;
  }

  reportError(error: DatabaseError, context: ErrorContext): ErrorReport {
    const severity = this.determineSeverity(error, context);
    const suggestions = this.getSuggestions(error, context);
    const actionable = this.isActionable(error);

    const report: ErrorReport = {
      error,
      context,
      timestamp: new Date(),
      severity,
      actionable,
      suggestions
    };

    this.logger.error('Error report generated', error, {
      ...context,
      severity,
      actionable,
      suggestions: suggestions.join('; ')
    });

    return report;
  }

  shouldRetry(error: DatabaseError, attempt: number): boolean {
    // Check if error is retryable
    if (!error.retryable) {
      return false;
    }

    // Check error frequency to avoid retry storms
    const errorKey = `${error.code}:${error.provider}`;
    const errorCount = this.errorCounts.get(errorKey) || 0;
    const lastError = this.lastErrorTime.get(errorKey);
    
    // If we've seen this error too frequently, don't retry
    if (lastError && errorCount > 10) {
      const timeSinceLastError = Date.now() - lastError.getTime();
      if (timeSinceLastError < 60000) { // 1 minute
        this.logger.warn('Suppressing retry due to error frequency', {
          errorCode: error.code,
          provider: error.provider,
          errorCount,
          timeSinceLastError
        });
        return false;
      }
    }

    // Specific retry logic based on error type
    switch (error.code) {
      case 'CONNECTION_ERROR':
        return attempt <= 5; // More retries for connection issues
      
      case 'TIMEOUT':
        return attempt <= 3;
      
      case 'THROUGHPUT_EXCEEDED':
        return attempt <= 10; // Many retries with backoff for throttling
      
      case 'INTERNAL_SERVER_ERROR':
        return attempt <= 3;
      
      default:
        return attempt <= 2;
    }
  }

  getSuggestions(error: DatabaseError, context: ErrorContext): string[] {
    const suggestions: string[] = [];

    switch (error.code) {
      case 'CONNECTION_ERROR':
        suggestions.push('Check network connectivity');
        suggestions.push('Verify database endpoint configuration');
        suggestions.push('Check security group and firewall rules');
        if (context.provider === 'mongodb') {
          suggestions.push('Verify MongoDB connection string format');
          suggestions.push('Check MongoDB server status');
        } else if (context.provider === 'dynamodb') {
          suggestions.push('Verify AWS credentials and permissions');
          suggestions.push('Check AWS region configuration');
        }
        break;

      case 'ACCESS_DENIED':
        suggestions.push('Verify database credentials');
        suggestions.push('Check user permissions and roles');
        if (context.provider === 'dynamodb') {
          suggestions.push('Review IAM policies and roles');
          suggestions.push('Check resource-based policies');
        } else if (context.provider === 'mongodb') {
          suggestions.push('Verify MongoDB user authentication');
          suggestions.push('Check database and collection permissions');
        }
        break;

      case 'VALIDATION_ERROR':
        suggestions.push('Review input data format and types');
        suggestions.push('Check required fields and constraints');
        suggestions.push('Validate data against schema requirements');
        break;

      case 'THROUGHPUT_EXCEEDED':
        if (context.provider === 'dynamodb') {
          suggestions.push('Consider increasing provisioned capacity');
          suggestions.push('Implement exponential backoff');
          suggestions.push('Review access patterns and hot partitions');
          suggestions.push('Consider using on-demand billing mode');
        }
        break;

      case 'TIMEOUT':
        suggestions.push('Optimize query performance');
        suggestions.push('Consider increasing timeout values');
        suggestions.push('Review query complexity and indexes');
        if (context.duration && context.duration > 5000) {
          suggestions.push('Query took longer than 5 seconds - consider optimization');
        }
        break;

      case 'TRANSACTION_ERROR':
        suggestions.push('Review transaction logic and constraints');
        suggestions.push('Check for conflicting concurrent operations');
        suggestions.push('Consider optimistic locking strategies');
        break;

      case 'DUPLICATE_KEY':
        suggestions.push('Check for unique constraint violations');
        suggestions.push('Implement proper key generation strategy');
        suggestions.push('Consider using conditional writes');
        break;

      case 'RESOURCE_NOT_FOUND':
        if (context.provider === 'dynamodb') {
          suggestions.push('Verify table name and region');
          suggestions.push('Check if table exists and is active');
        } else if (context.provider === 'mongodb') {
          suggestions.push('Verify database and collection names');
          suggestions.push('Check if database/collection exists');
        }
        break;

      default:
        suggestions.push('Check error details and logs for more information');
        suggestions.push('Consider contacting support if issue persists');
    }

    // Add context-specific suggestions
    if (context.query) {
      suggestions.push('Review query structure and parameters');
    }

    if (context.attempt && context.attempt > 1) {
      suggestions.push('Consider implementing circuit breaker pattern');
    }

    return suggestions;
  }

  private enrichError(error: DatabaseError, context: ErrorContext): void {
    // Add context information to error
    (error as any).context = context;
    (error as any).correlationId = context.correlationId;
    (error as any).operation = context.operation;
    (error as any).table = context.table;
  }

  private logError(error: DatabaseError, context: ErrorContext): void {
    const logContext: LogContext = {
      ...context,
      errorCode: error.code,
      retryable: error.retryable,
      errorName: error.name
    };

    if (error.retryable) {
      this.logger.warn(`Retryable database error: ${error.message}`, logContext);
    } else {
      this.logger.error(`Non-retryable database error: ${error.message}`, error, logContext);
    }
  }

  private trackError(error: DatabaseError, context: ErrorContext): void {
    const errorKey = `${error.code}:${error.provider}`;
    const currentCount = this.errorCounts.get(errorKey) || 0;
    
    this.errorCounts.set(errorKey, currentCount + 1);
    this.lastErrorTime.set(errorKey, new Date());

    // Log error patterns
    if (currentCount > 0 && currentCount % 5 === 0) {
      this.logger.warn(`Error pattern detected`, {
        errorCode: error.code,
        provider: error.provider,
        occurrences: currentCount + 1,
        operation: context.operation
      });
    }
  }

  private determineSeverity(error: DatabaseError, context: ErrorContext): ErrorSeverity {
    // Critical errors
    if (error.code === 'CONNECTION_ERROR' || error.code === 'ACCESS_DENIED') {
      return ErrorSeverity.CRITICAL;
    }

    // High severity errors
    if (error.code === 'TRANSACTION_ERROR' || error.code === 'INTERNAL_SERVER_ERROR') {
      return ErrorSeverity.HIGH;
    }

    // Medium severity errors
    if (error.code === 'TIMEOUT' || error.code === 'THROUGHPUT_EXCEEDED') {
      return ErrorSeverity.MEDIUM;
    }

    // Low severity errors
    return ErrorSeverity.LOW;
  }

  private isActionable(error: DatabaseError): boolean {
    // Errors that can be resolved by user action
    const actionableErrors = [
      'VALIDATION_ERROR',
      'ACCESS_DENIED',
      'CONFIGURATION_ERROR',
      'RESOURCE_NOT_FOUND',
      'DUPLICATE_KEY'
    ];

    return actionableErrors.includes(error.code);
  }

  // Get error statistics
  getErrorStatistics(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    this.errorCounts.forEach((count, key) => {
      const [code, provider] = key.split(':');
      if (!stats[provider]) {
        stats[provider] = {};
      }
      stats[provider][code] = {
        count,
        lastOccurrence: this.lastErrorTime.get(key)
      };
    });

    return stats;
  }

  // Reset error tracking
  resetStatistics(): void {
    this.errorCounts.clear();
    this.lastErrorTime.clear();
    this.logger.info('Error statistics reset');
  }
}

// Error aggregation and reporting
export class ErrorAggregator {
  private errors: ErrorReport[] = [];
  private logger: ILogger;
  private maxErrors: number;

  constructor(maxErrors: number = 1000) {
    this.maxErrors = maxErrors;
    this.logger = LoggerFactory.getLogger('ErrorAggregator');
  }

  addError(report: ErrorReport): void {
    this.errors.push(report);
    
    // Keep only the most recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    // Log critical errors immediately
    if (report.severity === ErrorSeverity.CRITICAL) {
      this.logger.error('Critical error detected', report.error, {
        operation: report.context.operation,
        provider: report.context.provider,
        suggestions: report.suggestions.join('; ')
      });
    }
  }

  getErrorSummary(timeWindow?: number): Record<string, any> {
    const cutoff = timeWindow ? new Date(Date.now() - timeWindow) : new Date(0);
    const recentErrors = this.errors.filter(e => e.timestamp >= cutoff);

    const summary = {
      totalErrors: recentErrors.length,
      byProvider: {} as Record<string, number>,
      byErrorCode: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      topErrors: [] as Array<{ code: string; count: number; provider: string }>
    };

    const errorCounts: Record<string, number> = {};

    recentErrors.forEach(report => {
      // Count by provider
      summary.byProvider[report.context.provider] = 
        (summary.byProvider[report.context.provider] || 0) + 1;

      // Count by error code
      summary.byErrorCode[report.error.code] = 
        (summary.byErrorCode[report.error.code] || 0) + 1;

      // Count by severity
      summary.bySeverity[report.severity] = 
        (summary.bySeverity[report.severity] || 0) + 1;

      // Track for top errors
      const key = `${report.error.code}:${report.context.provider}`;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });

    // Get top 10 errors
    summary.topErrors = Object.entries(errorCounts)
      .map(([key, count]) => {
        const [code, provider] = key.split(':');
        return { code, provider, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return summary;
  }

  clearErrors(): void {
    this.errors = [];
    this.logger.info('Error aggregator cleared');
  }
}

// Factory for creating error handlers
export class ErrorHandlerFactory {
  private static handlers: Map<string, DatabaseErrorHandler> = new Map();

  static getHandler(provider: string): DatabaseErrorHandler {
    if (!this.handlers.has(provider)) {
      const logger = LoggerFactory.getLogger(`ErrorHandler:${provider}`);
      this.handlers.set(provider, new DatabaseErrorHandler(logger));
    }
    return this.handlers.get(provider)!;
  }

  static createAggregator(maxErrors?: number): ErrorAggregator {
    return new ErrorAggregator(maxErrors);
  }
}