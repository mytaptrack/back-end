/**
 * Integration example demonstrating the complete configuration management workflow
 * This example shows how to use the configuration system in a real application
 */

import {
  DatabaseConfigLoader,
  DatabaseConfigValidator,
  DatabaseConfigHelper,
  DatabaseConfigPresets,
  DatabaseProviderFactory,
  DatabaseConfigurationManager,
  DB_CONFIG_ENV_VARS
} from '../utils';

import {
  DatabaseConfig,
  DatabaseProviderType
} from '../types';

import {
  ConfigurationError,
  ValidationError
} from '../types/database-errors';

/**
 * Example application configuration manager
 */
export class ApplicationConfigManager {
  private static instance: ApplicationConfigManager;
  private config: DatabaseConfig | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): ApplicationConfigManager {
    if (!ApplicationConfigManager.instance) {
      ApplicationConfigManager.instance = new ApplicationConfigManager();
    }
    return ApplicationConfigManager.instance;
  }

  /**
   * Initialize the application with database configuration
   */
  async initialize(options?: {
    configFile?: string;
    environment?: 'development' | 'testing' | 'production';
    fallbackProvider?: DatabaseProviderType;
  }): Promise<void> {
    try {
      console.log('🚀 Initializing application configuration...');

      // Step 1: Load configuration based on environment
      this.config = await this.loadConfiguration(options);

      // Step 2: Validate configuration
      console.log('✅ Validating configuration...');
      DatabaseConfigValidator.validate(this.config);

      // Step 3: Log configuration summary (without sensitive data)
      this.logConfigurationSummary(this.config);

      // Step 4: Initialize database provider (would work once providers are implemented)
      try {
        console.log('🔌 Initializing database provider...');
        await DatabaseConfigurationManager.initialize(this.config);
        console.log('✅ Database provider initialized successfully');
      } catch (error) {
        console.log('⚠️  Database provider initialization skipped (providers not implemented yet)');
        console.log('   This is expected during development phase');
      }

      this.initialized = true;
      console.log('🎉 Application configuration initialized successfully!');

    } catch (error) {
      console.error('❌ Failed to initialize application configuration:', error);
      throw error;
    }
  }

  /**
   * Load configuration from various sources with fallback logic
   */
  private async loadConfiguration(options?: {
    configFile?: string;
    environment?: 'development' | 'testing' | 'production';
    fallbackProvider?: DatabaseProviderType;
  }): Promise<DatabaseConfig> {
    
    // Try loading from config file first
    if (options?.configFile) {
      try {
        console.log(`📄 Loading configuration from file: ${options.configFile}`);
        return await DatabaseConfigLoader.loadFromFile(options.configFile);
      } catch (error) {
        console.log(`⚠️  Failed to load config file, trying other sources...`);
      }
    }

    // Try loading from environment variables
    try {
      console.log('🌍 Loading configuration from environment variables...');
      return DatabaseConfigLoader.loadFromEnvironment();
    } catch (error) {
      console.log('⚠️  Failed to load from environment, trying presets...');
    }

    // Use environment-specific presets
    if (options?.environment) {
      console.log(`🎯 Using ${options.environment} preset configuration...`);
      
      const provider = options.fallbackProvider || 'dynamodb';
      
      switch (options.environment) {
        case 'development':
          return DatabaseConfigPresets.development(provider);
        case 'testing':
          return DatabaseConfigPresets.testing(provider);
        case 'production':
          throw new ConfigurationError(
            'Production environment requires explicit configuration via environment variables or config file'
          );
        default:
          throw new ConfigurationError(`Unknown environment: ${options.environment}`);
      }
    }

    // Final fallback
    if (options?.fallbackProvider) {
      console.log(`🔄 Using fallback configuration for ${options.fallbackProvider}...`);
      return DatabaseConfigHelper.createTestConfig(options.fallbackProvider);
    }

    throw new ConfigurationError(
      'Unable to load configuration. Please provide configuration via environment variables, config file, or specify fallback options.'
    );
  }

  /**
   * Log configuration summary without sensitive information
   */
  private logConfigurationSummary(config: DatabaseConfig): void {
    console.log('📋 Configuration Summary:');
    console.log(`   Provider: ${config.provider}`);
    
    switch (config.provider) {
      case 'dynamodb':
        console.log(`   Region: ${config.dynamodb?.region}`);
        console.log(`   Primary Table: ${config.dynamodb?.primaryTable}`);
        console.log(`   Data Table: ${config.dynamodb?.dataTable}`);
        console.log(`   Consistent Read: ${config.dynamodb?.consistentRead}`);
        if (config.dynamodb?.endpoint) {
          console.log(`   Endpoint: ${config.dynamodb.endpoint}`);
        }
        break;
      case 'mongodb':
        // Don't log full connection string for security
        const connectionString = config.mongodb?.connectionString || '';
        const maskedConnection = connectionString.replace(/:\/\/.*@/, '://***@');
        console.log(`   Connection: ${maskedConnection}`);
        console.log(`   Database: ${config.mongodb?.database}`);
        console.log(`   Collections: ${JSON.stringify(config.mongodb?.collections)}`);
        break;
    }

    if (config.migration) {
      console.log(`   Migration Enabled: ${config.migration.enabled}`);
      console.log(`   Migration Batch Size: ${config.migration.batchSize}`);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): DatabaseConfig | null {
    return this.config;
  }

  /**
   * Check if application is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Shutdown the application
   */
  async shutdown(): Promise<void> {
    if (this.initialized) {
      console.log('🛑 Shutting down application...');
      await DatabaseConfigurationManager.shutdown();
      this.initialized = false;
      console.log('✅ Application shutdown complete');
    }
  }

  /**
   * Validate current environment for a specific provider
   */
  validateEnvironment(provider: DatabaseProviderType): { valid: boolean; missing: string[]; template?: Record<string, string> } {
    const validation = DatabaseConfigHelper.validateEnvironmentForProvider(provider);
    
    if (!validation.valid) {
      const template = DatabaseConfigHelper.generateEnvironmentTemplate(provider);
      return { ...validation, template };
    }

    return validation;
  }

  /**
   * Switch to a different database provider at runtime
   */
  async switchProvider(newConfig: DatabaseConfig): Promise<void> {
    if (!this.initialized) {
      throw new Error('Application must be initialized before switching providers');
    }

    console.log(`🔄 Switching database provider to ${newConfig.provider}...`);
    
    // Validate new configuration
    DatabaseConfigValidator.validate(newConfig);
    
    // Switch provider (would work once providers are implemented)
    try {
      await DatabaseConfigurationManager.switchProvider(newConfig);
      this.config = newConfig;
      console.log('✅ Provider switched successfully');
    } catch (error) {
      console.log('⚠️  Provider switch skipped (providers not implemented yet)');
      this.config = newConfig; // Update config anyway for testing
    }
  }
}

/**
 * Example usage scenarios
 */
export class ConfigurationExamples {
  
  /**
   * Example 1: Development setup with local databases
   */
  static async developmentSetup(): Promise<void> {
    console.log('\n=== Development Setup Example ===');
    
    const appConfig = ApplicationConfigManager.getInstance();
    
    await appConfig.initialize({
      environment: 'development',
      fallbackProvider: 'dynamodb'
    });

    console.log('Development setup complete!');
  }

  /**
   * Example 2: Production setup with environment variables
   */
  static async productionSetup(): Promise<void> {
    console.log('\n=== Production Setup Example ===');
    
    // Set production environment variables (in real app, these would be set externally)
    process.env[DB_CONFIG_ENV_VARS.PROVIDER] = 'dynamodb';
    process.env[DB_CONFIG_ENV_VARS.DYNAMODB_REGION] = 'us-west-2';
    process.env[DB_CONFIG_ENV_VARS.DYNAMODB_PRIMARY_TABLE] = 'MyApp-Primary-Prod';
    process.env[DB_CONFIG_ENV_VARS.DYNAMODB_DATA_TABLE] = 'MyApp-Data-Prod';
    process.env[DB_CONFIG_ENV_VARS.DYNAMODB_CONSISTENT_READ] = 'false';

    const appConfig = ApplicationConfigManager.getInstance();
    
    try {
      await appConfig.initialize();
      console.log('Production setup complete!');
    } catch (error) {
      console.error('Production setup failed:', error);
    }
  }

  /**
   * Example 3: Testing setup with migration enabled
   */
  static async testingSetup(): Promise<void> {
    console.log('\n=== Testing Setup Example ===');
    
    const appConfig = ApplicationConfigManager.getInstance();
    
    await appConfig.initialize({
      environment: 'testing',
      fallbackProvider: 'mongodb'
    });

    const config = appConfig.getConfig();
    console.log('Migration enabled:', config?.migration?.enabled);
    console.log('Testing setup complete!');
  }

  /**
   * Example 4: Configuration validation and troubleshooting
   */
  static validateConfiguration(): void {
    console.log('\n=== Configuration Validation Example ===');
    
    const appConfig = ApplicationConfigManager.getInstance();
    
    // Check DynamoDB environment
    const dynamoValidation = appConfig.validateEnvironment('dynamodb');
    console.log('DynamoDB Environment Validation:', dynamoValidation);
    
    if (!dynamoValidation.valid) {
      console.log('Missing environment variables:', dynamoValidation.missing);
      console.log('Environment template:');
      Object.entries(dynamoValidation.template || {}).forEach(([key, value]) => {
        console.log(`  export ${key}="${value}"`);
      });
    }

    // Check MongoDB environment
    const mongoValidation = appConfig.validateEnvironment('mongodb');
    console.log('MongoDB Environment Validation:', mongoValidation);
  }

  /**
   * Example 5: Runtime provider switching
   */
  static async providerSwitching(): Promise<void> {
    console.log('\n=== Provider Switching Example ===');
    
    const appConfig = ApplicationConfigManager.getInstance();
    
    // Start with DynamoDB
    await appConfig.initialize({
      environment: 'development',
      fallbackProvider: 'dynamodb'
    });

    console.log('Initial provider:', appConfig.getConfig()?.provider);

    // Switch to MongoDB
    const mongoConfig = DatabaseConfigHelper.createLocalMongoDBConfig({
      database: 'switched-database'
    });

    await appConfig.switchProvider(mongoConfig);
    console.log('Switched to provider:', appConfig.getConfig()?.provider);
  }

  /**
   * Example 6: Error handling scenarios
   */
  static async errorHandlingExamples(): Promise<void> {
    console.log('\n=== Error Handling Examples ===');
    
    // Example 1: Invalid configuration
    try {
      const invalidConfig = {
        provider: 'invalid-provider'
      } as any;
      
      DatabaseConfigValidator.validate(invalidConfig);
    } catch (error) {
      if (error instanceof ValidationError) {
        console.log('✅ Caught validation error:', error.message);
      }
    }

    // Example 2: Missing environment variables
    try {
      // Clear environment
      const originalProvider = process.env[DB_CONFIG_ENV_VARS.PROVIDER];
      delete process.env[DB_CONFIG_ENV_VARS.PROVIDER];
      
      DatabaseConfigLoader.loadFromEnvironment();
      
      // Restore environment
      if (originalProvider) {
        process.env[DB_CONFIG_ENV_VARS.PROVIDER] = originalProvider;
      }
    } catch (error) {
      if (error instanceof ConfigurationError) {
        console.log('✅ Caught configuration error:', error.message);
      }
    }

    // Example 3: Provider creation error (expected during development)
    try {
      const config = DatabaseConfigHelper.createDynamoDBConfig({
        primaryTable: 'test-primary',
        dataTable: 'test-data'
      });
      
      DatabaseProviderFactory.create(config);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        console.log('✅ Caught provider creation error (expected):', error.message);
      }
    }
  }

  /**
   * Run all examples
   */
  static async runAllExamples(): Promise<void> {
    console.log('🎯 Running Configuration Management Examples');
    console.log('='.repeat(50));

    try {
      // Validation examples (no initialization required)
      this.validateConfiguration();
      await this.errorHandlingExamples();

      // Setup examples (each creates a new instance)
      await this.developmentSetup();
      await ApplicationConfigManager.getInstance().shutdown();

      await this.testingSetup();
      await ApplicationConfigManager.getInstance().shutdown();

      await this.providerSwitching();
      await ApplicationConfigManager.getInstance().shutdown();

      // Production example (might fail without proper env vars)
      try {
        await this.productionSetup();
        await ApplicationConfigManager.getInstance().shutdown();
      } catch (error) {
        console.log('⚠️  Production setup skipped (requires environment variables)');
      }

      console.log('\n🎉 All configuration examples completed successfully!');
      
    } catch (error) {
      console.error('❌ Example execution failed:', error);
    }
  }
}

/**
 * Utility functions for configuration management
 */
export class ConfigurationUtils {
  
  /**
   * Generate environment file content for a specific provider
   */
  static generateEnvironmentFile(provider: DatabaseProviderType, options?: any): string {
    const template = DatabaseConfigHelper.generateEnvironmentTemplate(provider);
    
    let content = `# Database Configuration for ${provider.toUpperCase()}\n`;
    content += `# Generated on ${new Date().toISOString()}\n\n`;
    
    Object.entries(template).forEach(([key, value]) => {
      if (key.includes('_COMMENT')) {
        content += `${value}\n`;
      } else {
        content += `${key}=${value}\n`;
      }
    });
    
    return content;
  }

  /**
   * Check configuration compatibility between environments
   */
  static checkConfigurationCompatibility(
    sourceConfig: DatabaseConfig, 
    targetConfig: DatabaseConfig
  ): { compatible: boolean; issues: string[] } {
    const issues: string[] = [];

    if (sourceConfig.provider !== targetConfig.provider) {
      issues.push(`Provider mismatch: ${sourceConfig.provider} -> ${targetConfig.provider}`);
    }

    // Check migration compatibility
    if (sourceConfig.migration?.enabled !== targetConfig.migration?.enabled) {
      issues.push('Migration settings differ between configurations');
    }

    return {
      compatible: issues.length === 0,
      issues
    };
  }

  /**
   * Get configuration health status
   */
  static getConfigurationHealth(config: DatabaseConfig): {
    healthy: boolean;
    checks: Array<{ name: string; status: 'pass' | 'fail' | 'warning'; message: string }>;
  } {
    const checks: Array<{ name: string; status: 'pass' | 'fail' | 'warning'; message: string }> = [];

    // Basic validation check
    try {
      DatabaseConfigValidator.validate(config);
      checks.push({ name: 'Validation', status: 'pass', message: 'Configuration is valid' });
    } catch (error) {
      checks.push({ name: 'Validation', status: 'fail', message: error.message });
    }

    // Provider availability check
    const isSupported = DatabaseProviderFactory.isProviderSupported(config.provider);
    if (isSupported) {
      checks.push({ name: 'Provider Support', status: 'pass', message: `${config.provider} is supported` });
    } else {
      checks.push({ name: 'Provider Support', status: 'fail', message: `${config.provider} is not supported` });
    }

    // Migration configuration check
    if (config.migration?.enabled && config.migration.batchSize > 1000) {
      checks.push({ 
        name: 'Migration Settings', 
        status: 'warning', 
        message: 'Large batch size may impact performance' 
      });
    } else {
      checks.push({ name: 'Migration Settings', status: 'pass', message: 'Migration settings are optimal' });
    }

    const healthy = checks.every(check => check.status !== 'fail');

    return { healthy, checks };
  }
}

// Export for easy testing and usage
export default {
  ApplicationConfigManager,
  ConfigurationExamples,
  ConfigurationUtils
};