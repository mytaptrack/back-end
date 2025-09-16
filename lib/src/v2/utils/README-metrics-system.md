# Database Metrics and Performance Monitoring System

The metrics system provides comprehensive performance monitoring, health checking, and metrics collection for the database abstraction layer. It works seamlessly with both DynamoDB and MongoDB providers to give you insights into your database operations.

## Overview

The metrics system consists of several key components:

- **MetricsCollector**: Collects operation timing, success rates, and connection metrics
- **PerformanceMonitor**: Monitors operation performance and identifies slow operations
- **HealthCheck**: Provides health status and connection monitoring
- **MetricsReporter**: Generates formatted reports and exports
- **MetricsManager**: Coordinates all components and provides a unified interface

## Quick Start

```typescript
import { MetricsManager } from '../utils/metrics-manager';
import { DynamoDBProvider } from '../providers/dynamodb-provider';

// Create your database provider
const provider = new DynamoDBProvider({
  region: 'us-east-1',
  primaryTable: 'MyTapTrack-Primary',
  dataTable: 'MyTapTrack-Data'
});

// Create metrics manager
const metricsManager = new MetricsManager(provider);

// Connect and start monitoring
await provider.connect();

// Use operation timers
const timer = metricsManager.startOperation('get', { tableName: 'users' });
// ... perform your database operation
timer.stop(true, { itemCount: 1 });

// Get metrics
const metrics = metricsManager.getMetrics();
console.log(`Total operations: ${metrics.operations.totalOperations}`);
console.log(`Success rate: ${(metrics.operations.successfulOperations / metrics.operations.totalOperations * 100).toFixed(2)}%`);

// Cleanup
metricsManager.destroy();
```

## Configuration

The metrics system is highly configurable:

```typescript
import { DEFAULT_METRICS_CONFIG } from '../types/metrics';

const customConfig = {
  ...DEFAULT_METRICS_CONFIG,
  enabled: true,
  warningThresholds: {
    get: 100,      // 100ms warning threshold for get operations
    put: 200,      // 200ms warning threshold for put operations
    query: 500,    // 500ms warning threshold for queries
    scan: 1000,    // 1000ms warning threshold for scans
    batchGet: 300  // 300ms warning threshold for batch operations
  },
  slowQueryThreshold: 1000,    // Queries slower than 1s are considered slow
  maxSlowQueries: 100,         // Keep last 100 slow queries
  maxWarnings: 50,             // Keep last 50 performance warnings
  healthCheckInterval: 30000   // Health check every 30 seconds
};

const metricsManager = new MetricsManager(provider, customConfig);
```

## Core Features

### 1. Operation Timing

Track the performance of individual database operations:

```typescript
// Method 1: Using operation timers (recommended)
const timer = metricsManager.startOperation('get', { 
  tableName: 'users',
  userId: 'user123' 
});

try {
  const result = await provider.get({ primary: 'user123' });
  timer.stop(true, { itemCount: 1 });
  return result;
} catch (error) {
  timer.stop(false, { errorCode: error.code });
  throw error;
}

// Method 2: Direct recording
const startTime = Date.now();
try {
  const result = await provider.put(userData);
  const duration = Date.now() - startTime;
  metricsManager.recordOperation('put', duration, true, { itemSize: JSON.stringify(userData).length });
} catch (error) {
  const duration = Date.now() - startTime;
  metricsManager.recordOperation('put', duration, false, { errorCode: error.code });
}
```

### 2. Performance Monitoring

Automatically detect and warn about slow operations:

```typescript
// Get performance warnings
const warnings = metricsManager.getPerformanceWarnings();
warnings.forEach(warning => {
  console.log(`Slow ${warning.operationType}: ${warning.duration}ms (threshold: ${warning.threshold}ms)`);
});

// Check if specific operations are healthy
const isGetHealthy = metricsManager.isOperationHealthy('get');
const isPutHealthy = metricsManager.isOperationHealthy('put');

// Get performance recommendations
const recommendations = metricsManager.getPerformanceRecommendations();
recommendations.forEach(rec => console.log(`Recommendation: ${rec}`));
```

### 3. Health Monitoring

Monitor the overall health of your database connections:

```typescript
// Get current health status
const health = await metricsManager.getHealth();
console.log(`Database healthy: ${health.healthy}`);
console.log(`Connection status: ${health.connectionStatus}`);
console.log(`Average response time: ${health.metrics.averageResponseTime}ms`);
console.log(`Error rate: ${health.metrics.errorRate}%`);

// Generate detailed health report
const healthReport = await metricsManager.generateHealthReport();
console.log(`Health status: ${healthReport.status}`);
healthReport.recommendations.forEach(rec => {
  console.log(`Health recommendation: ${rec}`);
});
```

### 4. Metrics Reporting

Generate comprehensive reports in multiple formats:

```typescript
// Generate detailed metrics report
const report = metricsManager.generateReport();
console.log(`Provider: ${report.provider}`);
console.log(`Total operations: ${report.summary.totalOperations}`);
console.log(`Success rate: ${report.summary.successRate}%`);

// Generate performance summary
const perfSummary = metricsManager.generatePerformanceSummary();
console.log(`Overall performance: ${perfSummary.overallStatus}`);

// Export metrics
const jsonExport = metricsManager.exportMetrics('json');
const csvExport = metricsManager.exportMetrics('csv');

// Save to files
fs.writeFileSync('metrics-report.json', jsonExport);
fs.writeFileSync('metrics-report.csv', csvExport);
```

### 5. Real-time Monitoring

Enable continuous monitoring with periodic health checks:

```typescript
const config = {
  enabled: true,
  healthCheckInterval: 30000  // Check health every 30 seconds
};

const metricsManager = new MetricsManager(provider, config);

// Health checks will run automatically in the background
// Unhealthy conditions will be logged to console
```

## Advanced Usage

### Custom Warning Thresholds

Set different performance expectations for different operations:

```typescript
// Set custom thresholds at runtime
metricsManager.updateConfig({
  warningThresholds: {
    get: 50,        // Very fast gets expected
    put: 100,       // Moderate puts
    query: 300,     // Queries can be slower
    scan: 2000,     // Scans are expected to be slow
    batchGet: 200   // Batch operations
  }
});
```

### Metadata Tracking

Include detailed metadata with your operations:

```typescript
const timer = metricsManager.startOperation('query', {
  tableName: 'users',
  indexName: 'email-index',
  operation: 'findUsersByEmail'
});

// ... perform query

timer.stop(true, {
  resultCount: 25,
  filterExpression: 'email = :email',
  projectionExpression: 'userId, email, name',
  scanIndexForward: true
});
```

### Conditional Monitoring

Enable or disable monitoring based on environment:

```typescript
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

metricsManager.setEnabled(isProduction || isDevelopment);

// Or configure different thresholds per environment
const config = {
  warningThresholds: isProduction ? {
    get: 50,   // Strict in production
    put: 100
  } : {
    get: 200,  // Relaxed in development
    put: 500
  }
};
```

### Integration with Logging

Combine metrics with your existing logging system:

```typescript
// Log metrics periodically
setInterval(() => {
  metricsManager.logMetrics();  // Logs to console
  
  // Or integrate with your logger
  const metrics = metricsManager.getMetrics();
  logger.info('Database metrics', {
    provider: metrics.provider,
    totalOps: metrics.operations.totalOperations,
    successRate: (metrics.operations.successfulOperations / metrics.operations.totalOperations * 100),
    avgResponseTime: metrics.operations.averageResponseTime
  });
}, 60000); // Every minute
```

## Metrics Data Structure

### MetricsSnapshot

```typescript
interface MetricsSnapshot {
  timestamp: Date;
  provider: string;
  operations: OperationMetrics;
  connections: ConnectionMetrics;
  queries: QueryMetrics;
  performance: PerformanceMetrics;
}
```

### OperationMetrics

```typescript
interface OperationMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  operationCounts: Record<string, number>;
  operationTimings: Record<string, OperationTiming>;
}
```

### HealthStatus

```typescript
interface HealthStatus {
  healthy: boolean;
  provider: string;
  connectionStatus: 'connected' | 'disconnected' | 'error' | 'connecting';
  lastSuccessfulOperation?: Date;
  lastFailedOperation?: Date;
  metrics: HealthMetrics;
}
```

## Best Practices

### 1. Use Operation Timers

Always use operation timers for accurate timing:

```typescript
// ✅ Good
const timer = metricsManager.startOperation('get');
const result = await provider.get(key);
timer.stop(true);

// ❌ Avoid manual timing (less accurate)
const start = Date.now();
const result = await provider.get(key);
metricsManager.recordOperation('get', Date.now() - start, true);
```

### 2. Include Meaningful Metadata

Provide context that helps with debugging:

```typescript
const timer = metricsManager.startOperation('query', {
  tableName: 'users',
  indexName: 'email-index',
  operation: 'findActiveUsers'
});

// ... perform operation

timer.stop(true, {
  resultCount: results.length,
  filterApplied: true,
  cacheHit: false
});
```

### 3. Handle Errors Properly

Always record failed operations:

```typescript
const timer = metricsManager.startOperation('put');
try {
  await provider.put(data);
  timer.stop(true, { itemSize: JSON.stringify(data).length });
} catch (error) {
  timer.stop(false, { 
    errorCode: error.code,
    errorMessage: error.message 
  });
  throw error;
}
```

### 4. Monitor Health Regularly

Set up regular health monitoring:

```typescript
// Check health every 5 minutes and alert if unhealthy
setInterval(async () => {
  const health = await metricsManager.getHealth();
  if (!health.healthy) {
    // Send alert to monitoring system
    alerting.sendAlert('Database unhealthy', {
      provider: health.provider,
      connectionStatus: health.connectionStatus,
      errorRate: health.metrics.errorRate
    });
  }
}, 300000);
```

### 5. Clean Up Resources

Always clean up when done:

```typescript
// In your application shutdown handler
process.on('SIGTERM', () => {
  metricsManager.destroy();  // Stops health check intervals
  provider.disconnect();
});
```

## Troubleshooting

### High Memory Usage

If you notice high memory usage:

```typescript
// Reduce the number of stored slow queries and warnings
metricsManager.updateConfig({
  maxSlowQueries: 50,    // Reduce from default 100
  maxWarnings: 25        // Reduce from default 50
});

// Or reset metrics periodically
setInterval(() => {
  metricsManager.reset();
}, 3600000); // Reset every hour
```

### Performance Impact

The metrics system is designed to be lightweight, but if you notice performance impact:

```typescript
// Disable in performance-critical sections
metricsManager.setEnabled(false);
await performCriticalOperation();
metricsManager.setEnabled(true);

// Or use sampling
let operationCount = 0;
const timer = (++operationCount % 10 === 0) ? 
  metricsManager.startOperation('get') : null;

const result = await provider.get(key);

if (timer) {
  timer.stop(true);
}
```

### Missing Metrics

If metrics aren't being recorded:

1. Check if metrics are enabled: `metricsManager.setEnabled(true)`
2. Verify operation timers are being stopped: `timer.stop(success)`
3. Check for errors in console logs
4. Verify the provider is properly connected

## Integration with Existing Code

The metrics system is designed to integrate seamlessly with existing database abstraction layer code. See the [metrics integration example](../examples/metrics-integration-example.ts) for comprehensive usage examples.