# Configuration Management System

This document describes the unified configuration management system for MyTapTrack that supports both AWS and Docker deployments.

## Overview

The configuration system provides:
- Unified configuration schema for both AWS and Docker environments
- Configuration validation with clear error messages
- Environment-specific configuration files
- Configuration loading utilities that merge environment variables with config files
- Secure secret management for database credentials, API keys, and encryption keys

## Quick Start

```typescript
import { ConfigFactory, createDefaultConfig, validateEnvironmentConfig } from '@mytaptrack/business-logic-core';

// Load configuration automatically
const configFactory = ConfigFactory.getInstance();
const config = await configFactory.getConfig();

// Validate configuration
const validation = validateEnvironmentConfig(config);
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
}
```

## Configuration Files

### Docker Environment
- `containers/config/development.yml` - Development settings
- `containers/config/test.yml` - Test settings  
- `containers/config/production.yml` - Production settings (⚠️ **IGNORED BY GIT**)

### AWS Environment
- `config/aws-dev.yml` - AWS development settings
- `config/aws-prod.yml` - AWS production settings (⚠️ **IGNORED BY GIT**)

### Example/Template Files
- `containers/config/production.yml.example` - Production template
- `config/aws-prod.yml.example` - AWS production template

## 🔒 Security Best Practices

### Configuration File Security
1. **Production files are automatically ignored by .gitignore**
2. **Copy example files to create production configs**: 
   ```bash
   cp config/aws-prod.yml.example config/aws-prod.yml
   cp containers/config/production.yml.example containers/config/production.yml
   ```
3. **Use environment variables for all sensitive values**:
   ```yaml
   database:
     mongodb:
       connectionString: ${MONGODB_CONNECTION_STRING}
   ```
4. **Never commit real credentials, API keys, or secrets**
5. **Use secret management systems in production**

## Environment Variables

The system supports environment variable substitution using `${VAR}` syntax:

```yaml
database:
  mongodb:
    connectionString: ${MONGODB_CONNECTION_STRING}
    database: mytaptrack_${STAGE:-dev}
```

## Secret Management

Supports multiple secret providers:
- `env` - Environment variables (development)
- `docker-secrets` - Docker secrets (production)
- `aws-secrets-manager` - AWS Secrets Manager (AWS)
- `vault` - HashiCorp Vault (enterprise)

```typescript
import { SecretManager } from '@mytaptrack/business-logic-core';

const secretManager = new SecretManager();
const dbPassword = await secretManager.getSecret('database-password');
```

## Configuration Schema

The unified configuration supports:
- Database (DynamoDB/MongoDB)
- Message Broker (EventBridge/RabbitMQ)
- Authentication (Cognito/JWT/OIDC/Keycloak)
- Cache (DynamoDB/Redis)
- Services (GraphQL/REST/Device APIs)
- Security settings
- Logging and monitoring
- Health checks

## Validation

The system provides comprehensive validation:

```typescript
import { ConfigValidator } from '@mytaptrack/business-logic-core';

const result = ConfigValidator.validate(config);
if (!result.valid) {
  result.errors.forEach(error => {
    console.log(`${error.path}: ${error.message}`);
  });
}
```

## Setup

Run the setup script to create configuration files safely:

```bash
./scripts/setup-config.sh
```

This will:
1. Copy example configuration files to working files
2. Set up .env file from template
3. Provide security reminders and next steps

## Examples

See `src/examples/config-usage.ts` for comprehensive usage examples.

## Security Notes

- Production configuration files are automatically ignored by .gitignore
- Use environment variables for all sensitive values
- Never commit real credentials to version control
- Use proper secret management systems in production environments