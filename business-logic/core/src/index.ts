// Core interfaces and types - optimized for tree-shaking
// Each export is explicitly named to enable better tree-shaking

// Interfaces
export type { ServiceContext } from './interfaces/service-context';
export type { IBusinessService, IBusinessOperations } from './interfaces/business-service';
export type { IEmailService, EmailRequest, SupportEmailRequest, EmailServiceConfig } from './interfaces/email-service';

// Errors - all available error types
export { 
  ServiceError, 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError, 
  AccessDeniedError, 
  ServiceUnavailableError,
  DatabaseError,
  MessageBrokerError,
  AuthenticationError,
  ConfigurationError
} from './errors/service-errors';

// Lambda Utilities - specific exports for Lambda optimization
export { createLambdaServiceContext } from './lambda/service-context-factory';

// Service Context Factory and Container
// export { ServiceContextFactory } from './service-context/factory';
export { DependencyContainer } from './service-context/dependency-container';

// Configuration Management - specific exports for tree-shaking
export type { UnifiedConfig } from './config/interfaces';
export { ConfigFactory } from './config/factory';
export { ConfigLoader } from './config/loader';
export { SecretManager } from './config/secrets';
export { ConfigValidator } from './config/validation';
export { createDefaultConfig, validateEnvironmentConfig, isAWSEnvironment, isDockerEnvironment } from './config/utils';

// Operations - specific exports for business logic
export { SupportOperations } from './operations/support-operations';

// Email Services - specific exports for email functionality
export { SESEmailService } from './email-services/ses-email-service';

// Logging and Monitoring - specific exports
export { LambdaLogger } from './logging/lambda-logger';