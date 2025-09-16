# Project Structure

## Root Level Organization

The repository follows a modular monorepo structure with clear separation of concerns:

```
/
├── types/          # Shared TypeScript type definitions
├── cdk/            # Reusable CDK constructs and utilities
├── lib/            # Shared business logic and data access layer
├── core/           # Core AWS infrastructure stack
├── api/            # API services (GraphQL, REST, Device APIs)
├── data-prop/      # Data propagation and event processing
├── system-tests/   # End-to-end system validation
├── cicd/           # CI/CD pipeline infrastructure
├── config/         # Environment configuration files
└── utils/          # Deployment and environment utilities
```

## Module Types

### NodeJS Modules (Shared Libraries)
- **`/types`**: Central type definitions used across all services
- **`/cdk`**: Reusable CDK constructs and infrastructure patterns
- **`/lib`**: Business logic, data access layer, and shared utilities

### AWS CDK Stacks (Deployable Services)
- **`/core`**: Foundation infrastructure (databases, Cognito, EventBridge)
- **`/api`**: All API services (GraphQL, REST, device communication)
- **`/data-prop`**: Event-driven data processing and propagation
- **`/cicd`**: Build and deployment pipeline

### Supporting Components
- **`/system-tests`**: Integration and system-level testing
- **`/config`**: Environment-specific configuration files
- **`/utils`**: Environment management and deployment scripts

## Key Conventions

### File Organization
- Each module has its own `package.json` with local dependencies
- TypeScript source in `src/` directories
- CDK infrastructure code in `lib/` directories
- Build outputs in `dist/` or `.build/` directories

### Dependency Flow
```
types → cdk → lib → [core, api, data-prop]
                 ↘ system-tests
```

### GraphQL Structure (in `/api`)
- Schema files: `src/graphql/*.graphql`
- Resolvers: `src/graphql/resolver/` (mutations, queries, subscriptions)
- API definitions: `lib/api-v2-subs/` (modular API groupings)

### Lambda Functions
- Device functions: `api/src/device/functions/`
- Data processing: `data-prop/src/functions/`
- Shared library: `api/src/device/library/`

### Configuration Management
- Environment configs: `config/*.yml`
- CDK context: `*/cdk.json` files
- TypeScript configs: `*/tsconfig.json` files

## Build Dependencies

Modules must be built in dependency order:
1. `types` (foundational types)
2. `cdk` (infrastructure constructs)  
3. `lib` (business logic)
4. Individual stacks (`core`, `api`, `data-prop`)

The makefile handles this dependency chain automatically.