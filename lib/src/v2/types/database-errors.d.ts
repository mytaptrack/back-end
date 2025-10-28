/**
 * Unified error classes and error translation system
 * Provides consistent error handling across different database providers
 */
export declare abstract class DatabaseError extends Error {
    abstract readonly code: string;
    abstract readonly retryable: boolean;
    readonly timestamp: Date;
    readonly provider?: string;
    readonly originalError?: any;
    constructor(message: string, originalError?: any, provider?: string);
    toJSON(): {
        name: string;
        message: string;
        code: string;
        retryable: boolean;
        timestamp: Date;
        provider: string | undefined;
        stack: string | undefined;
    };
}
export declare class ItemNotFoundError extends DatabaseError {
    readonly code = "ITEM_NOT_FOUND";
    readonly retryable = false;
    constructor(message?: string, originalError?: any, provider?: string);
}
export declare class ConditionalCheckFailedError extends DatabaseError {
    readonly code = "CONDITIONAL_CHECK_FAILED";
    readonly retryable = false;
    constructor(message?: string, originalError?: any, provider?: string);
}
export declare class ConnectionError extends DatabaseError {
    readonly code = "CONNECTION_ERROR";
    readonly retryable = true;
    constructor(message?: string, originalError?: any, provider?: string);
}
export declare class ValidationError extends DatabaseError {
    readonly code = "VALIDATION_ERROR";
    readonly retryable = false;
    constructor(message?: string, originalError?: any, provider?: string);
}
export declare class TransactionError extends DatabaseError {
    readonly code = "TRANSACTION_ERROR";
    readonly retryable = false;
    constructor(message?: string, originalError?: any, provider?: string);
}
export declare class ProvisionedThroughputExceededError extends DatabaseError {
    readonly code = "THROUGHPUT_EXCEEDED";
    readonly retryable = true;
    constructor(message?: string, originalError?: any, provider?: string);
}
export declare class ResourceNotFoundError extends DatabaseError {
    readonly code = "RESOURCE_NOT_FOUND";
    readonly retryable = false;
    constructor(message?: string, originalError?: any, provider?: string);
}
export declare class AccessDeniedError extends DatabaseError {
    readonly code = "ACCESS_DENIED";
    readonly retryable = false;
    constructor(message?: string, originalError?: any, provider?: string);
}
export declare class TimeoutError extends DatabaseError {
    readonly code = "TIMEOUT";
    readonly retryable = true;
    constructor(message?: string, originalError?: any, provider?: string);
}
export declare class InternalServerError extends DatabaseError {
    readonly code = "INTERNAL_SERVER_ERROR";
    readonly retryable = true;
    constructor(message?: string, originalError?: any, provider?: string);
}
export declare class ConfigurationError extends DatabaseError {
    readonly code = "CONFIGURATION_ERROR";
    readonly retryable = false;
    constructor(message?: string, originalError?: any, provider?: string);
}
export declare class DuplicateKeyError extends DatabaseError {
    readonly code = "DUPLICATE_KEY";
    readonly retryable = false;
    constructor(message?: string, originalError?: any, provider?: string);
}
export interface IErrorTranslator {
    translateError(error: any, provider: string): DatabaseError;
}
export declare abstract class BaseErrorTranslator implements IErrorTranslator {
    abstract translateError(error: any, provider: string): DatabaseError;
    protected createGenericError(error: any, provider: string): DatabaseError;
}
export declare class DynamoDBErrorTranslator extends BaseErrorTranslator {
    translateError(error: any, provider?: string): DatabaseError;
}
export declare class MongoDBErrorTranslator extends BaseErrorTranslator {
    translateError(error: any, provider?: string): DatabaseError;
}
export declare class ErrorTranslatorFactory {
    private static translators;
    static getTranslator(provider: string): IErrorTranslator;
    static registerTranslator(provider: string, translator: IErrorTranslator): void;
    static translateError(error: any, provider: string): DatabaseError;
}
export declare function isRetryableError(error: DatabaseError): boolean;
export declare function isConnectionError(error: DatabaseError): boolean;
export declare function isTransactionError(error: DatabaseError): boolean;
export declare function isValidationError(error: DatabaseError): boolean;
export declare function isNotFoundError(error: DatabaseError): boolean;
//# sourceMappingURL=database-errors.d.ts.map