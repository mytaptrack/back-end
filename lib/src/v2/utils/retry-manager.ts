/**
 * Retry mechanism with exponential backoff for database operations
 * Handles connection errors and transient failures
 */

import { DatabaseError, InternalServerError, isRetryableError, isConnectionError } from '../types/database-errors';
import { ILogger, LoggerFactory } from './database-logger';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: string[];
}

export interface RetryContext {
  attempt: number;
  totalAttempts: number;
  lastError?: DatabaseError;
  totalDelay: number;
}

export interface RetryResult<T> {
  result?: T;
  success: boolean;
  attempts: number;
  totalDelay: number;
  lastError?: DatabaseError;
}

export class RetryManager {
  private config: RetryConfig;
  private logger: ILogger;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 5000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: ['CONNECTION_ERROR', 'TIMEOUT', 'THROUGHPUT_EXCEEDED', 'INTERNAL_SERVER_ERROR'],
      ...config
    };
    
    this.logger = LoggerFactory.getLogger('RetryManager');
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    provider: string,
    context?: any
  ): Promise<T> {
    let lastError: DatabaseError | undefined;
    let totalDelay = 0;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        this.logger.debug(`Executing ${operationName} (attempt ${attempt}/${this.config.maxAttempts})`, {
          provider,
          attempt,
          context: context ? JSON.stringify(context) : undefined
        });

        const result = await operation();
        
        if (attempt > 1) {
          this.logger.info(`${operationName} succeeded after ${attempt} attempts`, {
            provider,
            totalAttempts: attempt,
            totalDelay
          });
        }

        return result;
      } catch (error) {
        const dbError = error instanceof DatabaseError ? error : new InternalServerError(
          error?.message || 'Unknown error',
          error
        );

        lastError = dbError;

        this.logger.warn(`${operationName} failed on attempt ${attempt}`, {
          provider,
          attempt,
          error: dbError.code,
          message: dbError.message,
          retryable: this.shouldRetry(dbError, attempt)
        });

        if (!this.shouldRetry(dbError, attempt)) {
          this.logger.error(`${operationName} failed permanently`, dbError, {
            provider,
            totalAttempts: attempt,
            totalDelay
          });
          throw dbError;
        }

        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          totalDelay += delay;

          this.logger.info(`Retrying ${operationName} in ${delay}ms`, {
            provider,
            attempt,
            nextAttempt: attempt + 1,
            delay,
            totalDelay
          });

          await this.sleep(delay);
        }
      }
    }

    this.logger.error(`${operationName} failed after all retry attempts`, lastError, {
      provider,
      totalAttempts: this.config.maxAttempts,
      totalDelay
    });

    throw lastError!;
  }

  private shouldRetry(error: DatabaseError, attempt: number): boolean {
    if (attempt >= this.config.maxAttempts) {
      return false;
    }

    // Check if error is retryable based on error properties
    if (!isRetryableError(error)) {
      return false;
    }

    // Check if error code is in the retryable list
    if (this.config.retryableErrors && !this.config.retryableErrors.includes(error.code)) {
      return false;
    }

    return true;
  }

  private calculateDelay(attempt: number): number {
    let delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Update retry configuration
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RetryConfig {
    return { ...this.config };
  }
}

// Circuit breaker pattern for connection resilience
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxCalls: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime?: Date;
  private halfOpenCalls = 0;
  private config: CircuitBreakerConfig;
  private logger: ILogger;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 10000, // 10 seconds
      halfOpenMaxCalls: 3,
      ...config
    };
    
    this.logger = LoggerFactory.getLogger('CircuitBreaker');
  }

  async execute<T>(
    operation: () => Promise<T>,
    operationName: string,
    provider: string
  ): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenCalls = 0;
        this.logger.info(`Circuit breaker transitioning to HALF_OPEN`, {
          provider,
          operation: operationName
        });
      } else {
        const error = new InternalServerError(
          `Circuit breaker is OPEN for ${provider}`,
          undefined,
          provider
        );
        this.logger.warn(`Circuit breaker rejecting call`, {
          provider,
          operation: operationName,
          state: this.state
        });
        throw error;
      }
    }

    try {
      const result = await operation();
      this.onSuccess(operationName, provider);
      return result;
    } catch (error) {
      this.onFailure(error, operationName, provider);
      throw error;
    }
  }

  private onSuccess(operationName: string, provider: string): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++;
      
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.logger.info(`Circuit breaker reset to CLOSED`, {
          provider,
          operation: operationName,
          successfulCalls: this.halfOpenCalls
        });
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
    }
  }

  private onFailure(error: any, operationName: string, provider: string): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    this.logger.warn(`Circuit breaker recorded failure`, {
      provider,
      operation: operationName,
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      state: this.state
    });

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.logger.warn(`Circuit breaker opened from HALF_OPEN`, {
        provider,
        operation: operationName
      });
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.logger.error(`Circuit breaker opened due to failure threshold`, {
        provider,
        operation: operationName,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold
      });
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) {
      return true;
    }

    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceLastFailure >= this.config.recoveryTimeout;
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = undefined;
    
    this.logger.info(`Circuit breaker manually reset`);
  }
}

// Combined retry and circuit breaker manager
export class ResilienceManager {
  private retryManager: RetryManager;
  private circuitBreaker: CircuitBreaker;
  private logger: ILogger;

  constructor(
    retryConfig?: Partial<RetryConfig>,
    circuitConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.retryManager = new RetryManager(retryConfig);
    this.circuitBreaker = new CircuitBreaker(circuitConfig);
    this.logger = LoggerFactory.getLogger('ResilienceManager');
  }

  async executeWithResilience<T>(
    operation: () => Promise<T>,
    operationName: string,
    provider: string,
    context?: any
  ): Promise<T> {
    return this.circuitBreaker.execute(
      () => this.retryManager.executeWithRetry(operation, operationName, provider, context),
      operationName,
      provider
    );
  }

  getRetryConfig(): RetryConfig {
    return this.retryManager.getConfig();
  }

  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryManager.updateConfig(config);
  }
}

// Factory for creating resilience managers
export class ResilienceManagerFactory {
  private static managers: Map<string, ResilienceManager> = new Map();

  static getManager(
    provider: string,
    retryConfig?: Partial<RetryConfig>,
    circuitConfig?: Partial<CircuitBreakerConfig>
  ): ResilienceManager {
    if (!this.managers.has(provider)) {
      this.managers.set(provider, new ResilienceManager(retryConfig, circuitConfig));
    }
    return this.managers.get(provider)!;
  }

  static resetAll(): void {
    this.managers.forEach(manager => manager.resetCircuitBreaker());
  }
}