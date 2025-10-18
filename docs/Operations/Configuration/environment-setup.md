# Environment Setup and Configuration Management

This guide provides step-by-step procedures for setting up and managing MyTapTrack environments across development, testing, and production deployments.

## Prerequisites

Before setting up any environment, ensure you have:

- AWS CLI configured with appropriate permissions
- Node.js 16+ installed
- AWS CDK v2 installed globally
- Access to the MyTapTrack repository
- Appropriate AWS account access for the target environment

## Environment Setup Process

### 1. Initial Environment Configuration

#### Interactive Setup (Recommended for new environments)

Use the interactive setup script to create a new environment configuration:

```bash
cd core/utils
npm install
npm run setup-env
```

The script will prompt for:
- Environment name (dev, test, prod)
- Primary AWS region
- Secondary region for disaster recovery (optional)
- Route53 domain configuration
- Push notification settings
- SMS/Twilio configuration
- Email system configuration
- Chatbot integration
- Debug settings

#### Manual Configuration

For advanced users or automated deployments, create configuration files manually:

```bash
# Copy from example template
cp config/example_prod.yml config/myenv.yml

# Edit configuration parameters
vim config/myenv.yml
```

### 2. Configuration File Structure

#### Base Configuration Format

```yaml
env:
  # Application settings
  app:
    secrets:
      tokenKey:
        name: /myenv/app/tokenKey
        arn: ""
    pushSnsArns:
      android: ""
      ios: ""
  
  # Domain and DNS configuration
  domain:
    name: "example.com"
    hostedzone:
      id: "Z1234567890"
    sub:
      api:
        subdomain: "api"
        name: "api.example.com"
        cert: "arn:aws:acm:..."
      device:
        appid: "mytaptrack"
        subdomain: "device"
        name: "device.example.com"
        cert: "arn:aws:acm:..."
        apikey: "your-api-key"
      website:
        subdomain: "www"
        name: "www.example.com"
  
  # Regional deployment settings
  region:
    primary: "us-west-2"
    regions: "us-west-2,us-east-1"
  
  # Stack references
  stacks:
    core: "mytaptrack-myenv"
  
  # System configuration
  debug: "false"
  student:
    remove:
      timeout: 7776000  # 90 days in seconds
  
  regional:
    replication: "true"
    templates:
      path: "templates/"
```

### 3. Environment-Specific Setup Procedures

#### Development Environment (dev)

Development environments are optimized for rapid iteration and testing:

```bash
# Set up development environment
make set-env STAGE=dev

# Deploy development stack
make install STAGE=dev
```

**Development-specific settings:**
- Debug mode enabled
- Reduced timeouts for faster testing
- Local domain configuration
- Minimal replication settings

#### Testing Environment (test)

Testing environments mirror production but with test data:

```bash
# Set up testing environment
make set-env STAGE=test

# Deploy testing stack
make install STAGE=test
```

**Testing-specific settings:**
- Debug mode enabled for troubleshooting
- Full AWS service integration
- Automated test user accounts
- Monitoring and alerting enabled

#### Production Environment (prod)

Production environments require additional security and redundancy:

```bash
# Set up production environment
make set-env STAGE=prod

# Deploy production stack (requires approval)
make install STAGE=prod
```

**Production-specific settings:**
- Debug mode disabled
- Multi-region replication enabled
- Enhanced security configurations
- Full monitoring and alerting
- Backup and disaster recovery

### 4. Configuration Inheritance Patterns

#### Inheritance Hierarchy

The configuration system follows this inheritance pattern:

1. **Base Configuration** (`config/config.yml`) - Global defaults
2. **Environment Configuration** (`config/{environment}.yml`) - Environment overrides
3. **Regional Configuration** (`config/{environment}.{region}.yml`) - Region-specific overrides

#### Example Inheritance

```yaml
# config/config.yml (base)
env:
  debug: "false"
  region:
    primary: "us-west-2"
  student:
    remove:
      timeout: 7776000

# config/dev.yml (environment override)
env:
  debug: "true"  # Override: enable debug for dev
  student:
    remove:
      timeout: 90  # Override: shorter timeout for dev

# config/dev.us-east-1.yml (regional override)
env:
  regional:
    logging:
      bucket: "mtt-dev-us-east-1-logs"  # Region-specific bucket
```

#### Configuration Merging

Configurations are merged using deep merge strategy:

```typescript
// Resulting configuration for dev environment in us-east-1
{
  env: {
    debug: "true",           // From dev.yml
    region: {
      primary: "us-west-2"   // From config.yml
    },
    student: {
      remove: {
        timeout: 90          // From dev.yml
      }
    },
    regional: {
      logging: {
        bucket: "mtt-dev-us-east-1-logs"  // From dev.us-east-1.yml
      }
    }
  }
}
```

### 5. Environment Variables and Parameter Store

#### Setting Environment Parameters

The system automatically pushes configuration to AWS Parameter Store:

```bash
# Push configuration to Parameter Store
cd utils
npm run set-env {environment}
```

#### Parameter Store Structure

Parameters are stored hierarchically in AWS Parameter Store:

```
/{environment}/app/tokenKey          (SecureString)
/{environment}/domain/name           (String)
/{environment}/domain/hostedzone/id  (String)
/{environment}/region/primary        (String)
/{environment}/stacks/core           (String)
```

#### Retrieving Parameters

CDK stacks automatically retrieve parameters during deployment:

```typescript
// In CDK stack
const tokenKeyArn = StringParameter.valueForStringParameter(
  this, 
  `/${environment}/app/tokenKey/arn`
);
```

### 6. Multi-Region Configuration

#### Primary and Secondary Regions

Configure multi-region deployment for disaster recovery:

```yaml
env:
  region:
    primary: "us-west-2"
    regions: "us-west-2,us-east-1"  # Comma-separated list
  regional:
    replication: "true"  # Enable cross-region replication
```

#### Region-Specific Overrides

Create region-specific configuration files:

```bash
# Region-specific configuration
config/prod.us-east-1.yml
config/prod.us-west-2.yml
```

Example region-specific configuration:

```yaml
# config/prod.us-east-1.yml
env:
  regional:
    logging:
      bucket: "mtt-prod-us-east-1-logs"
    templates:
      path: "templates-east/"
```

### 7. Configuration Validation

#### Automated Validation

The system includes built-in configuration validation:

```bash
# Validate configuration
cd utils
npm run validate-config {environment}
```

#### Common Validation Checks

- Required parameters are present
- ARN formats are valid
- Region configurations are consistent
- Domain names are properly formatted
- Timeout values are within acceptable ranges

#### Manual Validation

Verify configuration before deployment:

```bash
# Check configuration loading
cd cdk
node -e "
const { ConfigFile } = require('./dist/config-file');
const config = new ConfigFile('../config', 'dev');
console.log(JSON.stringify(config.config, null, 2));
"
```

### 8. Environment Management Commands

#### Common Management Tasks

```bash
# Install dependencies and configure environment
make env-setup STAGE=dev

# Set environment variables in Parameter Store
make set-env STAGE=dev

# Delete environment from Parameter Store
make del-env STAGE=dev

# Configure environment interactively
make configure-env

# Update existing environment configuration
make update-env STAGE=dev
```

#### Environment Lifecycle

1. **Create**: Set up new environment configuration
2. **Deploy**: Deploy infrastructure and services
3. **Update**: Modify configuration parameters
4. **Maintain**: Regular updates and monitoring
5. **Destroy**: Clean up environment resources

### 9. Troubleshooting Environment Setup

#### Common Issues

**Configuration File Not Found**
```bash
Error: ENOENT: no such file or directory, open '../config/myenv.yml'
```
Solution: Ensure configuration file exists and is properly named.

**Parameter Store Access Denied**
```bash
AccessDenied: User is not authorized to perform: ssm:PutParameter
```
Solution: Verify AWS credentials have SSM permissions.

**Invalid Configuration Format**
```bash
YAMLException: bad indentation of a mapping entry
```
Solution: Check YAML syntax and indentation.

#### Debugging Configuration Loading

Enable debug mode to troubleshoot configuration issues:

```bash
# Enable debug logging
export DEBUG=config:*

# Test configuration loading
cd cdk
npm run test-config
```

#### Validation Tools

Use built-in validation tools:

```bash
# Validate all configurations
npm run validate-all-configs

# Check specific environment
npm run validate-config dev

# Verify Parameter Store sync
npm run verify-params dev
```

### 10. Best Practices

#### Configuration Management

- Use version control for all configuration files
- Implement configuration review process
- Validate configurations before deployment
- Document environment-specific requirements
- Maintain configuration templates

#### Security Considerations

- Never commit secrets to version control
- Use AWS Parameter Store for sensitive data
- Implement least-privilege access policies
- Regularly rotate API keys and tokens
- Monitor configuration changes

#### Environment Isolation

- Use separate AWS accounts for production
- Implement proper IAM boundaries
- Use environment-specific resource naming
- Maintain separate monitoring and alerting
- Document environment dependencies

## Next Steps

After completing environment setup:

1. [Configure AWS Services](./aws-services.md)
2. [Set up Secrets Management](./secrets-management.md)
3. [Deploy Infrastructure](../Deployment/system-deployment.md)
4. [Configure Monitoring](../Monitoring/README.md)