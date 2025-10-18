# Application Integration Patterns

## Overview

The MyTapTrack system implements a comprehensive integration architecture that connects multiple API layers, event-driven processing, and real-time data synchronization. The integration patterns are designed to support scalable, loosely-coupled communication between system components while maintaining data consistency and reliability.

## Integration Architecture

### Multi-Layer API Architecture

The system implements a three-tier API architecture:

1. **GraphQL API Layer** - Real-time queries, mutations, and subscriptions
2. **REST API Layer** - Traditional HTTP endpoints for CRUD operations
3. **Device API Layer** - Specialized endpoints for IoT device communication

### Event-Driven Integration

All components communicate through AWS EventBridge, enabling:
- Asynchronous processing
- Loose coupling between services
- Event sourcing and audit trails
- Real-time data propagation

## GraphQL API Integration Patterns

### Authentication and Authorization

```typescript
// Multi-mode authentication
authorizationConfig: {
  defaultAuthorization: {
    authorizationType: AuthorizationType.USER_POOL,
    userPoolConfig: {
      userPool: cognito.userPool,
    }
  },
  additionalAuthorizationModes: [
    {
      authorizationType: AuthorizationType.IAM
    }
  ]
}
```

### Resolver Integration Patterns

#### Lambda Resolver Pattern
- **Purpose**: Execute business logic with database access
- **Components**: Lambda function + DynamoDB tables + optional services
- **Example**: Student data retrieval with authorization

```typescript
this.appsync.addLambdaResolver('GetStudentData', {
  id: 'GetStudentData',
  codePath: 'src/graphql/resolver/query/getStudent/data.ts',
  typeName: 'Query',
  fieldName: 'getStudent',
  tables: [
    { table: primaryTable, access: DynamoDBAccess.read }, 
    { table: dataTable, access: DynamoDBAccess.read }
  ],
  auth: {
    student: {
      data: AccessLevel.read
    }
  }
});
```

#### Pipeline Resolver Pattern
- **Purpose**: Multi-step data processing and transformation
- **Components**: Multiple functions chained together
- **Use Cases**: Complex queries requiring multiple data sources

#### Subscription Resolver Pattern
- **Purpose**: Real-time data updates to connected clients
- **Components**: EventBridge integration + WebSocket connections
- **Example**: Student data change notifications

```typescript
this.appsync.addLambdaResolver("OnStudentNote", {
  id: 'OnStudentNote',
  codePath: 'src/graphql/resolver/subscriptions/report/notes.ts',
  typeName: 'Subscription',
  fieldName: 'onStudentNote',
  auth: {
    student: {
      comments: AccessLevel.read
    }
  }
});
```

### Data Flow Patterns

#### Query Data Flow
1. Client sends GraphQL query
2. AppSync validates schema and authorization
3. Lambda resolver executes business logic
4. DynamoDB data retrieval with consistent reads
5. Response transformation and return

#### Mutation Data Flow
1. Client sends GraphQL mutation
2. Authorization and validation
3. Lambda resolver processes mutation
4. Database updates (transactional when needed)
5. EventBridge event publication
6. Real-time subscription notifications
7. Response confirmation

#### Subscription Data Flow
1. Client establishes WebSocket connection
2. Subscription resolver validates authorization
3. EventBridge events trigger subscription updates
4. Real-time data pushed to connected clients

## REST API Integration Patterns

### Resource-Based Endpoints

The REST API follows RESTful conventions with resource-based URLs:

```
/api/v2/student          - Student resource operations
/api/v2/student/behavior - Nested behavior resources
/api/v2/student/team     - Team management operations
```

### Authentication Integration

```typescript
// Cognito User Pool authentication
authentication: {
  cognito: cognito.userPool
}
```

### Lambda Handler Pattern

Each REST endpoint is backed by a dedicated Lambda function:

```typescript
api.addLambdaHandler({
  id: 'createPutV2',
  codePath: 'src/v2/student/info/put.ts',
  handler: 'handleEvent',
  path: '/api/v2/student',
  method: 'put',
  tables: [
    { table: dataTable, access: DynamoDBAccess.readWrite },
    { table: primaryTable, access: DynamoDBAccess.readWrite }
  ]
});
```

### Cross-API Integration

REST endpoints can trigger GraphQL operations:

```typescript
// REST API calling GraphQL mutations
appsync: [ 
  { 
    api: props.appsync, 
    access: { 
      queries: ['getStudent'], 
      mutations: ['updateStudent']
    }
  }
]
```

## Device API Integration Patterns

### Device Authentication

Device APIs use API key authentication for IoT devices:

```typescript
authentication: {
  apiKey: apiKey
}
```

### Device Data Ingestion Pattern

1. **Device Registration**: Devices register with encrypted tokens
2. **Data Submission**: Continuous data streaming via PUT endpoints
3. **Event Processing**: Real-time event generation
4. **Data Propagation**: EventBridge distribution to processing functions

### Device-to-GraphQL Integration

Device APIs integrate with GraphQL for real-time updates:

```typescript
api.addLambdaHandler({
  id: 'devicePutDataV2',
  codePath: 'src/device/functions/api/dataPut.ts',
  appsync: [
    {
      api: appsync,
      access: {
        queries: ['getTrackForDevice']
      }
    }
  ],
  events: [
    { detailType: [MttEventType.trackEvent], access: EventBusAccess.sendMessage }
  ]
});
```

## Event-Driven Architecture Patterns

### EventBridge Integration

#### Event Types and Sources

The system defines comprehensive event types for different domains:

```typescript
export enum MttEventType {
  user = 'user-config',
  student = 'student-config',
  trackEvent = 'track-event',
  trackService = 'track-service',
  behaviorChange = 'behavior-change',
  license = 'license',
  // ... additional event types
}
```

#### Event Publishing Pattern

```typescript
// Event publication from Lambda functions
await EventDal.sendEvents(systemSource, [
  {
    type: MttEventType.trackEvent,
    data: eventData
  }
]);
```

#### Event Subscription Pattern

Functions subscribe to specific event types:

```typescript
new MttFunction(context, {
  id: 'processButtonV2',
  codePath: 'src/device/functions/processing/dash-button-process-event.ts',
  events: [
    { detailType: [MttEventType.reportProcessEvent], access: EventBusAccess.subscribe }
  ]
});
```

### Data Propagation Patterns

#### DynamoDB Streams Integration

DynamoDB changes automatically trigger EventBridge events:

```typescript
const dataToEventBus = new MttFunction(context, {
  id: 'dataToEventBus',
  codePath: 'src/functions/eventbus/from-dynamo.ts',
  handler: 'handler',
  events: [{ access: EventBusAccess.sendMessage }]
});

dataToEventBus.lambda.addEventSource(new DynamoEventSource(dataTable.dynamodb, {
  batchSize: 10,
  startingPosition: StartingPosition.LATEST
}));
```

#### Cross-Service Data Synchronization

Events trigger data synchronization across services:

```typescript
// Student changes propagate to S3 data lake
new MttFunction(context, {
  id: 'studentToS3',
  codePath: 'src/functions/student/prop/studentToS3.ts',
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

## Queue-Based Processing Patterns

### SQS Integration for Reliable Processing

Critical operations use SQS for guaranteed processing:

```typescript
const reportDataQueue = new MttSqs(context, {
  id: 'ReportDataQueue',
  name: `${context.stackName}-${context.region}.fifo`,
  fifo: true,
  contentBasedDeduplication: true,
  hasPhi: true
});

// GraphQL mutation queues data for processing
this.appsync.addLambdaResolver('UpdateDataInReport', {
  sqs: [{ sqs: reportDataQueue, access: SqsAccess.sendMessage}],
  // ... other configuration
});
```

### Batch Processing Pattern

SQS enables batch processing of related operations:

```typescript
new MttFunction(context, {
  id: 'ProcessDataInReport',
  codePath: 'src/graphql/resolver/mutations/report/process.ts',
  sqs: [{ sqs: reportDataQueue, access: SqsAccess.subscribe}],
  // Processes batched report data updates
});
```

## Real-Time Integration Patterns

### GraphQL Subscriptions

Real-time updates flow through GraphQL subscriptions:

1. **Data Change**: Database or API mutation occurs
2. **Event Generation**: EventBridge event published
3. **Subscription Trigger**: AppSync subscription resolver activated
4. **Client Notification**: Connected clients receive real-time updates

### WebSocket Management

AppSync manages WebSocket connections automatically:
- Connection authentication via Cognito
- Subscription authorization per field
- Automatic connection scaling
- Message delivery guarantees

## Cross-Cutting Integration Concerns

### Error Handling and Retry Patterns

- **Lambda Retries**: Automatic retry with exponential backoff
- **DLQ Processing**: Dead letter queues for failed messages
- **Circuit Breakers**: Prevent cascade failures between services

### Monitoring and Observability

- **CloudWatch Integration**: All APIs and functions log to CloudWatch
- **X-Ray Tracing**: Distributed tracing across service boundaries
- **Custom Metrics**: Business metrics published to CloudWatch

### Security Integration

- **IAM Roles**: Least privilege access between services
- **VPC Integration**: Network isolation where required
- **Encryption**: Data encrypted in transit and at rest
- **Audit Logging**: All API calls and data changes logged

## Performance Optimization Patterns

### Caching Strategies

- **DynamoDB DAX**: Microsecond latency for hot data
- **AppSync Caching**: GraphQL response caching
- **Lambda Provisioned Concurrency**: Reduced cold starts

### Data Access Optimization

- **Connection Pooling**: Reuse database connections
- **Batch Operations**: Minimize API calls
- **Consistent Reads**: When data consistency is critical
- **Eventually Consistent**: For better performance when acceptable

## Integration Testing Patterns

### API Testing

- **GraphQL Schema Validation**: Ensure schema compatibility
- **REST API Contract Testing**: Validate API contracts
- **Device API Simulation**: Mock device interactions

### Event Testing

- **Event Schema Validation**: Ensure event structure consistency
- **End-to-End Event Flow**: Test complete event processing chains
- **Event Replay**: Test system recovery and data consistency