"use strict";
/**
 * Unified error classes and error translation system
 * Provides consistent error handling across different database providers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorTranslatorFactory = exports.MongoDBErrorTranslator = exports.DynamoDBErrorTranslator = exports.BaseErrorTranslator = exports.DuplicateKeyError = exports.ConfigurationError = exports.InternalServerError = exports.TimeoutError = exports.AccessDeniedError = exports.ResourceNotFoundError = exports.ProvisionedThroughputExceededError = exports.TransactionError = exports.ValidationError = exports.ConnectionError = exports.ConditionalCheckFailedError = exports.ItemNotFoundError = exports.DatabaseError = void 0;
exports.isRetryableError = isRetryableError;
exports.isConnectionError = isConnectionError;
exports.isTransactionError = isTransactionError;
exports.isValidationError = isValidationError;
exports.isNotFoundError = isNotFoundError;
// Base database error class
class DatabaseError extends Error {
    timestamp;
    provider;
    originalError;
    constructor(message, originalError, provider) {
        super(message);
        this.name = this.constructor.name;
        this.timestamp = new Date();
        this.originalError = originalError;
        this.provider = provider;
        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, new.target.prototype);
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            retryable: this.retryable,
            timestamp: this.timestamp,
            provider: this.provider,
            stack: this.stack
        };
    }
}
exports.DatabaseError = DatabaseError;
// Specific error types
class ItemNotFoundError extends DatabaseError {
    code = 'ITEM_NOT_FOUND';
    retryable = false;
    constructor(message = 'Item not found', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.ItemNotFoundError = ItemNotFoundError;
class ConditionalCheckFailedError extends DatabaseError {
    code = 'CONDITIONAL_CHECK_FAILED';
    retryable = false;
    constructor(message = 'Conditional check failed', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.ConditionalCheckFailedError = ConditionalCheckFailedError;
class ConnectionError extends DatabaseError {
    code = 'CONNECTION_ERROR';
    retryable = true;
    constructor(message = 'Database connection error', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.ConnectionError = ConnectionError;
class ValidationError extends DatabaseError {
    code = 'VALIDATION_ERROR';
    retryable = false;
    constructor(message = 'Data validation failed', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.ValidationError = ValidationError;
class TransactionError extends DatabaseError {
    code = 'TRANSACTION_ERROR';
    retryable = false;
    constructor(message = 'Transaction failed', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.TransactionError = TransactionError;
class ProvisionedThroughputExceededError extends DatabaseError {
    code = 'THROUGHPUT_EXCEEDED';
    retryable = true;
    constructor(message = 'Provisioned throughput exceeded', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.ProvisionedThroughputExceededError = ProvisionedThroughputExceededError;
class ResourceNotFoundError extends DatabaseError {
    code = 'RESOURCE_NOT_FOUND';
    retryable = false;
    constructor(message = 'Database resource not found', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.ResourceNotFoundError = ResourceNotFoundError;
class AccessDeniedError extends DatabaseError {
    code = 'ACCESS_DENIED';
    retryable = false;
    constructor(message = 'Access denied', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.AccessDeniedError = AccessDeniedError;
class TimeoutError extends DatabaseError {
    code = 'TIMEOUT';
    retryable = true;
    constructor(message = 'Operation timed out', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.TimeoutError = TimeoutError;
class InternalServerError extends DatabaseError {
    code = 'INTERNAL_SERVER_ERROR';
    retryable = true;
    constructor(message = 'Internal server error', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.InternalServerError = InternalServerError;
class ConfigurationError extends DatabaseError {
    code = 'CONFIGURATION_ERROR';
    retryable = false;
    constructor(message = 'Database configuration error', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.ConfigurationError = ConfigurationError;
class DuplicateKeyError extends DatabaseError {
    code = 'DUPLICATE_KEY';
    retryable = false;
    constructor(message = 'Duplicate key error', originalError, provider) {
        super(message, originalError, provider);
    }
}
exports.DuplicateKeyError = DuplicateKeyError;
// Base error translator class
class BaseErrorTranslator {
    createGenericError(error, provider) {
        if (error instanceof DatabaseError) {
            return error;
        }
        // Default to internal server error for unknown errors
        return new InternalServerError(error?.message || 'Unknown database error', error, provider);
    }
}
exports.BaseErrorTranslator = BaseErrorTranslator;
// DynamoDB error translator
class DynamoDBErrorTranslator extends BaseErrorTranslator {
    translateError(error, provider = 'dynamodb') {
        if (error instanceof DatabaseError) {
            return error;
        }
        const errorName = error?.name || error?.code;
        const errorMessage = error?.message || 'Unknown DynamoDB error';
        switch (errorName) {
            case 'ResourceNotFoundException':
                return new ResourceNotFoundError(errorMessage, error, provider);
            case 'ConditionalCheckFailedException':
                return new ConditionalCheckFailedError(errorMessage, error, provider);
            case 'ProvisionedThroughputExceededException':
                return new ProvisionedThroughputExceededError(errorMessage, error, provider);
            case 'ValidationException':
                return new ValidationError(errorMessage, error, provider);
            case 'AccessDeniedException':
                return new AccessDeniedError(errorMessage, error, provider);
            case 'TimeoutError':
            case 'RequestTimeout':
                return new TimeoutError(errorMessage, error, provider);
            case 'NetworkingError':
            case 'ConnectionError':
                return new ConnectionError(errorMessage, error, provider);
            case 'TransactionCanceledException':
                return new TransactionError(errorMessage, error, provider);
            case 'InternalServerError':
            case 'ServiceUnavailable':
                return new InternalServerError(errorMessage, error, provider);
            default:
                return this.createGenericError(error, provider);
        }
    }
}
exports.DynamoDBErrorTranslator = DynamoDBErrorTranslator;
// MongoDB error translator
class MongoDBErrorTranslator extends BaseErrorTranslator {
    translateError(error, provider = 'mongodb') {
        if (error instanceof DatabaseError) {
            return error;
        }
        const errorCode = error?.code;
        const errorMessage = error?.message || 'Unknown MongoDB error';
        switch (errorCode) {
            case 11000: // Duplicate key error
                return new DuplicateKeyError(errorMessage, error, provider);
            case 50: // ExceededTimeLimit
                return new TimeoutError(errorMessage, error, provider);
            case 13: // Unauthorized
                return new AccessDeniedError(errorMessage, error, provider);
            case 26: // NamespaceNotFound
                return new ResourceNotFoundError(errorMessage, error, provider);
            case 112: // WriteConflict
                return new ConditionalCheckFailedError(errorMessage, error, provider);
            case 251: // TransactionTooOld
            case 244: // TransactionAborted
                return new TransactionError(errorMessage, error, provider);
            default:
                // Check error name patterns
                if (error?.name === 'MongoNetworkError' || error?.name === 'MongoServerSelectionError') {
                    return new ConnectionError(errorMessage, error, provider);
                }
                if (error?.name === 'MongoTimeoutError') {
                    return new TimeoutError(errorMessage, error, provider);
                }
                if (error?.name === 'ValidationError') {
                    return new ValidationError(errorMessage, error, provider);
                }
                return this.createGenericError(error, provider);
        }
    }
}
exports.MongoDBErrorTranslator = MongoDBErrorTranslator;
// Error translator factory
class ErrorTranslatorFactory {
    static translators = new Map([
        ['dynamodb', new DynamoDBErrorTranslator()],
        ['mongodb', new MongoDBErrorTranslator()]
    ]);
    static getTranslator(provider) {
        const translator = this.translators.get(provider.toLowerCase());
        if (!translator) {
            throw new ConfigurationError(`No error translator found for provider: ${provider}`);
        }
        return translator;
    }
    static registerTranslator(provider, translator) {
        this.translators.set(provider.toLowerCase(), translator);
    }
    static translateError(error, provider) {
        const translator = this.getTranslator(provider);
        return translator.translateError(error, provider);
    }
}
exports.ErrorTranslatorFactory = ErrorTranslatorFactory;
// Utility functions for error handling
function isRetryableError(error) {
    return error.retryable;
}
function isConnectionError(error) {
    return error.code === 'CONNECTION_ERROR';
}
function isTransactionError(error) {
    return error.code === 'TRANSACTION_ERROR';
}
function isValidationError(error) {
    return error.code === 'VALIDATION_ERROR';
}
function isNotFoundError(error) {
    return error.code === 'ITEM_NOT_FOUND' || error.code === 'RESOURCE_NOT_FOUND';
}
//# sourceMappingURL=database-errors.js.map