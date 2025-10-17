# System Deployment Runbook

## Overview

This runbook provides step-by-step procedures for deploying the complete MyTapTrack system to any environment (dev, test, prod).

## Prerequisites

### Required Tools
- AWS CLI v2.x configured with appropriate credentials
- Node.js 16+ with npm
- AWS CDK v2.x installed globally (`npm install -g aws-cdk`)
- Git access to the repository

### AWS Permissions Required
- CloudFormation full access
- IAM role creation and management
- Lambda function deployment
- DynamoDB table creation
- S3 bucket management
- Cognito User Pool management
- EventBridge rule management
- AppSync API management

### Environment Preparation
- Environment configuration file prepared (`config/{stage}.yml`)
- AWS account and region identified
- Domain names and certificates ready (for production)

## Deployment Procedure

### Step 1: Repository Setup

```bash
# Clone the repository
git clone <repository-url>
cd mytaptrack

# Verify you're on the correct branch
git branch
git status
```

**Verification**: Confirm you have the latest code and are on the intended branch.

### Step 2: Install Dependencies and Build

```bash
# Install all dependencies and build all modules
make install-deps

# Build all TypeScript projects
make build
```

**Verification**: 
- All `npm install` commands complete successfully
- All TypeScript compilation completes without errors
- Check for any build warnings that need attention

### Step 3: Environment Configuration

```bash
# Set environment variables for the target stage
make set-env STAGE={stage}

# Configure environment-specific settings
make configure-env STAGE={stage}
```

**Verification**:
- Environment variables are set correctly
- Configuration files are loaded properly
- AWS credentials are working: `aws sts get-caller-identity`

### Step 4: Deploy Core Infrastructure

```bash
# Deploy the core stack first (databases, Cognito, EventBridge)
make deploy-core STAGE={stage}
```

**Expected Duration**: 10-15 minutes

**Verification**:
- CloudFormation stack `mytaptrack-core-{stage}` shows CREATE_COMPLETE
- DynamoDB tables are created and accessible
- Cognito User Pool is configured
- EventBridge is set up with proper rules

**Rollback**: If deployment fails, run `cdk destroy mytaptrack-core-{stage}`

### Step 5: Deploy API Services

```bash
# Deploy GraphQL and REST APIs
make deploy-api STAGE={stage}
```

**Expected Duration**: 8-12 minutes

**Verification**:
- CloudFormation stack `mytaptrack-api-{stage}` shows CREATE_COMPLETE
- AppSync GraphQL API is accessible
- Lambda functions are deployed and healthy
- API Gateway endpoints are responding

**Rollback**: If deployment fails, run `cdk destroy mytaptrack-api-{stage}`

### Step 6: Deploy Data Propagation

```bash
# Deploy event processing and data propagation
make deploy-data-prop STAGE={stage}
```

**Expected Duration**: 5-8 minutes

**Verification**:
- CloudFormation stack `mytaptrack-data-prop-{stage}` shows CREATE_COMPLETE
- EventBridge rules are active
- Lambda functions for data processing are deployed
- Data flow between services is working

**Rollback**: If deployment fails, run `cdk destroy mytaptrack-data-prop-{stage}`

### Step 7: System Verification

```bash
# Run system tests to verify deployment
make test STAGE={stage}
```

**Verification Checklist**:
- [ ] All API endpoints return expected responses
- [ ] Database connections are working
- [ ] Authentication flows are functional
- [ ] Event processing is working
- [ ] Monitoring and logging are active

## Post-Deployment Tasks

### Configure Monitoring
1. Verify CloudWatch dashboards are created
2. Check that alarms are configured and active
3. Test notification channels (SNS topics)
4. Verify log groups are created with proper retention

### Security Verification
1. Review IAM roles and policies
2. Verify Cognito User Pool configuration
3. Check API authentication requirements
4. Validate encryption settings

### Performance Baseline
1. Record initial performance metrics
2. Set up performance monitoring
3. Configure auto-scaling if applicable
4. Document expected load patterns

## Environment-Specific Notes

### Development Environment
- Uses minimal resources for cost optimization
- Debug logging enabled
- Relaxed CORS policies for development
- Test data seeding may be enabled

### Test Environment
- Production-like configuration
- Automated testing enabled
- Performance testing capabilities
- Data anonymization for testing

### Production Environment
- High availability configuration
- Strict security policies
- Comprehensive monitoring and alerting
- Backup and disaster recovery enabled
- Domain names and SSL certificates configured

## Troubleshooting Common Issues

### CDK Bootstrap Issues
```bash
# If CDK bootstrap is required
cdk bootstrap aws://{account-id}/{region}
```

### Permission Errors
- Verify AWS credentials: `aws sts get-caller-identity`
- Check IAM permissions for CloudFormation and service creation
- Ensure CDK execution role has sufficient permissions

### Stack Dependencies
- Always deploy in order: core → api → data-prop
- If a stack fails, check dependencies are deployed first
- Use `cdk list` to see all available stacks

### Resource Conflicts
- Check for existing resources with same names
- Verify region and account settings
- Use unique stack names for different environments

## Rollback Procedures

### Complete System Rollback
```bash
# Destroy all stacks in reverse order
cdk destroy mytaptrack-data-prop-{stage}
cdk destroy mytaptrack-api-{stage}
cdk destroy mytaptrack-core-{stage}

# Clean up environment
make del-env STAGE={stage}
```

### Partial Rollback
- Individual stacks can be rolled back independently
- Always consider dependencies when rolling back
- Verify data integrity after rollback operations

## Emergency Contacts

### Escalation Path
1. **Level 1**: Development Team Lead
2. **Level 2**: DevOps Engineer
3. **Level 3**: System Architect
4. **Level 4**: CTO/Technical Director

### Contact Information
- **Development Team**: [team-email@company.com]
- **DevOps On-Call**: [devops-oncall@company.com]
- **Emergency Hotline**: [emergency-number]

## Documentation Updates

After successful deployment:
1. Update this runbook with any lessons learned
2. Document any environment-specific configurations
3. Update troubleshooting section with new issues encountered
4. Verify all contact information is current