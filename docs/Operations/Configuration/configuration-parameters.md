# Configuration Parameters Reference

This document provides a comprehensive reference for all configuration parameters used in MyTapTrack environments.

## Parameter Categories

- [Application Configuration](#application-configuration)
- [Domain and DNS Settings](#domain-and-dns-settings)
- [Regional Deployment](#regional-deployment)
- [AWS Service Integration](#aws-service-integration)
- [Security and Authentication](#security-and-authentication)
- [System Behavior](#system-behavior)
- [Third-Party Integrations](#third-party-integrations)

## Application Configuration

### Core Application Settings

#### `env.app.secrets.tokenKey`
**Type**: Object  
**Required**: Yes  
**Description**: Encryption key configuration for token generation and validation

```yaml
env:
  app:
    secrets:
      tokenKey:
        name: "/prod/app/tokenKey"      # Parameter Store path
        arn: "arn:aws:ssm:..."          # Parameter Store ARN
```

**Environment-specific values:**
- **dev**: `/dev/app/tokenKey`
- **test**: `/test/app/tokenKey`
- **prod**: `/prod/app/tokenKey`

#### `env.app.pushSnsArns`
**Type**: Object (Optional)  
**Required**: No  
**Description**: SNS topic ARNs for push notifications

```yaml
env:
  app:
    pushSnsArns:
      android: "arn:aws:sns:us-west-2:123456789012:android-push"
      ios: "arn:aws:sns:us-west-2:123456789012:ios-push"
```

**Usage**: Required only if push notifications are enabled

### Debug and Development Settings

#### `env.debug`
**Type**: String ("true" | "false")  
**Required**: Yes  
**Default**: "false"  
**Description**: Enables debug logging and development features

```yaml
env:
  debug: "true"  # Enable for dev/test, disable for prod
```

**Environment recommendations:**
- **dev**: "true"
- **test**: "true"
- **prod**: "false"

## Domain and DNS Settings

### Primary Domain Configuration

#### `env.domain.name`
**Type**: String  
**Required**: Yes (if using Route53)  
**Description**: Root domain name for the application

```yaml
env:
  domain:
    name: "mytaptrack.com"
```

#### `env.domain.hostedzone.id`
**Type**: String  
**Required**: Yes (if using Route53)  
**Description**: Route53 hosted zone ID

```yaml
env:
  domain:
    hostedzone:
      id: "Z1234567890ABCDEF"
```

### Subdomain Configuration

#### API Subdomain (`env.domain.sub.api`)
**Description**: Configuration for API endpoints

```yaml
env:
  domain:
    sub:
      api:
        subdomain: "api"                           # Subdomain prefix
        name: "api.mytaptrack.com"                # Full domain name
        cert: "arn:aws:acm:us-west-2:..."        # SSL certificate ARN
        path: "/prod"                             # API path (optional)
```

#### Device API Subdomain (`env.domain.sub.device`)
**Description**: Configuration for device communication endpoints

```yaml
env:
  domain:
    sub:
      device:
        appid: "mytaptrack"                       # Application identifier
        subdomain: "device"                       # Subdomain prefix
        name: "device.mytaptrack.com"            # Full domain name
        cert: "arn:aws:acm:us-west-2:..."       # SSL certificate ARN
        apikey: "your-secure-api-key"            # Device API key
        path: "/prod"                            # API path (optional)
```

#### Website Subdomain (`env.domain.sub.website`)
**Description**: Configuration for web application

```yaml
env:
  domain:
    sub:
      website:
        subdomain: "www"                         # Subdomain prefix
        name: "www.mytaptrack.com"              # Full domain name
```

## Regional Deployment

### Region Configuration

#### `env.region.primary`
**Type**: String  
**Required**: Yes  
**Description**: Primary AWS region for deployment

```yaml
env:
  region:
    primary: "us-west-2"
```

**Supported regions:**
- us-west-2 (Oregon)
- us-east-1 (N. Virginia)
- eu-west-1 (Ireland)
- ap-southeast-2 (Sydney)

#### `env.region.regions`
**Type**: String (comma-separated)  
**Required**: Yes  
**Description**: List of regions for deployment

```yaml
env:
  region:
    regions: "us-west-2,us-east-1"  # Primary and DR regions
```

### Regional Settings

#### `env.regional.replication`
**Type**: String ("true" | "false")  
**Required**: Yes  
**Description**: Enable cross-region data replication

```yaml
env:
  regional:
    replication: "true"  # Enable for prod, optional for dev/test
```

#### `env.regional.templates.path`
**Type**: String  
**Required**: Yes  
**Default**: "templates/"  
**Description**: S3 path for email templates

```yaml
env:
  regional:
    templates:
      path: "templates/"
```

#### `env.regional.logging.bucket`
**Type**: String (Optional)  
**Description**: S3 bucket for centralized logging

```yaml
env:
  regional:
    logging:
      bucket: "mtt-prod-us-west-2-logs"
```

## AWS Service Integration

### Stack References

#### `env.stacks.core`
**Type**: String  
**Required**: Yes  
**Description**: Name of the core infrastructure stack

```yaml
env:
  stacks:
    core: "mytaptrack-prod"
```

**Naming convention**: `mytaptrack-{environment}`

### SMS Configuration

#### `env.sms.origin`
**Type**: String  
**Required**: Yes (if SMS enabled)  
**Description**: Phone number for SMS origination

```yaml
env:
  sms:
    origin: "+1234567890"  # Must include country code
```

### System Email

#### `env.system.email`
**Type**: String  
**Required**: Yes (if email enabled)  
**Description**: System email address for notifications

```yaml
env:
  system:
    email: "noreply@mytaptrack.com"
```

### Chatbot Integration

#### `env.chatbot.arn`
**Type**: String (Optional)  
**Description**: AWS Chatbot configuration ARN for Slack integration

```yaml
env:
  chatbot:
    arn: "arn:aws:chatbot::123456789012:slack-configuration/mytaptrack-alerts"
```

## Security and Authentication

### KMS Configuration

#### `kms.s3`
**Type**: String  
**Required**: Yes (production)  
**Description**: KMS key ARN for S3 encryption

```yaml
kms:
  s3: "arn:aws:kms:us-west-2:123456789012:key/12345678-1234-1234-1234-123456789012"
```

#### `kms.pii.origin.arn`
**Type**: String  
**Required**: Yes (production)  
**Description**: KMS key ARN for PII data encryption

```yaml
kms:
  pii:
    origin:
      arn: "arn:aws:kms:us-west-2:123456789012:key/87654321-4321-4321-4321-210987654321"
```

### HIPAA Compliance

#### `hipaa.AWSConfigARN`
**Type**: String  
**Required**: Yes (production)  
**Description**: AWS Config service role ARN for compliance monitoring

```yaml
hipaa:
  AWSConfigARN: "arn:aws:iam::123456789012:role/aws-config-role"
  AdminRoleArn: "arn:aws:iam::123456789012:role/admin-role"
  PrimaryRegion: "us-west-2"
  ForceS3Locks: "false"
  VpcEnabled: "true"
  QSS3KeyPrefix: "/hipaa"
```

## System Behavior

### Student Data Management

#### `env.student.remove.timeout`
**Type**: Number  
**Required**: Yes  
**Description**: Timeout in seconds before removing students with no team members

```yaml
env:
  student:
    remove:
      timeout: 7776000  # 90 days in seconds
```

**Environment recommendations:**
- **dev**: 90 (90 seconds for testing)
- **test**: 90 (90 seconds for testing)
- **prod**: 7776000 (90 days)

### Testing Configuration

#### `env.testing.admin`
**Type**: Object  
**Required**: Yes (test environments)  
**Description**: Test admin user credentials

```yaml
env:
  testing:
    admin:
      email: "admin@test.mytaptrack.com"
      name: "Test Admin"
      password: "secure-test-password"
```

#### `env.testing.nonadmin`
**Type**: Object  
**Required**: Yes (test environments)  
**Description**: Test non-admin user credentials

```yaml
env:
  testing:
    nonadmin:
      email: "user@test.mytaptrack.com"
      name: "Test User"
      password: "secure-test-password"
```

## Third-Party Integrations

### Lumigo Monitoring

#### `Lumigo.Token`
**Type**: String (Optional)  
**Description**: Lumigo token for distributed tracing

```yaml
Lumigo:
  Token: "your-lumigo-token"
  AttributeMasking: '["body","password","secret"]'
  DomainScrubbing: '[".*lambda.*"]'
```

### Twilio SMS

#### `twilio.secret.arn`
**Type**: String (Optional)  
**Description**: AWS Secrets Manager ARN containing Twilio credentials

```yaml
twilio:
  secret:
    arn: "arn:aws:secretsmanager:us-west-2:123456789012:secret:twilio-credentials"
```

### Slack Integration

#### `slack.workspace.id`
**Type**: String (Optional)  
**Description**: Slack workspace ID for notifications

```yaml
slack:
  workspace:
    id: "T1234567890"
```

## Parameter Validation

### Required Parameters by Environment

#### Development Environment
```yaml
# Minimum required for dev
env:
  debug: "true"
  region:
    primary: "us-west-2"
    regions: "us-west-2"
  stacks:
    core: "mytaptrack-dev"
  app:
    secrets:
      tokenKey:
        name: "/dev/app/tokenKey"
  domain:
    sub:
      device:
        appid: "mytaptrack"
        apikey: "dev-api-key"
      website:
        name: "localhost:8000"
```

#### Production Environment
```yaml
# Required for production
env:
  debug: "false"
  region:
    primary: "us-west-2"
    regions: "us-west-2,us-east-1"
  stacks:
    core: "mytaptrack-prod"
  app:
    secrets:
      tokenKey:
        name: "/prod/app/tokenKey"
        arn: "arn:aws:ssm:..."
  domain:
    name: "mytaptrack.com"
    hostedzone:
      id: "Z1234567890"
    sub:
      api:
        subdomain: "api"
        name: "api.mytaptrack.com"
        cert: "arn:aws:acm:..."
      device:
        appid: "mytaptrack"
        subdomain: "device"
        name: "device.mytaptrack.com"
        cert: "arn:aws:acm:..."
        apikey: "secure-prod-key"
      website:
        subdomain: "www"
        name: "www.mytaptrack.com"
  regional:
    replication: "true"
  system:
    email: "noreply@mytaptrack.com"
kms:
  s3: "arn:aws:kms:..."
  pii:
    origin:
      arn: "arn:aws:kms:..."
hipaa:
  AWSConfigARN: "arn:aws:iam:..."
  AdminRoleArn: "arn:aws:iam:..."
  PrimaryRegion: "us-west-2"
  VpcEnabled: "true"
```

## Parameter Store Mapping

### Automatic Parameter Store Sync

The configuration system automatically syncs parameters to AWS Parameter Store with the following mapping:

```
Configuration Path              → Parameter Store Path
env.app.secrets.tokenKey.name  → /{env}/app/secrets/tokenKey/name
env.domain.name                → /{env}/domain/name
env.region.primary             → /{env}/region/primary
env.stacks.core                → /{env}/stacks/core
```

### Secure Parameters

The following parameters are stored as SecureString type:
- `/{env}/app/secrets/tokenKey/name`
- Any parameter path containing "secret", "key", or "password"

## Updating Parameters

### Single Parameter Update

```bash
# Update specific parameter
aws ssm put-parameter \
  --name "/prod/domain/name" \
  --value "new-domain.com" \
  --type "String" \
  --overwrite
```

### Bulk Parameter Update

```bash
# Update all parameters for environment
cd utils
npm run set-env prod
```

### Parameter Validation

```bash
# Validate parameter consistency
cd utils
npm run validate-params prod
```

## Environment-Specific Examples

### Minimal Development Configuration

```yaml
# config/dev-min.yml
env:
  debug: "true"
  app:
    secrets:
      tokenKey:
        name: "/dev/app/tokenKey"
  domain:
    sub:
      device:
        appid: "mytaptrack"
        apikey: "dev-key-123"
      website:
        name: "localhost:8000"
  region:
    primary: "us-west-2"
    regions: "us-west-2"
  stacks:
    core: "mytaptrack-dev"
  student:
    remove:
      timeout: 10
  regional:
    replication: "false"
    templates:
      path: "templates/"
```

### Full Production Configuration

```yaml
# config/prod.yml
env:
  debug: "false"
  app:
    secrets:
      tokenKey:
        name: "/prod/app/tokenKey"
        arn: "arn:aws:ssm:us-west-2:123456789012:parameter/prod/app/tokenKey"
    pushSnsArns:
      android: "arn:aws:sns:us-west-2:123456789012:android-push"
      ios: "arn:aws:sns:us-west-2:123456789012:ios-push"
  domain:
    name: "mytaptrack.com"
    hostedzone:
      id: "Z1234567890ABCDEF"
    sub:
      api:
        subdomain: "api"
        name: "api.mytaptrack.com"
        cert: "arn:aws:acm:us-west-2:123456789012:certificate/api-cert"
      device:
        appid: "mytaptrack"
        subdomain: "device"
        name: "device.mytaptrack.com"
        cert: "arn:aws:acm:us-west-2:123456789012:certificate/device-cert"
        apikey: "prod-secure-key-xyz789"
      website:
        subdomain: "www"
        name: "www.mytaptrack.com"
  region:
    primary: "us-west-2"
    regions: "us-west-2,us-east-1"
  stacks:
    core: "mytaptrack-prod"
  student:
    remove:
      timeout: 7776000
  system:
    email: "noreply@mytaptrack.com"
  sms:
    origin: "+15551234567"
  regional:
    replication: "true"
    templates:
      path: "templates/"
    logging:
      bucket: "mtt-prod-us-west-2-logs"

kms:
  s3: "arn:aws:kms:us-west-2:123456789012:key/s3-encryption-key"
  pii:
    origin:
      arn: "arn:aws:kms:us-west-2:123456789012:key/pii-encryption-key"

hipaa:
  AWSConfigARN: "arn:aws:iam::123456789012:role/aws-config-role"
  AdminRoleArn: "arn:aws:iam::123456789012:role/admin-role"
  PrimaryRegion: "us-west-2"
  ForceS3Locks: "false"
  VpcEnabled: "true"
  QSS3KeyPrefix: "/hipaa"

Lumigo:
  Token: "your-lumigo-token"
  AttributeMasking: '["body","password","secret","key"]'
  DomainScrubbing: '[".*lambda.*"]'

slack:
  workspace:
    id: "T1234567890"

twilio:
  secret:
    arn: "arn:aws:secretsmanager:us-west-2:123456789012:secret:twilio-creds"
```