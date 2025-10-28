/**
 * Configuration Management Usage Examples
 * Demonstrates how to use the unified configuration system
 */

import { 
  ConfigFactory, 
  ConfigLoader, 
  SecretManager,
  UnifiedConfig,
  createDefaultConfig,
  validateEnvironmentConfig,
  isAWSEnvironment,
  isDockerEnvironment
} from '../config';

/**
 * Example: Basic configuration loading
 */
export async function basicConfigurationExample(): Promise<void> {
  try {
    // Get configuration factory instance
    const configFactory = ConfigFactory.getInstance();
    
    // Load configuration with automatic environment detection
    const config = await configFactory.getConfig();
    
    console.log('Loaded configuration:', {
      environment: config.environment,
      stage: config.stage,
      database: config.database.provider,
      messageBroker: config.messageBroker.provider,
      authentication: config.authentication.provider
    });
    
    // Validate configuration
    const validation = validateEnvironmentConfig(config);
    if (!validation.valid) {
      console.error('Configuration validation failed:', validation.errors);
      return;
    }
    
    console.log('Configuration is valid');
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
}

/**
 * Example: Environment-specific configuration loading
 */
export async function environmentSpecificConfigExample(): Promise<void> {
  try {
    const configLoader = new ConfigLoader({
      configDir: process.cwd(),
      validateConfig: true
    });
    
    // Load development configuration
    const devConfig = await configLoader.loadConfig({
      environment: 'docker',
      stage: 'development'
    });
    
    console.log('Development config loaded:', devConfig.environment);
    
    // Load production configuration
    const prodConfig = await configLoader.loadConfig({
      environment: 'aws',
      stage: 'production'
    });
    
    console.log('Production config loaded:', prodConfig.environment);
  } catch (error) {
    console.error('Failed to load environment-specific configuration:', error);
  }
}

/**
 * Example: Secret management
 */
export async function secretManagementExample(): Promise<void> {
  try {
    // Create secret manager (auto-detects provider)
    const secretManager = new SecretManager();
    
    // Set a secret (if supported by provider)
    try {
      await secretManager.setSecret('database-password', 'super-secret-password');
      console.log('Secret set successfully');
    } catch (error) {
      console.log('Setting secrets not supported by current provider');
    }
    
    // Get a secret
    try {
      const dbPassword = await secretManager.getSecret('database-password');
      console.log('Retrieved database password:', dbPassword ? '[REDACTED]' : 'Not found');
    } catch (error) {
      console.log('Secret not found or provider not available');
    }
    
    // List available secrets
    try {
      const secrets = await secretManager.listSecrets();
      console.log('Available secrets:', secrets.length);
    } catch (error) {
      console.log('Listing secrets not supported by current provider');
    }
  } catch (error) {
    console.error('Secret management error:', error);
  }
}

/**
 * Example: Creating default configurations
 */
export async function defaultConfigurationExample(): Promise<void> {
  // Create AWS configuration
  const awsConfig = createDefaultConfig('aws', 'production', 'us-west-2');
  console.log('AWS config created:', {
    environment: awsConfig.environment,
    database: awsConfig.database?.provider,
    messageBroker: awsConfig.messageBroker?.provider
  });
  
  // Create Docker configuration
  const dockerConfig = createDefaultConfig('docker', 'development');
  console.log('Docker config created:', {
    environment: dockerConfig.environment,
    database: dockerConfig.database?.provider,
    messageBroker: dockerConfig.messageBroker?.provider
  });
}

/**
 * Example: Configuration with custom options
 */
export async function customConfigurationExample(): Promise<void> {
  try {
    const configLoader = new ConfigLoader({
      configDir: './custom-config',
      secretManager: new SecretManager('env', { prefix: 'CUSTOM_SECRET_' })
    });
    
    const config = await configLoader.loadConfig({
      environment: 'docker',
      stage: 'custom',
      validateConfig: true
    });
    
    console.log('Custom configuration loaded successfully');
  } catch (error) {
    console.error('Failed to load custom configuration:', error);
  }
}

/**
 * Example: Environment detection and conditional logic
 */
export async function environmentDetectionExample(): Promise<void> {
  try {
    const config = await ConfigFactory.getInstance().getConfig();
    
    if (isAWSEnvironment(config)) {
      console.log('Running in AWS environment');
      console.log('DynamoDB tables:', config.database.dynamodb?.tables);
      console.log('EventBridge bus:', config.messageBroker.eventbridge?.eventBusName);
    } else if (isDockerEnvironment(config)) {
      console.log('Running in Docker environment');
      console.log('MongoDB database:', config.database.mongodb?.database);
      console.log('RabbitMQ vhost:', config.messageBroker.rabbitmq?.vhost);
    }
    
    // Configure services based on environment
    if (config.development?.hotReload) {
      console.log('Hot reload enabled for development');
    }
    
    if (config.monitoring?.tracing?.enabled) {
      console.log('Tracing enabled with provider:', config.monitoring.tracing.provider);
    }
  } catch (error) {
    console.error('Environment detection error:', error);
  }
}

/**
 * Example: Configuration validation and error handling
 */
export async function configurationValidationExample(): Promise<void> {
  try {
    // Create an invalid configuration for testing
    const invalidConfig = {
      environment: 'invalid',
      stage: '',
      database: {
        provider: 'unknown'
      }
    } as any;
    
    const validation = validateEnvironmentConfig(invalidConfig);
    
    if (!validation.valid) {
      console.log('Validation errors found:');
      validation.errors.forEach(error => {
        console.log(`- ${error.path}: ${error.message}`);
        if (error.value !== undefined) {
          console.log(`  Current value: ${error.value}`);
        }
      });
    }
  } catch (error) {
    console.error('Validation example error:', error);
  }
}

/**
 * Example: Runtime configuration reloading
 */
export async function configurationReloadExample(): Promise<void> {
  try {
    const configFactory = ConfigFactory.getInstance();
    
    // Load initial configuration
    const initialConfig = await configFactory.getConfig();
    console.log('Initial config stage:', initialConfig.stage);
    
    // Simulate configuration change (e.g., environment variable update)
    process.env.STAGE = 'updated-stage';
    
    // Reload configuration
    const reloadedConfig = await configFactory.reloadConfig();
    console.log('Reloaded config stage:', reloadedConfig.stage);
  } catch (error) {
    console.error('Configuration reload error:', error);
  }
}

/**
 * Run all configuration examples
 */
export async function runAllConfigExamples(): Promise<void> {
  console.log('=== Configuration Management Examples ===\n');
  
  console.log('1. Basic Configuration Loading:');
  await basicConfigurationExample();
  console.log('');
  
  console.log('2. Environment-Specific Configuration:');
  await environmentSpecificConfigExample();
  console.log('');
  
  console.log('3. Secret Management:');
  await secretManagementExample();
  console.log('');
  
  console.log('4. Default Configuration Creation:');
  await defaultConfigurationExample();
  console.log('');
  
  console.log('5. Custom Configuration:');
  await customConfigurationExample();
  console.log('');
  
  console.log('6. Environment Detection:');
  await environmentDetectionExample();
  console.log('');
  
  console.log('7. Configuration Validation:');
  await configurationValidationExample();
  console.log('');
  
  console.log('8. Configuration Reloading:');
  await configurationReloadExample();
  console.log('');
}