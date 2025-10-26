# Device API Container Service

The Device API Container Service provides a containerized HTTP API for IoT device communication, supporting multiple device protocols and authentication methods. It handles device registration, data collection, and event processing for MyTapTrack devices.

## Features

- **Multi-Protocol Support**: Track 2.0, IoT devices, and mobile apps
- **Device Authentication**: Identity-based authentication for devices
- **Event Processing**: Real-time event publishing to message broker
- **Legacy Compatibility**: Full backward compatibility with existing Track 2.0 devices
- **Health Monitoring**: Comprehensive health checks and monitoring
- **Scalable Architecture**: Designed for horizontal scaling in container environments

## Supported Device Types

### Track 2.0 Devices
- Button press events with click counting
- Audio recording and processing
- Firmware update management
- Battery level monitoring
- Device identity validation

### IoT Devices
- Generic IoT device registration
- Event-driven communication
- Thing management integration
- Policy-based access control

### Mobile Applications
- Token-based authentication
- Behavior tracking
- Service tracking
- Notes management
- Push notification support

## API Endpoints

### Device Management
```
POST   /device/register          - Register new device
GET    /device/:id/registration  - Get device registration
DELETE /device/:id/registration  - Unregister device
PUT    /device/:id/data          - Record device data
PUT    /device/:id/battery       - Update battery level
PUT    /device/:id/status        - Update device status
PUT    /device/:id/settings      - Update device settings
```

### Legacy Track 2.0 Endpoints
```
GET    /time                     - Get current time (unauthenticated)
GET    /ping                     - Ping endpoint (unauthenticated)
PUT    /data                     - Track button press data
PUT    /audio                    - Track audio data
POST   /firmware                 - Firmware update check
```

### App API Endpoints
```
POST   /app                      - App token retrieve
PUT    /app                      - App behavior tracking
PUT    /app/notes                - App notes
DELETE /app                      - Delete app
```

### IoT Endpoints
```
PUT    /iot/register             - IoT device registration
GET    /auth/config              - Authentication configuration
```

### Health Endpoints
```
GET    /health                   - Full health check
GET    /health/quick             - Quick health check
GET    /ready                    - Readiness check
GET    /live                     - Liveness check
```

## Authentication

The service supports multiple authentication methods:

### Device Identity Authentication
- Used by Track 2.0 devices
- Based on device serial number (DSN) and identity hash
- Validates device registration and identity

### JWT Token Authentication
- Used by IoT devices and administrative endpoints
- Standard JWT token validation
- Configurable issuer and audience

### App Token Authentication
- Used by mobile applications
- Encrypted token-based authentication
- Token validation and refresh support

## Request/Response Formats

### Track 2.0 Button Press
```json
PUT /data
{
  "dsn": "M200000000000001",
  "identity": "device-identity-hash",
  "pressType": "click",
  "clickCount": 3,
  "remainingLife": 85,
  "eventDate": "2023-10-24T10:30:00.000Z"
}

Response:
{
  "success": true
}
```

### Device Registration
```json
POST /device/register
{
  "deviceId": "device-123",
  "studentId": "student-456",
  "license": "license-789",
  "deviceType": "track20",
  "manufacturer": "MyTapTrack",
  "model": "Track 2.0",
  "firmwareVersion": "2.1.0",
  "batteryLevel": 85
}

Response:
{
  "success": true,
  "data": {
    "deviceId": "device-123",
    "studentId": "student-456",
    "license": "license-789",
    "deviceType": "track20",
    "status": "active",
    "registeredAt": "2023-10-24T10:30:00.000Z"
  }
}
```

### App Behavior Tracking
```json
PUT /app
{
  "device": { "id": "app-device-123" },
  "token": "encrypted-token",
  "behaviorId": "behavior-456",
  "date": "2023-10-24T10:30:00.000Z",
  "endDate": "2023-10-24T10:35:00.000Z",
  "intensity": 7
}

Response:
{
  "success": true
}
```

## Event Publishing

The service publishes events to the message broker for downstream processing:

### Device Events
- `device.registered` - Device registration completed
- `device.track.button.pressed` - Track 2.0 button press
- `device.audio.received` - Track 2.0 audio data
- `device.battery.low` - Low battery warning
- `device.status.updated` - Device status change

### App Events
- `app.token.requested` - App token request
- `app.track.event` - App behavior tracking
- `app.notes.created` - App notes created
- `app.deleted` - App deleted

### IoT Events
- `iot.device.register` - IoT device registration
- `iot.device.click` - IoT device click event

## Configuration

### Environment Variables
```bash
# Server Configuration
PORT=3003
HOST=0.0.0.0
CORS_ORIGIN=*

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Logging
LOG_REQUESTS=true
LOG_LEVEL=info

# Authentication
JWT_ISSUER=mytaptrack-device-api
JWT_AUDIENCE=mytaptrack-devices

# Body Parser
MAX_JSON_SIZE=10mb
```

### Docker Configuration
```yaml
# docker-compose.yml
device-api:
  build:
    context: .
    dockerfile: containers/device-api/Dockerfile
  ports:
    - "3003:3003"
  environment:
    - NODE_ENV=production
    - DATABASE_PROVIDER=mongodb
    - MESSAGE_BROKER_PROVIDER=rabbitmq
    - AUTH_PROVIDER=jwt
  depends_on:
    - mongodb
    - rabbitmq
    - redis
```

## Usage Examples

### Starting the Service
```typescript
import { DeviceAPIService } from '@mytaptrack/business-logic-core';

const config = {
  port: 3003,
  cors: { origin: '*' },
  middleware: {
    requestLogging: true,
    rateLimiting: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 1000
    }
  }
};

const service = new DeviceAPIService(config);
await service.initialize();
```

### Client Examples

#### Register Device
```bash
curl -X POST http://localhost:3003/device/register \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "M200000000000001",
    "studentId": "student-123",
    "license": "license-456",
    "deviceType": "track20"
  }'
```

#### Track Button Press
```bash
curl -X PUT http://localhost:3003/data \
  -H "Content-Type: application/json" \
  -d '{
    "dsn": "M200000000000001",
    "identity": "device-identity",
    "pressType": "click",
    "clickCount": 3,
    "remainingLife": 85,
    "eventDate": "2023-10-24T10:30:00.000Z"
  }'
```

#### Health Check
```bash
curl http://localhost:3003/health
```

## Error Handling

The service provides structured error responses:

```json
{
  "success": false,
  "error": "Device not found",
  "errorCode": "DEVICE_NOT_FOUND",
  "correlationId": "req-123",
  "retryable": false,
  "timestamp": "2023-10-24T10:30:00.000Z"
}
```

### Common Error Codes
- `VALIDATION_ERROR` - Invalid request data
- `DEVICE_NOT_FOUND` - Device not registered
- `AUTHENTICATION_ERROR` - Invalid authentication
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INTERNAL_SERVER_ERROR` - Server error

## Monitoring

### Health Checks
The service provides multiple health check endpoints:

- `/health` - Full health check including dependencies
- `/health/quick` - Quick health check without deep validation
- `/ready` - Kubernetes readiness probe
- `/live` - Kubernetes liveness probe

### Metrics
The service logs structured metrics for monitoring:

- Request/response times
- Error rates by endpoint
- Device event counts
- Authentication success/failure rates
- Message broker publish rates

### Logging
Structured JSON logging with correlation IDs:

```json
{
  "timestamp": "2023-10-24T10:30:00.000Z",
  "level": "info",
  "service": "device-api",
  "correlationId": "req-123",
  "message": "Device registered successfully",
  "metadata": {
    "deviceId": "M200000000000001",
    "studentId": "student-123",
    "deviceType": "track20"
  }
}
```

## Security

### Network Security
- CORS configuration for cross-origin requests
- Rate limiting to prevent abuse
- Request size limits for DoS protection
- Helmet.js security headers

### Authentication Security
- Device identity validation
- JWT token verification
- Encrypted app tokens
- Secure secret management

### Data Security
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- Secure error messages (no sensitive data leakage)

## Deployment

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3003/health || exit 1
CMD ["npm", "start"]
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: device-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: device-api
  template:
    metadata:
      labels:
        app: device-api
    spec:
      containers:
      - name: device-api
        image: mytaptrack/device-api:latest
        ports:
        - containerPort: 3003
        env:
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /live
            port: 3003
        readinessProbe:
          httpGet:
            path: /ready
            port: 3003
```

## Development

### Running Tests
```bash
npm test                    # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage
```

### Local Development
```bash
npm run dev                # Start in development mode
npm run build              # Build for production
npm run start              # Start production server
```

### Debugging
```bash
DEBUG=device-api:* npm run dev    # Enable debug logging
NODE_ENV=development npm run dev  # Development mode
```

## Troubleshooting

### Common Issues

#### Device Authentication Failures
- Verify device is registered
- Check DSN format (M2[A-Z0-9]{10})
- Validate identity hash
- Check device status (active/inactive)

#### Message Broker Connection Issues
- Verify RabbitMQ is running
- Check connection configuration
- Validate credentials
- Check network connectivity

#### High Memory Usage
- Monitor request body sizes
- Check for memory leaks in event handlers
- Verify garbage collection
- Review caching strategies

### Debug Endpoints
```bash
# Check service status
curl http://localhost:3003/health

# Verify configuration
curl http://localhost:3003/auth/config

# Test connectivity
curl http://localhost:3003/ping
```

## Contributing

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Follow semantic versioning
5. Use conventional commits

## License

Copyright (c) MyTapTrack. All rights reserved.