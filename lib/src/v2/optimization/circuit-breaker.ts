/**
 * Circuit breaker pattern implementation for connection resilience
 * Provides fault tolerance and prevents cascading failures in database operations
 */

import { IDataAccessLayer, DatabaseProviderType } from '../types/database-abstraction';

// Circuit breaker states
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing fast, not allowing requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service has recovered
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening circuit
  recoveryTimeout: number;       // Time in ms before attempting recovery
  successThreshold: number;      // Number of successes needed to close circuit in half-open state
  timeout: number;               // Request timeout in ms
  monitoringPeriod: number;      // Time window for failure counting in ms
  volumeThreshold: number;       // Minimum number of requests before circuit can open
}

// Circuit breaker statistics
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  stateChangedAt: Date;
  failureRate: number;
  averageResponseTime: number;
}

// Circuit breaker events
export interface CircuitBreakerEvent {
  type: 'state_change' | 'failure' | 'success' | 'timeout' | 'rejected';
  timestamp: Date;
  state?: CircuitBreakerState;
  previousState?: CircuitBreakerState;
  error?: Error;
  duration?: number;
}

// Event listener interface
export type CircuitBreakerEventListener = (event: CircuitBreakerEvent) => void;

/**
 * Circuit breaker implementation for database operations
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private stateChangedAt = new Date();
  private nextAttemptTime = 0;
  private responseTimes: number[] = [];
  private eventListeners: CircuitBreakerEventListener[] = [];
  private monitoringWindow: Array<{ timestamp: number; success: boolean }> = [];

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      successThreshold: 3,
      timeout: 30000, // 30 seconds
      monitoringPeriod: 300000, // 5 minutes
      volumeThreshold: 10,
      ...config
    };

    // Start monitoring cleanup
    setInterval(() => this.cleanupMonitoringWindow(), 60000); // Every minute
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    
    // Check if circuit is open
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        this.emitEvent({
          type: 'rejected',
          timestamp: new Date()
        });
        throw new CircuitBreakerOpenError('Circuit breaker is OPEN');
      } else {
        // Transition to half-open for testing
        this.changeState(CircuitBreakerState.HALF_OPEN);
      }
    }

    this.totalRequests++;
    
    try {
      // Execute operation with timeout
      const result = await Promise.race([
        operation(),
        this.createTimeoutPromise<T>()
      ]);

      const duration = Date.now() - startTime;
      this.onSuccess(duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.onFailure(error as Error, duration);
      throw error;
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const recentRequests = this.getRecentRequests();
    const failureRate = recentRequests.length > 0 
      ? recentRequests.filter(r => !r.success).length / recentRequests.length 
      : 0;

    const averageResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
      : 0;

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedAt: this.stateChangedAt,
      failureRate,
      averageResponseTime
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.changeState(CircuitBreakerState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.responseTimes = [];
    this.monitoringWindow = [];
    this.nextAttemptTime = 0;
  }

  /**
   * Add event listener
   */
  addEventListener(listener: CircuitBreakerEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: CircuitBreakerEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  // Private methods

  private onSuccess(duration: number): void {
    this.successCount++;
    this.lastSuccessTime = new Date();
    this.recordResponse(duration, true);

    this.emitEvent({
      type: 'success',
      timestamp: new Date(),
      duration
    });

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        this.changeState(CircuitBreakerState.CLOSED);
        this.failureCount = 0; // Reset failure count when closing
      }
    }
  }

  private onFailure(error: Error, duration: number): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    this.recordResponse(duration, false);

    this.emitEvent({
      type: 'failure',
      timestamp: new Date(),
      error,
      duration
    });

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Go back to open state on any failure in half-open
      this.changeState(CircuitBreakerState.OPEN);
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Check if we should open the circuit
      if (this.shouldOpenCircuit()) {
        this.changeState(CircuitBreakerState.OPEN);
      }
    }
  }

  private shouldOpenCircuit(): boolean {
    const recentRequests = this.getRecentRequests();
    
    // Need minimum volume of requests
    if (recentRequests.length < this.config.volumeThreshold) {
      return false;
    }

    // Check failure rate
    const failures = recentRequests.filter(r => !r.success).length;
    return failures >= this.config.failureThreshold;
  }

  private changeState(newState: CircuitBreakerState): void {
    const previousState = this.state;
    this.state = newState;
    this.stateChangedAt = new Date();

    if (newState === CircuitBreakerState.OPEN) {
      this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
    } else if (newState === CircuitBreakerState.CLOSED) {
      this.successCount = 0; // Reset success count when closing
    }

    this.emitEvent({
      type: 'state_change',
      timestamp: new Date(),
      state: newState,
      previousState
    });
  }

  private recordResponse(duration: number, success: boolean): void {
    // Record response time
    this.responseTimes.push(duration);
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift(); // Keep only last 100 response times
    }

    // Record in monitoring window
    this.monitoringWindow.push({
      timestamp: Date.now(),
      success
    });
  }

  private getRecentRequests(): Array<{ timestamp: number; success: boolean }> {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    return this.monitoringWindow.filter(r => r.timestamp > cutoff);
  }

  private cleanupMonitoringWindow(): void {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    this.monitoringWindow = this.monitoringWindow.filter(r => r.timestamp > cutoff);
  }

  private createTimeoutPromise<T>(): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        this.emitEvent({
          type: 'timeout',
          timestamp: new Date()
        });
        reject(new CircuitBreakerTimeoutError(`Operation timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });
  }

  private emitEvent(event: CircuitBreakerEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in circuit breaker event listener:', error);
      }
    }
  }
}

/**
 * Circuit breaker wrapper for IDataAccessLayer
 */
export class CircuitBreakerDataAccessLayer implements IDataAccessLayer {
  private provider: IDataAccessLayer;
  private circuitBreaker: CircuitBreaker;

  constructor(provider: IDataAccessLayer, config?: Partial<CircuitBreakerConfig>) {
    this.provider = provider;
    this.circuitBreaker = new CircuitBreaker(config);
    
    // Log circuit breaker events
    this.circuitBreaker.addEventListener((event) => {
      if (event.type === 'state_change') {
        console.log(`Circuit breaker state changed: ${event.previousState} -> ${event.state}`);
      } else if (event.type === 'failure') {
        console.warn(`Circuit breaker recorded failure:`, event.error?.message);
      }
    });
  }

  // IDatabaseProvider methods
  async connect(): Promise<void> {
    return this.circuitBreaker.execute(() => this.provider.connect());
  }

  async disconnect(): Promise<void> {
    return this.circuitBreaker.execute(() => this.provider.disconnect());
  }

  isConnected(): boolean {
    return this.provider.isConnected();
  }

  getProviderType(): DatabaseProviderType {
    return this.provider.getProviderType();
  }

  async healthCheck() {
    return this.circuitBreaker.execute(() => this.provider.healthCheck());
  }

  // IDataAccessLayer methods
  async get<TResult>(key: any, options?: any): Promise<TResult | null> {
    return this.circuitBreaker.execute(() => this.provider.get<TResult>(key, options));
  }

  async put<TData>(data: TData, options?: any): Promise<void> {
    return this.circuitBreaker.execute(() => this.provider.put(data, options));
  }

  async update(input: any, options?: any): Promise<any> {
    return this.circuitBreaker.execute(() => this.provider.update(input, options));
  }

  async delete(key: any, options?: any): Promise<void> {
    return this.circuitBreaker.execute(() => this.provider.delete(key, options));
  }

  async query<TResult>(input: any): Promise<TResult[]> {
    return this.circuitBreaker.execute(() => this.provider.query<TResult>(input));
  }

  async scan<TResult>(input: any): Promise<{ items: TResult[], token?: any }> {
    return this.circuitBreaker.execute(() => this.provider.scan<TResult>(input));
  }

  async batchGet<TResult>(keys: any[], options?: any): Promise<TResult[]> {
    return this.circuitBreaker.execute(() => this.provider.batchGet<TResult>(keys, options));
  }

  async beginTransaction() {
    return this.circuitBreaker.execute(() => this.provider.beginTransaction());
  }

  async executeTransaction(operations: any[]): Promise<void> {
    return this.circuitBreaker.execute(() => this.provider.executeTransaction(operations));
  }

  async executeNative(operation: any): Promise<any> {
    return this.circuitBreaker.execute(() => this.provider.executeNative(operation));
  }

  // Circuit breaker specific methods
  getCircuitBreakerStats(): CircuitBreakerStats {
    return this.circuitBreaker.getStats();
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  addCircuitBreakerEventListener(listener: CircuitBreakerEventListener): void {
    this.circuitBreaker.addEventListener(listener);
  }

  removeCircuitBreakerEventListener(listener: CircuitBreakerEventListener): void {
    this.circuitBreaker.removeEventListener(listener);
  }
}

/**
 * Circuit breaker specific errors
 */
export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreakerOpenError extends CircuitBreakerError {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreakerTimeoutError extends CircuitBreakerError {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerTimeoutError';
  }
}

/**
 * Factory for creating circuit breaker configurations based on provider type
 */
export class CircuitBreakerConfigFactory {
  static createForProvider(providerType: DatabaseProviderType): CircuitBreakerConfig {
    const baseConfig: CircuitBreakerConfig = {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      successThreshold: 3,
      timeout: 30000,
      monitoringPeriod: 300000,
      volumeThreshold: 10
    };

    if (providerType === 'dynamodb') {
      return {
        ...baseConfig,
        failureThreshold: 3, // DynamoDB is more sensitive to throttling
        recoveryTimeout: 30000, // Shorter recovery time
        timeout: 10000 // Shorter timeout for DynamoDB operations
      };
    } else if (providerType === 'mongodb') {
      return {
        ...baseConfig,
        failureThreshold: 5,
        recoveryTimeout: 60000,
        timeout: 30000 // MongoDB operations can take longer
      };
    }

    return baseConfig;
  }
}