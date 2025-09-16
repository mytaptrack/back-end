/**
 * Tests for database logging system
 */

import {
  DatabaseLogger,
  LogLevel,
  LoggerFactory,
  PerformanceLogger,
  ConnectionLogger,
  withLogging,
  logDatabaseOperation
} from './database-logger';

describe('DatabaseLogger', () => {
  let logger: DatabaseLogger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new DatabaseLogger(LogLevel.DEBUG);
    consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Basic Logging', () => {
    it('should log debug messages when level is DEBUG', () => {
      logger.debug('Test debug message', { operation: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"DEBUG"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test debug message"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"operation":"test"')
      );
    });

    it('should not log debug messages when level is higher', () => {
      logger.setLevel(LogLevel.INFO);
      logger.debug('Test debug message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should include timestamp in log entries', () => {
      logger.info('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"timestamp":"')
      );
    });

    it('should serialize error objects properly', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"name":"Error"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test error"')
      );
    });
  });

  describe('Child Loggers', () => {
    it('should create child logger with inherited context', () => {
      const childLogger = logger.child({ provider: 'dynamodb' });
      childLogger.info('Child message', { operation: 'get' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"provider":"dynamodb"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"operation":"get"')
      );
    });

    it('should merge context from parent and child', () => {
      const baseLogger = new DatabaseLogger(LogLevel.DEBUG, { component: 'test' });
      const childLogger = baseLogger.child({ provider: 'mongodb' });
      
      childLogger.info('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"component":"test"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"provider":"mongodb"')
      );
    });
  });

  describe('Log Levels', () => {
    it('should respect log level hierarchy', () => {
      logger.setLevel(LogLevel.WARN);
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');
      
      expect(consoleSpy).toHaveBeenCalledTimes(2); // Only warn and error
    });
  });
});

describe('PerformanceLogger', () => {
  let logger: DatabaseLogger;
  let performanceLogger: PerformanceLogger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new DatabaseLogger(LogLevel.DEBUG);
    performanceLogger = new PerformanceLogger(logger, 1000);
    consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log slow operations as warnings', () => {
    performanceLogger.logOperation({
      operation: 'query',
      provider: 'dynamodb',
      duration: 1500,
      success: true,
      itemCount: 100
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Slow database operation detected')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"duration":1500')
    );
  });

  it('should not log fast operations as warnings', () => {
    performanceLogger.logOperation({
      operation: 'get',
      provider: 'dynamodb',
      duration: 500,
      success: true
    });

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should log slow queries with query details', () => {
    const query = { pk: 'user#123' };
    performanceLogger.logSlowQuery('query', 'dynamodb', 2000, query);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Slow query detected')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"query":"{\\"pk\\":\\"user#123\\"}"')
    );
  });
});

describe('ConnectionLogger', () => {
  let logger: DatabaseLogger;
  let connectionLogger: ConnectionLogger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new DatabaseLogger(LogLevel.DEBUG);
    connectionLogger = new ConnectionLogger(logger);
    consoleSpy = jest.spyOn(console, 'info').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log connection attempts', () => {
    connectionLogger.logConnectionAttempt('mongodb', {
      connectionString: 'mongodb://localhost:27017',
      database: 'test'
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Attempting database connection')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"provider":"mongodb"')
    );
  });

  it('should sanitize sensitive configuration', () => {
    connectionLogger.logConnectionAttempt('mongodb', {
      connectionString: 'mongodb://user:password@localhost:27017',
      password: 'secret123'
    });

    const logCall = consoleSpy.mock.calls[0][0];
    expect(logCall).toContain('[REDACTED]');
    expect(logCall).not.toContain('password');
    expect(logCall).not.toContain('secret123');
  });

  it('should log connection success with duration', () => {
    connectionLogger.logConnectionSuccess('dynamodb', 250);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Database connection established')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"duration":250')
    );
  });
});

describe('LoggerFactory', () => {
  beforeEach(() => {
    // Clear any existing loggers
    (LoggerFactory as any).loggers.clear();
  });

  it('should create loggers with consistent naming', () => {
    const logger1 = LoggerFactory.getLogger('TestComponent');
    const logger2 = LoggerFactory.getLogger('TestComponent');
    
    expect(logger1).toBe(logger2); // Should return same instance
  });

  it('should create different loggers for different contexts', () => {
    const logger1 = LoggerFactory.getLogger('TestComponent', { provider: 'dynamodb' });
    const logger2 = LoggerFactory.getLogger('TestComponent', { provider: 'mongodb' });
    
    expect(logger1).not.toBe(logger2);
  });

  it('should parse log level from environment variable', () => {
    process.env.DATABASE_LOG_LEVEL = 'ERROR';
    
    const logger = LoggerFactory.getLogger('TestComponent');
    expect(logger.getLevel()).toBe(LogLevel.ERROR);
    
    delete process.env.DATABASE_LOG_LEVEL;
  });

  it('should create performance logger with custom threshold', () => {
    const perfLogger = LoggerFactory.createPerformanceLogger('TestComponent', 2000);
    
    expect(perfLogger).toBeInstanceOf(PerformanceLogger);
  });
});

describe('withLogging utility', () => {
  let logger: DatabaseLogger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new DatabaseLogger(LogLevel.DEBUG);
    consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log operation start and completion', async () => {
    const operation = jest.fn().mockResolvedValue('result');
    
    const result = await withLogging(
      logger,
      'test_operation',
      'dynamodb',
      operation,
      { key: 'test' }
    );

    expect(result).toBe('result');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Starting test_operation')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Completed test_operation')
    );
  });

  it('should log operation failure', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const operation = jest.fn().mockRejectedValue(new Error('Test error'));
    
    await expect(
      withLogging(logger, 'test_operation', 'dynamodb', operation)
    ).rejects.toThrow('Test error');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed test_operation')
    );
    
    errorSpy.mockRestore();
  });

  it('should include duration in completion log', async () => {
    const operation = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve('result'), 100))
    );
    
    await withLogging(logger, 'test_operation', 'dynamodb', operation);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"duration":')
    );
  });
});

describe('logDatabaseOperation utility', () => {
  let logger: DatabaseLogger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new DatabaseLogger(LogLevel.DEBUG);
    consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log database operation with context', () => {
    const key = { pk: 'user#123', sk: 'profile' };
    const options = { consistentRead: true };
    
    const context = logDatabaseOperation(logger, 'get', 'dynamodb', key, options);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Database operation: get')
    );
    expect(context.operation).toBe('get');
    expect(context.provider).toBe('dynamodb');
    expect(context.key).toBe(JSON.stringify(key));
    expect(context.options).toBe(JSON.stringify(options));
  });

  it('should handle undefined key and options', () => {
    const context = logDatabaseOperation(logger, 'scan', 'mongodb');

    expect(context.key).toBeUndefined();
    expect(context.options).toBeUndefined();
  });
});