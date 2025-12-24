# Device API Local Development

## Overview

The Device API local server mimics AWS API Gateway's request/response format, allowing you to test device endpoints locally without deploying to AWS.

## Architecture

```
Express Server (Port 3001)
    ↓
Request Transformation (Express → API Gateway Event)
    ↓
Lambda Handler Functions
    ↓
Response Transformation (Lambda → Express)
```

## Starting the Server

### With Docker
```bash
make container-up
```

### Without Docker
```bash
cd api
npm run device:start
```

## Available Endpoints

### Device API
- `GET /time` - Get server time in seconds since epoch
- `PUT /data` - Submit device tracking data
- `PUT /audio` - Upload audio data
- `POST /firmware` - Firmware update endpoint

### App API
- `DELETE /app` - Delete app token
- `POST /app` - Retrieve app token (also available at `/v3/app`)
- `PUT /app` - Track app data
- `PUT /app/notes` - Add notes to tracking data

### Health Check
- `GET /health` - Returns `{"status":"ok","service":"device-api"}`

## Request Format

The server automatically transforms Express requests to API Gateway event format:

```typescript
{
    body: JSON.stringify(req.body),
    headers: req.headers,
    httpMethod: req.method,
    path: req.path,
    pathParameters: req.params,
    queryStringParameters: req.query,
    requestContext: {
        accountId: 'local',
        apiId: 'local',
        // ... other API Gateway context
    }
}
```

## Environment Variables

Required:
- `DYNAMODB_ENDPOINT` - DynamoDB endpoint (default: http://localhost:8000)
- `PrimaryTable` - Primary table name (default: mytaptrack-local-primary)
- `DataTable` - Data table name (default: mytaptrack-local-data)
- `appsyncUrl` - GraphQL API URL (default: http://localhost:4000/graphql)

Optional:
- `PORT` - Server port (default: 3001)
- `AWS_REGION` - AWS region (default: us-east-1)

## Testing

```bash
# Health check
curl http://localhost:3001/health

# Get time
curl http://localhost:3001/time

# Submit data (requires valid device ID)
curl -X PUT http://localhost:3001/data \
  -H "Content-Type: application/json" \
  -d '{"dsn":"M200000000000001","identity":"test","pressType":"click","clickCount":1}'
```

## Implementation Details

### Handler Mapping
Each endpoint is mapped to its corresponding Lambda handler:
- `timeGet.ts` → `GET /time`
- `dataPut.ts` → `PUT /data`
- `appDelete.ts` → `DELETE /app`
- etc.

### Error Handling
Errors are caught and returned as:
```json
{
    "error": "error message"
}
```

### Limitations
- No API key validation (all requests accepted)
- No rate limiting
- No request size limits
- Simplified authentication
- No CloudWatch logging

## Development

To add a new endpoint:

1. Add the handler import:
```typescript
import { handler } from './functions/path/to/handler';
```

2. Add the route:
```typescript
app.method('/path', (req, res) => handleLambda(handler, req, res));
```

3. Restart the server

## Troubleshooting

**Port already in use:**
```bash
lsof -ti:3001 | xargs kill
```

**Cannot connect to DynamoDB:**
- Ensure DynamoDB Local is running on port 8000
- Check `DYNAMODB_ENDPOINT` environment variable

**Handler errors:**
- Check `/tmp/device-api.log` for error details
- Verify all required environment variables are set
- Ensure GraphQL API is running if handler uses AppSync
