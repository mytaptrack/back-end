import { IAuthenticationProvider, AuthenticationResult, UserContext, TokenResult, AuthConfig } from '../authentication/interfaces';
import { ICacheProvider, CacheConfig } from '../cache-providers/interfaces';
import { UnifiedConfig } from '../config/interfaces';
import { IEmailService } from './email-service';

/**
 * Core service context interface that provides all service dependencies
 */
export interface ServiceContext {
  dataAccess: IDataAccessLayer;
  messageBroker: IMessageBroker;
  authentication: IAuthenticationProvider;
  cache: ICacheProvider;
  logger: ILogger;
  config: ServiceConfig;
  emailService?: IEmailService;
}

/**
 * Data access layer interface for database operations
 */
export interface IDataAccessLayer {
  get<T>(key: any, projection?: string): Promise<T | null>;
  put<T>(item: T, overwrite?: boolean): Promise<void>;
  update(params: UpdateParams): Promise<void>;
  delete(key: any): Promise<void>;
  query<T>(params: QueryParams): Promise<T[]>;
  scan<T>(params: ScanParams): Promise<T[]>;
  batchGet<T>(keys: any[], projection?: string): Promise<T[]>;
  isConnected(): Promise<boolean>;
}

/**
 * Message broker interface for event-driven communication
 */
export interface IMessageBroker {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(eventType: string, payload: any, options?: PublishOptions): Promise<void>;
  subscribe(eventType: string, handler: MessageHandler, options?: SubscribeOptions): Promise<void>;
  unsubscribe(eventType: string): Promise<void>;
}



// Re-export ICacheProvider for convenience
export { ICacheProvider };

/**
 * Logger interface
 */
export interface ILogger {
  debug(message: string, metadata?: any): void;
  info(message: string, metadata?: any): void;
  warn(message: string, metadata?: any): void;
  error(message: string, metadata?: any): void;
}

/**
 * Service configuration interface (legacy - use UnifiedConfig instead)
 * @deprecated Use UnifiedConfig from '../config/interfaces' instead
 */
export interface ServiceConfig {
  environment: 'aws' | 'docker';
  database: DatabaseConfig;
  messageBroker: MessageBrokerConfig;
  authentication: AuthConfig;
  cache: CacheConfig;
  [key: string]: any;
}

/**
 * Updated service context interface using unified configuration
 */
export interface ServiceContextV2 {
  dataAccess: IDataAccessLayer;
  messageBroker: IMessageBroker;
  authentication: IAuthenticationProvider;
  cache: ICacheProvider;
  logger: ILogger;
  config: UnifiedConfig;
  emailService?: IEmailService;
}

// Supporting interfaces
export interface UpdateParams {
  key: any;
  updateExpression: string;
  attributeNames?: Record<string, string>;
  attributeValues?: Record<string, any>;
}

export interface QueryParams {
  keyExpression: string;
  attributeNames?: Record<string, string>;
  attributeValues: Record<string, any>;
  projectionExpression?: string;
  filterExpression?: string;
  indexName?: string;
}

export interface ScanParams {
  filterExpression?: string;
  attributeNames?: Record<string, string>;
  attributeValues?: Record<string, any>;
  projectionExpression?: string;
}

export interface PublishOptions {
  correlationId?: string;
  delay?: number;
  priority?: number;
}

export interface SubscribeOptions {
  durable?: boolean;
  autoAck?: boolean;
  prefetch?: number;
}

export interface MessageHandler {
  (message: BrokerMessage): Promise<void>;
}

export interface BrokerMessage {
  eventType: string;
  payload: any;
  metadata: {
    messageId: string;
    timestamp: Date;
    source: string;
    correlationId?: string;
  };
}

// Re-export authentication interfaces for convenience
export { IAuthenticationProvider, AuthenticationResult, UserContext, TokenResult };

export interface DatabaseConfig {
  provider: 'dynamodb' | 'mongodb';
  connectionString?: string;
  region?: string;
  tables?: Record<string, string>;
}

export interface MessageBrokerConfig {
  provider: 'eventbridge' | 'rabbitmq';
  connectionString?: string;
  region?: string;
  eventBusName?: string;
}

// Re-export AuthConfig and CacheConfig for convenience
export { AuthConfig, CacheConfig };