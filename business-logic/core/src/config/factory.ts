/**
 * Configuration Factory
 * Creates service configurations based on environment and deployment type
 */

import { UnifiedConfig } from './interfaces';
import { ConfigLoader, ConfigLoaderOptions } from './loader';
import { SecretManager } from './secrets';

/**
 * Configuration factory for creating service configurations
 */
export class ConfigFactory {
  private static instance: ConfigFactory;
  private configLoader: ConfigLoader;
  private cachedConfig: UnifiedConfig | null = null;
  
  private constructor() {
    this.configLoader = new ConfigLoader();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): ConfigFactory {
    if (!ConfigFactory.instance) {
      ConfigFactory.instance = new ConfigFactory();
    }
    return ConfigFactory.instance;
  }
  
  /**
   * Load and cache configuration
   */
  async getConfig(options: ConfigLoaderOptions = {}): Promise<UnifiedConfig> {
    if (!this.cachedConfig) {
      this.cachedConfig = await this.configLoader.loadConfig(options);
    }
    return this.cachedConfig;
  }
  
  /**
   * Reload configuration (clears cache)
   */
  async reloadConfig(options: ConfigLoaderOptions = {}): Promise<UnifiedConfig> {
    this.cachedConfig = null;
    return this.getConfig(options);
  }
  
  /**
   * Create AWS-specific configuration
   */
  static createAWSConfig(stage: string, region: string): Partial<UnifiedConfig> {
    return {
      environment: 'aws',
      stage,
      region,
      database: {
        provider: 'dynamodb',
        dynamodb: {
          region,
          tables: {
            primary: `mytaptrack-${stage}-primary`,
            data: `mytaptrack-${stage}-data`
          }
        }
      },
      messageBroker: {
        provider: 'eventbridge',
        eventbridge: {
          region,
          eventBusName: `mytaptrack-${stage}-events`,
          source: 'mytaptrack'
        }
      },
      authentication: {
        provider: 'cognito',
        cognito: {
          region,
          userPoolId: `${region}_XXXXXXXXX`,
          clientId: 'XXXXXXXXXXXXXXXXXXXXXXXXXX',
          issuer: `https://cognito-idp.${region}.amazonaws.com/${region}_XXXXXXXXX`
        }
      },
      cache: {
        provider: 'dynamodb',
        dynamodb: {
          region,
          tableName: `mytaptrack-${stage}-cache`,
          ttlAttribute: 'ttl'
        }
      },
      security: {
        encryption: {
          algorithm: 'aes-256-gcm',
          keyRotation: true
        },
        secrets: {
          provider: 'aws-secrets-manager',
          awsSecretsManager: {
            region
          }
        },
        network: {
          allowedOrigins: ['*'],
          rateLimiting: true,
          ddosProtection: true
        }
      }
    };
  }
  
  /**
   * Create Docker-specific configuration
   */
  static createDockerConfig(stage: string): Partial<UnifiedConfig> {
    return {
      environment: 'docker',
      stage,
      database: {
        provider: 'mongodb',
        mongodb: {
          connectionString: '${MONGODB_CONNECTION_STRING}',
          database: `mytaptrack_${stage}`,
          collections: {
            primary: 'primary_data',
            data: 'secondary_data'
          },
          options: {
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000,
            serverSelectionTimeoutMS: 5000
          }
        }
      },
      messageBroker: {
        provider: 'rabbitmq',
        rabbitmq: {
          connectionString: '${RABBITMQ_CONNECTION_STRING}',
          vhost: `mytaptrack_${stage}`,
          exchanges: {
            events: `mytaptrack.${stage}.events`,
            deadLetter: `mytaptrack.${stage}.dlx`
          },
          queues: {
            userEvents: `user.${stage}.events`,
            studentEvents: `student.${stage}.events`,
            licenseEvents: `license.${stage}.events`,
            reportEvents: `report.${stage}.events`,
            appEvents: `app.${stage}.events`,
            deviceEvents: `device.${stage}.events`
          }
        }
      },
      authentication: {
        provider: 'jwt',
        jwt: {
          publicKeyPath: '${JWT_PUBLIC_KEY_PATH}',
          issuer: '${JWT_ISSUER}',
          audience: '${JWT_AUDIENCE}',
          algorithms: ['RS256', 'ES256'],
          clockTolerance: 60,
          maxAge: '8h'
        }
      },
      cache: {
        provider: 'redis',
        redis: {
          connectionString: '${REDIS_CONNECTION_STRING}',
          keyPrefix: `mtt:${stage}:`,
          defaultTTL: 1800
        }
      },
      security: {
        encryption: {
          algorithm: 'aes-256-gcm',
          keyRotation: false
        },
        secrets: {
          provider: 'env'
        },
        network: {
          allowedOrigins: ['*'],
          rateLimiting: false,
          ddosProtection: false
        }
      }
    };
  }
}