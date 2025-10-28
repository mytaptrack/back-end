/**
 * Configuration Loading System
 * Handles loading and merging configuration from multiple sources
 */

import * as fs from 'fs';
import * as path from 'path';
// Dynamic import for js-yaml to avoid dependency issues
import { 
  UnifiedConfig, 
  ConfigValidationResult,
  SecretReference,
  EnvReference,
  ConfigValue
} from './interfaces';
import { ConfigValidator } from './validation';
import { SecretManager } from './secrets';

/**
 * Configuration loading options
 */
export interface ConfigLoaderOptions {
  configDir?: string;
  environment?: string;
  stage?: string;
  validateConfig?: boolean;
  secretManager?: SecretManager;
}

/**
 * Configuration loader that merges multiple sources
 */
export class ConfigLoader {
  private secretManager: SecretManager;
  private configDir: string;
  
  constructor(options: ConfigLoaderOptions = {}) {
    this.configDir = options.configDir || process.cwd();
    this.secretManager = options.secretManager || new SecretManager();
  }
  
  /**
   * Load configuration from multiple sources
   */
  async loadConfig(options: ConfigLoaderOptions = {}): Promise<UnifiedConfig> {
    const environment = options.environment || process.env.NODE_ENV || 'development';
    const stage = options.stage || process.env.STAGE || 'dev';
    
    // Load base configuration
    let config = await this.loadBaseConfig(environment, stage);
    
    // Merge environment variables
    config = this.mergeEnvironmentVariables(config);
    
    // Resolve secrets and references
    config = await this.resolveConfigReferences(config);
    
    // Validate configuration if requested
    if (options.validateConfig !== false) {
      const validation = ConfigValidator.validate(config);
      if (!validation.valid) {
        throw new ConfigurationError('Configuration validation failed', validation.errors);
      }
    }
    
    return config as UnifiedConfig;
  } 
 
  /**
   * Load base configuration from files
   */
  private async loadBaseConfig(environment: string, stage: string): Promise<Record<string, any>> {
    const configFiles = [
      'config.yml',
      'config.yaml',
      `config.${environment}.yml`,
      `config.${environment}.yaml`,
      `config.${stage}.yml`,
      `config.${stage}.yaml`,
      `${environment}.yml`,
      `${environment}.yaml`,
      `${stage}.yml`,
      `${stage}.yaml`
    ];
    
    let config: Record<string, any> = {};
    
    // Try to load from multiple possible locations
    const searchPaths = [
      this.configDir,
      path.join(this.configDir, 'config'),
      path.join(this.configDir, 'containers', 'config'),
      path.join(this.configDir, '..', 'config'),
      path.join(this.configDir, '..', 'containers', 'config')
    ];
    
    // Dynamic import for js-yaml
    let yaml: any;
    try {
      yaml = await import('js-yaml');
    } catch (importError) {
      console.warn('js-yaml not available. Only JSON configuration files will be supported.');
    }
    
    for (const searchPath of searchPaths) {
      for (const configFile of configFiles) {
        const filePath = path.join(searchPath, configFile);
        
        if (fs.existsSync(filePath)) {
          try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            
            let fileConfig: any;
            if (filePath.endsWith('.json')) {
              fileConfig = JSON.parse(fileContent);
            } else if (yaml && (filePath.endsWith('.yml') || filePath.endsWith('.yaml'))) {
              fileConfig = yaml.load(fileContent) as any;
            } else {
              console.warn(`Unsupported configuration file format: ${filePath}`);
              continue;
            }
            
            // Deep merge configuration
            config = this.deepMerge(config, fileConfig);
            
            console.log(`Loaded configuration from: ${filePath}`);
          } catch (error) {
            console.warn(`Failed to load configuration from ${filePath}:`, error);
          }
        }
      }
    }
    
    // Set default environment and stage if not provided
    if (!config.environment) {
      config.environment = this.detectEnvironment();
    }
    
    if (!config.stage) {
      config.stage = stage;
    }
    
    return config;
  }
  
  /**
   * Merge environment variables into configuration
   */
  private mergeEnvironmentVariables(config: any): any {
    const envMappings = {
      // Database
      'DATABASE_PROVIDER': 'database.provider',
      'MONGODB_CONNECTION_STRING': 'database.mongodb.connectionString',
      'MONGODB_DATABASE': 'database.mongodb.database',
      'DYNAMODB_REGION': 'database.dynamodb.region',
      'DYNAMODB_PRIMARY_TABLE': 'database.dynamodb.tables.primary',
      'DYNAMODB_DATA_TABLE': 'database.dynamodb.tables.data',
      
      // Message Broker
      'MESSAGE_BROKER_PROVIDER': 'messageBroker.provider',
      'RABBITMQ_CONNECTION_STRING': 'messageBroker.rabbitmq.connectionString',
      'RABBITMQ_VHOST': 'messageBroker.rabbitmq.vhost',
      'EVENTBRIDGE_REGION': 'messageBroker.eventbridge.region',
      'EVENTBRIDGE_EVENT_BUS': 'messageBroker.eventbridge.eventBusName',
      
      // Authentication
      'AUTH_PROVIDER': 'authentication.provider',
      'JWT_PUBLIC_KEY_PATH': 'authentication.jwt.publicKeyPath',
      'JWT_ISSUER': 'authentication.jwt.issuer',
      'JWT_AUDIENCE': 'authentication.jwt.audience',
      'COGNITO_REGION': 'authentication.cognito.region',
      'COGNITO_USER_POOL_ID': 'authentication.cognito.userPoolId',
      'COGNITO_CLIENT_ID': 'authentication.cognito.clientId',
      
      // Cache
      'CACHE_PROVIDER': 'cache.provider',
      'REDIS_CONNECTION_STRING': 'cache.redis.connectionString',
      'REDIS_KEY_PREFIX': 'cache.redis.keyPrefix',
      
      // Services
      'GRAPHQL_PORT': 'services.graphqlApi.port',
      'REST_API_PORT': 'services.restApi.port',
      'DEVICE_API_PORT': 'services.deviceApi.port',
      
      // Logging
      'LOG_LEVEL': 'logging.level',
      'LOG_FORMAT': 'logging.format',
      
      // General
      'NODE_ENV': 'environment',
      'STAGE': 'stage',
      'AWS_REGION': 'region',
      'SERVICE_NAME': 'logging.fields.service',
      'APP_VERSION': 'logging.fields.version'
    };
    
    const result = { ...config };
    
    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        this.setNestedProperty(result, configPath, this.parseEnvValue(envValue));
      }
    }
    
    return result;
  }  
  
/**
   * Resolve configuration references (secrets and environment variables)
   */
  private async resolveConfigReferences(config: any): Promise<any> {
    const resolved = JSON.parse(JSON.stringify(config));
    
    await this.resolveObjectReferences(resolved);
    
    return resolved;
  }
  
  /**
   * Recursively resolve references in configuration object
   */
  private async resolveObjectReferences(obj: any): Promise<void> {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'object' && obj[i] !== null) {
          await this.resolveObjectReferences(obj[i]);
        } else if (typeof obj[i] === 'string') {
          obj[i] = await this.resolveStringReference(obj[i]);
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          await this.resolveObjectReferences(obj[key]);
        } else if (typeof obj[key] === 'string') {
          obj[key] = await this.resolveStringReference(obj[key]);
        }
      }
    }
  }
  
  /**
   * Resolve string references (${VAR} syntax)
   */
  private async resolveStringReference(value: string): Promise<string> {
    // Handle environment variable references: ${VAR} or ${VAR:-default}
    const envPattern = /\$\{([^}]+)\}/g;
    let resolved = value;
    let match;
    
    while ((match = envPattern.exec(value)) !== null) {
      const fullMatch = match[0];
      const varExpression = match[1];
      
      let resolvedValue: string;
      
      if (varExpression.includes(':-')) {
        // Handle default values: ${VAR:-default}
        const [varName, defaultValue] = varExpression.split(':-', 2);
        resolvedValue = process.env[varName] || defaultValue;
      } else if (varExpression.startsWith('secret:')) {
        // Handle secret references: ${secret:key}
        const secretKey = varExpression.substring(7);
        resolvedValue = await this.secretManager.getSecret(secretKey);
      } else {
        // Handle simple environment variables: ${VAR}
        resolvedValue = process.env[varExpression] || '';
      }
      
      resolved = resolved.replace(fullMatch, resolvedValue);
    }
    
    return resolved;
  }
  
  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
  
  /**
   * Set nested property using dot notation
   */
  private setNestedProperty(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }
  
  /**
   * Parse environment variable value to appropriate type
   */
  private parseEnvValue(value: string): any {
    // Handle boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Handle numeric values
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    
    // Handle JSON arrays and objects
    if ((value.startsWith('[') && value.endsWith(']')) || 
        (value.startsWith('{') && value.endsWith('}'))) {
      try {
        return JSON.parse(value);
      } catch {
        // If JSON parsing fails, return as string
      }
    }
    
    return value;
  }
  
  /**
   * Detect environment based on various indicators
   */
  private detectEnvironment(): string {
    // Check for AWS Lambda environment
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      return 'aws';
    }
    
    // Check for Docker environment
    if (process.env.DOCKER_CONTAINER || fs.existsSync('/.dockerenv')) {
      return 'docker';
    }
    
    // Default to docker for development
    return 'docker';
  }
}

/**
 * Configuration error class
 */
export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly errors?: any[]
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}