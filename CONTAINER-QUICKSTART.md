# Container Quick Start Guide

## Setup

1. **Copy environment file**
   ```bash
   cp .env.example .env
   ```

2. **Install dependencies** (first time only)
   ```bash
   make install-deps
   ```

3. **Start containers**
   ```bash
   make container-up
   ```

4. **Initialize DynamoDB tables** (first time only)
   ```bash
   make container-init
   ```

## Access Services

- **GraphQL API**: http://localhost:4000/graphql
- **RabbitMQ Management**: http://localhost:15672 (mytaptrack/mytaptrack)
- **DynamoDB Local**: http://localhost:8000

## Common Commands

```bash
# Start containers
make container-up

# Stop containers
make container-down

# View logs
make container-logs

# Initialize tables
make container-init

# Rebuild containers
docker-compose up --build -d
```

## Testing GraphQL

Open http://localhost:4000/graphql in your browser to access GraphiQL.

Example query:
```graphql
query {
  getServerSettings {
    version
  }
}
```

## Troubleshooting

**Containers won't start:**
```bash
make container-down
docker-compose up --build
```

**Tables not created:**
```bash
make container-init
```

**Port conflicts:**
Edit `docker-compose.yml` and change port mappings.

## Development Workflow

1. Make code changes in `api/src/`
2. Restart GraphQL container:
   ```bash
   docker-compose restart graphql-api
   ```
3. Test in GraphiQL

## Stopping

```bash
make container-down
```

To remove all data:
```bash
docker-compose down -v
```
