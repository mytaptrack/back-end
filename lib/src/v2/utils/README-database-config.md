# Database Configuration Management System

This document explains how to use the database configuration management system for the MyTapTrack data access abstraction layer.

## Overview

The configuration management system provides:

1. **Configuration Loading**: Load database configuration from environment variables, config files, or programmatically
2. **Configuration Validation**: Validate configuration structure and values with clear error messages
3. **Provider Factory**: Create database provider instances based on configuration
4. **Configuration Helpers**: Convenient utilities for common configuration scenarios

## Quick Start

### Environment Variables

Set the following environment variables to configure your database provider:

#### DynamoDB Configuration
```bash
export DB_PROVIDER=dynamodb
export DYNAMODB_REGION=us-east-1
export DYNAMODB_PRIMARY_TABLE=MyApp-Primary
export DYNAMODB_DATA_TABLE=MyApp-Data
export DYNAMODB_CONSISTENT_READ=false
# Optional: for local DynamoDB
export DYNAMODB_ENDPOINT=http://localhost:8000
```

#### MongoDB Configuration
```bash
export DB_PROVIDER=mongodb
export MONGODB_CONNECTION_STRING=mongodb://localhost:27017
export MONGODB_DATABASE=myapp
export MONGODB_PRIMARY_COLLECTION=primary_data
export MONGODB_DATA_COLLECTION=application_data
export MONGODB_MAX_POOL_SIZE=10
```

#### Migration Configuration (Optional)
```bash
export MIGRATION_ENABLED=false
export MIGRATION_BATCH_SIZE=100
export MIGRATION_VALIDATE_AFTER=true
```

### Programmatic Configuration

#### Creating DynamoDB Configuration
```typescript
import { DatabaseConfigHelper } from '@mytaptrack/lib';

const config = DatabaseConfigHelper.createDynamoDBConfig({
  region: 'us-east-1',
  primaryTable: 'MyApp-Primary',
  dataTable: 'MyApp-Data',
  consistentRead: false
});
```

#### Creating MongoDB Configuration
```typescript
import { DatabaseConfigHelper } from '@mytaptrack/lib';

const config = DatabaseConfigHelper.createMongoDBConfig({
  connectionString: 'mongodb://localhost:27017',
  database: 'myapp',
  primaryCollection: 'users',
  dataCollection: 'app_data',
  maxPoolSize: 15
});
```

### Using Configuration Presets

#### Development Environment
```typescript
import { DatabaseConfigPresets } from '@mytaptrack/lib';

// Local DynamoDB for development
const devConfig = DatabaseConfigPresets.development('dynamodb');

// Local MongoDB for development
const devConfig = DatabaseConfigPresets.development('mongodb');
```

#### Testing Environment
```typescript
const testConfig = DatabaseConfigPresets.testing('dynamodb');
// Automatically enables migration for testing
```

#### Production Environment
```typescript
const prodConfig = DatabaseConfigPresets.production('dynamodb', {
  region: 'us-west-2',
  primaryTable: 'Prod-Primary',
  dataTable: 'Prod-Data'
});
```

## Configuration Loading

### From Environment Variables
```typescript
import { DatabaseConfigLoader } from '@mytaptrack/lib';

try {
  const config = DatabaseConfigLoader.loadFromEnvironment();
  console.log('Loaded config:', config);
} catch (error) {
  console.error('Configuration error:', error.message);
}
```

### From Configuration File
```typescript
import { DatabaseConfigLoader } from '@mytaptrack/lib';

try {
  const config = await DatabaseConfigLoader.loadFromFile('./config/database.json');
  console.log('Loaded config from file:', config);
} catch (error) {
  console.error('Failed to load config file:', error.message);
}
```

### With Fallback Options
```typescript
import { DatabaseConfigHelper } from '@mytaptrack/lib';

const config = await DatabaseConfigHelper.loadConfigWithFallback({
  configFile: './config/database.json',
  fallbackProvider: 'dynamodb',
  fallbackConfig: {
    provider: 'dynamodb',
    dynamodb: {
      region: 'us-east-1',
      primaryTable: 'Fallback-Primary',
      dataTable: 'Fallback-Data'
    }
  }
});
```

## Configuration Validation

### Validate Configuration
```typescript
import { DatabaseConfigValidator } from '@mytaptrack/lib';

try {
  DatabaseConfigValidator.validate(config);
  console.log('Configuration is valid');
} catch (error) {
  console.error('Validation error:', error.message);
}
```

### Validate Environment Variables
```typescript
import { DatabaseConfigHelper } from '@mytaptrack/lib';

const validation = DatabaseConfigHelper.validateEnvironmentForProvider('dynamodb');

if (!validation.valid) {
  console.log('Missing environment variables:', validation.missing);
  
  // Generate template
  const template = DatabaseConfigHelper.generateEnvironmentTemplate('dynamodb');
  console.log('Environment template:', template);
}
```

## Provider Factory

### Create Database Provider
```typescript
import { DatabaseProviderFactory } from '@mytaptrack/lib';

try {
  const provider = DatabaseProviderFactory.create(config);
  console.log('Created provider:', provider.getProviderType());
} catch (error) {
  console.error('Provider creation failed:', error.message);
}
```

### Check Supported Providers
```typescript
import { DatabaseProviderFactory } from '@mytaptrack/lib';

const supportedProviders = DatabaseProviderFactory.getSupportedProviders();
console.log('Supported providers:', supportedProviders);

const isSupported = DatabaseProviderFactory.isProviderSupported('dynamodb');
console.log('Is DynamoDB supported:', isSupported);
```

## Configuration Manager

### Initialize and Manage Configuration
```typescript
import { DatabaseConfigurationManager } from '@mytaptrack/lib';

// Initialize
const provider = await DatabaseConfigurationManager.initialize(config);

// Get current configuration
const currentConfig = DatabaseConfigurationManager.getCurrentConfig();

// Switch provider
const newProvider = await DatabaseConfigurationManager.switchProvider(newConfig);

// Shutdown
await DatabaseConfigurationManager.shutdown();
```

## Error Handling

The configuration system provides clear error messages for common issues:

### Configuration Errors
- Missing required environment variables
- Invalid provider types
- Invalid configuration structure
- Missing configuration files

### Validation Errors
- Invalid table/collection names
- Invalid connection strings
- Invalid numeric values
- Missing required fields

### Example Error Handling
```typescript
import { ConfigurationError, ValidationError } from '@mytaptrack/lib';

try {
  const config = DatabaseConfigLoader.loadFromEnvironment();
  DatabaseConfigValidator.validate(config);
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error('Configuration error:', error.message);
  } else if (error instanceof ValidationError) {
    console.error('Validation error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Environment Variable Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DB_PROVIDER` | Database provider (`dynamodb` or `mongodb`) | Yes | - |
| `DYNAMODB_REGION` | AWS region for DynamoDB | DynamoDB | `us-east-1` |
| `DYNAMODB_PRIMARY_TABLE` | Primary table name | DynamoDB | - |
| `DYNAMODB_DATA_TABLE` | Data table name | DynamoDB | - |
| `DYNAMODB_CONSISTENT_READ` | Use consistent reads | No | `false` |
| `DYNAMODB_ENDPOINT` | Custom endpoint (for local) | No | - |
| `MONGODB_CONNECTION_STRING` | MongoDB connection string | MongoDB | - |
| `MONGODB_DATABASE` | Database name | MongoDB | - |
| `MONGODB_PRIMARY_COLLECTION` | Primary collection name | No | `primary_data` |
| `MONGODB_DATA_COLLECTION` | Data collection name | No | `application_data` |
| `MONGODB_MAX_POOL_SIZE` | Connection pool size | No | `10` |
| `MONGODB_MIN_POOL_SIZE` | Minimum pool size | No | `2` |
| `MIGRATION_ENABLED` | Enable migration features | No | `false` |
| `MIGRATION_BATCH_SIZE` | Migration batch size | No | `100` |
| `MIGRATION_VALIDATE_AFTER` | Validate after migration | No | `true` |

## Best Practices

1. **Use Environment Variables**: For production deployments, use environment variables for configuration
2. **Use Presets**: For development and testing, use configuration presets for consistency
3. **Validate Early**: Always validate configuration before using it
4. **Handle Errors**: Implement proper error handling for configuration issues
5. **Use Fallbacks**: Provide fallback configurations for development environments
6. **Document Configuration**: Document required environment variables for your team

## Next Steps

After configuring the database provider, you can:

1. **Implement Provider Classes**: Create DynamoDB and MongoDB provider implementations (Tasks 3 and 4)
2. **Use Data Access Layer**: Use the unified data access interface in your application
3. **Set Up Migration**: Configure data migration between providers if needed
4. **Monitor Performance**: Use the built-in metrics and monitoring features

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**: Use `validateEnvironmentForProvider()` to check required variables
2. **Invalid Configuration**: Use `DatabaseConfigValidator.validate()` to check configuration structure
3. **Provider Not Supported**: Check supported providers with `getSupportedProviders()`
4. **Connection Issues**: Verify connection strings and network connectivity

### Debug Configuration
```typescript
// Enable debug logging
process.env.DEBUG = 'database-config:*';

// Validate environment
const validation = DatabaseConfigHelper.validateEnvironmentForProvider('dynamodb');
console.log('Environment validation:', validation);

// Generate template
const template = DatabaseConfigHelper.generateEnvironmentTemplate('dynamodb');
console.log('Environment template:', template);
```