# Development Environment Setup

This guide provides complete instructions for setting up a local development environment for MyTapTrack.

## Prerequisites

### Required Software

#### Node.js and npm
- **Node.js**: Version 16 or higher
- **npm**: Version 8 or higher (comes with Node.js)

**Installation:**
```bash
# Using Node Version Manager (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 16
nvm use 16

# Verify installation
node --version  # Should show v16.x.x or higher
npm --version   # Should show 8.x.x or higher
```

#### AWS CLI v2
Required for AWS service interaction and deployment.

**Installation:**
```bash
# macOS
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify installation
aws --version  # Should show aws-cli/2.x.x
```

#### AWS CDK v2
Infrastructure deployment tool.

**Installation:**
```bash
npm install -g aws-cdk@2.x

# Verify installation
cdk --version  # Should show 2.x.x
```

#### Git
Version control system.

**Installation:**
```bash
# macOS (using Homebrew)
brew install git

# Linux (Ubuntu/Debian)
sudo apt-get install git

# Verify installation
git --version
```

### Optional but Recommended

#### Docker
For local testing and containerized development.

**Installation:**
- Download Docker Desktop from https://www.docker.com/products/docker-desktop
- Follow platform-specific installation instructions

#### Visual Studio Code
Recommended IDE with excellent TypeScript support.

**Installation:**
- Download from https://code.visualstudio.com/
- Install recommended extensions:
  - TypeScript and JavaScript Language Features
  - AWS Toolkit
  - GitLens
  - Prettier - Code formatter
  - ESLint

## AWS Account Setup

### AWS Credentials Configuration

1. **Create AWS Account**: If you don't have one, create an AWS account at https://aws.amazon.com/

2. **Create IAM User**: Create an IAM user with programmatic access and appropriate permissions

3. **Configure AWS CLI**:
```bash
aws configure
# Enter your Access Key ID
# Enter your Secret Access Key
# Enter your default region (e.g., us-east-1)
# Enter default output format (json)
```

4. **Verify AWS Access**:
```bash
aws sts get-caller-identity
# Should return your user information
```

### CDK Bootstrap

Bootstrap CDK in your AWS account and region:

```bash
cdk bootstrap aws://ACCOUNT-NUMBER/REGION
# Replace ACCOUNT-NUMBER and REGION with your values
```

## Project Setup

### Clone Repository

```bash
git clone <repository-url>
cd mytaptrack
```

### Install Dependencies

The project uses a makefile for simplified dependency management:

```bash
# Install all dependencies and build all modules
make install

# Alternative: Install dependencies only
make install-deps
```

This command will:
1. Install root-level dependencies
2. Install dependencies for all modules (types, cdk, lib, core, api, data-prop, etc.)
3. Build all TypeScript projects in dependency order
4. Link local dependencies between modules

### Environment Configuration

1. **Copy Configuration Template**:
```bash
cp config/example_dev.yml config/dev.yml
```

2. **Edit Configuration**:
Edit `config/dev.yml` with your specific settings:
```yaml
# Example configuration
region: us-east-1
account: "123456789012"
stage: dev
domain: dev.mytaptrack.com
# ... other configuration parameters
```

3. **Set Environment Variables**:
```bash
make set-env STAGE=dev
```

### Initial Deployment

Deploy the core infrastructure:

```bash
# Deploy all stacks
make deploy

# Or deploy individual stacks in order
make deploy-core      # Core infrastructure first
make deploy-api       # API services
make deploy-data-prop # Data propagation
```

## Development Workflow

### Daily Development Commands

```bash
# Start development session
make set-env STAGE=dev

# Build all projects
make build

# Deploy changes
make deploy

# Run tests
make test

# Clean build artifacts
make clean
```

### Working with Individual Modules

Each module can be worked on independently:

```bash
# Navigate to specific module
cd api/

# Install module dependencies
npm install

# Build module
npm run build

# Run module-specific tests
npm test

# Deploy module (if it's a CDK stack)
npm run deploy
```

### Hot Reloading for Lambda Functions

For faster development of Lambda functions:

```bash
# Deploy with hot reload enabled
cdk deploy --hotswap

# Or use SAM for local testing
sam local start-api
```

## Verification Steps

### Verify Installation

Run these commands to verify your setup:

```bash
# Check Node.js and npm
node --version && npm --version

# Check AWS CLI and credentials
aws --version && aws sts get-caller-identity

# Check CDK
cdk --version

# Check project build
make build

# Check deployment (optional - requires AWS resources)
make deploy-core
```

### Test API Endpoints

After deployment, test the APIs:

```bash
# Test GraphQL endpoint
curl -X POST https://your-api-id.appsync-api.region.amazonaws.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query { __schema { types { name } } }"}'

# Test REST API
curl https://your-api-id.execute-api.region.amazonaws.com/dev/health
```

## Troubleshooting

### Common Issues and Solutions

#### Node.js Version Issues

**Problem**: Build fails with Node.js version errors
```
Error: This package requires Node.js version 16 or higher
```

**Solution**:
```bash
# Check current version
node --version

# Install correct version using nvm
nvm install 16
nvm use 16
nvm alias default 16
```

#### AWS Credentials Issues

**Problem**: AWS operations fail with credential errors
```
Error: Unable to locate credentials
```

**Solutions**:
```bash
# Reconfigure AWS CLI
aws configure

# Check current credentials
aws sts get-caller-identity

# Use AWS SSO (if applicable)
aws sso login --profile your-profile
```

#### CDK Bootstrap Issues

**Problem**: CDK deployment fails with bootstrap errors
```
Error: This stack uses assets, so the toolkit stack must be deployed
```

**Solution**:
```bash
# Bootstrap CDK in your account/region
cdk bootstrap aws://ACCOUNT-NUMBER/REGION

# Verify bootstrap
aws cloudformation describe-stacks --stack-name CDKToolkit
```

#### Dependency Installation Issues

**Problem**: npm install fails with permission or network errors

**Solutions**:
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Use different registry if network issues
npm install --registry https://registry.npmjs.org/
```

#### Build Failures

**Problem**: TypeScript compilation errors

**Solutions**:
```bash
# Clean all build artifacts
make clean

# Rebuild everything
make build

# Check individual module builds
cd problematic-module/
npm run build
```

#### Memory Issues During Build

**Problem**: Build fails with out-of-memory errors

**Solution**:
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
make build
```

#### CDK Deployment Issues

**Problem**: CDK deployment fails or hangs

**Solutions**:
```bash
# Check CDK diff first
cdk diff

# Deploy with verbose logging
cdk deploy --verbose

# Force deployment if stuck
cdk deploy --force

# Check CloudFormation events
aws cloudformation describe-stack-events --stack-name YourStackName
```

#### Local Testing Issues

**Problem**: Local tests fail to connect to AWS services

**Solutions**:
```bash
# Verify AWS credentials
aws sts get-caller-identity

# Check region configuration
aws configure get region

# Use LocalStack for local AWS services (optional)
docker run -p 4566:4566 localstack/localstack
```

### Getting Help

1. **Check Logs**: Always check CloudWatch logs for Lambda functions and API Gateway
2. **AWS Console**: Use AWS Console to inspect resources and their states
3. **CDK Documentation**: Refer to AWS CDK documentation for construct-specific issues
4. **Team Resources**: Check internal documentation and team knowledge base
5. **AWS Support**: For AWS-specific issues, consider AWS support channels

### Performance Optimization

#### Faster Builds
```bash
# Use parallel builds where possible
npm run build -- --parallel

# Skip unnecessary rebuilds
npm run build -- --incremental
```

#### Faster Deployments
```bash
# Deploy only changed stacks
cdk deploy --exclusively

# Use hotswap for Lambda changes
cdk deploy --hotswap
```

## Next Steps

After completing the environment setup:

1. **Read Coding Standards**: Review [coding-standards.md](./coding-standards.md)
2. **Understand Architecture**: Study [Architecture Documentation](../Architecture/README.md)
3. **Review Testing Guidelines**: Check [testing.md](./testing.md)
4. **Learn Contribution Workflow**: Read [contribution-workflow.md](./contribution-workflow.md)

## Environment Variables Reference

Key environment variables used in development:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=default

# CDK Configuration
CDK_DEFAULT_ACCOUNT=123456789012
CDK_DEFAULT_REGION=us-east-1

# Application Configuration
STAGE=dev
NODE_ENV=development

# Build Configuration
NODE_OPTIONS=--max-old-space-size=4096
```

## IDE Configuration

### Visual Studio Code Settings

Create `.vscode/settings.json`:
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.build": true
  }
}
```

### Recommended Extensions

Install these VS Code extensions:
- AWS Toolkit
- TypeScript and JavaScript Language Features
- ESLint
- Prettier - Code formatter
- GitLens
- Thunder Client (for API testing)