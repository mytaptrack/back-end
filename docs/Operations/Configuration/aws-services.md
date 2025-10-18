# AWS Service Configuration

This document provides comprehensive guidance for configuring AWS services used by MyTapTrack, including setup procedures, security considerations, and best practices.

## Overview

MyTapTrack leverages multiple AWS services for compute, storage, authentication, messaging, and monitoring. Each service requires specific configuration to ensure proper integration, security, and performance.

## Core AWS Services

### Amazon Cognito (User Authentication)

#### Service Overview
Amazon Cognito provides user authentication and authorization for the MyTapTrack application.

#### Configuration Requirements

**User Pool Configuration**
```yaml
# Environment configuration
env:
  auth:
    username: true  # Enable username-based authentication
    google:         # Optional Google OAuth integration
      clientId: "your-google-client-id"
      clientSecretName: "/prod/auth/google/secret"
      scopes: "profile email openid"
```

**User Pool Settings**
- **Sign-in Options**: Email and username
- **Password Policy**: 
  - Minimum 8 characters
  - Requires uppercase, lowercase, numbers, and symbols
  - Temporary password validity: 7 days
- **MFA**: Optional (recommended for production)
- **Account Recovery**: Email-based recovery

#### Setup Procedures

1. **Create User Pool**
   ```bash
   # Deploy core stack to create Cognito resources
   cd core
   cdk deploy
   ```

2. **Configure Domain**
   ```bash
   # Domain is automatically configured during deployment
   # Format: {stack-name}-{account-id}.auth.{region}.amazoncognito.com
   ```

3. **Set Up OAuth Providers** (Optional)
   ```bash
   # Configure Google OAuth in environment config
   env:
     auth:
       google:
         clientId: "your-google-oauth-client-id"
         clientSecretName: "/prod/auth/google/client-secret"
   ```

4. **Configure Application Clients**
   - Web client for browser-based access
   - Mobile client for device applications
   - Admin client for management operations

#### Security Configuration

**OAuth Settings**
- **Callback URLs**: Configure for each environment
  - Development: `https://localhost:8000`
  - Production: `https://www.mytaptrack.com`
- **Logout URLs**: Match callback URLs
- **OAuth Scopes**: `openid`, `email`, `profile`, `aws.cognito.signin.user.admin`

**Token Configuration**
- **Access Token Validity**: 60 minutes
- **ID Token Validity**: 60 minutes  
- **Refresh Token Validity**: 30 days

### Amazon DynamoDB (Primary Database)

#### Service Overview
DynamoDB serves as the primary database for user data, device information, and application state.

#### Table Configuration

**Primary Table** (`mytaptrack-{env}-primary`)
```typescript
// Table structure
{
  partitionKey: 'pk',     // Primary partition key
  sortKey: 'sk',          // Primary sort key
  billingMode: 'PAY_PER_REQUEST',
  pointInTimeRecovery: true,
  streamSpecification: {
    streamViewType: 'NEW_AND_OLD_IMAGES'
  },
  globalSecondaryIndexes: [
    {
      indexName: 'license-index',
      partitionKey: 'lpk',
      sortKey: 'lsk'
    }
  ]
}
```

**Data Table** (`mytaptrack-{env}-data`)
```typescript
// Table structure with multiple GSIs
{
  partitionKey: 'pk',
  sortKey: 'sk',
  globalSecondaryIndexes: [
    {
      indexName: 'student-index',
      partitionKey: 'studentId',
      sortKey: 'tsk'
    },
    {
      indexName: 'device-index', 
      partitionKey: 'deviceId',
      sortKey: 'dsk'
    },
    {
      indexName: 'app-index',
      partitionKey: 'appId',
      sortKey: 'deviceId'
    },
    {
      indexName: 'license-index',
      partitionKey: 'lpk',
      sortKey: 'lsk'
    }
  ]
}
```

#### Setup Procedures

1. **Deploy Tables**
   ```bash
   # Tables are created during core stack deployment
   cd core
   cdk deploy
   ```

2. **Configure Encryption**
   ```yaml
   # KMS encryption configuration
   kms:
     s3: "arn:aws:kms:region:account:key/key-id"
     pii:
       origin:
         arn: "arn:aws:kms:region:account:key/pii-key-id"
   ```

3. **Set Up Cross-Region Replication**
   ```yaml
   env:
     region:
       primary: "us-west-2"
       regions: "us-west-2,us-east-1"
     regional:
       replication: "true"
   ```

#### Security Configuration

**Encryption**
- **Encryption at Rest**: AWS managed keys or customer managed KMS keys
- **Encryption in Transit**: TLS 1.2 for all connections
- **Point-in-Time Recovery**: Enabled for all production tables

**Access Control**
- **IAM Roles**: Least privilege access for Lambda functions
- **VPC Endpoints**: Private connectivity when using VPC
- **Resource-Based Policies**: Fine-grained access control

### Amazon S3 (Object Storage)

#### Service Overview
S3 provides object storage for data files, templates, compliance documents, and static assets.

#### Bucket Configuration

**Data Bucket** (`mytaptrack-{env}-{account}-{region}-data`)
```typescript
{
  versioning: 'Enabled',
  encryption: {
    serverSideEncryption: 'aws:kms',
    kmsMasterKeyId: 'kms-key-id'
  },
  publicAccessBlock: {
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true
  },
  replication: {
    enabled: true,
    destinationBucket: 'cross-region-replica'
  }
}
```

**Template Bucket** (`mytaptrack-{env}-{account}-{region}-templates`)
```typescript
{
  versioning: 'Enabled',
  encryption: 'AES256',
  publicAccessBlock: 'all-blocked',
  content: {
    emailTemplates: 'templates/',
    staticAssets: 'assets/'
  }
}
```

#### Setup Procedures

1. **Deploy Buckets**
   ```bash
   # Buckets created during core stack deployment
   cd core
   cdk deploy
   ```

2. **Configure Cross-Region Replication**
   ```yaml
   env:
     regional:
       replication: "true"
   ```

3. **Upload Templates**
   ```bash
   # Templates automatically deployed from core/templates/
   # Custom templates can be added to the directory
   ```

#### Security Configuration

**Bucket Policies**
- **Deny HTTP**: Force HTTPS for all requests
- **IP Restrictions**: Optional IP-based access control
- **VPC Endpoints**: Private access from VPC resources

**Encryption**
- **Server-Side Encryption**: KMS or AES-256
- **Bucket Key**: Reduce KMS costs for high-volume buckets
- **Cross-Region Replication**: Encrypted replication to DR region

### Amazon EventBridge (Event Processing)

#### Service Overview
EventBridge provides event-driven architecture for real-time data processing and system integration.

#### Configuration

**Custom Event Bus** (`mytaptrack-{env}-data-events`)
```typescript
{
  eventBusName: 'mytaptrack-prod-data-events',
  eventSourceName: 'mytaptrack.data',
  rules: [
    {
      name: 'data-propagation',
      eventPattern: {
        source: ['mytaptrack.data'],
        detailType: ['Data Change']
      }
    }
  ]
}
```

#### Setup Procedures

1. **Deploy Event Bus**
   ```bash
   # Event bus created during core stack deployment
   cd core
   cdk deploy
   ```

2. **Configure Event Rules**
   ```bash
   # Rules are defined in individual service stacks
   cd data-prop
   cdk deploy
   ```

#### Security Configuration

**Resource Policies**
- **Cross-Account Access**: Controlled access from other AWS accounts
- **Service Integration**: Secure integration with Lambda, SQS, SNS

### AWS Lambda (Serverless Compute)

#### Service Overview
Lambda functions provide serverless compute for API processing, data transformation, and system automation.

#### Configuration Standards

**Runtime Configuration**
```typescript
{
  runtime: 'nodejs18.x',
  timeout: 300,  // 5 minutes max
  memorySize: 512,  // MB
  environment: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info'
  }
}
```

**VPC Configuration** (Optional)
```typescript
{
  vpc: 'vpc-12345678',
  subnets: ['subnet-12345678', 'subnet-87654321'],
  securityGroups: ['sg-12345678']
}
```

#### Setup Procedures

1. **Deploy Functions**
   ```bash
   # Functions deployed with their respective stacks
   cd api
   cdk deploy
   
   cd data-prop  
   cdk deploy
   ```

2. **Configure Environment Variables**
   ```bash
   # Environment variables set automatically from Parameter Store
   make set-env STAGE=prod
   ```

#### Security Configuration

**Execution Roles**
- **Least Privilege**: Minimal required permissions
- **Resource-Specific**: Scoped to specific resources
- **Temporary Credentials**: No long-term access keys

**Monitoring**
- **CloudWatch Logs**: Centralized logging
- **X-Ray Tracing**: Distributed tracing (optional)
- **Custom Metrics**: Application-specific metrics

### AWS Parameter Store (Configuration Management)

#### Service Overview
Parameter Store provides secure, hierarchical storage for configuration data and secrets.

#### Parameter Structure

**Hierarchical Organization**
```
/{environment}/
├── app/
│   ├── tokenKey              (SecureString)
│   └── secrets/
│       └── detailsKey        (SecureString)
├── domain/
│   ├── name                  (String)
│   └── hostedzone/
│       └── id                (String)
├── region/
│   ├── primary               (String)
│   └── regions               (String)
└── stacks/
    └── core                  (String)
```

#### Setup Procedures

1. **Initialize Parameters**
   ```bash
   # Set all environment parameters
   cd utils
   npm run set-env prod
   ```

2. **Validate Parameters**
   ```bash
   # Check parameter consistency
   npm run validate-params prod
   ```

3. **Update Individual Parameters**
   ```bash
   aws ssm put-parameter \
     --name "/prod/domain/name" \
     --value "mytaptrack.com" \
     --type "String" \
     --overwrite
   ```

#### Security Configuration

**Parameter Types**
- **String**: Non-sensitive configuration values
- **SecureString**: Encrypted sensitive values (passwords, keys)
- **StringList**: Comma-separated lists

**Access Control**
- **IAM Policies**: Role-based parameter access
- **Resource ARNs**: Parameter-specific permissions
- **KMS Encryption**: Customer-managed keys for SecureString parameters

### AWS Secrets Manager (Secrets Management)

#### Service Overview
Secrets Manager provides secure storage and automatic rotation for database credentials, API keys, and other secrets.

#### Configuration

**Secret Structure**
```json
{
  "secretName": "/prod/database/credentials",
  "description": "Database connection credentials",
  "secretString": {
    "username": "admin",
    "password": "secure-password",
    "host": "database.region.rds.amazonaws.com",
    "port": 5432
  }
}
```

#### Setup Procedures

1. **Create Secrets**
   ```bash
   aws secretsmanager create-secret \
     --name "/prod/twilio/credentials" \
     --description "Twilio API credentials" \
     --secret-string '{"accountSid":"AC123","authToken":"token123"}'
   ```

2. **Configure Automatic Rotation**
   ```bash
   aws secretsmanager update-secret \
     --secret-id "/prod/database/credentials" \
     --rotation-lambda-arn "arn:aws:lambda:region:account:function:rotation-function"
   ```

#### Security Configuration

**Encryption**
- **KMS Encryption**: Customer-managed keys
- **Cross-Region Replication**: Encrypted replication for DR

**Access Control**
- **Resource Policies**: Fine-grained access control
- **VPC Endpoints**: Private network access
- **Audit Logging**: CloudTrail integration

## Service Integration Patterns

### Cross-Service Communication

**API Gateway → Lambda → DynamoDB**
```typescript
// Secure integration pattern
{
  apiGateway: {
    authentication: 'Cognito User Pool',
    authorization: 'IAM roles'
  },
  lambda: {
    executionRole: 'least-privilege-role',
    vpcConfig: 'optional-vpc-isolation'
  },
  dynamodb: {
    encryption: 'customer-managed-kms',
    accessPattern: 'iam-role-based'
  }
}
```

**EventBridge → Lambda → S3**
```typescript
// Event-driven processing
{
  eventBridge: {
    eventBus: 'custom-event-bus',
    rules: 'event-pattern-matching'
  },
  lambda: {
    trigger: 'eventbridge-rule',
    processing: 'async-data-transformation'
  },
  s3: {
    storage: 'encrypted-object-storage',
    lifecycle: 'automated-archival'
  }
}
```

### Security Integration

**Identity and Access Management**
```typescript
{
  cognito: {
    userAuthentication: 'user-pools',
    tokenValidation: 'jwt-tokens'
  },
  iam: {
    serviceRoles: 'least-privilege-access',
    resourcePolicies: 'fine-grained-control'
  },
  kms: {
    dataEncryption: 'customer-managed-keys',
    keyRotation: 'automatic-annual'
  }
}
```

## Environment-Specific Configurations

### Development Environment

**Service Sizing**
```yaml
# Reduced capacity for cost optimization
dynamodb:
  billingMode: 'PAY_PER_REQUEST'
  
lambda:
  memorySize: 256
  timeout: 30
  
s3:
  replication: false
  lifecycle: 'delete-after-30-days'
```

**Security Settings**
```yaml
# Relaxed security for development
cognito:
  passwordPolicy: 'basic'
  mfa: false
  
kms:
  encryption: 'aws-managed-keys'
```

### Production Environment

**Service Sizing**
```yaml
# Optimized for performance and reliability
dynamodb:
  billingMode: 'PAY_PER_REQUEST'
  pointInTimeRecovery: true
  
lambda:
  memorySize: 512
  timeout: 300
  reservedConcurrency: 100
  
s3:
  replication: true
  lifecycle: 'intelligent-tiering'
```

**Security Settings**
```yaml
# Enhanced security for production
cognito:
  passwordPolicy: 'strict'
  mfa: 'optional'
  
kms:
  encryption: 'customer-managed-keys'
  keyRotation: true
  
vpc:
  enabled: true
  privateSubnets: true
```

## Monitoring and Alerting

### CloudWatch Configuration

**Log Groups**
```bash
# Automatic log group creation for all services
/aws/lambda/mytaptrack-prod-*
/aws/apigateway/mytaptrack-prod-*
/aws/events/mytaptrack-prod-*
```

**Metrics and Alarms**
```yaml
alarms:
  - name: 'DynamoDB-ThrottledRequests'
    metric: 'AWS/DynamoDB/ThrottledRequests'
    threshold: 0
    
  - name: 'Lambda-Errors'
    metric: 'AWS/Lambda/Errors'
    threshold: 5
    
  - name: 'API-Gateway-5XXError'
    metric: 'AWS/ApiGateway/5XXError'
    threshold: 10
```

### Cost Monitoring

**Budget Alerts**
```yaml
budgets:
  - name: 'Monthly-Service-Budget'
    amount: 1000
    services: ['DynamoDB', 'Lambda', 'S3', 'Cognito']
    
  - name: 'Data-Transfer-Budget'
    amount: 100
    category: 'Data Transfer'
```

## Troubleshooting Common Issues

### Service Configuration Problems

**Cognito Authentication Failures**
```bash
# Check user pool configuration
aws cognito-idp describe-user-pool --user-pool-id us-west-2_XXXXXXXXX

# Verify client configuration
aws cognito-idp describe-user-pool-client \
  --user-pool-id us-west-2_XXXXXXXXX \
  --client-id XXXXXXXXXXXXXXXXXX
```

**DynamoDB Access Issues**
```bash
# Check table status
aws dynamodb describe-table --table-name mytaptrack-prod-primary

# Verify IAM permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::account:role/lambda-role \
  --action-names dynamodb:GetItem \
  --resource-arns arn:aws:dynamodb:region:account:table/mytaptrack-prod-primary
```

**Parameter Store Access Problems**
```bash
# List parameters
aws ssm describe-parameters --filters "Key=Name,Values=/prod/"

# Get parameter value
aws ssm get-parameter --name "/prod/app/tokenKey" --with-decryption
```

### Performance Issues

**Lambda Cold Starts**
```yaml
# Optimize function configuration
lambda:
  memorySize: 1024  # Increase memory for faster CPU
  provisionedConcurrency: 10  # Pre-warm instances
  environment:
    AWS_NODEJS_CONNECTION_REUSE_ENABLED: 1
```

**DynamoDB Throttling**
```yaml
# Monitor and adjust capacity
dynamodb:
  billingMode: 'PAY_PER_REQUEST'  # Auto-scaling
  # Or use provisioned with auto-scaling
  readCapacity: 100
  writeCapacity: 100
  autoScaling: true
```

## Best Practices

### Security Best Practices

1. **Least Privilege Access**: Grant minimum required permissions
2. **Encryption Everywhere**: Encrypt data at rest and in transit
3. **Regular Key Rotation**: Rotate encryption keys annually
4. **Network Isolation**: Use VPC for sensitive workloads
5. **Audit Logging**: Enable CloudTrail for all API calls

### Performance Best Practices

1. **Connection Reuse**: Enable connection pooling for Lambda
2. **Caching**: Implement caching at multiple layers
3. **Async Processing**: Use EventBridge for decoupled processing
4. **Resource Sizing**: Right-size resources based on usage patterns
5. **Monitoring**: Implement comprehensive monitoring and alerting

### Cost Optimization

1. **Pay-per-Request**: Use pay-per-request billing for variable workloads
2. **Lifecycle Policies**: Implement S3 lifecycle policies for archival
3. **Reserved Capacity**: Use reserved capacity for predictable workloads
4. **Resource Cleanup**: Regularly clean up unused resources
5. **Budget Monitoring**: Set up budget alerts and cost monitoring

## Next Steps

After configuring AWS services:

1. [Set up Secrets Management](./secrets-management.md)
2. [Configure Monitoring](../Monitoring/README.md)
3. [Deploy Infrastructure](../Deployment/system-deployment.md)
4. [Test Service Integration](../../Development/testing.md)