# Running System Tests Against Local APIs

## Quick Start

```bash
# From project root
make container-up        # Start all local services
make container-init      # Initialize tables (first time only)
make test-local          # Run tests against local APIs
```

## Prerequisites

1. Ensure Docker is running

2. Start local services:
   ```bash
   make container-up
   make container-init  # First time only
   ```

3. Verify services are running:
   - GraphQL API: http://localhost:4000/graphql
   - Device API: http://localhost:3001/health
   - DynamoDB Local: http://localhost:8000
   - RabbitMQ: http://localhost:15672

## Running Tests

Run all tests against local APIs:
```bash
cd system-tests
npm run test:local
```

Run specific test:
```bash
cd system-tests
USE_LOCAL=true npm test -- --testNamePattern="test name"
```

Run from project root:
```bash
make test-local
```

## Local Services

### GraphQL API (Port 4000)
- Endpoint: `http://localhost:4000/graphql`
- Handles all GraphQL queries and mutations
- Connected to local DynamoDB

### Device API (Port 3001)
- Endpoint: `http://localhost:3001`
- Mimics API Gateway request/response format
- Routes:
  - `GET /time` - Get server time
  - `PUT /data` - Track device data
  - `PUT /audio` - Upload audio
  - `POST /firmware` - Firmware updates
  - `DELETE /app` - Delete app token
  - `POST /app` - Retrieve app token
  - `PUT /app` - Track app data
  - `PUT /app/notes` - Add notes
  - `GET /health` - Health check

### DynamoDB Local (Port 8000)
- Local DynamoDB instance
- Tables: `mytaptrack-local-primary`, `mytaptrack-local-data`

## Configuration

When `USE_LOCAL=true` is set:
- GraphQL endpoint: `http://localhost:4000/graphql`
- Device API endpoint: `http://localhost:3001`
- Cognito authentication: Mocked (returns `Bearer local-test-token`)
- DynamoDB: Uses local tables via endpoint `http://localhost:8000`
- AWS SSM: Bypassed, returns local values
- HTTP protocol: Uses HTTP instead of HTTPS

## What Works

- ✅ GraphQL queries and mutations
- ✅ Device API endpoints (time, data, app tokens)
- ✅ DynamoDB operations
- ✅ Basic connectivity tests

## Limitations

- ❌ Cognito authentication is mocked
- ❌ REST API endpoints not running locally
- ❌ Tests requiring real AWS services will fail
- ❌ S3 operations not available
- ❌ SNS/SQS not available

## Running Without Docker

You can run services individually without Docker:

```bash
# Terminal 1: GraphQL API
cd api && npm run container:start

# Terminal 2: Device API
make device-start

# Terminal 3: Run tests
cd system-tests && npm run test:local
```

## Troubleshooting

**Port already in use:**
```bash
# Check what's using the port
lsof -ti:3001 | xargs kill  # Device API
lsof -ti:4000 | xargs kill  # GraphQL API
```

**Tables not found:**
```bash
make container-init
```

**Connection refused:**
```bash
# Check containers
docker ps | grep mytaptrack

# Restart
make container-down && make container-up
```

**Device API not responding:**
```bash
# Check health
curl http://localhost:3001/health

# View logs
docker logs mytaptrack-device-api
```

## DAL (Data Access Layer) Configuration

When `USE_LOCAL=true`, the system automatically:
- Sets `DYNAMODB_ENDPOINT=http://localhost:8000`
- Uses dummy credentials (`accessKeyId: 'local', secretAccessKey: 'local'`)
- Points to local tables (`mytaptrack-local-primary`, `mytaptrack-local-data`)
- Skips AWS authentication

This allows DAL operations in tests to work without AWS credentials.


## Test Filtering

### Automatically Skipped Tests

When `USE_LOCAL=true`, the following tests are automatically skipped:

- **Website v1 Tests** (`src/tests/website-v1/**`) - Require REST API endpoints not available locally
- **Website v2 Tests** (`src/tests/website-v2/**`) - Require REST API endpoints not available locally

These tests use `describe.skip` in local mode to avoid failures from missing services.

### Running Specific Tests

```bash
# Run only device tests
USE_LOCAL=true npm test -- src/tests/devices/

# Run only GraphQL-based tests
USE_LOCAL=true npm test -- --testNamePattern="basic"
```

## DAL (Data Access Layer) Configuration

When `USE_LOCAL=true`, the system automatically:
- Sets `DYNAMODB_ENDPOINT=http://localhost:8000`
- Uses dummy credentials (`accessKeyId: 'local', secretAccessKey: 'local'`)
- Points to local tables (`mytaptrack-local-primary`, `mytaptrack-local-data`)
- Skips AWS authentication

This allows DAL operations in tests to work without AWS credentials.

## REST API (Port 3000)

The REST API server wraps website API endpoints and mimics API Gateway behavior.

### Available Endpoints

- `GET /api/v2/student/devices` - Get student devices
- `PUT /api/v2/student/devices/app` - Update device app
- `DELETE /api/v2/student/devices/app` - Delete device app
- `GET /api/v2/student/devices/app/token` - Get app token
- `GET /api/v2/user` - Get current user
- `PUT /api/v2/user` - Update user
- `GET /health` - Health check

### Testing

```bash
# Health check
curl http://localhost:3000/health

# Get user (requires auth in production)
curl http://localhost:3000/api/v2/user
```

### Authentication

In local mode, requests are automatically authenticated with:
- `sub: 'local-test-user'`
- `cognito:username: 'local-test-user'`
- `email: 'test@local.dev'`

## Authentication in Local Mode

When `USE_LOCAL=true`, tests automatically authenticate via SAML callback:

1. Test calls `login()` from cognito.ts
2. Sends POST to `/auth/saml/callback` with user info
3. REST API generates JWT token and stores in Redis
4. Token cached and reused for all subsequent requests
5. GraphQL API validates token against Redis

### Token Flow

```
Test → SAML Callback → JWT Generated → Stored in Redis
                                     ↓
GraphQL Request → Validate Token → Get User Info → Execute Resolver
```

### User Information

Default test user:
- **User ID**: `{email}` (@ replaced with -at-)
- **Email**: From test config (default: admin email)
- **Name**: From test config or "Test User"

Token is cached for the test session and reused across all API calls.
