# Development Documentation

This section contains guides and workflows for developers contributing to the MyTapTrack codebase.

## Contents

- [Development Environment Setup](./environment-setup.md) - Complete local development setup guide
- [Coding Standards](./coding-standards.md) - TypeScript, AWS CDK, and code quality standards
- [Testing Guidelines](./testing.md) - Unit, integration, and E2E testing procedures
- [Contribution Workflow](./contribution-workflow.md) - Git workflow, PR process, and testing requirements

## Quick Start

1. **Environment Setup**: [Complete local development setup](./environment-setup.md)
2. **Coding Standards**: [TypeScript and AWS CDK best practices](./coding-standards.md)
3. **Testing**: [Comprehensive testing guidelines](./testing.md)
4. **Contributing**: [Git workflow and contribution process](./contribution-workflow.md)

## Development Workflow

```bash
# Install dependencies and build
make install

# Set up development environment
make set-env STAGE=dev

# Deploy to development
make deploy

# Run tests
make test
```

## Key Concepts

- **Modular Architecture**: Understanding the monorepo structure
- **TypeScript Standards**: Type safety and code organization
- **AWS CDK Patterns**: Infrastructure as code best practices
- **Testing Strategy**: Unit, integration, and system testing approaches