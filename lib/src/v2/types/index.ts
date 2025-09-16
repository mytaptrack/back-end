export * from './app';
export * from './data';
export * from './user';
export * from './student';
export * from './license';
export * from './templates';
export * from './schedule';
export * from './iotEvents';
export * from './subscriptions';
export * from './eventbus';
export * from './lookups';
export * from './timestream';
export * from './lodash-web';

// Database abstraction layer exports
export * from './database-abstraction';
export * from './database-errors';
export * from './database-provider';
export * from './storage-models';

// Metrics exports (avoiding conflicts)
export {
  IMetricsCollector as IMetricsCollectorV2,
  OperationMetrics as OperationMetricsV2,
  PerformanceMetrics as PerformanceMetricsV2,
  MetricsSnapshot,
  ConnectionMetrics,
  QueryMetrics,
  ConnectionEvent,
  OperationMetadata,
  ConnectionMetadata,
  QueryMetadata
} from './metrics';

// Error handling and logging utilities (avoiding conflicts)
export {
  ILogger,
  LoggerFactory,
  PerformanceLogger as DatabasePerformanceLogger,
  ConnectionLogger,
  withLogging,
  logDatabaseOperation,
  LogContext,
  LogEntry
} from '../utils/database-logger';
export * from '../utils/error-handler';
export * from '../utils/retry-manager';
