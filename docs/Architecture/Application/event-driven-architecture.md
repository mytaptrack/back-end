# Event-Driven Architecture Patterns

## Overview

The MyTapTrack system implements a comprehensive event-driven architecture using AWS EventBridge as the central event bus. This architecture enables loose coupling between components, real-time data processing, and scalable system integration while maintaining data consistency and reliability.

## EventBridge Architecture

### Central Event Bus

AWS EventBridge serves as the central nervous system for all inter-service communication:

```typescript
// Event bus configuration in CDK
const eventBus = context.getEventBus();
```

### Event Types and Classification

The system defines a comprehensive taxonomy of event types organized by domain:

```typescript
export enum MttEventType {
  // Configuration Events
  user = 'user-config',
  student = 'student-config',
  license = 'license',
  team = 'team',
  
  // Application Events
  a = 'app',
  d = 'device-config',
  ad = 'app-device-config',
  as = 'app-student-config',
  
  // Behavioral Events
  b = 'behavior',
  trackEvent = 'track-event',
  trackService = 'track-service',
  behaviorChange = 'behavior-change',
  
  // Notification Events
  ns = 'notification-summary',
  nu = 'notification-user-config',
  na = 'notification-app-config',
  ne = 'note-event',
  requestNotify = 'request-notify',
  
  // System Events
  trackLowPower = 'track-low-power',
  reportProcessEvent = 'report-process-event'
}
```

## Event Publishing Patterns

### Direct Event Publishing

Lambda functions publish events directly to EventBridge:

```typescript
import { EventDal } from './event-dal';

// Publishing events from business logic
await EventDal.sendEvents('MyTapTrack-API', [
  {
    type: MttEventType.trackEvent,
    data: {
      studentId: 'student-123',
      behaviorId: 'behavior-456',
      timestamp: Date.now(),
      source: 'device-api'
    }
  }
]);
```

### Event Publishing Infrastructure

```typescript
class EventDalClass {
  async sendEvents<T>(source: string, events: MttEvent<T>[]) {
    await eventbus.send(new PutEventsCommand({
      Entries: events.filter(r => r? true : false).map(r => ({
        EventBusName: process.env.EVENT_BUS,
        Source: source,
        DetailType: r.type,
        Detail: JSON.stringify(r.data)
      }))
    }));
  }
}
```

### DynamoDB Streams Integration

Database changes automatically trigger events through DynamoDB Streams:

```typescript
// Automatic event generation from database changes
const dataToEventBus = new MttFunction(context, {
  id: 'dataToEventBus',
  codePath: 'src/functions/eventbus/from-dynamo.ts',
  handler: 'handler',
  events: [{ access: EventBusAccess.sendMessage }]
});

// Connect to DynamoDB Stream
dataToEventBus.lambda.addEventSource(new DynamoEventSource(dataTable.dynamodb, {
  batchSize: 10,
  startingPosition: StartingPosition.LATEST
}));
```

## Event Subscription Patterns

### Function-Based Event Subscription

Lambda functions subscribe to specific event types:

```typescript
// Subscribe to behavior change events
new MttFunction(context, {
  id: 'patternEventNotifyV2',
  codePath: 'src/device/functions/events/patternEventNotification.ts',
  handler: 'notify',
  events: [
    { detailType: [MttEventType.behaviorChange], access: EventBusAccess.subscribe }
  ]
});
```

### Multi-Event Subscription

Functions can subscribe to multiple related event types:

```typescript
// Subscribe to multiple tracking events
new MttFunction(context, {
  id: 'ReportQueueManagement',
  codePath: 'src/graphql/resolver/mutations/report/queue-management.ts',
  events: [
    { 
      detailType: [MttEventType.trackService, MttEventType.trackEvent], 
      access: EventBusAccess.subscribe 
    }
  ]
});
```

### Source-Based Event Filtering

Events can be filtered by source system:

```typescript
// Subscribe to DynamoDB-sourced events
new MttFunction(context, {
  id: 'licenseTemplateProcessing',
  events: [{
    source: ['DynamoDB'],
    detailType: ['license'],
    access: EventBusAccess.subscribe
  }]
});
```

## Event Processing Patterns

### Immediate Event Processing

Real-time event processing for critical operations:

```typescript
// Process button events immediately
new MttFunction(context, {
  id: 'processButtonV2',
  codePath: 'src/device/functions/processing/dash-button-process-event.ts',
  handler: 'processRequest',
  events: [
    { detailType: [MttEventType.reportProcessEvent], access: EventBusAccess.subscribe }
  ]
});
```

### Batch Event Processing

Events can be batched for efficient processing:

```typescript
// Batch process notification events
new MttFunction(context, {
  id: 'notificationToUserV2',
  codePath: 'src/functions/notification/toUser/notificationToUser.ts',
  handler: 'handleEvent',
  events: [{
    source: ['DynamoDB'],
    detailType: ['notification-summary'],
    access: EventBusAccess.subscribe
  }]
});
```

### Event Transformation and Enrichment

Events can be transformed and enriched during processing:

```typescript
// Transform and enrich student events
new MttFunction(context, {
  id: 'studentToApp',
  codePath: 'src/functions/app/studentToApp.ts',
  handler: 'handler',
  events: [{
    source: ['DynamoDB'],
    detailType: ['student-config'],
    access: EventBusAccess.subscribe
  }]
});
```

## Data Propagation Patterns

### Cross-Service Data Synchronization

Events enable data synchronization across different services and storage systems:

```typescript
// Propagate student data to S3 data lake
new MttFunction(context, {
  id: 'studentToS3',
  codePath: 'src/functions/student/prop/studentToS3.ts',
  handler: 'handleEvent',
  buckets: [
    { bucket: dataBucket, access: S3Access.write }
  ],
  events: [{
    source: ['DynamoDB'],
    detailType: ['student-config'],
    access: EventBusAccess.subscribe
  }]
});
```

### Multi-Target Data Propagation

Single events can trigger multiple data propagation targets:

```typescript
// License events propagate to multiple targets
new MttFunction(context, {
  id: 'licenseToS3',
  codePath: 'src/functions/licenses/licenseToS3.ts',
  handler: 'handleEvent',
  buckets: [{ bucket: dataBucket, access: S3Access.write }],
  events: [{ source: ['DynamoDB'], detailType: ['license'], access: EventBusAccess.subscribe }]
});

new MttFunction(context, {
  id: 'licenseToStudentV3',
  codePath: 'src/functions/licenses/licenseToStudent.ts',
  handler: 'handleEvent',
  tables: [
    { table: dataTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.license] },
    { table: primaryTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.license] }
  ],
  events: [{ source: ['DynamoDB'], detailType: ['license'], access: EventBusAccess.subscribe }]
});
```

### Event-Driven Cache Invalidation

Events trigger cache updates and invalidation:

```typescript
// App configuration changes invalidate device caches
new MttFunction(context, {
  id: 'appToS3',
  codePath: 'src/functions/student/prop/appToS3.ts',
  handler: 'handleEvent',
  buckets: [{ bucket: dataBucket, access: S3Access.write }],
  events: [{ source: ['DynamoDB'], detailType: ['app'], access: EventBusAccess.subscribe }]
});
```

## Real-Time Integration Patterns

### GraphQL Subscription Integration

Events trigger real-time GraphQL subscriptions:

```typescript
// Events trigger GraphQL subscription updates
this.appsync.addLambdaResolver('UpdateDataInReport', {
  environmentVariables: {
    EVENT_BUS: context.getEventBus().eventBusName
  },
  policyStatements: [
    {
      actions: ['events:PutEvents'],
      resources: [`arn:aws:events:${context.region}:${this.account}:event-bus/*`]
    }
  ]
});
```

### WebSocket Notification Patterns

Events can trigger WebSocket notifications through AppSync:

```typescript
// Real-time student data change notifications
new MttFunction(context, {
  id: 'ProcessDataInReport',
  appsync: [{ 
    api: this.appsync, 
    access: { mutations: ['studentDataChange'] } 
  }]
});
```

### Push Notification Integration

Events trigger mobile push notifications:

```typescript
// Single event notifications with push integration
new MttFunction(context, {
  id: 'singleEventNotifyV2',
  codePath: 'src/device/functions/events/singleEventNotification.ts',
  handler: 'notify',
  appsync: [{ api: appsync, access: { queries: ['getAppsForDevice'] } }],
  events: [
    { detailType: [MttEventType.trackEvent], access: EventBusAccess.subscribe }
  ]
});
```

## Event Reliability Patterns

### Dead Letter Queue Integration

Failed event processing is handled through dead letter queues:

```typescript
// SQS integration for reliable event processing
const reportDataQueue = new MttSqs(context, {
  id: 'ReportDataQueue',
  name: `${context.stackName}-${context.region}.fifo`,
  fifo: true,
  contentBasedDeduplication: true,
  hasPhi: true
});
```

### Event Retry Mechanisms

Lambda functions automatically retry failed event processing:

```typescript
// Automatic retry configuration
new MttFunction(context, {
  id: 'ReportQueueManagement',
  codePath: 'src/graphql/resolver/mutations/report/queue-management.ts',
  sqs: [{ sqs: reportDataQueue, access: SqsAccess.sendMessage }],
  events: [
    { detailType: [MttEventType.trackService, MttEventType.trackEvent], access: EventBusAccess.subscribe }
  ]
});
```

### Event Deduplication

FIFO queues provide event deduplication:

```typescript
// FIFO queue with content-based deduplication
const notificationDeleteQueue = new MttSqs(context, {
  id: 'notificationsDeleteQueue',
  name: `${EnvironmentTagName}-student-notifications-delete-queue.fifo`,
  fifo: true,
  contentBasedDeduplication: true,
  hasPhi: false
});
```

## Event Monitoring and Observability

### Event Tracing

All events are traced through CloudWatch and X-Ray:

```typescript
// Automatic event tracing
const eventbus = new EventBridgeClient({});
```

### Event Metrics

Custom metrics track event processing:

- Event publication rates
- Processing latency
- Error rates
- Dead letter queue depths

### Event Logging

Structured logging captures event processing details:

```typescript
// Structured event logging
console.log('Processing event', {
  eventType: event.DetailType,
  source: event.Source,
  timestamp: event.Time
});
```

## Event Security Patterns

### Event Authorization

IAM policies control event publishing and subscription:

```typescript
// Event publishing permissions
policyStatements: [
  {
    actions: ['events:PutEvents'],
    resources: [`arn:aws:events:${context.region}:${this.account}:event-bus/*`]
  }
]
```

### Event Encryption

Events containing PHI are encrypted in transit and at rest:

```typescript
// PHI-aware event handling
const reportDataQueue = new MttSqs(context, {
  hasPhi: true  // Enables encryption for PHI data
});
```

### Event Filtering

Event rules filter sensitive data based on content:

```typescript
// Content-based event filtering
events: [{
  source: ['DynamoDB'],
  detailType: ['student-config'],
  access: EventBusAccess.subscribe
}]
```

## Event Schema Evolution

### Backward Compatibility

Event schemas maintain backward compatibility:

```typescript
export interface MttEvent<T> {
  type: MttEventType;
  data: T;
}

export interface MttUpdateEvent<T> {
  type: MttEventType;
  data: {
    old: T;
    new: T;    
  }
}
```

### Schema Versioning

Event types can be versioned for schema evolution:

```typescript
// Versioned event types
export enum MttEventType {
  trackEvent = 'track-event',      // v1
  trackEventV2 = 'track-event-v2'  // v2 with additional fields
}
```

### Event Migration

Event processors handle multiple schema versions:

```typescript
// Handle multiple event schema versions
function processTrackEvent(event: any) {
  if (event.version === 'v2') {
    // Handle v2 schema
  } else {
    // Handle v1 schema (backward compatibility)
  }
}
```

## Performance Optimization

### Event Batching

Related events are batched for efficient processing:

```typescript
// Batch event processing
dataToEventBus.lambda.addEventSource(new DynamoEventSource(dataTable.dynamodb, {
  batchSize: 10,  // Process up to 10 events per invocation
  startingPosition: StartingPosition.LATEST
}));
```

### Event Filtering

Event rules filter events at the EventBridge level:

```typescript
// Server-side event filtering
events: [{
  source: ['DynamoDB'],
  detailType: ['license'],  // Only license events
  access: EventBusAccess.subscribe
}]
```

### Parallel Processing

Independent events are processed in parallel:

```typescript
// Parallel event processing functions
new MttFunction(context, { id: 'licenseToS3' });
new MttFunction(context, { id: 'licenseToStudent' });
new MttFunction(context, { id: 'licenseToUser' });
```