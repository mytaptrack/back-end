/**
 * Unified error classes and error translation system
 * Provides consistent error handling across different database providers
 */

// Base database error class
export abstract class DatabaseError extends Error {
  abstract readonly code: string;
  abstract readonly retryable: boolean;
  readonly timestamp: Date;
  readonly provider?: string;
  readonly originalError?: any;

  constructor(message: string, originalError?: any, provider?: string) {
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

// Specific error types
export class ItemNotFoundError extends DatabaseError {
  readonly code = 'ITEM_NOT_FOUND';
  readonly retryable = false;

  constructor(message: string = 'Item not found', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

export class ConditionalCheckFailedError extends DatabaseError {
  readonly code = 'CONDITIONAL_CHECK_FAILED';
  readonly retryable = false;

  constructor(message: string = 'Conditional check failed', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

export class ConnectionError extends DatabaseError {
  readonly code = 'CONNECTION_ERROR';
  readonly retryable = true;

  constructor(message: string = 'Database connection error', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

export class ValidationError extends DatabaseError {
  readonly code = 'VALIDATION_ERROR';
  readonly retryable = false;

  constructor(message: string = 'Data validation failed', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

export class TransactionError extends DatabaseError {
  readonly code = 'TRANSACTION_ERROR';
  readonly retryable = false;

  constructor(message: string = 'Transaction failed', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

export class ProvisionedThroughputExceededError extends DatabaseError {
  readonly code = 'THROUGHPUT_EXCEEDED';
  readonly retryable = true;

  constructor(message: string = 'Provisioned throughput exceeded', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

export class ResourceNotFoundError extends DatabaseError {
  readonly code = 'RESOURCE_NOT_FOUND';
  readonly retryable = false;

  constructor(message: string = 'Database resource not found', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

export class AccessDeniedError extends DatabaseError {
  readonly code = 'ACCESS_DENIED';
  readonly retryable = false;

  constructor(message: string = 'Access denied', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

export class TimeoutError extends DatabaseError {
  readonly code = 'TIMEOUT';
  readonly retryable = true;

  constructor(message: string = 'Operation timed out', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

export class InternalServerError extends DatabaseError {
  readonly code = 'INTERNAL_SERVER_ERROR';
  readonly retryable = true;

  constructor(message: string = 'Internal server error', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

export class ConfigurationError extends DatabaseError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly retryable = false;

  constructor(message: string = 'Database configuration error', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

export class DuplicateKeyError extends DatabaseError {
  readonly code = 'DUPLICATE_KEY';
  readonly retryable = false;

  constructor(message: string = 'Duplicate key error', originalError?: any, provider?: string) {
    super(message, originalError, provider);
  }
}

// Error translation interface
export interface IErrorTranslator {
  translateError(error: any, provider: string): DatabaseError;
}

// Base error translator class
export abstract class BaseErrorTranslator implements IErrorTranslator {
  abstract translateError(error: any, provider: string): DatabaseError;

  protected createGenericError(error: any, provider: string): DatabaseError {
    if (error instanceof DatabaseError) {
      return error;
    }

    // Default to internal server error for unknown errors
    return new InternalServerError(
      error?.message || 'Unknown database error',
      error,
      provider
    );
  }
}

// DynamoDB error translator
export class DynamoDBErrorTranslator extends BaseErrorTranslator {
  translateError(error: any, provider: string = 'dynamodb'): DatabaseError {
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

// MongoDB error translator
export class MongoDBErrorTranslator extends BaseErrorTranslator {
  translateError(error: any, provider: string = 'mongodb'): DatabaseError {
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

// Error translator factory
export class ErrorTranslatorFactory {
  private static translators: Map<string, IErrorTranslator> = new Map([
    ['dynamodb', new DynamoDBErrorTranslator()],
    ['mongodb', new MongoDBErrorTranslator()]
  ]);

  static getTranslator(provider: string): IErrorTranslator {
    const translator = this.translators.get(provider.toLowerCase());
    if (!translator) {
      throw new ConfigurationError(`No error translator found for provider: ${provider}`);
    }
    return translator;
  }

  static registerTranslator(provider: string, translator: IErrorTranslator): void {
    this.translators.set(provider.toLowerCase(), translator);
  }

  static translateError(error: any, provider: string): DatabaseError {
    const translator = this.getTranslator(provider);
    return translator.translateError(error, provider);
  }
}

// Utility functions for error handling
export function isRetryableError(error: DatabaseError): boolean {
  return error.retryable;
}

export function isConnectionError(error: DatabaseError): boolean {
  return error.code === 'CONNECTION_ERROR';
}

export function isTransactionError(error: DatabaseError): boolean {
  return error.code === 'TRANSACTION_ERROR';
}

export function isValidationError(error: DatabaseError): boolean {
  return error.code === 'VALIDATION_ERROR';
}

export function isNotFoundError(error: DatabaseError): boolean {
  return error.code === 'ITEM_NOT_FOUND' || error.code === 'RESOURCE_NOT_FOUND';
}