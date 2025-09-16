/**
 * Database providers index
 * Exports all available database provider implementations
 */

export { DynamoDBProvider } from './dynamodb-provider';
export { MongoDBProvider } from './mongodb-provider';

// Re-export base classes and interfaces for convenience
export {
  BaseDatabaseProvider,
  BaseTransaction,
  ConnectionState,
  IConnectionManager,
  IMetricsCollector,
  DefaultMetricsCollector,
  IDatabaseProviderFactory,
  OperationMetrics
} from '../types/database-provider';