# Deployment Runbooks

This section contains comprehensive deployment procedures for the MyTapTrack system across all environments.

## Deployment Procedures

### Core Deployment Guides
- [System Deployment Overview](./system-deployment.md) - Complete system deployment process
- [Environment Setup](./environment-setup.md) - Environment-specific configuration
- [Stack Deployment Order](./stack-deployment.md) - Proper deployment sequence
- [Configuration Management](./configuration-management.md) - Managing environment configs

### Environment-Specific Procedures
- [Development Environment](./dev-deployment.md) - Local and dev environment setup
- [Test Environment](./test-deployment.md) - Test environment deployment
- [Production Environment](./prod-deployment.md) - Production deployment procedures

### Troubleshooting
- [Common Deployment Issues](./deployment-troubleshooting.md) - Solutions for frequent problems
- [CDK Troubleshooting](./cdk-troubleshooting.md) - CDK-specific issues and fixes
- [AWS Service Issues](./aws-service-troubleshooting.md) - AWS service deployment problems

## Quick Reference

### Essential Commands
```bash
# Full system deployment
make install STAGE=dev

# Individual stack deployment
make deploy-core STAGE=dev
make deploy-api STAGE=dev
make deploy-data-prop STAGE=dev

# Environment management
make set-env STAGE=dev
make configure-env STAGE=dev
```

### Prerequisites Checklist
- [ ] AWS CLI configured with appropriate credentials
- [ ] Node.js 16+ installed
- [ ] AWS CDK v2 installed globally
- [ ] Environment configuration files prepared
- [ ] Required AWS permissions verified

### Deployment Verification
- [ ] All stacks deployed successfully
- [ ] Health checks passing
- [ ] API endpoints responding
- [ ] Database connections established
- [ ] Monitoring and alerting configured