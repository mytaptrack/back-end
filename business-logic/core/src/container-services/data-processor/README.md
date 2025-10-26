# Data Processor Service

The Data Processor Service is a containerized service that handles background event processing, replacing AWS Lambda-based event handlers with a unified, scalable container solution.

## Overview

This service subscribes to message broker events and processes them using business logic services. It provides:

- **Event Processing**: Handles user, student, license, and app events
- **Batch Processing**: Efficiently processes multiple events in batches
- **Retry Logic**: Automatic retry with exponential backoff for failed events
- **Dead Letter Queue**: Failed events are sent to DLQ for investigation
- **Health Monitoring**: Built-in health checks and processing statistics
- **Manual Operations**: API endpoints for reprocessing and batch flushing

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Data Processor Service                   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  Event Handlers │  │ Batch Processor │  │ HTTP Server  │ │
│  │                 │  │                 │  │              │ │
│  │ • License       │  │ • Batching      │  │ • /health    │ │
│  │ • Student       │  │ • Retry Logic   │  │ • /stats     │ │
│  │ • User          │  │ • DLQ Handling  │  │ • /reprocess │ │
│  │ • Notification  │  │ • Performance   │  │ • /flush     │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Message Broker                          │
│              (RabbitMQ / EventBridge)                      │
└─────────────────────────────────────────────────────────────┘
```

## Event Handlers

### License Event Handlers

- **LicenseToUserProcessor**: Manages user-license associations when license admin lists change
- **LicenseToS3Processor**: Exports license data to storage (S3/MinIO/filesystem)
- **LicenseToStudentProcessor**: Updates student license details when licenses change

### Student Event Handlers

- **StudentToS3Processor**: Exports student data to storage for analytics
- **AppToS3Processor**: Exports app data associated with students
- **StudentRemovalProcessor**: Handles complete student data removal
- **StudentOrphanCleanupProcessor**: Cleans up orphaned student records

### Notification Event Handlers

- **NotificationToUserProcessor**: Processes user notifications (email, push, etc.)

### Generic Event Handlers

- **UserEventProcessor**: Handles general user events
- **StudentEventProcessor**: Handles general student events
- **LicenseEventProcessor**: Handles general license events
- **AppEventProcessor**: Handles general app events

## Configuration

### Server Configuration

```typescript
const config: ServerConfig = {
  port: 3003,
  host: '0.0.0.0',
  cors: {
    origin: ['http://localhost:3000'],
    credentials: true
  },
  middleware: {
    requestLogging: true,
    compression: true,
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 1000
    }
  },
  security: {
    helmet: true,
    trustProxy: true
  }
};
```

### Batch Processing Configuration

```typescript
const batchConfig: BatchProcessorConfig = {
  batchSize: 10,        // Process up to 10 events per batch
  batchTimeout: 5000,   // Process batch every 5 seconds
  maxRetries: 3,        // Retry failed events up to 3 times
  retryDelay: 1000      // Start with 1 second delay between retries
};
```

## Usage

### Starting the Service

```typescript
import { DataProcessorService } from './data-processor-service';

const service = new DataProcessorService(config, batchConfig);
await service.initialize();
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY . .
RUN npm ci --only=production

EXPOSE 3003
CMD ["node", "dist/data-processor-service.js"]
```

### Docker Compose

```yaml
services:
  data-processor:
    build: .
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=production
      - MESSAGE_BROKER_PROVIDER=rabbitmq
      - RABBITMQ_URL=amqp://rabbitmq:5672
      - DATABASE_PROVIDER=mongodb
      - MONGODB_URL=mongodb://mongodb:27017/mytaptrack
    depends_on:
      - rabbitmq
      - mongodb
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## API Endpoints

### Health Check
```
GET /health
```
Returns service health status and dependency checks.

### Processing Statistics
```
GET /stats
```
Returns processing statistics including:
- Total events processed
- Error count
- Uptime
- Batch processing stats

### Manual Reprocessing
```
POST /reprocess/:eventType
```
Triggers manual reprocessing for a specific event type (if supported).

### Flush Batches
```
POST /flush
```
Immediately processes all pending batches.

## Event Processing Flow

1. **Event Reception**: Service subscribes to message broker events
2. **Batch Queuing**: Events are queued for batch processing
3. **Batch Processing**: Events are processed in configurable batches
4. **Retry Logic**: Failed events are retried with exponential backoff
5. **Dead Letter Queue**: Permanently failed events are sent to DLQ
6. **Statistics**: Processing metrics are tracked and exposed

## Monitoring

### Health Checks

The service provides multiple health check endpoints:

- `/health` - Full health check including dependencies
- `/health/quick` - Quick health check without deep dependency checks
- `/ready` - Readiness check for container orchestration
- `/live` - Liveness check for container orchestration

### Metrics

Processing statistics are available at `/stats`:

```json
{
  "totalProcessed": 1250,
  "totalErrors": 5,
  "lastProcessedAt": "2023-12-01T10:30:00Z",
  "uptime": 3600000,
  "isProcessing": true,
  "registeredProcessors": ["license.to.user", "student.to.s3"],
  "batchProcessing": {
    "queuedBatches": 2,
    "queuedMessages": 15,
    "isProcessing": true,
    "oldestBatchAge": 2000,
    "batchSize": 10,
    "batchTimeout": 5000
  }
}
```

## Error Handling

### Retry Policy

Failed events are retried using exponential backoff:

1. **First retry**: 1 second delay
2. **Second retry**: 2 second delay  
3. **Third retry**: 4 second delay
4. **Dead Letter Queue**: After max retries exceeded

### Dead Letter Queue

Failed events are published to `{eventType}.failed` topics with metadata:

```json
{
  "originalMessage": { /* original event */ },
  "error": "Processing failed: Connection timeout",
  "failedAt": "2023-12-01T10:30:00Z",
  "retryCount": 3
}
```

## Performance Optimization

### Batch Processing

Events are processed in batches to improve throughput:

- **Configurable batch size**: Adjust based on processing capacity
- **Timeout-based processing**: Ensures timely processing even with small volumes
- **Concurrent processing**: Multiple batches can be processed simultaneously

### Connection Pooling

The service uses connection pooling for:

- **Database connections**: Reused across event processing
- **Message broker connections**: Persistent connections with heartbeat
- **Cache connections**: Pooled Redis connections

## Troubleshooting

### Common Issues

1. **High Error Rate**
   - Check message broker connectivity
   - Verify database connection
   - Review event payload formats

2. **Slow Processing**
   - Increase batch size
   - Reduce batch timeout
   - Scale horizontally with multiple instances

3. **Memory Issues**
   - Reduce batch size
   - Increase batch timeout
   - Monitor for memory leaks in event handlers

### Debugging

Enable debug logging:

```bash
DEBUG=data-processor:* npm start
```

Check processing statistics:

```bash
curl http://localhost:3003/stats
```

Flush pending batches:

```bash
curl -X POST http://localhost:3003/flush
```

## Migration from Lambda

This service replaces the following Lambda functions:

- `data-prop/src/functions/licenses/licenseToUser.ts`
- `data-prop/src/functions/licenses/licenseToS3.ts`
- `data-prop/src/functions/licenses/licenseToStudent.ts`
- `data-prop/src/functions/student/prop/studentToS3.ts`
- `data-prop/src/functions/student/prop/appToS3.ts`
- `data-prop/src/functions/student/removeFinal/studentRemoveFinal.ts`
- `data-prop/src/functions/student/clearOutOrphans/studentClearOutOrphans.ts`
- `data-prop/src/functions/notification/toUser/notificationToUser.ts`
- `data-prop/src/functions/eventbus/from-dynamo.ts`

The same business logic is preserved but adapted for containerized execution with improved error handling, batching, and monitoring.