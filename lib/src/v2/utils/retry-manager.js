"use strict";
/**
 * Retry mechanism with exponential backoff for database operations
 * Handles connection errors and transient failures
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResilienceManagerFactory = exports.ResilienceManager = exports.CircuitBreaker = exports.CircuitState = exports.RetryManager = void 0;
const database_errors_1 = require("../types/database-errors");
const database_logger_1 = require("./database-logger");
class RetryManager {
    config;
    logger;
    constructor(config = {}) {
        this.config = {
            maxAttempts: 3,
            baseDelay: 100,
            maxDelay: 5000,
            backoffMultiplier: 2,
            jitter: true,
            retryableErrors: ['CONNECTION_ERROR', 'TIMEOUT', 'THROUGHPUT_EXCEEDED', 'INTERNAL_SERVER_ERROR'],
            ...config
        };
        this.logger = database_logger_1.LoggerFactory.getLogger('RetryManager');
    }
    async executeWithRetry(operation, operationName, provider, context) {
        let lastError;
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
            }
            catch (error) {
                const dbError = error instanceof database_errors_1.DatabaseError ? error : new database_errors_1.InternalServerError(error?.message || 'Unknown error', error);
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
        throw lastError;
    }
    shouldRetry(error, attempt) {
        if (attempt >= this.config.maxAttempts) {
            return false;
        }
        // Check if error is retryable based on error properties
        if (!(0, database_errors_1.isRetryableError)(error)) {
            return false;
        }
        // Check if error code is in the retryable list
        if (this.config.retryableErrors && !this.config.retryableErrors.includes(error.code)) {
            return false;
        }
        return true;
    }
    calculateDelay(attempt) {
        let delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
        // Apply maximum delay limit
        delay = Math.min(delay, this.config.maxDelay);
        // Add jitter to prevent thundering herd
        if (this.config.jitter) {
            delay = delay * (0.5 + Math.random() * 0.5);
        }
        return Math.floor(delay);
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // Update retry configuration
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    getConfig() {
        return { ...this.config };
    }
}
exports.RetryManager = RetryManager;
// Circuit breaker pattern for connection resilience
var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "CLOSED";
    CircuitState["OPEN"] = "OPEN";
    CircuitState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitState || (exports.CircuitState = CircuitState = {}));
class CircuitBreaker {
    state = CircuitState.CLOSED;
    failureCount = 0;
    lastFailureTime;
    halfOpenCalls = 0;
    config;
    logger;
    constructor(config = {}) {
        this.config = {
            failureThreshold: 5,
            recoveryTimeout: 60000, // 1 minute
            monitoringPeriod: 10000, // 10 seconds
            halfOpenMaxCalls: 3,
            ...config
        };
        this.logger = database_logger_1.LoggerFactory.getLogger('CircuitBreaker');
    }
    async execute(operation, operationName, provider) {
        if (this.state === CircuitState.OPEN) {
            if (this.shouldAttemptReset()) {
                this.state = CircuitState.HALF_OPEN;
                this.halfOpenCalls = 0;
                this.logger.info(`Circuit breaker transitioning to HALF_OPEN`, {
                    provider,
                    operation: operationName
                });
            }
            else {
                const error = new database_errors_1.InternalServerError(`Circuit breaker is OPEN for ${provider}`, undefined, provider);
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
        }
        catch (error) {
            this.onFailure(error, operationName, provider);
            throw error;
        }
    }
    onSuccess(operationName, provider) {
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
        }
        else if (this.state === CircuitState.CLOSED) {
            this.failureCount = 0;
        }
    }
    onFailure(error, operationName, provider) {
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
        }
        else if (this.state === CircuitState.CLOSED && this.failureCount >= this.config.failureThreshold) {
            this.state = CircuitState.OPEN;
            this.logger.error(`Circuit breaker opened due to failure threshold`, {
                provider,
                operation: operationName,
                failureCount: this.failureCount,
                threshold: this.config.failureThreshold
            });
        }
    }
    shouldAttemptReset() {
        if (!this.lastFailureTime) {
            return true;
        }
        const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
        return timeSinceLastFailure >= this.config.recoveryTimeout;
    }
    getState() {
        return this.state;
    }
    getFailureCount() {
        return this.failureCount;
    }
    reset() {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.halfOpenCalls = 0;
        this.lastFailureTime = undefined;
        this.logger.info(`Circuit breaker manually reset`);
    }
}
exports.CircuitBreaker = CircuitBreaker;
// Combined retry and circuit breaker manager
class ResilienceManager {
    retryManager;
    circuitBreaker;
    logger;
    constructor(retryConfig, circuitConfig) {
        this.retryManager = new RetryManager(retryConfig);
        this.circuitBreaker = new CircuitBreaker(circuitConfig);
        this.logger = database_logger_1.LoggerFactory.getLogger('ResilienceManager');
    }
    async executeWithResilience(operation, operationName, provider, context) {
        return this.circuitBreaker.execute(() => this.retryManager.executeWithRetry(operation, operationName, provider, context), operationName, provider);
    }
    getRetryConfig() {
        return this.retryManager.getConfig();
    }
    getCircuitState() {
        return this.circuitBreaker.getState();
    }
    resetCircuitBreaker() {
        this.circuitBreaker.reset();
    }
    updateRetryConfig(config) {
        this.retryManager.updateConfig(config);
    }
}
exports.ResilienceManager = ResilienceManager;
// Factory for creating resilience managers
class ResilienceManagerFactory {
    static managers = new Map();
    static getManager(provider, retryConfig, circuitConfig) {
        if (!this.managers.has(provider)) {
            this.managers.set(provider, new ResilienceManager(retryConfig, circuitConfig));
        }
        return this.managers.get(provider);
    }
    static resetAll() {
        this.managers.forEach(manager => manager.resetCircuitBreaker());
    }
}
exports.ResilienceManagerFactory = ResilienceManagerFactory;
//# sourceMappingURL=retry-manager.js.map