/**
 * Configuration Utilities
 * Helper functions for configuration management
 */

import { UnifiedConfig, ConfigValidationResult } from './interfaces';
import { ConfigValidator } from './validation';
import { ConfigFactory } from './factory';

/**
 * Create default configuration based on environment
 */
export function createDefaultConfig(environment: 'aws' | 'docker', stage: string, region?: string): Partial<UnifiedConfig> {
  const baseConfig = {
    services: {
      graphqlApi: {
        port: 4000,
        cors: {
          origins: ['*'],
          credentials: true,
          methods: ['GET', 'POST', 'OPTIONS'],
          allowedHeaders: ['Authorization', 'Content-Type', 'Accept']
        },
        rateLimit: {
          windowMs: 60000,
          maxRequests: 1000
        },
        complexity: {
          maximumComplexity: 2000,
          maximumDepth: 15
        }
      },
      restApi: {
        port: 4501,
        cors: {
          origins: ['*'],
          credentials: true,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Authorization', 'Content-Type', 'Accept']
        },
        rateLimit: {
          windowMs: 60000,
          maxRequests: 2000
        }
      },
      deviceApi: {
        port: 4502,
        rateLimit: {
          windowMs: 60000,
          maxRequests: 5000
        },
        timeout: 60000
      },
      dataProcessor: {
        batchSize: 5,
        retryAttempts: 2,
        retryDelay: 3000,
        deadLetterThreshold: 3,
        processingTimeout: 30000
      }
    },
    logging: {
      level: 'info' as const,
      format: 'json' as const,
      timestamp: true,
      correlationId: true,
      includeStack: true,
      destinations: ['console' as const],
      fields: {
        service: 'mytaptrack',
        environment,
        version: '1.0.0'
      }
    },
    healthCheck: {
      enabled: true,
      interval: 15000,
      timeout: 3000,
      retries: 2,
      checks: ['database' as const, 'messageBroker' as const, 'cache' as const]
    },
    monitoring: {
      metrics: {
        enabled: true,
        port: 9090,
        path: '/metrics'
      },
      tracing: {
        enabled: true
      },
      profiling: {
        enabled: false
      }
    }
  };

  if (environment === 'aws') {
    return {
      ...baseConfig,
      ...ConfigFactory.createAWSConfig(stage, region || 'us-west-2')
    };
  } else {
    return {
      ...baseConfig,
      ...ConfigFactory.createDockerConfig(stage),
      development: {
        hotReload: true,
        mockData: false,
        debugMode: true,
        verboseLogging: true
      }
    };
  }
}

/**
 * Validate environment-specific configuration requirements
 */
export function validateEnvironmentConfig(config: UnifiedConfig): ConfigValidationResult {
  const result = ConfigValidator.validate(config);
  
  // Add environment-specific validation warnings
  if (result.valid) {
    const warnings: string[] = [];
    
    if (config.environment === 'aws') {
      // AWS-specific warnings
      if (config.logging?.level === 'debug') {
        warnings.push('Debug logging in AWS environment may impact performance and costs');
      }
      
      if (config.security?.network?.allowedOrigins?.includes('*')) {
        warnings.push('Wildcard CORS origins should be restricted in AWS production environment');
      }
    } else if (config.environment === 'docker') {
      // Docker-specific warnings
      if (!config.development?.hotReload && config.stage === 'development') {
        warnings.push('Hot reload is recommended for Docker development environment');
      }
      
      if (config.security?.secrets?.provider === 'env' && config.stage === 'production') {
        warnings.push('Environment variable secrets are not recommended for production');
      }
    }
    
    if (warnings.length > 0) {
      console.warn('Configuration warnings:', warnings);
    }
  }
  
  return result;
}

/**
 * Get configuration value with type safety
 */
export function getConfigValue<T>(config: UnifiedConfig, path: string, defaultValue?: T): T {
  const keys = path.split('.');
  let current: any = config;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return defaultValue as T;
    }
  }
  
  return current as T;
}

/**
 * Check if configuration is for AWS environment
 */
export function isAWSEnvironment(config: UnifiedConfig): boolean {
  return config.environment === 'aws';
}

/**
 * Check if configuration is for Docker environment
 */
export function isDockerEnvironment(config: UnifiedConfig): boolean {
  return config.environment === 'docker';
}

/**
 * Get database connection string based on configuration
 */
export function getDatabaseConnectionString(config: UnifiedConfig): string {
  if (config.database.provider === 'mongodb' && config.database.mongodb) {
    return config.database.mongodb.connectionString;
  } else if (config.database.provider === 'dynamodb' && config.database.dynamodb) {
    return `dynamodb://${config.database.dynamodb.region}`;
  }
  
  throw new Error('Invalid database configuration');
}

/**
 * Get message broker connection string based on configuration
 */
export function getMessageBrokerConnectionString(config: UnifiedConfig): string {
  if (config.messageBroker.provider === 'rabbitmq' && config.messageBroker.rabbitmq) {
    return config.messageBroker.rabbitmq.connectionString;
  } else if (config.messageBroker.provider === 'eventbridge' && config.messageBroker.eventbridge) {
    return `eventbridge://${config.messageBroker.eventbridge.region}/${config.messageBroker.eventbridge.eventBusName}`;
  }
  
  throw new Error('Invalid message broker configuration');
}

/**
 * Merge configuration objects with deep merge
 */
export function mergeConfigs(base: Partial<UnifiedConfig>, override: Partial<UnifiedConfig>): Partial<UnifiedConfig> {
  const result = { ...base };
  
  for (const key in override) {
    const overrideValue = override[key as keyof UnifiedConfig];
    const baseValue = result[key as keyof UnifiedConfig];
    
    if (overrideValue && typeof overrideValue === 'object' && !Array.isArray(overrideValue) &&
        baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)) {
      result[key as keyof UnifiedConfig] = mergeConfigs(baseValue as any, overrideValue as any) as any;
    } else {
      result[key as keyof UnifiedConfig] = overrideValue as any;
    }
  }
  
  return result;
}