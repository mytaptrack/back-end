/**
 * Tests for database error handling system
 */

import {
  DatabaseErrorHandler,
  ErrorHandlerFactory,
  ErrorAggregator,
  ErrorSeverity,
  ErrorContext
} from './error-handler';

import {
  DatabaseError,
  ConnectionError,
  ValidationError,
  TransactionError,
  TimeoutError,
  AccessDeniedError
} from '../types/database-errors';

import { DatabaseLogger, LogLevel } from './database-logger';

describe('DatabaseErrorHandler', () => {
  let errorHandler: DatabaseErrorHandler;
  let logger: DatabaseLogger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new DatabaseLogger(LogLevel.DEBUG);
    errorHandler = new DatabaseErrorHandler(logger);
    consoleSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Error Handling', () => {
    it('should translate and enrich errors', () => {
      const originalError = new Error('Connection failed');
      const context: ErrorContext = {
        operation: 'connect',
        provider: 'dynamodb',
        table: 'users'
      };

      const result = errorHandler.handleError(originalError, context);

      expect(result).toBeInstanceOf(DatabaseError);
      expect((result as any).context).toEqual(context);
      expect((result as any).operation).toBe('connect');
    });

    it('should log retryable errors as warnings', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const connectionError = new ConnectionError('Connection lost');
      const context: ErrorContext = {
        operation: 'get',
        provider: 'mongodb'
      };

      errorHandler.handleError(connectionError, context);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Retryable database error')
      );
      
      warnSpy.mockRestore();
    });

    it('should log non-retryable errors as errors', () => {
      const validationError = new ValidationError('Invalid data');
      const context: ErrorContext = {
        operation: 'put',
        provider: 'dynamodb'
      };

      errorHandler.handleError(validationError, context);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Non-retryable database error')
      );
    });

    it('should track error patterns', () => {
      const context: ErrorContext = {
        operation: 'query',
        provider: 'dynamodb'
      };

      // Generate multiple errors of the same type
      for (let i = 0; i < 6; i++) {
        errorHandler.handleError(new TimeoutError(), context);
      }

      const stats = errorHandler.getErrorStatistics();
      expect(stats.dynamodb.TIMEOUT.count).toBe(6);
    });
  });

  describe('Retry Logic', () => {
    it('should allow retries for retryable errors', () => {
      const connectionError = new ConnectionError();
      
      expect(errorHandler.shouldRetry(connectionError, 1)).toBe(true);
      expect(errorHandler.shouldRetry(connectionError, 3)).toBe(true);
      expect(errorHandler.shouldRetry(connectionError, 6)).toBe(false); // Exceeds max
    });

    it('should not allow retries for non-retryable errors', () => {
      const validationError = new ValidationError();
      
      expect(errorHandler.shouldRetry(validationError, 1)).toBe(false);
    });

    it('should limit retries based on error frequency', () => {
      const timeoutError = new TimeoutError();
      
      // Generate many errors quickly
      for (let i = 0; i < 15; i++) {
        errorHandler.handleError(timeoutError, {
          operation: 'get',
          provider: 'dynamodb'
        });
      }

      // Should suppress retries due to frequency
      expect(errorHandler.shouldRetry(timeoutError, 1)).toBe(false);
    });

    it('should have different retry limits for different error types', () => {
      const connectionError = new ConnectionError();
      const timeoutError = new TimeoutError();
      
      expect(errorHandler.shouldRetry(connectionError, 5)).toBe(true);
      expect(errorHandler.shouldRetry(timeoutError, 5)).toBe(false);
    });
  });

  describe('Error Suggestions', () => {
    it('should provide connection error suggestions', () => {
      const connectionError = new ConnectionError();
      const context: ErrorContext = {
        operation: 'connect',
        provider: 'dynamodb'
      };

      const suggestions = errorHandler.getSuggestions(connectionError, context);

      expect(suggestions).toContain('Check network connectivity');
      expect(suggestions).toContain('Verify AWS credentials and permissions');
    });

    it('should provide provider-specific suggestions', () => {
      const connectionError = new ConnectionError();
      const mongoContext: ErrorContext = {
        operation: 'connect',
        provider: 'mongodb'
      };

      const suggestions = errorHandler.getSuggestions(connectionError, mongoContext);

      expect(suggestions).toContain('Verify MongoDB connection string format');
      expect(suggestions).toContain('Check MongoDB server status');
    });

    it('should provide timeout-specific suggestions for slow queries', () => {
      const timeoutError = new TimeoutError();
      const context: ErrorContext = {
        operation: 'query',
        provider: 'dynamodb',
        duration: 6000 // 6 seconds
      };

      const suggestions = errorHandler.getSuggestions(timeoutError, context);

      expect(suggestions).toContain('Query took longer than 5 seconds - consider optimization');
    });

    it('should provide access denied suggestions', () => {
      const accessError = new AccessDeniedError();
      const context: ErrorContext = {
        operation: 'put',
        provider: 'mongodb'
      };

      const suggestions = errorHandler.getSuggestions(accessError, context);

      expect(suggestions).toContain('Verify database credentials');
      expect(suggestions).toContain('Verify MongoDB user authentication');
    });
  });

  describe('Error Reporting', () => {
    it('should generate comprehensive error reports', () => {
      const error = new ConnectionError('Database unavailable');
      const context: ErrorContext = {
        operation: 'connect',
        provider: 'dynamodb',
        correlationId: 'test-123'
      };

      const report = errorHandler.reportError(error, context);

      expect(report.error).toBe(error);
      expect(report.context).toBe(context);
      expect(report.severity).toBe(ErrorSeverity.CRITICAL);
      expect(report.actionable).toBe(false);
      expect(report.suggestions.length).toBeGreaterThan(0);
      expect(report.timestamp).toBeInstanceOf(Date);
    });

    it('should determine correct severity levels', () => {
      const connectionError = new ConnectionError();
      const validationError = new ValidationError();
      const timeoutError = new TimeoutError();

      const context: ErrorContext = { operation: 'test', provider: 'dynamodb' };

      expect(errorHandler.reportError(connectionError, context).severity)
        .toBe(ErrorSeverity.CRITICAL);
      expect(errorHandler.reportError(validationError, context).severity)
        .toBe(ErrorSeverity.LOW);
      expect(errorHandler.reportError(timeoutError, context).severity)
        .toBe(ErrorSeverity.MEDIUM);
    });

    it('should identify actionable errors', () => {
      const validationError = new ValidationError();
      const connectionError = new ConnectionError();
      const context: ErrorContext = { operation: 'test', provider: 'dynamodb' };

      expect(errorHandler.reportError(validationError, context).actionable).toBe(true);
      expect(errorHandler.reportError(connectionError, context).actionable).toBe(false);
    });
  });

  describe('Error Statistics', () => {
    it('should track error statistics by provider and code', () => {
      const context1: ErrorContext = { operation: 'get', provider: 'dynamodb' };
      const context2: ErrorContext = { operation: 'put', provider: 'mongodb' };

      errorHandler.handleError(new ConnectionError(), context1);
      errorHandler.handleError(new ValidationError(), context1);
      errorHandler.handleError(new TimeoutError(), context2);

      const stats = errorHandler.getErrorStatistics();

      expect(stats.dynamodb.CONNECTION_ERROR.count).toBe(1);
      expect(stats.dynamodb.VALIDATION_ERROR.count).toBe(1);
      expect(stats.mongodb.TIMEOUT.count).toBe(1);
    });

    it('should reset statistics', () => {
      const context: ErrorContext = { operation: 'test', provider: 'dynamodb' };
      
      errorHandler.handleError(new ConnectionError(), context);
      expect(Object.keys(errorHandler.getErrorStatistics())).toHaveLength(1);

      errorHandler.resetStatistics();
      expect(Object.keys(errorHandler.getErrorStatistics())).toHaveLength(0);
    });
  });
});

describe('ErrorAggregator', () => {
  let aggregator: ErrorAggregator;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    aggregator = new ErrorAggregator(100);
    consoleSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Error Collection', () => {
    it('should collect error reports', () => {
      const error = new ValidationError();
      const context: ErrorContext = { operation: 'put', provider: 'dynamodb' };
      const report = {
        error,
        context,
        timestamp: new Date(),
        severity: ErrorSeverity.LOW,
        actionable: true,
        suggestions: ['Check input data']
      };

      aggregator.addError(report);

      const summary = aggregator.getErrorSummary();
      expect(summary.totalErrors).toBe(1);
    });

    it('should limit the number of stored errors', () => {
      const maxErrors = 5;
      const smallAggregator = new ErrorAggregator(maxErrors);

      // Add more errors than the limit
      for (let i = 0; i < 10; i++) {
        const report = {
          error: new ValidationError(),
          context: { operation: 'test', provider: 'dynamodb' },
          timestamp: new Date(),
          severity: ErrorSeverity.LOW,
          actionable: true,
          suggestions: []
        };
        smallAggregator.addError(report);
      }

      const summary = smallAggregator.getErrorSummary();
      expect(summary.totalErrors).toBe(maxErrors);
    });

    it('should immediately log critical errors', () => {
      const criticalReport = {
        error: new ConnectionError(),
        context: { operation: 'connect', provider: 'dynamodb' },
        timestamp: new Date(),
        severity: ErrorSeverity.CRITICAL,
        actionable: false,
        suggestions: ['Check network']
      };

      aggregator.addError(criticalReport);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Critical error detected')
      );
    });
  });

  describe('Error Summary', () => {
    beforeEach(() => {
      // Add sample errors
      const errors = [
        { error: new ConnectionError(), provider: 'dynamodb', severity: ErrorSeverity.CRITICAL },
        { error: new ValidationError(), provider: 'dynamodb', severity: ErrorSeverity.LOW },
        { error: new TimeoutError(), provider: 'mongodb', severity: ErrorSeverity.MEDIUM },
        { error: new ConnectionError(), provider: 'mongodb', severity: ErrorSeverity.CRITICAL }
      ];

      errors.forEach(({ error, provider, severity }) => {
        aggregator.addError({
          error,
          context: { operation: 'test', provider },
          timestamp: new Date(),
          severity,
          actionable: false,
          suggestions: []
        });
      });
    });

    it('should generate error summary by provider', () => {
      const summary = aggregator.getErrorSummary();

      expect(summary.byProvider.dynamodb).toBe(2);
      expect(summary.byProvider.mongodb).toBe(2);
    });

    it('should generate error summary by error code', () => {
      const summary = aggregator.getErrorSummary();

      expect(summary.byErrorCode.CONNECTION_ERROR).toBe(2);
      expect(summary.byErrorCode.VALIDATION_ERROR).toBe(1);
      expect(summary.byErrorCode.TIMEOUT).toBe(1);
    });

    it('should generate error summary by severity', () => {
      const summary = aggregator.getErrorSummary();

      expect(summary.bySeverity.CRITICAL).toBe(2);
      expect(summary.bySeverity.MEDIUM).toBe(1);
      expect(summary.bySeverity.LOW).toBe(1);
    });

    it('should identify top errors', () => {
      const summary = aggregator.getErrorSummary();

      expect(summary.topErrors[0]).toEqual({
        code: 'CONNECTION_ERROR',
        provider: 'dynamodb',
        count: 1
      });
    });

    it('should filter by time window', () => {
      const oneHour = 60 * 60 * 1000;
      const summary = aggregator.getErrorSummary(oneHour);

      expect(summary.totalErrors).toBe(4); // All errors within last hour
    });
  });

  describe('Error Clearing', () => {
    it('should clear all errors', () => {
      const report = {
        error: new ValidationError(),
        context: { operation: 'test', provider: 'dynamodb' },
        timestamp: new Date(),
        severity: ErrorSeverity.LOW,
        actionable: true,
        suggestions: []
      };

      aggregator.addError(report);
      expect(aggregator.getErrorSummary().totalErrors).toBe(1);

      aggregator.clearErrors();
      expect(aggregator.getErrorSummary().totalErrors).toBe(0);
    });
  });
});

describe('ErrorHandlerFactory', () => {
  it('should create error handlers for different providers', () => {
    const dynamoHandler = ErrorHandlerFactory.getHandler('dynamodb');
    const mongoHandler = ErrorHandlerFactory.getHandler('mongodb');

    expect(dynamoHandler).toBeInstanceOf(DatabaseErrorHandler);
    expect(mongoHandler).toBeInstanceOf(DatabaseErrorHandler);
    expect(dynamoHandler).not.toBe(mongoHandler);
  });

  it('should reuse error handlers for same provider', () => {
    const handler1 = ErrorHandlerFactory.getHandler('dynamodb');
    const handler2 = ErrorHandlerFactory.getHandler('dynamodb');

    expect(handler1).toBe(handler2);
  });

  it('should create error aggregators', () => {
    const aggregator = ErrorHandlerFactory.createAggregator(500);

    expect(aggregator).toBeInstanceOf(ErrorAggregator);
  });
});