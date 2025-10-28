/**
 * Configuration Management Interfaces
 * Provides unified configuration schema for both AWS and Docker deployments
 */

/**
 * Root configuration interface that supports both AWS and Docker environments
 */
export interface UnifiedConfig {
  environment: 'aws' | 'docker';
  stage: string;
  region?: string;
  
  // Core service configurations
  database: DatabaseConfig;
  messageBroker: MessageBrokerConfig;
  authentication: AuthenticationConfig;
  cache: CacheConfig;
  
  // Service-specific configurations
  services: ServicesConfig;
  
  // Security and secrets
  security: SecurityConfig;
  
  // Logging and monitoring
  logging: LoggingConfig;
  monitoring?: MonitoringConfig;
  
  // Health checks
  healthCheck: HealthCheckConfig;
  
  // Development features (optional)
  development?: DevelopmentConfig;
  
  // Custom application settings
  app?: AppConfig;
}

/**
 * Database configuration supporting both DynamoDB and MongoDB
 */
export interface DatabaseConfig {
  provider: 'dynamodb' | 'mongodb';
  
  // DynamoDB configuration (AWS)
  dynamodb?: {
    region: string;
    tables: {
      primary: string;
      data: string;
    };
    endpoints?: {
      primary?: string;
      data?: string;
    };
  };
  
  // MongoDB configuration (Docker)
  mongodb?: {
    connectionString: string;
    database: string;
    collections: {
      primary: string;
      data: string;
    };
    options?: {
      maxPoolSize?: number;
      minPoolSize?: number;
      maxIdleTimeMS?: number;
      serverSelectionTimeoutMS?: number;
      socketTimeoutMS?: number;
      connectTimeoutMS?: number;
      retryWrites?: boolean;
      w?: number;
      readPreference?: 'primary' | 'secondary' | 'primaryPreferred' | 'secondaryPreferred' | 'nearest';
    };
  };
}

/**
 * Message broker configuration supporting EventBridge and RabbitMQ
 */
export interface MessageBrokerConfig {
  provider: 'eventbridge' | 'rabbitmq';
  
  // EventBridge configuration (AWS)
  eventbridge?: {
    region: string;
    eventBusName: string;
    source: string;
  };
  
  // RabbitMQ configuration (Docker)
  rabbitmq?: {
    connectionString: string;
    vhost?: string;
    exchanges: {
      events: string;
      deadLetter: string;
    };
    queues: {
      userEvents: string;
      studentEvents: string;
      licenseEvents: string;
      reportEvents: string;
      appEvents: string;
      deviceEvents: string;
    };
    options?: {
      heartbeat?: number;
      connectionTimeout?: number;
      channelMax?: number;
      frameMax?: number;
      prefetch?: number;
    };
  };
}

/**
 * Authentication configuration supporting Cognito and JWT/OIDC
 */
export interface AuthenticationConfig {
  provider: 'cognito' | 'jwt' | 'oidc' | 'keycloak';
  
  // Cognito configuration (AWS)
  cognito?: {
    region: string;
    userPoolId: string;
    clientId: string;
    issuer: string;
  };
  
  // JWT configuration (Docker)
  jwt?: {
    publicKeyPath: string;
    issuer: string;
    audience: string;
    algorithms: string[];
    clockTolerance?: number;
    maxAge?: string;
  };
  
  // OIDC configuration (Docker)
  oidc?: {
    discoveryUrl: string;
    clientId: string;
    clientSecret: string;
    issuer: string;
    audience: string;
  };
  
  // Keycloak configuration (Docker)
  keycloak?: {
    serverUrl: string;
    realm: string;
    clientId: string;
    clientSecret?: string;
  };
}

/**
 * Cache configuration supporting DynamoDB and Redis
 */
export interface CacheConfig {
  provider: 'dynamodb' | 'redis';
  
  // DynamoDB cache configuration (AWS)
  dynamodb?: {
    region: string;
    tableName: string;
    ttlAttribute: string;
  };
  
  // Redis configuration (Docker)
  redis?: {
    connectionString: string;
    keyPrefix: string;
    defaultTTL: number;
    options?: {
      retryDelayOnFailover?: number;
      enableReadyCheck?: boolean;
      maxRetriesPerRequest?: number;
      lazyConnect?: boolean;
      keepAlive?: number;
    };
  };
}

/**
 * Services configuration for API endpoints
 */
export interface ServicesConfig {
  graphqlApi: {
    port: number;
    cors: CorsConfig;
    rateLimit?: RateLimitConfig;
    complexity?: {
      maximumComplexity: number;
      maximumDepth: number;
    };
  };
  
  restApi: {
    port: number;
    cors: CorsConfig;
    rateLimit?: RateLimitConfig;
  };
  
  deviceApi: {
    port: number;
    rateLimit?: RateLimitConfig;
    timeout?: number;
  };
  
  dataProcessor?: {
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
    deadLetterThreshold: number;
    processingTimeout: number;
  };
}

/**
 * CORS configuration
 */
export interface CorsConfig {
  origins: string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  encryption: {
    algorithm: string;
    keyRotation: boolean;
  };
  
  secrets: {
    provider: 'aws-secrets-manager' | 'docker-secrets' | 'env' | 'vault';
    awsSecretsManager?: {
      region: string;
    };
    vault?: {
      endpoint: string;
      token: string;
      mountPath: string;
    };
  };
  
  network: {
    allowedOrigins: string[];
    rateLimiting: boolean;
    ddosProtection: boolean;
  };
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'pretty';
  timestamp: boolean;
  correlationId: boolean;
  includeStack: boolean;
  destinations: ('console' | 'file' | 'cloudwatch' | 'elasticsearch')[];
  fields?: Record<string, any>;
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  metrics: {
    enabled: boolean;
    port: number;
    path: string;
  };
  tracing: {
    enabled: boolean;
    provider?: 'jaeger' | 'zipkin' | 'aws-xray';
  };
  profiling: {
    enabled: boolean;
  };
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  enabled: boolean;
  interval: number;
  timeout: number;
  retries: number;
  checks: ('database' | 'messageBroker' | 'cache' | 'external')[];
}

/**
 * Development-specific configuration
 */
export interface DevelopmentConfig {
  hotReload: boolean;
  mockData: boolean;
  debugMode: boolean;
  verboseLogging: boolean;
}

/**
 * Application-specific configuration
 */
export interface AppConfig {
  name: string;
  version: string;
  pushSnsArns?: {
    android: string;
    ios: string;
  };
  domain?: {
    name: string;
    hostedZoneId: string;
    subdomains: {
      api: string;
      device: string;
      website: string;
    };
  };
  student?: {
    removeTimeout: number;
  };
  [key: string]: any;
}

/**
 * Configuration validation error
 */
export interface ConfigValidationError {
  path: string;
  message: string;
  value?: any;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
}

/**
 * Secret reference for secure values
 */
export interface SecretReference {
  type: 'secret';
  key: string;
  required: boolean;
}

/**
 * Environment variable reference
 */
export interface EnvReference {
  type: 'env';
  key: string;
  defaultValue?: string;
  required: boolean;
}

/**
 * Configuration value that can be a literal value, secret reference, or env reference
 */
export type ConfigValue<T> = T | SecretReference | EnvReference;