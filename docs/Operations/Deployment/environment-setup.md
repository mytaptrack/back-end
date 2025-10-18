# Environment Setup Guide

## Overview

This guide covers the setup and configuration of different environments for the MyTapTrack system, including development, test, and production environments.

## Environment Types

### Development Environment
- **Purpose**: Local development and feature testing
- **Resources**: Minimal AWS resources for cost efficiency
- **Data**: Test data and mock services
- **Access**: Development team members

### Test Environment  
- **Purpose**: Integration testing and QA validation
- **Resources**: Production-like but smaller scale
- **Data**: Anonymized production data or comprehensive test datasets
- **Access**: QA team, stakeholders, automated testing

### Production Environment
- **Purpose**: Live system serving real users
- **Resources**: Full-scale, high-availability configuration
- **Data**: Live production data
- **Access**: Restricted to operations team and authorized personnel

## Configuration Management

### Configuration File Structure

The system uses a hierarchical configuration approach:

```
config/
├── dev.yml              # Development environment
├── test.yml             # Test environment  
├── prod.yml             # Production environment
├── dev-min.yml          # Minimal dev configuration
└── example_prod.yml     # Production template
```

### Configuration Hierarchy

Configuration inheritance follows this pattern:
1. Base configuration (in code defaults)
2. Environment-specific file (`{stage}.yml`)
3. Environment variables (highest priority)

### Required Configuration Parameters

#### Core Infrastructure Settings
```yaml
# AWS Configuration
aws:
  region: us-east-1
  account: "123456789012"

# Application Settings
app:
  name: mytaptrack
  stage: dev
  domain: dev.mytaptrack.com

# Database Configuration
database:
  billingMode: PAY_PER_REQUEST  # or PROVISIONED for production
  pointInTimeRecovery: false    # true for production
  deletionProtection: false     # true for production

# Cognito Configuration
cognito:
  userPoolName: mytaptrack-users-dev
  passwordPolicy:
    minLength: 8
    requireNumbers: true
    requireSymbols: false
    requireUppercase: true
    requireLowercase: true
```

#### Environment-Specific Variations

**Development (`dev.yml`)**:
```yaml
app:
  stage: dev
  logLevel: DEBUG
  
database:
  billingMode: PAY_PER_REQUEST
  pointInTimeRecovery: false
  deletionProtection: false

monitoring:
  detailedMetrics: false
  xrayTracing: false
```

**Production (`prod.yml`)**:
```yaml
app:
  stage: prod
  logLevel: INFO
  domain: mytaptrack.com

database:
  billingMode: PROVISIONED
  readCapacity: 100
  writeCapacity: 50
  pointInTimeRecovery: true
  deletionProtection: true

monitoring:
  detailedMetrics: true
  xrayTracing: true
  alarmNotifications: true
```

## Environment Setup Procedures

### Development Environment Setup

#### Prerequisites
- AWS CLI configured with development account credentials
- Node.js 16+ installed locally
- Git repository access

#### Setup Steps

1. **Clone and Prepare Repository**
```bash
git clone <repository-url>
cd mytaptrack
npm install
```

2. **Configure AWS Credentials**
```bash
# Configure AWS CLI for development account
aws configure --profile mytaptrack-dev
# or use AWS SSO
aws sso login --profile mytaptrack-dev
```

3. **Set Environment Variables**
```bash
export AWS_PROFILE=mytaptrack-dev
export AWS_REGION=us-east-1
export STAGE=dev
```

4. **Deploy Development Environment**
```bash
make install STAGE=dev
```

5. **Verify Setup**
```bash
# Test API connectivity
curl https://api-dev.mytaptrack.com/health

# Run basic system tests
make test STAGE=dev
```

### Test Environment Setup

#### Prerequisites
- Production-like AWS account or isolated test account
- CI/CD pipeline access for automated deployments
- Test data preparation

#### Setup Steps

1. **Prepare Configuration**
```bash
# Copy and customize test configuration
cp config/example_test.yml config/test.yml
# Edit test.yml with appropriate values
```

2. **Deploy Test Environment**
```bash
# Set test environment variables
make set-env STAGE=test

# Deploy all stacks
make install STAGE=test
```

3. **Load Test Data**
```bash
# Run data seeding scripts
npm run seed-test-data --stage=test

# Verify data loading
npm run verify-test-data --stage=test
```

4. **Configure Automated Testing**
```bash
# Set up system test schedule
npm run setup-test-automation --stage=test
```

### Production Environment Setup

#### Prerequisites
- Production AWS account with proper security controls
- Domain names and SSL certificates
- Backup and monitoring systems ready
- Change management approval

#### Setup Steps

1. **Security Review**
- [ ] IAM roles and policies reviewed
- [ ] Network security groups configured
- [ ] Encryption settings verified
- [ ] Access controls implemented

2. **Prepare Production Configuration**
```bash
# Copy and customize production configuration
cp config/example_prod.yml config/prod.yml
# Review all production settings carefully
```

3. **Pre-Deployment Verification**
```bash
# Validate configuration
npm run validate-config --stage=prod

# Security scan
npm run security-scan --stage=prod

# Dry-run deployment
cdk diff --profile=mytaptrack-prod
```

4. **Deploy Production Environment**
```bash
# Set production environment
make set-env STAGE=prod

# Deploy with extra verification
make install STAGE=prod --confirm-production
```

5. **Post-Deployment Verification**
```bash
# Comprehensive system verification
make verify-production STAGE=prod

# Performance baseline
npm run performance-baseline --stage=prod
```

## Environment Management Commands

### Common Operations

```bash
# List all environments
make list-environments

# Switch between environments
make set-env STAGE={stage}

# View current environment status
make status STAGE={stage}

# Update environment configuration
make configure-env STAGE={stage}

# Clean up environment
make clean-env STAGE={stage}
```

### Environment Variables

#### Required Environment Variables
```bash
export AWS_PROFILE=mytaptrack-{stage}
export AWS_REGION=us-east-1
export STAGE={stage}
export CDK_DEFAULT_ACCOUNT={account-id}
export CDK_DEFAULT_REGION=us-east-1
```

#### Optional Environment Variables
```bash
export LOG_LEVEL=INFO
export DEBUG_MODE=false
export ENABLE_XRAY=true
export NOTIFICATION_EMAIL=ops@company.com
```

## Security Considerations

### Development Environment
- Use separate AWS account or strict IAM boundaries
- Enable CloudTrail for audit logging
- Implement resource tagging for cost tracking
- Regular security scans and updates

### Test Environment
- Mirror production security controls
- Use anonymized or synthetic test data
- Implement data retention policies
- Regular penetration testing

### Production Environment
- Multi-factor authentication required
- Principle of least privilege access
- Comprehensive audit logging
- Regular security assessments
- Incident response procedures

## Monitoring and Alerting Setup

### CloudWatch Configuration

```yaml
monitoring:
  dashboards:
    - name: "System Overview"
      widgets: ["API Metrics", "Database Performance", "Error Rates"]
    - name: "Performance"
      widgets: ["Response Times", "Throughput", "Resource Utilization"]

  alarms:
    - name: "High Error Rate"
      metric: "ErrorRate"
      threshold: 5
      period: 300
    - name: "Database Connection Issues"
      metric: "DatabaseConnections"
      threshold: 100
      period: 60
```

### Notification Setup

```bash
# Configure SNS topics for alerts
aws sns create-topic --name mytaptrack-alerts-{stage}

# Subscribe email endpoints
aws sns subscribe \
  --topic-arn arn:aws:sns:region:account:mytaptrack-alerts-{stage} \
  --protocol email \
  --notification-endpoint ops@company.com
```

## Backup and Recovery

### Development Environment
- Daily automated backups
- 7-day retention period
- Point-in-time recovery enabled for databases

### Test Environment
- Daily automated backups
- 30-day retention period
- Cross-region backup replication

### Production Environment
- Continuous backup with point-in-time recovery
- 90-day retention period
- Cross-region and cross-account backup replication
- Regular restore testing procedures

## Cost Management

### Development Environment
- Use PAY_PER_REQUEST billing for DynamoDB
- Implement auto-shutdown for non-essential resources
- Regular cost monitoring and optimization

### Test Environment
- Scheduled resource scaling based on testing schedules
- Cost allocation tags for different test suites
- Monthly cost reviews and optimization

### Production Environment
- Reserved instances for predictable workloads
- Auto-scaling for variable workloads
- Comprehensive cost monitoring and budgets
- Regular architecture reviews for cost optimization

## Troubleshooting Environment Issues

### Common Configuration Problems

**Invalid Configuration File**
```bash
# Validate configuration syntax
npm run validate-config --stage={stage}

# Check for missing required parameters
npm run check-config-completeness --stage={stage}
```

**AWS Credential Issues**
```bash
# Verify AWS credentials
aws sts get-caller-identity --profile=mytaptrack-{stage}

# Check permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::account:role/deployment-role \
  --action-names cloudformation:CreateStack \
  --resource-arns "*"
```

**Environment Conflicts**
```bash
# Check for existing resources
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE

# Verify unique naming
npm run check-resource-conflicts --stage={stage}
```

### Recovery Procedures

**Environment Corruption**
1. Export critical data if possible
2. Document the issue for post-mortem
3. Destroy corrupted environment: `make destroy STAGE={stage}`
4. Redeploy from clean state: `make install STAGE={stage}`
5. Restore data from backups if needed

**Partial Deployment Failures**
1. Identify failed components: `cdk list --stage={stage}`
2. Check CloudFormation events for error details
3. Fix underlying issues (permissions, conflicts, etc.)
4. Retry deployment: `make deploy STAGE={stage}`
5. Verify system integrity after recovery

## Documentation Maintenance

### Regular Updates Required
- [ ] Configuration parameter documentation
- [ ] Environment-specific procedures
- [ ] Contact information and escalation paths
- [ ] Security requirements and compliance
- [ ] Cost optimization recommendations

### Change Management
- All environment changes must be documented
- Configuration changes require peer review
- Production changes require change management approval
- Regular audits of environment configurations