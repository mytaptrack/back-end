# Container Development Setup

This document describes the containerized local development environment for MyTapTrack.

## Overview

The container setup provides:
- **DynamoDB Local**: Local DynamoDB instance for data storage
- **RabbitMQ**: Message queue service replacing AWS EventBridge/SQS
- **GraphQL API**: Express server wrapping existing AppSync resolvers

## Prerequisites

- Docker and Docker Compose installed
- Node.js 16+ (for local development)

## Quick Start

### Start the containers

```bash
make container-up
```

This starts:
- DynamoDB Local on port 8000
- RabbitMQ on ports 5672 (AMQP) and 15672 (Management UI)
- GraphQL API on port 4000

### Stop the containers

```bash
make container-down
```

### View logs

```bash
make container-logs
```

## Services

### DynamoDB Local

- **Endpoint**: http://localhost:8000
- **Data**: Persisted in Docker volume `dynamodb-data`
- **Configuration**: Uses shared database mode

Access via AWS CLI:
```bash
aws dynamodb list-tables --endpoint-url http://localhost:8000
```

### RabbitMQ

- **AMQP Port**: 5672
- **Management UI**: http://localhost:15672
- **Credentials**: 
  - Username: `mytaptrack`
  - Password: `mytaptrack`
- **Data**: Persisted in Docker volume `rabbitmq-data`

### GraphQL API

- **Endpoint**: http://localhost:4000/graphql
- **GraphiQL**: http://localhost:4000/graphql (interactive playground)
- **Resolver Wrapping**: Existing AppSync resolvers are wrapped to work with Express

## Architecture

### Resolver Wrapping

The container GraphQL server wraps existing AppSync Lambda resolvers:

1. **Schema Loading**: GraphQL schemas are loaded from `api/src/graphql/*.graphql`
2. **Resolver Discovery**: Resolvers are auto-discovered from:
   - `api/src/graphql/resolver/query/`
   - `api/src/graphql/resolver/mutations/`
3. **Event Transformation**: Express requests are transformed to AppSync event format
4. **Context Injection**: DynamoDB client and RabbitMQ channel are injected

### Data Flow

```
Client Request
    ↓
Express GraphQL Server
    ↓
Resolver Wrapper (transforms to AppSync event)
    ↓
Original AppSync Resolver Handler
    ↓
DynamoDB Local / RabbitMQ
```

## Environment Variables

The GraphQL container uses these environment variables:

- `DYNAMODB_ENDPOINT`: DynamoDB endpoint (default: http://dynamodb-local:8000)
- `RABBITMQ_URL`: RabbitMQ connection URL (default: amqp://mytaptrack:mytaptrack@rabbitmq:5672)
- `AWS_REGION`: AWS region (default: us-east-1)
- `AWS_ACCESS_KEY_ID`: Local credentials (default: local)
- `AWS_SECRET_ACCESS_KEY`: Local credentials (default: local)

## Development Workflow

### Making Changes

The GraphQL container mounts source directories as volumes:
- `./api/src` → `/app/src`
- `./lib` → `/app/lib`
- `./types` → `/app/types`

Changes to TypeScript files require container restart:
```bash
make container-down
make container-up
```

### Testing Locally

1. Start containers: `make container-up`
2. Access GraphiQL: http://localhost:4000/graphql
3. Run queries/mutations against local DynamoDB

### Debugging

View container logs:
```bash
docker-compose logs -f graphql-api
docker-compose logs -f dynamodb-local
docker-compose logs -f rabbitmq
```

## Differences from AWS

### DynamoDB
- Local instance vs AWS DynamoDB
- No IAM authentication
- Limited feature set (no streams, backups, etc.)

### Message Queue
- RabbitMQ vs AWS EventBridge/SQS
- Direct queue access vs event patterns
- Different message format

### GraphQL
- Express server vs AWS AppSync
- No built-in subscriptions (WebSocket)
- No VTL templates (direct resolver invocation)
- No fine-grained authorization

## Troubleshooting

### Port conflicts
If ports are already in use, modify `docker-compose.yml`:
```yaml
ports:
  - "8001:8000"  # Change DynamoDB port
  - "4001:4000"  # Change GraphQL port
```

### Container won't start
```bash
docker-compose down -v  # Remove volumes
docker-compose up --build  # Rebuild images
```

### DynamoDB connection errors
Ensure DynamoDB container is healthy:
```bash
docker-compose ps
curl http://localhost:8000
```

## Production Deployment

This container setup is for **local development only**. Production deployments use:
- AWS DynamoDB (managed service)
- AWS EventBridge/SQS (managed services)
- AWS AppSync (managed GraphQL)

Deploy to AWS using:
```bash
make deploy
```
