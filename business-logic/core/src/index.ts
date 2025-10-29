// Core interfaces and types - optimized for tree-shaking
// Each export is explicitly named to enable better tree-shaking

// Interfaces
export type { ServiceContext } from './interfaces/service-context';
export type { IBusinessService } from './interfaces/business-service';

// Errors
export { ServiceError, BusinessLogicError, ServiceUnavailableError } from './errors/service-errors';

// Types
export type { CommonTypes } from './types/common';

// Message Brokers - specific exports for tree-shaking
export { IMessageBroker, MessageHandler, BrokerMessage } from './message-brokers/interfaces';
export { EventBridgeMessageBroker } from './message-brokers/eventbridge-message-broker';
export { RabbitMQMessageBroker } from './message-brokers/rabbitmq-message-broker';
export { MessageBrokerFactory } from './message-brokers/factory';

// Authentication - specific exports
export { IAuthenticationProvider, UserContext, AuthenticationResult } from './authentication/interfaces';
export { CognitoAuthenticationProvider } from './authentication/cognito-authentication-provider';
export { JWTAuthenticationProvider } from './authentication/jwt-authentication-provider';
export { AuthProviderFactory } from './authentication/factory';

// Cache Providers - specific exports
export { ICacheProvider } from './cache-providers/interfaces';
export { DynamoDBCacheProvider } from './cache-providers/dynamodb-cache-provider';
export { RedisCacheProvider } from './cache-providers/redis-cache-provider';
export { CacheProviderFactory } from './cache-providers/factory';

// Service Context and Dependency Injection
export { ServiceContextFactory } from './service-context/factory';
export { DependencyContainer } from './service-context/dependency-container';

// Configuration Management - specific exports for tree-shaking
export type { UnifiedConfig } from './config/interfaces';
export { ConfigFactory } from './config/factory';
export { ConfigLoader } from './config/loader';
export { SecretManager } from './config/secrets';
export { ConfigValidator } from './config/validation';
export { createDefaultConfig, validateEnvironmentConfig, isAWSEnvironment, isDockerEnvironment } from './config/utils';

// Logging and Monitoring - specific exports
export { LambdaLogger } from './logging/lambda-logger';
export { ContainerLogger } from './logging/container-logger';
export { HealthCheckManager } from './logging/health-checks';
export { MetricsCollector } from './logging/metrics';

// Lambda Utilities - specific exports for Lambda optimization
export { createLambdaServiceContext } from './lambda/service-context-factory';
export { LambdaWrapper } from './lambda/wrapper';

// Examples - conditional exports (only include if needed)
// These are typically not imported in production Lambda functions
// export * from './examples/authentication-usage';
// export * from './examples/service-context-usage';
// export * from './examples/cache-usage';