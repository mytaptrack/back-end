/**
 * Performance monitoring and metrics types for database abstraction layer
 */

export interface IMetricsCollector {
  /**
   * Record a database operation with timing and success information
   */
  recordOperation(operation: string, duration: number, success: boolean, metadata?: OperationMetadata): void;
  
  /**
   * Record a connection event (connect, disconnect, error)
   */
  recordConnectionEvent(event: ConnectionEvent, metadata?: ConnectionMetadata): void;
  
  /**
   * Record query performance metrics
   */
  recordQueryPerformance(queryType: string, duration: number, resultCount: number, metadata?: QueryMetadata): void;
  
  /**
   * Get current metrics snapshot
   */
  getMetrics(): MetricsSnapshot;
  
  /**
   * Reset all metrics
   */
  reset(): void;
}

export interface IPerformanceMonitor {
  /**
   * Start monitoring an operation
   */
  startOperation(operationName: string, metadata?: OperationMetadata): OperationTimer;
  
  /**
   * Check if an operation duration exceeds warning threshold
   */
  isSlowOperation(operationName: string, duration: number): boolean;
  
  /**
   * Get performance warnings for slow operations
   */
  getPerformanceWarnings(): PerformanceWarning[];
  
  /**
   * Configure warning thresholds for operations
   */
  setWarningThreshold(operationType: string, thresholdMs: number): void;
}

export interface IHealthCheck {
  /**
   * Check overall health status
   */
  checkHealth(): Promise<HealthStatus>;
  
  /**
   * Check connection health
   */
  checkConnection(): Promise<ConnectionHealth>;
  
  /**
   * Get detailed health metrics
   */
  getHealthMetrics(): Promise<HealthMetrics>;
}

export interface OperationTimer {
  /**
   * Stop the timer and record the operation
   */
  stop(success: boolean, metadata?: OperationMetadata): void;
  
  /**
   * Get elapsed time without stopping
   */
  getElapsed(): number;
}

export interface OperationMetadata {
  provider?: string;
  tableName?: string;
  indexName?: string;
  itemCount?: number;
  errorCode?: string;
  errorMessage?: string;
  [key: string]: any;
}

export interface ConnectionMetadata {
  provider: string;
  endpoint?: string;
  region?: string;
  database?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface QueryMetadata {
  provider: string;
  tableName?: string;
  indexName?: string;
  filterExpression?: string;
  projectionExpression?: string;
  scanIndexForward?: boolean;
}

export type ConnectionEvent = 'connect' | 'disconnect' | 'error' | 'reconnect';

export interface MetricsSnapshot {
  timestamp: Date;
  provider: string;
  operations: OperationMetrics;
  connections: ConnectionMetrics;
  queries: QueryMetrics;
  performance: PerformanceMetrics;
}

export interface OperationMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  errorRate: number;
  operationCounts: Record<string, number>;
  operationTimings: Record<string, OperationTiming>;
}

export interface OperationTiming {
  count: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  successCount: number;
  failureCount: number;
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  connectionEvents: Record<ConnectionEvent, number>;
  lastConnectionTime?: Date;
  lastDisconnectionTime?: Date;
  lastErrorTime?: Date;
}

export interface QueryMetrics {
  totalQueries: number;
  averageQueryTime: number;
  averageResultCount: number;
  queryTypes: Record<string, QueryTiming>;
  slowQueries: SlowQuery[];
}

export interface QueryTiming {
  count: number;
  totalTime: number;
  averageTime: number;
  totalResults: number;
  averageResults: number;
}

export interface SlowQuery {
  queryType: string;
  duration: number;
  resultCount: number;
  timestamp: Date;
  metadata?: QueryMetadata;
}

export interface PerformanceMetrics {
  warningThresholds: Record<string, number>;
  warnings: PerformanceWarning[];
  slowOperations: SlowOperation[];
}

export interface PerformanceWarning {
  operationType: string;
  duration: number;
  threshold: number;
  timestamp: Date;
  metadata?: OperationMetadata;
}

export interface SlowOperation {
  operationName: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  metadata?: OperationMetadata;
}

export interface HealthStatus {
  healthy: boolean;
  provider: string;
  connectionStatus: ConnectionStatus;
  lastSuccessfulOperation?: Date;
  lastFailedOperation?: Date;
  metrics: HealthMetrics;
}

export interface ConnectionHealth {
  connected: boolean;
  provider: string;
  endpoint?: string;
  lastConnectionTime?: Date;
  connectionDuration?: number;
  errorCount: number;
  lastError?: string;
}

export interface HealthMetrics {
  averageResponseTime: number;
  errorRate: number;
  connectionCount: number;
  operationsPerSecond: number;
  uptime: number;
  memoryUsage?: number;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

export interface MetricsConfig {
  enabled: boolean;
  warningThresholds: Record<string, number>;
  slowQueryThreshold: number;
  maxSlowQueries: number;
  maxWarnings: number;
  healthCheckInterval: number;
}

export const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  enabled: true,
  warningThresholds: {
    'get': 100,      // 100ms
    'put': 200,      // 200ms
    'update': 200,   // 200ms
    'delete': 150,   // 150ms
    'query': 500,    // 500ms
    'scan': 1000,    // 1000ms
    'batchGet': 300, // 300ms
    'transaction': 1000 // 1000ms
  },
  slowQueryThreshold: 1000, // 1 second
  maxSlowQueries: 100,
  maxWarnings: 50,
  healthCheckInterval: 30000 // 30 seconds
};