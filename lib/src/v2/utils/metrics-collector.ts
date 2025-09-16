/**
 * Metrics collector implementation for database operations
 */

import {
  IMetricsCollector,
  OperationMetadata,
  ConnectionEvent,
  ConnectionMetadata,
  QueryMetadata,
  MetricsSnapshot,
  OperationMetrics,
  ConnectionMetrics,
  QueryMetrics,
  PerformanceMetrics,
  OperationTiming,
  QueryTiming,
  SlowQuery,
  PerformanceWarning,
  SlowOperation,
  MetricsConfig,
  DEFAULT_METRICS_CONFIG
} from '../types/metrics';

export class MetricsCollector implements IMetricsCollector {
  private operationMetrics: Map<string, OperationTiming> = new Map();
  private connectionMetrics: ConnectionMetrics;
  private queryMetrics: Map<string, QueryTiming> = new Map();
  private slowQueries: SlowQuery[] = [];
  private warnings: PerformanceWarning[] = [];
  private slowOperations: SlowOperation[] = [];
  private startTime: Date;
  private config: MetricsConfig;

  constructor(
    private provider: string,
    config: Partial<MetricsConfig> = {}
  ) {
    this.config = { ...DEFAULT_METRICS_CONFIG, ...config };
    this.startTime = new Date();
    this.connectionMetrics = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      connectionEvents: {
        connect: 0,
        disconnect: 0,
        error: 0,
        reconnect: 0
      }
    };
  }

  recordOperation(
    operation: string,
    duration: number,
    success: boolean,
    metadata?: OperationMetadata
  ): void {
    if (!this.config.enabled) return;

    // Update operation timing
    const timing = this.operationMetrics.get(operation) || {
      count: 0,
      totalTime: 0,
      averageTime: 0,
      minTime: Infinity,
      maxTime: 0,
      successCount: 0,
      failureCount: 0
    };

    timing.count++;
    timing.totalTime += duration;
    timing.averageTime = timing.totalTime / timing.count;
    timing.minTime = Math.min(timing.minTime, duration);
    timing.maxTime = Math.max(timing.maxTime, duration);

    if (success) {
      timing.successCount++;
    } else {
      timing.failureCount++;
    }

    this.operationMetrics.set(operation, timing);

    // Check for slow operations
    const threshold = this.config.warningThresholds[operation] || 1000;
    if (duration > threshold) {
      this.recordSlowOperation(operation, duration, success, metadata);
      this.recordPerformanceWarning(operation, duration, threshold, metadata);
    }
  }

  recordConnectionEvent(
    event: ConnectionEvent,
    metadata?: ConnectionMetadata
  ): void {
    if (!this.config.enabled) return;

    this.connectionMetrics.connectionEvents[event]++;

    switch (event) {
      case 'connect':
        this.connectionMetrics.totalConnections++;
        this.connectionMetrics.activeConnections++;
        this.connectionMetrics.lastConnectionTime = new Date();
        break;
      case 'disconnect':
        this.connectionMetrics.activeConnections = Math.max(0, this.connectionMetrics.activeConnections - 1);
        this.connectionMetrics.lastDisconnectionTime = new Date();
        break;
      case 'error':
        this.connectionMetrics.failedConnections++;
        this.connectionMetrics.lastErrorTime = new Date();
        break;
      case 'reconnect':
        this.connectionMetrics.activeConnections++;
        break;
    }
  }

  recordQueryPerformance(
    queryType: string,
    duration: number,
    resultCount: number,
    metadata?: QueryMetadata
  ): void {
    if (!this.config.enabled) return;

    // Update query timing
    const timing = this.queryMetrics.get(queryType) || {
      count: 0,
      totalTime: 0,
      averageTime: 0,
      totalResults: 0,
      averageResults: 0
    };

    timing.count++;
    timing.totalTime += duration;
    timing.averageTime = timing.totalTime / timing.count;
    timing.totalResults += resultCount;
    timing.averageResults = timing.totalResults / timing.count;

    this.queryMetrics.set(queryType, timing);

    // Check for slow queries
    if (duration > this.config.slowQueryThreshold) {
      this.recordSlowQuery(queryType, duration, resultCount, metadata);
    }
  }

  getMetrics(): MetricsSnapshot {
    const operationMetrics = this.calculateOperationMetrics();
    const queryMetrics = this.calculateQueryMetrics();
    const performanceMetrics = this.calculatePerformanceMetrics();

    return {
      timestamp: new Date(),
      provider: this.provider,
      operations: operationMetrics,
      connections: { ...this.connectionMetrics },
      queries: queryMetrics,
      performance: performanceMetrics
    };
  }

  reset(): void {
    this.operationMetrics.clear();
    this.queryMetrics.clear();
    this.slowQueries = [];
    this.warnings = [];
    this.slowOperations = [];
    this.startTime = new Date();
    
    this.connectionMetrics = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      connectionEvents: {
        connect: 0,
        disconnect: 0,
        error: 0,
        reconnect: 0
      }
    };
  }

  private recordSlowOperation(
    operationName: string,
    duration: number,
    success: boolean,
    metadata?: OperationMetadata
  ): void {
    const slowOperation: SlowOperation = {
      operationName,
      duration,
      timestamp: new Date(),
      success,
      metadata
    };

    this.slowOperations.push(slowOperation);

    // Keep only the most recent slow operations
    if (this.slowOperations.length > this.config.maxSlowQueries) {
      this.slowOperations = this.slowOperations.slice(-this.config.maxSlowQueries);
    }
  }

  private recordPerformanceWarning(
    operationType: string,
    duration: number,
    threshold: number,
    metadata?: OperationMetadata
  ): void {
    const warning: PerformanceWarning = {
      operationType,
      duration,
      threshold,
      timestamp: new Date(),
      metadata
    };

    this.warnings.push(warning);

    // Keep only the most recent warnings
    if (this.warnings.length > this.config.maxWarnings) {
      this.warnings = this.warnings.slice(-this.config.maxWarnings);
    }
  }

  private recordSlowQuery(
    queryType: string,
    duration: number,
    resultCount: number,
    metadata?: QueryMetadata
  ): void {
    const slowQuery: SlowQuery = {
      queryType,
      duration,
      resultCount,
      timestamp: new Date(),
      metadata
    };

    this.slowQueries.push(slowQuery);

    // Keep only the most recent slow queries
    if (this.slowQueries.length > this.config.maxSlowQueries) {
      this.slowQueries = this.slowQueries.slice(-this.config.maxSlowQueries);
    }
  }

  private calculateOperationMetrics(): OperationMetrics {
    let totalOperations = 0;
    let successfulOperations = 0;
    let failedOperations = 0;
    let totalTime = 0;
    const operationCounts: Record<string, number> = {};
    const operationTimings: Record<string, OperationTiming> = {};

    for (const [operation, timing] of this.operationMetrics) {
      totalOperations += timing.count;
      successfulOperations += timing.successCount;
      failedOperations += timing.failureCount;
      totalTime += timing.totalTime;
      operationCounts[operation] = timing.count;
      operationTimings[operation] = { ...timing };
    }

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      averageResponseTime: totalOperations > 0 ? totalTime / totalOperations : 0,
      errorRate: totalOperations > 0 ? failedOperations / totalOperations : 0,
      operationCounts,
      operationTimings
    };
  }

  private calculateQueryMetrics(): QueryMetrics {
    let totalQueries = 0;
    let totalTime = 0;
    let totalResults = 0;
    const queryTypes: Record<string, QueryTiming> = {};

    for (const [queryType, timing] of this.queryMetrics) {
      totalQueries += timing.count;
      totalTime += timing.totalTime;
      totalResults += timing.totalResults;
      queryTypes[queryType] = { ...timing };
    }

    return {
      totalQueries,
      averageQueryTime: totalQueries > 0 ? totalTime / totalQueries : 0,
      averageResultCount: totalQueries > 0 ? totalResults / totalQueries : 0,
      queryTypes,
      slowQueries: [...this.slowQueries]
    };
  }

  private calculatePerformanceMetrics(): PerformanceMetrics {
    return {
      warningThresholds: { ...this.config.warningThresholds },
      warnings: [...this.warnings],
      slowOperations: [...this.slowOperations]
    };
  }
}