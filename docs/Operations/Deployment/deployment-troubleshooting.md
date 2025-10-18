# Deployment Troubleshooting Guide

## Overview

This guide provides solutions for common deployment issues encountered when deploying the MyTapTrack system. Issues are organized by category with step-by-step resolution procedures.

## Quick Diagnosis

### Deployment Status Check
```bash
# Check CloudFormation stack status
aws cloudformation describe-stacks --stack-name mytaptrack-{component}-{stage}

# List all stacks and their status
aws cloudformation list-stacks --stack-status-filter CREATE_IN_PROGRESS UPDATE_IN_PROGRESS ROLLBACK_IN_PROGRESS

# Check CDK deployment status
cdk list --stage={stage}
```

### Log Analysis
```bash
# View CloudFormation events
aws cloudformation describe-stack-events --stack-name mytaptrack-{component}-{stage}

# Check CDK deployment logs
cdk deploy --verbose --stage={stage}

# View Lambda function logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/mytaptrack"
```

## Common Deployment Issues

### 1. CDK Bootstrap Issues

#### Symptoms
- Error: "This stack uses assets, so the toolkit stack must be deployed"
- Error: "Unable to resolve AWS account to use"

#### Diagnosis
```bash
# Check if CDK is bootstrapped
aws cloudformation describe-stacks --stack-name CDKToolkit

# Verify AWS credentials
aws sts get-caller-identity
```

#### Resolution
```bash
# Bootstrap CDK for the account/region
cdk bootstrap aws://{account-id}/{region}

# If using specific profile
cdk bootstrap aws://{account-id}/{region} --profile mytaptrack-{stage}

# Verify bootstrap
aws cloudformation describe-stacks --stack-name CDKToolkit
```

#### Prevention
- Always bootstrap new AWS accounts/regions before first deployment
- Document bootstrap status for each environment
- Include bootstrap verification in deployment procedures

### 2. IAM Permission Errors

#### Symptoms
- Error: "User is not authorized to perform: iam:CreateRole"
- Error: "Access Denied" during CloudFormation operations
- Error: "Insufficient permissions to access this resource"

#### Diagnosis
```bash
# Check current user/role permissions
aws sts get-caller-identity

# Test specific permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::{account}:user/{username} \
  --action-names cloudformation:CreateStack \
  --resource-arns "*"
```

#### Resolution

**For Development/Test Environments:**
```bash
# Attach AdministratorAccess policy (temporary)
aws iam attach-user-policy \
  --user-name {username} \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

**For Production Environments:**
Create specific deployment role with required permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "iam:*",
        "lambda:*",
        "dynamodb:*",
        "s3:*",
        "cognito-idp:*",
        "events:*",
        "appsync:*",
        "logs:*"
      ],
      "Resource": "*"
    }
  ]
}
```

#### Prevention
- Use deployment-specific IAM roles
- Document required permissions for each environment
- Regular permission audits and principle of least privilege

### 3. Resource Naming Conflicts

#### Symptoms
- Error: "Resource already exists"
- Error: "Bucket name already exists"
- Error: "User pool name already in use"

#### Diagnosis
```bash
# Check for existing resources
aws dynamodb list-tables
aws s3 ls
aws cognito-idp list-user-pools --max-results 10

# Search for resources by name pattern
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=Project,Values=mytaptrack
```

#### Resolution

**Option 1: Use Different Names**
```bash
# Update configuration with unique names
# Edit config/{stage}.yml to include unique suffixes
app:
  name: mytaptrack-{unique-suffix}
  stage: {stage}
```

**Option 2: Remove Conflicting Resources**
```bash
# CAUTION: Only if resources are not in use
aws dynamodb delete-table --table-name {conflicting-table}
aws s3 rb s3://{conflicting-bucket} --force
```

**Option 3: Import Existing Resources**
```bash
# Import existing resources into CDK stack
cdk import --stage={stage}
```

#### Prevention
- Use environment-specific naming conventions
- Include random suffixes for globally unique resources
- Implement resource tagging strategy
- Document resource naming standards

### 4. Dependency Issues

#### Symptoms
- Error: "Resource does not exist" when referencing other stacks
- Error: "Circular dependency detected"
- Deployment succeeds but resources can't communicate

#### Diagnosis
```bash
# Check stack dependencies
cdk list --stage={stage}

# Verify stack outputs and imports
aws cloudformation describe-stacks --stack-name mytaptrack-core-{stage} \
  --query 'Stacks[0].Outputs'

# Check cross-stack references
aws cloudformation list-imports --export-name {export-name}
```

#### Resolution

**Deploy in Correct Order:**
```bash
# Always deploy in dependency order
make deploy-core STAGE={stage}      # First - databases, Cognito
make deploy-api STAGE={stage}       # Second - APIs depend on core
make deploy-data-prop STAGE={stage} # Third - depends on both
```

**Fix Circular Dependencies:**
1. Identify the circular reference in CDK code
2. Move shared resources to a common stack
3. Use explicit resource ARNs instead of references where possible

**Verify Cross-Stack References:**
```bash
# Check that exports exist
aws cloudformation list-exports

# Verify imports are working
aws cloudformation describe-stack-resources \
  --stack-name mytaptrack-api-{stage}
```

#### Prevention
- Document stack dependencies clearly
- Use automated deployment scripts that enforce order
- Regular dependency analysis and cleanup
- Avoid circular references in design phase

### 5. Lambda Deployment Issues

#### Symptoms
- Error: "Code size exceeds maximum allowed size"
- Error: "Function does not exist"
- Lambda functions not updating with new code

#### Diagnosis
```bash
# Check Lambda function status
aws lambda get-function --function-name mytaptrack-{function}-{stage}

# Check function size
aws lambda get-function --function-name mytaptrack-{function}-{stage} \
  --query 'Configuration.CodeSize'

# View function logs
aws logs tail /aws/lambda/mytaptrack-{function}-{stage}
```

#### Resolution

**Code Size Issues:**
```bash
# Clean and rebuild
make clean
make build

# Check for large dependencies
npm ls --depth=0
du -sh node_modules/*

# Optimize bundle size
npm run bundle-analyze
```

**Function Update Issues:**
```bash
# Force function update
aws lambda update-function-code \
  --function-name mytaptrack-{function}-{stage} \
  --zip-file fileb://function.zip

# Verify update
aws lambda get-function --function-name mytaptrack-{function}-{stage} \
  --query 'Configuration.LastModified'
```

#### Prevention
- Regular dependency audits and cleanup
- Implement bundle size monitoring
- Use Lambda layers for shared dependencies
- Optimize build process for smaller bundles

### 6. Database Deployment Issues

#### Symptoms
- Error: "Table already exists"
- Error: "Insufficient permissions to create table"
- DynamoDB tables not accessible after deployment

#### Diagnosis
```bash
# Check table status
aws dynamodb describe-table --table-name mytaptrack-{table}-{stage}

# List all tables
aws dynamodb list-tables

# Check table permissions
aws dynamodb describe-table --table-name mytaptrack-{table}-{stage} \
  --query 'Table.TableStatus'
```

#### Resolution

**Table Exists Error:**
```bash
# Check if table is from previous deployment
aws dynamodb describe-table --table-name mytaptrack-{table}-{stage}

# If safe to delete (development only)
aws dynamodb delete-table --table-name mytaptrack-{table}-{stage}

# Wait for deletion to complete
aws dynamodb wait table-not-exists --table-name mytaptrack-{table}-{stage}
```

**Permission Issues:**
```bash
# Verify DynamoDB permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::{account}:role/{role} \
  --action-names dynamodb:CreateTable \
  --resource-arns "*"
```

#### Prevention
- Use unique table names per environment
- Implement proper IAM policies for DynamoDB
- Regular backup and restore testing
- Document table schemas and dependencies

## Environment-Specific Issues

### Development Environment

**Common Issues:**
- Resource conflicts from multiple developers
- Insufficient AWS credits/limits
- Local configuration inconsistencies

**Solutions:**
```bash
# Use developer-specific prefixes
export DEVELOPER_PREFIX=${USER}
make install STAGE=dev-${DEVELOPER_PREFIX}

# Check AWS limits
aws service-quotas get-service-quota \
  --service-code lambda \
  --quota-code L-B99A9384
```

### Test Environment

**Common Issues:**
- Test data conflicts
- CI/CD pipeline failures
- Performance test resource limits

**Solutions:**
```bash
# Clean test data between runs
npm run clean-test-data --stage=test

# Verify CI/CD permissions
aws sts assume-role --role-arn arn:aws:iam::{account}:role/ci-cd-role \
  --role-session-name test-deployment
```

### Production Environment

**Common Issues:**
- Change management approval delays
- Resource scaling limitations
- Security policy conflicts

**Solutions:**
- Follow established change management procedures
- Pre-approve emergency deployment procedures
- Regular capacity planning and scaling tests

## Advanced Troubleshooting

### CloudFormation Stack Analysis

```bash
# Get detailed stack information
aws cloudformation describe-stacks --stack-name {stack-name} \
  --query 'Stacks[0].[StackStatus,StackStatusReason]'

# Analyze failed resources
aws cloudformation describe-stack-events --stack-name {stack-name} \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'

# Check stack drift
aws cloudformation detect-stack-drift --stack-name {stack-name}
```

### Network and Connectivity Issues

```bash
# Test API connectivity
curl -v https://api-{stage}.mytaptrack.com/health

# Check DNS resolution
nslookup api-{stage}.mytaptrack.com

# Test database connectivity
aws dynamodb scan --table-name mytaptrack-users-{stage} --limit 1
```

### Performance Issues During Deployment

```bash
# Monitor deployment progress
watch -n 30 'aws cloudformation describe-stack-events --stack-name {stack-name} --max-items 5'

# Check resource utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFormation \
  --metric-name StackCreationTime \
  --start-time 2023-01-01T00:00:00Z \
  --end-time 2023-01-02T00:00:00Z \
  --period 3600 \
  --statistics Average
```

## Recovery Procedures

### Partial Deployment Failure

1. **Assess the Situation**
```bash
# Identify what deployed successfully
aws cloudformation describe-stack-resources --stack-name {stack-name}

# Check for data integrity issues
npm run verify-data-integrity --stage={stage}
```

2. **Rollback Strategy**
```bash
# Rollback specific stack
aws cloudformation cancel-update-stack --stack-name {stack-name}

# Or complete rollback
cdk destroy {stack-name} --stage={stage}
```

3. **Clean Deployment**
```bash
# Clean environment
make clean-env STAGE={stage}

# Fresh deployment
make install STAGE={stage}
```

### Complete System Recovery

1. **Data Backup** (if applicable)
```bash
# Export critical data
aws dynamodb scan --table-name mytaptrack-users-{stage} > users-backup.json
```

2. **Environment Cleanup**
```bash
# Destroy all stacks
make destroy-all STAGE={stage}

# Clean local environment
make clean
```

3. **Fresh Deployment**
```bash
# Redeploy from scratch
make install STAGE={stage}

# Restore data if needed
aws dynamodb batch-write-item --request-items file://users-backup.json
```

## Escalation Procedures

### When to Escalate

- Deployment failures affecting production
- Security-related deployment issues
- Data loss or corruption during deployment
- Repeated failures despite following troubleshooting steps

### Escalation Contacts

1. **Level 1**: Development Team Lead
   - Email: dev-lead@company.com
   - Phone: +1-xxx-xxx-xxxx
   - Slack: @dev-lead

2. **Level 2**: DevOps Engineer
   - Email: devops@company.com
   - Phone: +1-xxx-xxx-xxxx
   - Slack: @devops-team

3. **Level 3**: System Architect
   - Email: architect@company.com
   - Phone: +1-xxx-xxx-xxxx
   - Slack: @system-architect

4. **Level 4**: CTO/Technical Director
   - Email: cto@company.com
   - Phone: +1-xxx-xxx-xxxx

### Escalation Information to Provide

- Environment affected (dev/test/prod)
- Deployment command that failed
- Complete error messages and logs
- Steps already attempted
- Business impact assessment
- Timeline requirements

## Prevention and Best Practices

### Pre-Deployment Checklist

- [ ] Configuration files validated
- [ ] AWS credentials verified
- [ ] Dependencies up to date
- [ ] Previous deployment successful
- [ ] Backup procedures in place
- [ ] Rollback plan prepared

### Monitoring and Alerting

- Set up CloudWatch alarms for deployment failures
- Monitor CloudFormation stack events
- Track deployment duration and success rates
- Alert on resource limit approaches

### Documentation Maintenance

- Update troubleshooting guide after each incident
- Document new error patterns and solutions
- Regular review of escalation procedures
- Keep contact information current

### Regular Maintenance

- Monthly review of deployment procedures
- Quarterly disaster recovery testing
- Annual security and compliance audits
- Continuous improvement based on incident analysis