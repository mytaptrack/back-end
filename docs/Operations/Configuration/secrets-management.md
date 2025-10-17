# Secrets and Security Management

This document provides comprehensive guidance for managing secrets, credentials, and security configurations in MyTapTrack environments using AWS Parameter Store, Secrets Manager, and security best practices.

## Overview

MyTapTrack implements a multi-layered security approach for managing sensitive information including API keys, database credentials, encryption keys, and other secrets. The system uses AWS Parameter Store for configuration parameters and AWS Secrets Manager for sensitive credentials.

## Security Architecture

### Secrets Storage Strategy

**AWS Parameter Store**
- Configuration parameters
- Non-rotating secrets
- Environment-specific settings
- Application configuration

**AWS Secrets Manager**
- Database credentials with automatic rotation
- Third-party API credentials
- OAuth client secrets
- Certificates and private keys

**AWS KMS (Key Management Service)**
- Encryption key management
- Customer-managed keys for sensitive data
- Cross-region key replication
- Automatic key rotation

## Parameter Store Configuration

### Parameter Hierarchy

The system uses a hierarchical parameter structure for organized secret management:

```
/{environment}/
├── app/
│   ├── tokenKey                    (SecureString) - JWT signing key
│   └── secrets/
│       ├── detailsKey             (SecureString) - Data validation key
│       └── encryptionKey          (SecureString) - Application encryption
├── auth/
│   ├── google/
│   │   ├── clientId               (String) - Google OAuth client ID
│   │   └── clientSecret           (SecureString) - Google OAuth secret
│   └── cognito/
│       ├── userPoolId             (String) - Cognito User Pool ID
│       └── clientId               (String) - Cognito Client ID
├── database/
│   ├── primary/
│   │   └── connectionString       (SecureString) - Primary DB connection
│   └── replica/
│       └── connectionString       (SecureString) - Replica DB connection
├── external/
│   ├── twilio/
│   │   ├── accountSid             (String) - Twilio Account SID
│   │   └── authToken              (SecureString) - Twilio Auth Token
│   ├── slack/
│   │   └── webhookUrl             (SecureString) - Slack webhook URL
│   └── lumigo/
│       └── token                  (SecureString) - Lumigo tracing token
└── kms/
    ├── s3/
    │   └── keyId                  (String) - S3 encryption key ID
    └── pii/
        └── keyArn                 (String) - PII encryption key ARN
```

### Parameter Types and Security

**SecureString Parameters**
- Encrypted using AWS KMS
- Automatic encryption/decryption
- Access controlled via IAM policies
- Audit trail in CloudTrail

**String Parameters**
- Non-sensitive configuration values
- Faster retrieval (no decryption)
- Lower cost than SecureString
- Still access-controlled via IAM

### Setting Up Parameters

#### Automated Parameter Setup

```bash
# Set all environment parameters from configuration
cd utils
npm run set-env prod

# This script:
# 1. Reads configuration from config/prod.yml
# 2. Converts nested YAML to parameter paths
# 3. Creates/updates parameters in Parameter Store
# 4. Uses SecureString for sensitive values
```

#### Manual Parameter Management

```bash
# Create a secure parameter
aws ssm put-parameter \
  --name "/prod/app/tokenKey" \
  --value "your-secure-jwt-signing-key" \
  --type "SecureString" \
  --key-id "alias/parameter-store-key" \
  --description "JWT token signing key for production"

# Create a standard parameter
aws ssm put-parameter \
  --name "/prod/domain/name" \
  --value "mytaptrack.com" \
  --type "String" \
  --description "Primary domain name"

# Update existing parameter
aws ssm put-parameter \
  --name "/prod/app/tokenKey" \
  --value "new-secure-key" \
  --type "SecureString" \
  --overwrite

# Get parameter value (with decryption for SecureString)
aws ssm get-parameter \
  --name "/prod/app/tokenKey" \
  --with-decryption
```

#### Bulk Parameter Operations

```bash
# Get all parameters for an environment
aws ssm get-parameters-by-path \
  --path "/prod/" \
  --recursive \
  --with-decryption

# Delete environment parameters
aws ssm delete-parameters \
  --names $(aws ssm get-parameters-by-path \
    --path "/dev/" \
    --recursive \
    --query "Parameters[].Name" \
    --output text)
```

## Secrets Manager Configuration

### Secret Categories

**Database Credentials**
```json
{
  "secretName": "/prod/database/primary",
  "description": "Primary database connection credentials",
  "secretString": {
    "username": "admin",
    "password": "secure-generated-password",
    "host": "prod-db.cluster-xyz.us-west-2.rds.amazonaws.com",
    "port": 5432,
    "dbname": "mytaptrack"
  }
}
```

**Third-Party API Credentials**
```json
{
  "secretName": "/prod/twilio/credentials",
  "description": "Twilio SMS service credentials",
  "secretString": {
    "accountSid": "AC1234567890abcdef1234567890abcdef",
    "authToken": "your-twilio-auth-token",
    "phoneNumber": "+15551234567"
  }
}
```

**OAuth Client Secrets**
```json
{
  "secretName": "/prod/auth/google/client-secret",
  "description": "Google OAuth client secret",
  "secretString": {
    "clientSecret": "GOCSPX-your-google-client-secret"
  }
}
```

### Creating Secrets

#### Using AWS CLI

```bash
# Create database credentials secret
aws secretsmanager create-secret \
  --name "/prod/database/primary" \
  --description "Primary database credentials" \
  --secret-string '{
    "username": "admin",
    "password": "secure-password-123",
    "host": "prod-db.cluster-xyz.us-west-2.rds.amazonaws.com",
    "port": 5432,
    "dbname": "mytaptrack"
  }'

# Create Twilio credentials
aws secretsmanager create-secret \
  --name "/prod/twilio/credentials" \
  --description "Twilio SMS service credentials" \
  --secret-string '{
    "accountSid": "AC1234567890abcdef",
    "authToken": "your-auth-token",
    "phoneNumber": "+15551234567"
  }'

# Create OAuth client secret
aws secretsmanager create-secret \
  --name "/prod/auth/google/client-secret" \
  --description "Google OAuth client secret" \
  --secret-string '{
    "clientSecret": "GOCSPX-your-client-secret"
  }'
```

#### Using CDK/CloudFormation

```typescript
// In CDK stack
const dbSecret = new Secret(this, 'DatabaseSecret', {
  secretName: `/prod/database/primary`,
  description: 'Primary database credentials',
  generateSecretString: {
    secretStringTemplate: JSON.stringify({
      username: 'admin',
      host: 'prod-db.cluster-xyz.us-west-2.rds.amazonaws.com',
      port: 5432,
      dbname: 'mytaptrack'
    }),
    generateStringKey: 'password',
    excludeCharacters: '"@/\\'
  }
});
```

### Automatic Secret Rotation

#### Database Credentials

```bash
# Set up automatic rotation for RDS credentials
aws secretsmanager update-secret \
  --secret-id "/prod/database/primary" \
  --rotation-lambda-arn "arn:aws:lambda:us-west-2:123456789012:function:SecretsManagerRDSPostgreSQLRotationSingleUser" \
  --rotation-rules AutomaticallyAfterDays=30
```

#### Custom Rotation for API Keys

```typescript
// Lambda function for custom secret rotation
export const handler = async (event: any) => {
  const { SecretId, Step, Token } = event;
  
  switch (Step) {
    case 'createSecret':
      // Generate new API key from third-party service
      break;
    case 'setSecret':
      // Update secret in Secrets Manager
      break;
    case 'testSecret':
      // Test new secret with third-party service
      break;
    case 'finishSecret':
      // Activate new secret
      break;
  }
};
```

## KMS Key Management

### Customer-Managed Keys

#### S3 Encryption Key

```typescript
// CDK configuration for S3 encryption key
const s3EncryptionKey = new Key(this, 'S3EncryptionKey', {
  description: 'Customer-managed key for S3 bucket encryption',
  enableKeyRotation: true,
  policy: new PolicyDocument({
    statements: [
      new PolicyStatement({
        sid: 'Enable IAM User Permissions',
        effect: Effect.ALLOW,
        principals: [new AccountRootPrincipal()],
        actions: ['kms:*'],
        resources: ['*']
      }),
      new PolicyStatement({
        sid: 'Allow S3 Service',
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal('s3.amazonaws.com')],
        actions: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:DescribeKey'
        ],
        resources: ['*']
      })
    ]
  })
});
```

#### PII Data Encryption Key

```typescript
// Multi-region key for PII data encryption
const piiEncryptionKey = new CfnKey(this, 'PiiEncryptionKey', {
  description: 'Multi-region key for PII data encryption',
  multiRegion: true,
  enableKeyRotation: true,
  keyPolicy: {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'Enable IAM User Permissions',
        Effect: 'Allow',
        Principal: {
          AWS: `arn:aws:iam::${this.account}:root`
        },
        Action: 'kms:*',
        Resource: '*'
      },
      {
        Sid: 'Allow DynamoDB Service',
        Effect: 'Allow',
        Principal: {
          Service: 'dynamodb.amazonaws.com'
        },
        Action: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:DescribeKey'
        ],
        Resource: '*'
      }
    ]
  }
});
```

### Key Aliases

```bash
# Create key aliases for easier management
aws kms create-alias \
  --alias-name "alias/mytaptrack-prod-s3" \
  --target-key-id "12345678-1234-1234-1234-123456789012"

aws kms create-alias \
  --alias-name "alias/mytaptrack-prod-pii" \
  --target-key-id "87654321-4321-4321-4321-210987654321"
```

## Access Control and IAM

### IAM Policies for Parameter Store

#### Lambda Function Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": [
        "arn:aws:ssm:*:*:parameter/prod/app/*",
        "arn:aws:ssm:*:*:parameter/prod/external/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": [
        "arn:aws:kms:*:*:key/parameter-store-key-id"
      ]
    }
  ]
}
```

#### Admin Access Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter*",
        "ssm:PutParameter",
        "ssm:DeleteParameter*",
        "ssm:DescribeParameters"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:DescribeKey"
      ],
      "Resource": "*"
    }
  ]
}
```

### IAM Policies for Secrets Manager

#### Application Access Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:/prod/database/*",
        "arn:aws:secretsmanager:*:*:secret:/prod/twilio/*"
      ]
    }
  ]
}
```

#### Rotation Function Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:DescribeSecret",
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:UpdateSecretVersionStage"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "rds:ModifyDBInstance",
        "rds:DescribeDBInstances"
      ],
      "Resource": "*"
    }
  ]
}
```

## Application Integration

### Lambda Function Integration

#### Parameter Store Access

```typescript
// TypeScript example for Lambda function
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

export const getParameter = async (name: string, decrypt: boolean = false): Promise<string> => {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: decrypt
  });
  
  const response = await ssmClient.send(command);
  return response.Parameter?.Value || '';
};

// Usage in Lambda function
export const handler = async (event: any) => {
  const tokenKey = await getParameter('/prod/app/tokenKey', true);
  const domainName = await getParameter('/prod/domain/name');
  
  // Use parameters in application logic
};
```

#### Secrets Manager Access

```typescript
// TypeScript example for Secrets Manager
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

export const getSecret = async (secretId: string): Promise<any> => {
  const command = new GetSecretValueCommand({
    SecretId: secretId
  });
  
  const response = await secretsClient.send(command);
  return JSON.parse(response.SecretString || '{}');
};

// Usage for database connection
export const getDatabaseConnection = async () => {
  const dbCredentials = await getSecret('/prod/database/primary');
  
  return {
    host: dbCredentials.host,
    port: dbCredentials.port,
    username: dbCredentials.username,
    password: dbCredentials.password,
    database: dbCredentials.dbname
  };
};
```

### CDK Integration

#### Parameter Store in CDK

```typescript
// Access parameters in CDK stacks
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    
    // Get parameter value
    const domainName = StringParameter.valueForStringParameter(
      this, 
      '/prod/domain/name'
    );
    
    // Use in resource configuration
    const certificate = Certificate.fromCertificateArn(
      this,
      'Certificate',
      StringParameter.valueForStringParameter(this, '/prod/domain/cert/arn')
    );
  }
}
```

#### Secrets Manager in CDK

```typescript
// Reference secrets in CDK
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

const dbSecret = Secret.fromSecretNameV2(
  this,
  'DatabaseSecret',
  '/prod/database/primary'
);

// Use secret in RDS configuration
const database = new DatabaseCluster(this, 'Database', {
  credentials: Credentials.fromSecret(dbSecret),
  // ... other configuration
});
```

## Security Best Practices

### Secret Rotation

#### Automated Rotation Schedule

```yaml
# Rotation schedule for different secret types
secrets:
  database:
    rotation: 30 days
    method: automatic
    
  api_keys:
    rotation: 90 days
    method: manual
    
  certificates:
    rotation: 365 days
    method: automatic
    
  jwt_keys:
    rotation: 180 days
    method: manual
```

#### Rotation Procedures

1. **Database Credentials**
   ```bash
   # Enable automatic rotation
   aws secretsmanager update-secret \
     --secret-id "/prod/database/primary" \
     --rotation-lambda-arn "arn:aws:lambda:region:account:function:rotation-function" \
     --rotation-rules AutomaticallyAfterDays=30
   ```

2. **API Keys**
   ```bash
   # Manual rotation process
   # 1. Generate new key from service provider
   # 2. Update secret with new key
   # 3. Test new key functionality
   # 4. Update applications to use new key
   # 5. Revoke old key
   ```

### Access Auditing

#### CloudTrail Monitoring

```json
{
  "eventName": "GetParameter",
  "eventSource": "ssm.amazonaws.com",
  "userIdentity": {
    "type": "AssumedRole",
    "principalId": "AIDACKCEVSQ6C2EXAMPLE",
    "arn": "arn:aws:sts::123456789012:assumed-role/lambda-role/function-name"
  },
  "requestParameters": {
    "name": "/prod/app/tokenKey",
    "withDecryption": true
  }
}
```

#### Access Monitoring Alerts

```yaml
# CloudWatch alarms for secret access
alarms:
  - name: 'Unusual-Parameter-Access'
    metric: 'AWS/SSM/ParameterRequests'
    threshold: 100
    period: 300
    
  - name: 'Failed-Secret-Access'
    metric: 'AWS/SecretsManager/GetSecretValueErrors'
    threshold: 5
    period: 300
```

### Encryption Standards

#### Encryption at Rest

- **Parameter Store**: KMS encryption for SecureString parameters
- **Secrets Manager**: KMS encryption with customer-managed keys
- **S3**: Server-side encryption with KMS
- **DynamoDB**: Encryption at rest with customer-managed keys

#### Encryption in Transit

- **TLS 1.2+**: All API communications
- **VPC Endpoints**: Private network access to AWS services
- **Certificate Pinning**: Mobile applications

### Network Security

#### VPC Endpoints

```typescript
// VPC endpoints for secure access
const ssmEndpoint = new VpcEndpoint(this, 'SSMEndpoint', {
  vpc: vpc,
  service: VpcEndpointService.SSM,
  vpcEndpointType: VpcEndpointType.INTERFACE
});

const secretsEndpoint = new VpcEndpoint(this, 'SecretsEndpoint', {
  vpc: vpc,
  service: VpcEndpointService.SECRETS_MANAGER,
  vpcEndpointType: VpcEndpointType.INTERFACE
});
```

## Environment-Specific Configurations

### Development Environment

```yaml
# Simplified security for development
secrets:
  encryption: aws-managed-keys
  rotation: disabled
  access: relaxed-policies
  
parameters:
  debug: "true"
  logging: verbose
```

### Production Environment

```yaml
# Enhanced security for production
secrets:
  encryption: customer-managed-keys
  rotation: enabled
  access: least-privilege
  monitoring: comprehensive
  
parameters:
  debug: "false"
  logging: error-only
```

## Troubleshooting

### Common Issues

#### Parameter Not Found

```bash
# Check parameter exists
aws ssm describe-parameters --filters "Key=Name,Values=/prod/app/tokenKey"

# Check IAM permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::account:role/lambda-role \
  --action-names ssm:GetParameter \
  --resource-arns arn:aws:ssm:region:account:parameter/prod/app/tokenKey
```

#### KMS Access Denied

```bash
# Check KMS key policy
aws kms describe-key --key-id alias/parameter-store-key

# Test KMS permissions
aws kms decrypt \
  --ciphertext-blob fileb://encrypted-data \
  --key-id alias/parameter-store-key
```

#### Secret Rotation Failures

```bash
# Check rotation status
aws secretsmanager describe-secret --secret-id "/prod/database/primary"

# View rotation logs
aws logs filter-log-events \
  --log-group-name "/aws/lambda/rotation-function" \
  --start-time 1640995200000
```

### Debugging Tools

#### Parameter Validation Script

```bash
#!/bin/bash
# validate-parameters.sh

ENVIRONMENT=$1
REQUIRED_PARAMS=(
  "/$ENVIRONMENT/app/tokenKey"
  "/$ENVIRONMENT/domain/name"
  "/$ENVIRONMENT/stacks/core"
)

for param in "${REQUIRED_PARAMS[@]}"; do
  if aws ssm get-parameter --name "$param" >/dev/null 2>&1; then
    echo "✓ $param exists"
  else
    echo "✗ $param missing"
  fi
done
```

#### Secret Access Test

```typescript
// test-secret-access.ts
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const testSecretAccess = async (secretId: string) => {
  try {
    const client = new SecretsManagerClient({});
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await client.send(command);
    console.log(`✓ Successfully accessed secret: ${secretId}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to access secret: ${secretId}`, error);
    return false;
  }
};
```

## Next Steps

After setting up secrets management:

1. [Configure Monitoring and Alerting](../Monitoring/README.md)
2. [Set up Backup and Recovery](../Maintenance/disaster-recovery.md)
3. [Implement Security Monitoring](../../Architecture/Technology/security.md)
4. [Deploy Application Services](../Deployment/system-deployment.md)