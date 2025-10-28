/**
 * Configuration Validation System
 * Provides comprehensive validation for unified configuration schema
 */

import { 
  UnifiedConfig, 
  ConfigValidationError, 
  ConfigValidationResult,
  DatabaseConfig,
  MessageBrokerConfig,
  AuthenticationConfig,
  CacheConfig,
  ServicesConfig,
  SecurityConfig,
  LoggingConfig,
  HealthCheckConfig
} from './interfaces';

/**
 * Main configuration validator
 */
export class ConfigValidator {
  /**
   * Validate the complete configuration
   */
  static validate(config: any): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    
    // Validate root level properties
    this.validateRootProperties(config, errors);
    
    if (config) {
      // Validate each section
      this.validateDatabase(config.database, errors);
      this.validateMessageBroker(config.messageBroker, errors);
      this.validateAuthentication(config.authentication, errors);
      this.validateCache(config.cache, errors);
      this.validateServices(config.services, errors);
      this.validateSecurity(config.security, errors);
      this.validateLogging(config.logging, errors);
      this.validateHealthCheck(config.healthCheck, errors);
      
      // Validate environment-specific requirements
      this.validateEnvironmentSpecific(config, errors);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate root level properties
   */
  private static validateRootProperties(config: any, errors: ConfigValidationError[]): void {
    if (!config) {
      errors.push({
        path: 'root',
        message: 'Configuration object is required'
      });
      return;
    }
    
    // Validate environment
    if (!config.environment) {
      errors.push({
        path: 'environment',
        message: 'Environment is required'
      });
    } else if (!['aws', 'docker'].includes(config.environment)) {
      errors.push({
        path: 'environment',
        message: 'Environment must be either "aws" or "docker"',
        value: config.environment
      });
    }
    
    // Validate stage
    if (!config.stage) {
      errors.push({
        path: 'stage',
        message: 'Stage is required'
      });
    } else if (typeof config.stage !== 'string' || config.stage.trim().length === 0) {
      errors.push({
        path: 'stage',
        message: 'Stage must be a non-empty string',
        value: config.stage
      });
    }
    
    // Validate region for AWS environment
    if (config.environment === 'aws' && !config.region) {
      errors.push({
        path: 'region',
        message: 'Region is required for AWS environment'
      });
    }
  }
  
  /**
   * Validate database configuration
   */
  private static validateDatabase(database: any, errors: ConfigValidationError[]): void {
    if (!database) {
      errors.push({
        path: 'database',
        message: 'Database configuration is required'
      });
      return;
    }
    
    if (!database.provider) {
      errors.push({
        path: 'database.provider',
        message: 'Database provider is required'
      });
    } else if (!['dynamodb', 'mongodb'].includes(database.provider)) {
      errors.push({
        path: 'database.provider',
        message: 'Database provider must be either "dynamodb" or "mongodb"',
        value: database.provider
      });
    }
    
    // Validate provider-specific configuration
    if (database.provider === 'dynamodb') {
      this.validateDynamoDBConfig(database.dynamodb, errors);
    } else if (database.provider === 'mongodb') {
      this.validateMongoDBConfig(database.mongodb, errors);
    }
  }
  
  /**
   * Validate DynamoDB configuration
   */
  private static validateDynamoDBConfig(dynamodb: any, errors: ConfigValidationError[]): void {
    if (!dynamodb) {
      errors.push({
        path: 'database.dynamodb',
        message: 'DynamoDB configuration is required when provider is "dynamodb"'
      });
      return;
    }
    
    if (!dynamodb.region) {
      errors.push({
        path: 'database.dynamodb.region',
        message: 'DynamoDB region is required'
      });
    }
    
    if (!dynamodb.tables) {
      errors.push({
        path: 'database.dynamodb.tables',
        message: 'DynamoDB tables configuration is required'
      });
    } else {
      if (!dynamodb.tables.primary) {
        errors.push({
          path: 'database.dynamodb.tables.primary',
          message: 'Primary table name is required'
        });
      }
      if (!dynamodb.tables.data) {
        errors.push({
          path: 'database.dynamodb.tables.data',
          message: 'Data table name is required'
        });
      }
    }
  }
  
  /**
   * Validate MongoDB configuration
   */
  private static validateMongoDBConfig(mongodb: any, errors: ConfigValidationError[]): void {
    if (!mongodb) {
      errors.push({
        path: 'database.mongodb',
        message: 'MongoDB configuration is required when provider is "mongodb"'
      });
      return;
    }
    
    if (!mongodb.connectionString) {
      errors.push({
        path: 'database.mongodb.connectionString',
        message: 'MongoDB connection string is required'
      });
    }
    
    if (!mongodb.database) {
      errors.push({
        path: 'database.mongodb.database',
        message: 'MongoDB database name is required'
      });
    }
    
    if (!mongodb.collections) {
      errors.push({
        path: 'database.mongodb.collections',
        message: 'MongoDB collections configuration is required'
      });
    } else {
      if (!mongodb.collections.primary) {
        errors.push({
          path: 'database.mongodb.collections.primary',
          message: 'Primary collection name is required'
        });
      }
      if (!mongodb.collections.data) {
        errors.push({
          path: 'database.mongodb.collections.data',
          message: 'Data collection name is required'
        });
      }
    }
  }
  
  /**
   * Validate message broker configuration
   */
  private static validateMessageBroker(messageBroker: any, errors: ConfigValidationError[]): void {
    if (!messageBroker) {
      errors.push({
        path: 'messageBroker',
        message: 'Message broker configuration is required'
      });
      return;
    }
    
    if (!messageBroker.provider) {
      errors.push({
        path: 'messageBroker.provider',
        message: 'Message broker provider is required'
      });
    } else if (!['eventbridge', 'rabbitmq'].includes(messageBroker.provider)) {
      errors.push({
        path: 'messageBroker.provider',
        message: 'Message broker provider must be either "eventbridge" or "rabbitmq"',
        value: messageBroker.provider
      });
    }
    
    // Validate provider-specific configuration
    if (messageBroker.provider === 'eventbridge') {
      this.validateEventBridgeConfig(messageBroker.eventbridge, errors);
    } else if (messageBroker.provider === 'rabbitmq') {
      this.validateRabbitMQConfig(messageBroker.rabbitmq, errors);
    }
  }
  
  /**
   * Validate EventBridge configuration
   */
  private static validateEventBridgeConfig(eventbridge: any, errors: ConfigValidationError[]): void {
    if (!eventbridge) {
      errors.push({
        path: 'messageBroker.eventbridge',
        message: 'EventBridge configuration is required when provider is "eventbridge"'
      });
      return;
    }
    
    if (!eventbridge.region) {
      errors.push({
        path: 'messageBroker.eventbridge.region',
        message: 'EventBridge region is required'
      });
    }
    
    if (!eventbridge.eventBusName) {
      errors.push({
        path: 'messageBroker.eventbridge.eventBusName',
        message: 'EventBridge event bus name is required'
      });
    }
    
    if (!eventbridge.source) {
      errors.push({
        path: 'messageBroker.eventbridge.source',
        message: 'EventBridge source is required'
      });
    }
  }
  
  /**
   * Validate RabbitMQ configuration
   */
  private static validateRabbitMQConfig(rabbitmq: any, errors: ConfigValidationError[]): void {
    if (!rabbitmq) {
      errors.push({
        path: 'messageBroker.rabbitmq',
        message: 'RabbitMQ configuration is required when provider is "rabbitmq"'
      });
      return;
    }
    
    if (!rabbitmq.connectionString) {
      errors.push({
        path: 'messageBroker.rabbitmq.connectionString',
        message: 'RabbitMQ connection string is required'
      });
    }
    
    if (!rabbitmq.exchanges) {
      errors.push({
        path: 'messageBroker.rabbitmq.exchanges',
        message: 'RabbitMQ exchanges configuration is required'
      });
    } else {
      if (!rabbitmq.exchanges.events) {
        errors.push({
          path: 'messageBroker.rabbitmq.exchanges.events',
          message: 'Events exchange name is required'
        });
      }
      if (!rabbitmq.exchanges.deadLetter) {
        errors.push({
          path: 'messageBroker.rabbitmq.exchanges.deadLetter',
          message: 'Dead letter exchange name is required'
        });
      }
    }
    
    if (!rabbitmq.queues) {
      errors.push({
        path: 'messageBroker.rabbitmq.queues',
        message: 'RabbitMQ queues configuration is required'
      });
    }
  }
  
  /**
   * Validate authentication configuration
   */
  private static validateAuthentication(authentication: any, errors: ConfigValidationError[]): void {
    if (!authentication) {
      errors.push({
        path: 'authentication',
        message: 'Authentication configuration is required'
      });
      return;
    }
    
    if (!authentication.provider) {
      errors.push({
        path: 'authentication.provider',
        message: 'Authentication provider is required'
      });
    } else if (!['cognito', 'jwt', 'oidc', 'keycloak'].includes(authentication.provider)) {
      errors.push({
        path: 'authentication.provider',
        message: 'Authentication provider must be one of: cognito, jwt, oidc, keycloak',
        value: authentication.provider
      });
    }
    
    // Validate provider-specific configuration
    switch (authentication.provider) {
      case 'cognito':
        this.validateCognitoConfig(authentication.cognito, errors);
        break;
      case 'jwt':
        this.validateJWTConfig(authentication.jwt, errors);
        break;
      case 'oidc':
        this.validateOIDCConfig(authentication.oidc, errors);
        break;
      case 'keycloak':
        this.validateKeycloakConfig(authentication.keycloak, errors);
        break;
    }
  }
  
  /**
   * Validate Cognito configuration
   */
  private static validateCognitoConfig(cognito: any, errors: ConfigValidationError[]): void {
    if (!cognito) {
      errors.push({
        path: 'authentication.cognito',
        message: 'Cognito configuration is required when provider is "cognito"'
      });
      return;
    }
    
    const requiredFields = ['region', 'userPoolId', 'clientId', 'issuer'];
    requiredFields.forEach(field => {
      if (!cognito[field]) {
        errors.push({
          path: `authentication.cognito.${field}`,
          message: `Cognito ${field} is required`
        });
      }
    });
  }
  
  /**
   * Validate JWT configuration
   */
  private static validateJWTConfig(jwt: any, errors: ConfigValidationError[]): void {
    if (!jwt) {
      errors.push({
        path: 'authentication.jwt',
        message: 'JWT configuration is required when provider is "jwt"'
      });
      return;
    }
    
    const requiredFields = ['publicKeyPath', 'issuer', 'audience', 'algorithms'];
    requiredFields.forEach(field => {
      if (!jwt[field]) {
        errors.push({
          path: `authentication.jwt.${field}`,
          message: `JWT ${field} is required`
        });
      }
    });
    
    if (jwt.algorithms && !Array.isArray(jwt.algorithms)) {
      errors.push({
        path: 'authentication.jwt.algorithms',
        message: 'JWT algorithms must be an array',
        value: jwt.algorithms
      });
    }
  }
  
  /**
   * Validate OIDC configuration
   */
  private static validateOIDCConfig(oidc: any, errors: ConfigValidationError[]): void {
    if (!oidc) {
      errors.push({
        path: 'authentication.oidc',
        message: 'OIDC configuration is required when provider is "oidc"'
      });
      return;
    }
    
    const requiredFields = ['discoveryUrl', 'clientId', 'clientSecret', 'issuer', 'audience'];
    requiredFields.forEach(field => {
      if (!oidc[field]) {
        errors.push({
          path: `authentication.oidc.${field}`,
          message: `OIDC ${field} is required`
        });
      }
    });
  }
  
  /**
   * Validate Keycloak configuration
   */
  private static validateKeycloakConfig(keycloak: any, errors: ConfigValidationError[]): void {
    if (!keycloak) {
      errors.push({
        path: 'authentication.keycloak',
        message: 'Keycloak configuration is required when provider is "keycloak"'
      });
      return;
    }
    
    const requiredFields = ['serverUrl', 'realm', 'clientId'];
    requiredFields.forEach(field => {
      if (!keycloak[field]) {
        errors.push({
          path: `authentication.keycloak.${field}`,
          message: `Keycloak ${field} is required`
        });
      }
    });
  }
  
  /**
   * Validate cache configuration
   */
  private static validateCache(cache: any, errors: ConfigValidationError[]): void {
    if (!cache) {
      errors.push({
        path: 'cache',
        message: 'Cache configuration is required'
      });
      return;
    }
    
    if (!cache.provider) {
      errors.push({
        path: 'cache.provider',
        message: 'Cache provider is required'
      });
    } else if (!['dynamodb', 'redis'].includes(cache.provider)) {
      errors.push({
        path: 'cache.provider',
        message: 'Cache provider must be either "dynamodb" or "redis"',
        value: cache.provider
      });
    }
    
    // Validate provider-specific configuration
    if (cache.provider === 'redis') {
      this.validateRedisCacheConfig(cache.redis, errors);
    } else if (cache.provider === 'dynamodb') {
      this.validateDynamoDBCacheConfig(cache.dynamodb, errors);
    }
  }
  
  /**
   * Validate Redis cache configuration
   */
  private static validateRedisCacheConfig(redis: any, errors: ConfigValidationError[]): void {
    if (!redis) {
      errors.push({
        path: 'cache.redis',
        message: 'Redis configuration is required when provider is "redis"'
      });
      return;
    }
    
    const requiredFields = ['connectionString', 'keyPrefix', 'defaultTTL'];
    requiredFields.forEach(field => {
      if (redis[field] === undefined || redis[field] === null) {
        errors.push({
          path: `cache.redis.${field}`,
          message: `Redis ${field} is required`
        });
      }
    });
  }
  
  /**
   * Validate DynamoDB cache configuration
   */
  private static validateDynamoDBCacheConfig(dynamodb: any, errors: ConfigValidationError[]): void {
    if (!dynamodb) {
      errors.push({
        path: 'cache.dynamodb',
        message: 'DynamoDB cache configuration is required when provider is "dynamodb"'
      });
      return;
    }
    
    const requiredFields = ['region', 'tableName', 'ttlAttribute'];
    requiredFields.forEach(field => {
      if (!dynamodb[field]) {
        errors.push({
          path: `cache.dynamodb.${field}`,
          message: `DynamoDB cache ${field} is required`
        });
      }
    });
  }
  
  /**
   * Validate services configuration
   */
  private static validateServices(services: any, errors: ConfigValidationError[]): void {
    if (!services) {
      errors.push({
        path: 'services',
        message: 'Services configuration is required'
      });
      return;
    }
    
    // Validate required services
    const requiredServices = ['graphqlApi', 'restApi', 'deviceApi'];
    requiredServices.forEach(service => {
      if (!services[service]) {
        errors.push({
          path: `services.${service}`,
          message: `${service} configuration is required`
        });
      } else {
        this.validateServiceConfig(services[service], `services.${service}`, errors);
      }
    });
  }
  
  /**
   * Validate individual service configuration
   */
  private static validateServiceConfig(service: any, path: string, errors: ConfigValidationError[]): void {
    if (!service.port) {
      errors.push({
        path: `${path}.port`,
        message: 'Service port is required'
      });
    } else if (typeof service.port !== 'number' || service.port < 1 || service.port > 65535) {
      errors.push({
        path: `${path}.port`,
        message: 'Service port must be a number between 1 and 65535',
        value: service.port
      });
    }
    
    if (service.cors) {
      this.validateCorsConfig(service.cors, `${path}.cors`, errors);
    }
  }
  
  /**
   * Validate CORS configuration
   */
  private static validateCorsConfig(cors: any, path: string, errors: ConfigValidationError[]): void {
    if (!Array.isArray(cors.origins)) {
      errors.push({
        path: `${path}.origins`,
        message: 'CORS origins must be an array'
      });
    }
    
    if (typeof cors.credentials !== 'boolean') {
      errors.push({
        path: `${path}.credentials`,
        message: 'CORS credentials must be a boolean'
      });
    }
    
    if (!Array.isArray(cors.methods)) {
      errors.push({
        path: `${path}.methods`,
        message: 'CORS methods must be an array'
      });
    }
    
    if (!Array.isArray(cors.allowedHeaders)) {
      errors.push({
        path: `${path}.allowedHeaders`,
        message: 'CORS allowedHeaders must be an array'
      });
    }
  }
  
  /**
   * Validate security configuration
   */
  private static validateSecurity(security: any, errors: ConfigValidationError[]): void {
    if (!security) {
      errors.push({
        path: 'security',
        message: 'Security configuration is required'
      });
      return;
    }
    
    if (!security.encryption) {
      errors.push({
        path: 'security.encryption',
        message: 'Security encryption configuration is required'
      });
    } else {
      if (!security.encryption.algorithm) {
        errors.push({
          path: 'security.encryption.algorithm',
          message: 'Encryption algorithm is required'
        });
      }
      
      if (typeof security.encryption.keyRotation !== 'boolean') {
        errors.push({
          path: 'security.encryption.keyRotation',
          message: 'Key rotation must be a boolean'
        });
      }
    }
    
    if (!security.secrets) {
      errors.push({
        path: 'security.secrets',
        message: 'Security secrets configuration is required'
      });
    } else {
      if (!security.secrets.provider) {
        errors.push({
          path: 'security.secrets.provider',
          message: 'Secrets provider is required'
        });
      } else if (!['aws-secrets-manager', 'docker-secrets', 'env', 'vault'].includes(security.secrets.provider)) {
        errors.push({
          path: 'security.secrets.provider',
          message: 'Secrets provider must be one of: aws-secrets-manager, docker-secrets, env, vault',
          value: security.secrets.provider
        });
      }
    }
  }
  
  /**
   * Validate logging configuration
   */
  private static validateLogging(logging: any, errors: ConfigValidationError[]): void {
    if (!logging) {
      errors.push({
        path: 'logging',
        message: 'Logging configuration is required'
      });
      return;
    }
    
    if (!logging.level) {
      errors.push({
        path: 'logging.level',
        message: 'Logging level is required'
      });
    } else if (!['debug', 'info', 'warn', 'error'].includes(logging.level)) {
      errors.push({
        path: 'logging.level',
        message: 'Logging level must be one of: debug, info, warn, error',
        value: logging.level
      });
    }
    
    if (!logging.format) {
      errors.push({
        path: 'logging.format',
        message: 'Logging format is required'
      });
    } else if (!['json', 'pretty'].includes(logging.format)) {
      errors.push({
        path: 'logging.format',
        message: 'Logging format must be either "json" or "pretty"',
        value: logging.format
      });
    }
    
    if (!Array.isArray(logging.destinations)) {
      errors.push({
        path: 'logging.destinations',
        message: 'Logging destinations must be an array'
      });
    }
  }
  
  /**
   * Validate health check configuration
   */
  private static validateHealthCheck(healthCheck: any, errors: ConfigValidationError[]): void {
    if (!healthCheck) {
      errors.push({
        path: 'healthCheck',
        message: 'Health check configuration is required'
      });
      return;
    }
    
    if (typeof healthCheck.enabled !== 'boolean') {
      errors.push({
        path: 'healthCheck.enabled',
        message: 'Health check enabled must be a boolean'
      });
    }
    
    const numericFields = ['interval', 'timeout', 'retries'];
    numericFields.forEach(field => {
      if (typeof healthCheck[field] !== 'number' || healthCheck[field] <= 0) {
        errors.push({
          path: `healthCheck.${field}`,
          message: `Health check ${field} must be a positive number`,
          value: healthCheck[field]
        });
      }
    });
    
    if (!Array.isArray(healthCheck.checks)) {
      errors.push({
        path: 'healthCheck.checks',
        message: 'Health check checks must be an array'
      });
    }
  }
  
  /**
   * Validate environment-specific requirements
   */
  private static validateEnvironmentSpecific(config: any, errors: ConfigValidationError[]): void {
    if (config.environment === 'aws') {
      // AWS-specific validations
      if (config.database?.provider === 'mongodb') {
        errors.push({
          path: 'database.provider',
          message: 'MongoDB is not supported in AWS environment, use DynamoDB instead'
        });
      }
      
      if (config.messageBroker?.provider === 'rabbitmq') {
        errors.push({
          path: 'messageBroker.provider',
          message: 'RabbitMQ is not supported in AWS environment, use EventBridge instead'
        });
      }
      
      if (config.authentication?.provider !== 'cognito') {
        errors.push({
          path: 'authentication.provider',
          message: 'AWS environment should use Cognito for authentication'
        });
      }
    } else if (config.environment === 'docker') {
      // Docker-specific validations
      if (config.database?.provider === 'dynamodb') {
        errors.push({
          path: 'database.provider',
          message: 'DynamoDB is not supported in Docker environment, use MongoDB instead'
        });
      }
      
      if (config.messageBroker?.provider === 'eventbridge') {
        errors.push({
          path: 'messageBroker.provider',
          message: 'EventBridge is not supported in Docker environment, use RabbitMQ instead'
        });
      }
      
      if (config.authentication?.provider === 'cognito') {
        errors.push({
          path: 'authentication.provider',
          message: 'Cognito is not supported in Docker environment, use JWT, OIDC, or Keycloak instead'
        });
      }
    }
  }
}