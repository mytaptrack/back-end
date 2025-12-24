# API Service

## Overview

This repository contains the data storage components as well as the api and processing layers for the mytaptrack solution.

## Prerequisites
- Node.js 16+
- AWS CDK

## Project Structure
| Type | Folder | Description |
|:---:|:---:|:---:|
| NodeJS Module | /cdk | A NodeJS module which centralizes how AWS resources are created |
| NodeJS Module | /lib | A NodeJS module which contains the data access layer and utilities used by the rest of the system |
| AWS Stack | /core | Contains all the core components including databases, event bridge, data lake storage, and cognito user pool |
| AWS Stack | /api | This folder contains the website apis, the graphql apis and the devices apis |
| AWS Stack | /data-prop | This is the compute layer for data propagation through the system |
| Tests | /system-tests | A set of system tests to validate the system's operational capabilities |

## Container Development

For local development without AWS dependencies, use Docker containers:

```bash
make container-up        # Start all local services
make container-init      # Initialize database tables (first time)
make container-down      # Stop containers
make test-local          # Run system tests against local APIs
```

- **GraphQL API**: http://localhost:4000/graphql
- **REST API**: http://localhost:3000/health
- **Device API**: http://localhost:3001/health
- **Redis**: localhost:6379
- **RabbitMQ Management**: http://localhost:15672 (mytaptrack/mytaptrack)

See [CONTAINER-QUICKSTART.md](./CONTAINER-QUICKSTART.md) and [system-tests/README-local.md](./system-tests/README-local.md) for details.

## Local Development

### Installation

To install dependencies run the command
```bash
make install
```

To set specific configurations run the command with the **{variable name}**=**{value}**

Example:
```bash
make install STAGE=test
```

### Installation Variables
| Variable Name | Default | Description |
|:---:|:---:|
| STAGE | dev | The environment name which to deploy |
| CONFIG_PATH | ../config | The absolute or project relative path the the configuration directory to use |
| AWS_REGION | Default Region | Overwrites the default region with the one specified |

## Scripts
| Script Name | Description |
|:---:|:---:|
| configure | Creates the basic configuration files for deloying mytaptrack |
| install | Gets dependencies, builds all the projects, and deploys all the code to AWS |
| deploy | Leverages all existing dependencies and projects and deploys the code to AWS |
| test | Builds and executes the system tests against the configured environment |
| export-data | Exports all tracked data and configurations organized by license |
| clean | Cleans all build directories and artifacts |

## Data Export

To export all tracked data and student configurations organized by license:

```bash
# Using the shell script (recommended)
./export-data.sh [output-directory] [start-date] [end-date]

# Using make
make export-data

# Direct execution
cd utils && npm run export-data [output-directory] [start-date] [end-date]
```

See [utils/README-export.md](./utils/README-export.md) for detailed documentation.

## References
- [Configuration Documentation](./config/README.md)
- [Core Components](./core/README.md)
- [API Components](./api/README.md)
- [Data Prop](./data-prop/README.md)
- [Lib](./lib/README.md)
- [System Tests](./lib/README.md)
- [Data Export](./utils/README-export.md)

## License
[Mozilla Public License Version 2.0](./LICENSE)

## Development with Watch Mode

Run services with automatic restart on file changes:

```bash
# GraphQL API with watch mode
make graphql-watch

# REST API with watch mode
make rest-watch

# Device API with watch mode
make device-watch

# RabbitMQ consumer with watch mode
make rabbitmq-watch

# Start all services (GraphQL + RabbitMQ consumer)
make start-all
```

Changes to TypeScript files in `api/src/` will automatically restart the service.

### RabbitMQ Message Processing

The GraphQL API includes a RabbitMQ consumer for processing report data messages:

- **Consumer Service**: Processes messages from `report-data-queue`
- **Message Handler**: Uses `api/src/graphql/resolver/mutations/report/process.ts`
- **Queue Management**: Messages sent via `api/src/graphql/resolver/mutations/report/queue-management.ts`

Start the consumer separately:
```bash
make rabbitmq-consumer
```

Or start both GraphQL API and consumer together:
```bash
make start-all
```
