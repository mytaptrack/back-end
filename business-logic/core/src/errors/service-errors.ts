/**
 * Base class for all service errors
 */
export abstract class ServiceError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  abstract readonly retryable: boolean;
  
  constructor(
    message: string,
    public readonly correlationId?: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Business logic validation errors
 */
export class BusinessLogicError extends ServiceError {
  readonly code = 'BUSINESS_LOGIC_ERROR';
  readonly statusCode = 400;
  readonly retryable = false;
}

/**
 * Data validation errors
 */
export class ValidationError extends ServiceError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  readonly retryable = false;
}

/**
 * Resource not found errors
 */
export class NotFoundError extends ServiceError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;
  readonly retryable = false;
}

/**
 * Access denied errors
 */
export class AccessDeniedError extends ServiceError {
  readonly code = 'ACCESS_DENIED';
  readonly statusCode = 403;
  readonly retryable = false;
}

/**
 * Service unavailable errors
 */
export class ServiceUnavailableError extends ServiceError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly statusCode = 503;
  readonly retryable = true;
}

/**
 * Database operation errors
 */
export class DatabaseError extends ServiceError {
  readonly code = 'DATABASE_ERROR';
  readonly statusCode = 500;
  readonly retryable = true;
}

/**
 * Message broker errors
 */
export class MessageBrokerError extends ServiceError {
  readonly code = 'MESSAGE_BROKER_ERROR';
  readonly statusCode = 500;
  readonly retryable = true;
}

/**
 * Authentication errors
 */
export class AuthenticationError extends ServiceError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;
  readonly retryable = false;
}

/**
 * Configuration errors
 */
export class ConfigurationError extends ServiceError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 500;
  readonly retryable = false;
}