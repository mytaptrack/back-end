/**
 * Tests for retry manager and circuit breaker
 */

import {
  RetryManager,
  CircuitBreaker,
  CircuitState,
  ResilienceManager,
  ResilienceManagerFactory
} from './retry-manager';

import {
  ConnectionError,
  ValidationError,
  TimeoutError,
  InternalServerError
} from '../types/database-errors';

describe('RetryManager', () => {
  let retryManager: RetryManager;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxAttempts: 3,
      baseDelay: 10, // Small delay for tests
      maxDelay: 100,
      backoffMultiplier: 2,
      jitter: false // Disable jitter for predictable tests
    });
    consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Successful Operations', () => {
    it('should execute operation successfully on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await retryManager.executeWithRetry(
        operation,
        'test_operation',
        'dynamodb'
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should log success after retries', async () => {
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();
      let attempts = 0;
      const operation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new ConnectionError('Connection failed');
        }
        return Promise.resolve('success');
      });

      const result = await retryManager.executeWithRetry(
        operation,
        'test_operation',
        'dynamodb'
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('succeeded after 3 attempts')
      );
      
      infoSpy.mockRestore();
    });
  });

  describe('Retry Logic', () => {
    it('should retry retryable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new ConnectionError('Connection failed'))
        .mockRejectedValueOnce(new TimeoutError('Timeout'))
        .mockResolvedValue('success');

      const result = await retryManager.executeWithRetry(
        operation,
        'test_operation',
        'dynamodb'
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new ValidationError('Invalid data'));

      await expect(
        retryManager.executeWithRetry(operation, 'test_operation', 'dynamodb')
      ).rejects.toThrow('Invalid data');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect maximum attempts', async () => {
      const operation = jest.fn().mockRejectedValue(new ConnectionError('Always fails'));

      await expect(
        retryManager.executeWithRetry(operation, 'test_operation', 'dynamodb')
      ).rejects.toThrow('Always fails');

      expect(operation).toHaveBeenCalledTimes(3); // maxAttempts
    });

    it('should calculate exponential backoff delays', async () => {
      const delays: number[] = [];
      const originalSleep = (RetryManager.prototype as any).sleep;
      (RetryManager.prototype as any).sleep = jest.fn().mockImplementation((ms: number) => {
        delays.push(ms);
        return Promise.resolve();
      });

      const operation = jest.fn().mockRejectedValue(new ConnectionError('Always fails'));

      await expect(
        retryManager.executeWithRetry(operation, 'test_operation', 'dynamodb')
      ).rejects.toThrow();

      expect(delays).toEqual([10, 20]); // baseDelay * backoffMultiplier^(attempt-1)
      
      (RetryManager.prototype as any).sleep = originalSleep;
    });

    it('should respect maximum delay', async () => {
      const retryManagerWithLowMax = new RetryManager({
        maxAttempts: 5,
        baseDelay: 50,
        maxDelay: 75,
        backoffMultiplier: 2,
        jitter: false
      });

      const delays: number[] = [];
      const originalSleep = (RetryManager.prototype as any).sleep;
      (RetryManager.prototype as any).sleep = jest.fn().mockImplementation((ms: number) => {
        delays.push(ms);
        return Promise.resolve();
      });

      const operation = jest.fn().mockRejectedValue(new ConnectionError('Always fails'));

      await expect(
        retryManagerWithLowMax.executeWithRetry(operation, 'test_operation', 'dynamodb')
      ).rejects.toThrow();

      // Should cap at maxDelay (75)
      expect(delays.every(delay => delay <= 75)).toBe(true);
      
      (RetryManager.prototype as any).sleep = originalSleep;
    });
  });

  describe('Error Logging', () => {
    it('should log retry attempts', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();
      
      const operation = jest.fn()
        .mockRejectedValueOnce(new ConnectionError('Connection failed'))
        .mockResolvedValue('success');

      await retryManager.executeWithRetry(operation, 'test_operation', 'dynamodb');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('test_operation failed on attempt 1')
      );
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Retrying test_operation in')
      );
      
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    });

    it('should log permanent failures', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const operation = jest.fn().mockRejectedValue(new ValidationError('Invalid data'));

      await expect(
        retryManager.executeWithRetry(operation, 'test_operation', 'dynamodb')
      ).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('test_operation failed permanently')
      );
      
      errorSpy.mockRestore();
    });
  });

  describe('Configuration', () => {
    it('should update retry configuration', () => {
      const originalConfig = retryManager.getConfig();
      
      retryManager.updateConfig({ maxAttempts: 5, baseDelay: 200 });
      
      const updatedConfig = retryManager.getConfig();
      expect(updatedConfig.maxAttempts).toBe(5);
      expect(updatedConfig.baseDelay).toBe(200);
      expect(updatedConfig.backoffMultiplier).toBe(originalConfig.backoffMultiplier);
    });
  });
});

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 100, // Short timeout for tests
      halfOpenMaxCalls: 2
    });
    consoleSpy = jest.spyOn(console, 'info').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Circuit States', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open after failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Always fails'));

      // Trigger failures to reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(operation, 'test_op', 'dynamodb')
        ).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reject calls when OPEN', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(operation, 'test_op', 'dynamodb')
        ).rejects.toThrow();
      }

      // Should reject without calling operation
      operation.mockClear();
      await expect(
        circuitBreaker.execute(operation, 'test_op', 'dynamodb')
      ).rejects.toThrow('Circuit breaker is OPEN');

      expect(operation).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(operation, 'test_op', 'dynamodb')
        ).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next call should transition to HALF_OPEN
      operation.mockResolvedValue('success');
      await circuitBreaker.execute(operation, 'test_op', 'dynamodb');

      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close after successful calls in HALF_OPEN', async () => {
      const operation = jest.fn();

      // Open the circuit
      operation.mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(operation, 'test_op', 'dynamodb')
        ).rejects.toThrow();
      }

      // Wait and transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Successful calls should close the circuit
      operation.mockResolvedValue('success');
      await circuitBreaker.execute(operation, 'test_op', 'dynamodb');
      await circuitBreaker.execute(operation, 'test_op', 'dynamodb');

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen if failure occurs in HALF_OPEN', async () => {
      const operation = jest.fn();

      // Open the circuit
      operation.mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(operation, 'test_op', 'dynamodb')
        ).rejects.toThrow();
      }

      // Wait and transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 150));
      operation.mockResolvedValue('success');
      await circuitBreaker.execute(operation, 'test_op', 'dynamodb');

      // Failure should reopen
      operation.mockRejectedValue(new Error('Fail again'));
      await expect(
        circuitBreaker.execute(operation, 'test_op', 'dynamodb')
      ).rejects.toThrow();

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Manual Reset', () => {
    it('should reset circuit breaker state', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(operation, 'test_op', 'dynamodb')
        ).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(circuitBreaker.getFailureCount()).toBe(3);

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });
  });

  describe('Logging', () => {
    it('should log state transitions', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(operation, 'test_op', 'dynamodb')
        ).rejects.toThrow();
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker opened due to failure threshold')
      );
      
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});

describe('ResilienceManager', () => {
  let resilienceManager: ResilienceManager;

  beforeEach(() => {
    resilienceManager = new ResilienceManager(
      { maxAttempts: 2, baseDelay: 10, jitter: false },
      { failureThreshold: 2, recoveryTimeout: 100 }
    );
  });

  it('should combine retry and circuit breaker functionality', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new ConnectionError('Fail 1'))
      .mockResolvedValue('success');

    const result = await resilienceManager.executeWithResilience(
      operation,
      'test_operation',
      'dynamodb'
    );

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should open circuit after repeated failures', async () => {
    const operation = jest.fn().mockRejectedValue(new ConnectionError('Always fails'));

    // First set of failures should exhaust retries and fail
    await expect(
      resilienceManager.executeWithResilience(operation, 'test_op', 'dynamodb')
    ).rejects.toThrow();

    // Second set should open the circuit
    await expect(
      resilienceManager.executeWithResilience(operation, 'test_op', 'dynamodb')
    ).rejects.toThrow();

    expect(resilienceManager.getCircuitState()).toBe(CircuitState.OPEN);

    // Subsequent calls should be rejected by circuit breaker
    operation.mockClear();
    await expect(
      resilienceManager.executeWithResilience(operation, 'test_op', 'dynamodb')
    ).rejects.toThrow('Circuit breaker is OPEN');

    expect(operation).not.toHaveBeenCalled();
  });

  it('should provide access to configuration', () => {
    const retryConfig = resilienceManager.getRetryConfig();
    expect(retryConfig.maxAttempts).toBe(2);

    resilienceManager.updateRetryConfig({ maxAttempts: 5 });
    expect(resilienceManager.getRetryConfig().maxAttempts).toBe(5);
  });

  it('should allow circuit breaker reset', () => {
    // This is tested indirectly through the circuit breaker tests
    expect(() => resilienceManager.resetCircuitBreaker()).not.toThrow();
  });
});

describe('ResilienceManagerFactory', () => {
  beforeEach(() => {
    // Clear factory state
    (ResilienceManagerFactory as any).managers.clear();
  });

  it('should create managers for different providers', () => {
    const dynamoManager = ResilienceManagerFactory.getManager('dynamodb');
    const mongoManager = ResilienceManagerFactory.getManager('mongodb');

    expect(dynamoManager).toBeInstanceOf(ResilienceManager);
    expect(mongoManager).toBeInstanceOf(ResilienceManager);
    expect(dynamoManager).not.toBe(mongoManager);
  });

  it('should reuse managers for same provider', () => {
    const manager1 = ResilienceManagerFactory.getManager('dynamodb');
    const manager2 = ResilienceManagerFactory.getManager('dynamodb');

    expect(manager1).toBe(manager2);
  });

  it('should reset all circuit breakers', () => {
    const dynamoManager = ResilienceManagerFactory.getManager('dynamodb');
    const mongoManager = ResilienceManagerFactory.getManager('mongodb');

    const resetSpy1 = jest.spyOn(dynamoManager, 'resetCircuitBreaker');
    const resetSpy2 = jest.spyOn(mongoManager, 'resetCircuitBreaker');

    ResilienceManagerFactory.resetAll();

    expect(resetSpy1).toHaveBeenCalled();
    expect(resetSpy2).toHaveBeenCalled();
  });
});