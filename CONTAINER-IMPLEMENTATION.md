# Container Implementation Summary

## Overview

A containerized local development environment has been created for MyTapTrack, allowing development without AWS dependencies.

## Components Created

### 1. Docker Configuration

**docker-compose.yml** (root)
- DynamoDB Local container (port 8000)
- RabbitMQ container (ports 5672, 15672)
- GraphQL API container (port 4000)
- Persistent volumes for data
- Network configuration

**api/Dockerfile**
- Node.js 16 Alpine base
- Installs dependencies
- Copies source code
- Runs entrypoint script

**api/.dockerignore**
- Excludes node_modules, build artifacts, etc.

### 2. GraphQL Server

**api/src/container/server.ts**
- Express-based GraphQL server
- Auto-discovers and loads resolvers from:
  - `src/graphql/resolver/query/`
  - `src/graphql/resolver/mutations/`
- Wraps AppSync Lambda resolvers for Express
- Transforms Express requests to AppSync event format
- Injects DynamoDB client and RabbitMQ channel
- Serves GraphiQL playground

**api/src/container/resolver-wrapper.ts**
- Helper functions for wrapping resolvers
- Context creation utilities

**api/src/container/config.ts**
- Centralized configuration
- Environment variable management

### 3. Database Initialization

**api/src/container/init-tables.ts**
- Creates DynamoDB tables:
  - `mytaptrack-data` (with GSI)
  - `mytaptrack-primary`
- Checks for existing tables
- Configurable via environment

**api/src/container/entrypoint.sh**
- Waits for DynamoDB and RabbitMQ
- Initializes tables
- Starts GraphQL server

### 4. Makefile Commands

Added to root Makefile:
- `make container-up` - Start all containers
- `make container-down` - Stop all containers
- `make container-logs` - View container logs
- `make container-init` - Initialize DynamoDB tables

### 5. Package Configuration

**api/package.json** updates:
- Added `express-graphql` dependency
- Added `amqplib` for RabbitMQ
- Added type definitions
- Added scripts:
  - `container:start` - Start GraphQL server
  - `container:init-tables` - Initialize tables

### 6. Documentation

**CONTAINER-QUICKSTART.md**
- Quick start guide
- Common commands
- Troubleshooting

**CONTAINER-README.md**
- Detailed architecture
- Resolver wrapping explanation
- Development workflow
- Differences from AWS

**.env.example**
- Example environment configuration
- All configurable variables

**README.md** (updated)
- Added Container Development section
- Links to container documentation

## Architecture

### Request Flow

```
Client → Express GraphQL Server
         ↓
    Resolver Wrapper (transforms to AppSync event)
         ↓
    Original AppSync Lambda Handler
         ↓
    DynamoDB Local / RabbitMQ
```

### Resolver Wrapping

The system automatically:
1. Discovers resolver files in `query/` and `mutations/` directories
2. Loads the `handler` export from each file
3. Wraps handlers to transform Express context to AppSync event format
4. Injects DynamoDB client and RabbitMQ channel

### Data Storage

- **DynamoDB Local**: Replaces AWS DynamoDB
- **RabbitMQ**: Replaces AWS EventBridge/SQS
- **Volumes**: Data persists between container restarts

## Usage

### First Time Setup

```bash
# Copy environment file
cp .env.example .env

# Install dependencies
make install-deps

# Start containers
make container-up

# Initialize tables
make container-init
```

### Daily Development

```bash
# Start containers
make container-up

# Access GraphQL playground
open http://localhost:4000/graphql

# Make code changes (auto-reloaded via volumes)

# Stop containers
make container-down
```

### Testing

Access GraphiQL at http://localhost:4000/graphql and run queries:

```graphql
query {
  getServerSettings {
    version
  }
}
```

## Key Features

1. **No AWS Required**: Runs entirely locally
2. **Resolver Compatibility**: Uses existing AppSync resolvers
3. **Auto-Discovery**: Automatically loads all resolvers
4. **GraphiQL**: Interactive query playground
5. **Persistent Data**: Data survives container restarts
6. **Hot Reload**: Source changes reflected via volumes

## Limitations

Compared to AWS deployment:
- No AppSync subscriptions (WebSocket)
- No VTL templates (direct resolver invocation)
- No fine-grained authorization
- No DynamoDB streams
- RabbitMQ instead of EventBridge (different message patterns)

## Next Steps

1. Add authentication/authorization middleware
2. Implement subscription support via WebSocket
3. Add more comprehensive table initialization
4. Create seed data scripts
5. Add integration tests for container environment
