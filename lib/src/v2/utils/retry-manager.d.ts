/**
 * Retry mechanism with exponential backoff for database operations
 * Handles connection errors and transient failures
 */
import { DatabaseError } from '../types/database-errors';
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
export declare class RetryManager {
    private config;
    private logger;
    constructor(config?: Partial<RetryConfig>);
    executeWithRetry<T>(operation: () => Promise<T>, operationName: string, provider: string, context?: any): Promise<T>;
    private shouldRetry;
    private calculateDelay;
    private sleep;
    updateConfig(config: Partial<RetryConfig>): void;
    getConfig(): RetryConfig;
}
export declare enum CircuitState {
    CLOSED = "CLOSED",
    OPEN = "OPEN",
    HALF_OPEN = "HALF_OPEN"
}
export interface CircuitBreakerConfig {
    failureThreshold: number;
    recoveryTimeout: number;
    monitoringPeriod: number;
    halfOpenMaxCalls: number;
}
export declare class CircuitBreaker {
    private state;
    private failureCount;
    private lastFailureTime?;
    private halfOpenCalls;
    private config;
    private logger;
    constructor(config?: Partial<CircuitBreakerConfig>);
    execute<T>(operation: () => Promise<T>, operationName: string, provider: string): Promise<T>;
    private onSuccess;
    private onFailure;
    private shouldAttemptReset;
    getState(): CircuitState;
    getFailureCount(): number;
    reset(): void;
}
export declare class ResilienceManager {
    private retryManager;
    private circuitBreaker;
    private logger;
    constructor(retryConfig?: Partial<RetryConfig>, circuitConfig?: Partial<CircuitBreakerConfig>);
    executeWithResilience<T>(operation: () => Promise<T>, operationName: string, provider: string, context?: any): Promise<T>;
    getRetryConfig(): RetryConfig;
    getCircuitState(): CircuitState;
    resetCircuitBreaker(): void;
    updateRetryConfig(config: Partial<RetryConfig>): void;
}
export declare class ResilienceManagerFactory {
    private static managers;
    static getManager(provider: string, retryConfig?: Partial<RetryConfig>, circuitConfig?: Partial<CircuitBreakerConfig>): ResilienceManager;
    static resetAll(): void;
}
//# sourceMappingURL=retry-manager.d.ts.map