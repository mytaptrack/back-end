/**
 * Metrics reporter for standardized metrics reporting across database providers
 */

import {
  MetricsSnapshot,
  HealthStatus,
  PerformanceWarning,
  SlowQuery,
  SlowOperation
} from '../types/metrics';

export interface IMetricsReporter {
  /**
   * Generate a formatted metrics report
   */
  generateReport(metrics: MetricsSnapshot): MetricsReport;
  
  /**
   * Generate a health status report
   */
  generateHealthReport(health: HealthStatus): HealthReport;
  
  /**
   * Generate a performance summary report
   */
  generatePerformanceSummary(metrics: MetricsSnapshot): PerformanceSummary;
  
  /**
   * Export metrics in JSON format
   */
  exportMetricsAsJson(metrics: MetricsSnapshot): string;
  
  /**
   * Export metrics in CSV format
   */
  exportMetricsAsCsv(metrics: MetricsSnapshot): string;
}

export interface MetricsReport {
  timestamp: string;
  provider: string;
  summary: MetricsSummary;
  operations: OperationReport[];
  connections: ConnectionReport;
  queries: QueryReport[];
  performance: PerformanceReport;
}

export interface MetricsSummary {
  totalOperations: number;
  successRate: number;
  averageResponseTime: number;
  activeConnections: number;
  errorRate: number;
  uptime: string;
}

export interface OperationReport {
  operation: string;
  count: number;
  successRate: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  status: 'healthy' | 'warning' | 'critical';
}

export interface ConnectionReport {
  status: string;
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  lastConnectionTime?: string;
  lastErrorTime?: string;
}

export interface QueryReport {
  queryType: string;
  count: number;
  averageTime: number;
  averageResults: number;
  status: 'healthy' | 'warning' | 'critical';
}

export interface PerformanceReport {
  warnings: WarningReport[];
  slowOperations: SlowOperationReport[];
  slowQueries: SlowQueryReport[];
  thresholds: Record<string, number>;
}

export interface WarningReport {
  type: string;
  duration: number;
  threshold: number;
  timestamp: string;
  severity: 'low' | 'medium' | 'high';
}

export interface SlowOperationReport {
  operation: string;
  duration: number;
  timestamp: string;
  success: boolean;
  severity: 'low' | 'medium' | 'high';
}

export interface SlowQueryReport {
  queryType: string;
  duration: number;
  resultCount: number;
  timestamp: string;
  severity: 'low' | 'medium' | 'high';
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  provider: string;
  connectionStatus: string;
  lastSuccessfulOperation?: string;
  lastFailedOperation?: string;
  metrics: {
    averageResponseTime: number;
    errorRate: number;
    connectionCount: number;
    operationsPerSecond: number;
    uptime: string;
  };
  recommendations: string[];
}

export interface PerformanceSummary {
  overallStatus: 'excellent' | 'good' | 'fair' | 'poor';
  keyMetrics: {
    averageResponseTime: number;
    successRate: number;
    errorRate: number;
    throughput: number;
  };
  topSlowOperations: SlowOperationReport[];
  criticalWarnings: WarningReport[];
  recommendations: string[];
}

export class MetricsReporter implements IMetricsReporter {
  generateReport(metrics: MetricsSnapshot): MetricsReport {
    return {
      timestamp: metrics.timestamp.toISOString(),
      provider: metrics.provider,
      summary: this.generateSummary(metrics),
      operations: this.generateOperationReports(metrics),
      connections: this.generateConnectionReport(metrics),
      queries: this.generateQueryReports(metrics),
      performance: this.generatePerformanceReport(metrics)
    };
  }

  generateHealthReport(health: HealthStatus): HealthReport {
    const status = this.determineHealthStatus(health);
    const recommendations = this.generateHealthRecommendations(health);

    return {
      status,
      provider: health.provider,
      connectionStatus: health.connectionStatus,
      lastSuccessfulOperation: health.lastSuccessfulOperation?.toISOString(),
      lastFailedOperation: health.lastFailedOperation?.toISOString(),
      metrics: {
        averageResponseTime: health.metrics.averageResponseTime,
        errorRate: health.metrics.errorRate,
        connectionCount: health.metrics.connectionCount,
        operationsPerSecond: health.metrics.operationsPerSecond,
        uptime: this.formatUptime(health.metrics.uptime)
      },
      recommendations
    };
  }

  generatePerformanceSummary(metrics: MetricsSnapshot): PerformanceSummary {
    const overallStatus = this.determineOverallPerformanceStatus(metrics);
    const keyMetrics = this.extractKeyMetrics(metrics);
    const topSlowOperations = this.getTopSlowOperations(metrics);
    const criticalWarnings = this.getCriticalWarnings(metrics);
    const recommendations = this.generatePerformanceRecommendations(metrics);

    return {
      overallStatus,
      keyMetrics,
      topSlowOperations,
      criticalWarnings,
      recommendations
    };
  }

  exportMetricsAsJson(metrics: MetricsSnapshot): string {
    const report = this.generateReport(metrics);
    return JSON.stringify(report, null, 2);
  }

  exportMetricsAsCsv(metrics: MetricsSnapshot): string {
    const report = this.generateReport(metrics);
    const lines: string[] = [];

    // Header
    lines.push('Timestamp,Provider,Operation,Count,Success Rate,Avg Time,Min Time,Max Time,Status');

    // Operation data
    for (const op of report.operations) {
      lines.push([
        report.timestamp,
        report.provider,
        op.operation,
        op.count.toString(),
        `${(op.successRate * 100).toFixed(2)}%`,
        `${op.averageTime.toFixed(2)}ms`,
        `${op.minTime.toFixed(2)}ms`,
        `${op.maxTime.toFixed(2)}ms`,
        op.status
      ].join(','));
    }

    return lines.join('\n');
  }

  private generateSummary(metrics: MetricsSnapshot): MetricsSummary {
    const successRate = metrics.operations.totalOperations > 0 
      ? metrics.operations.successfulOperations / metrics.operations.totalOperations 
      : 0;
    
    const errorRate = metrics.operations.totalOperations > 0
      ? metrics.operations.failedOperations / metrics.operations.totalOperations
      : 0;

    return {
      totalOperations: metrics.operations.totalOperations,
      successRate: successRate * 100,
      averageResponseTime: metrics.operations.averageResponseTime,
      activeConnections: metrics.connections.activeConnections,
      errorRate: errorRate * 100,
      uptime: this.formatUptime(Date.now() - metrics.timestamp.getTime())
    };
  }

  private generateOperationReports(metrics: MetricsSnapshot): OperationReport[] {
    return Object.entries(metrics.operations.operationTimings).map(([operation, timing]) => {
      const successRate = timing.count > 0 ? timing.successCount / timing.count : 0;
      const status = this.determineOperationStatus(timing, successRate);

      return {
        operation,
        count: timing.count,
        successRate: successRate * 100,
        averageTime: timing.averageTime,
        minTime: timing.minTime === Infinity ? 0 : timing.minTime,
        maxTime: timing.maxTime,
        status
      };
    });
  }

  private generateConnectionReport(metrics: MetricsSnapshot): ConnectionReport {
    return {
      status: metrics.connections.activeConnections > 0 ? 'connected' : 'disconnected',
      totalConnections: metrics.connections.totalConnections,
      activeConnections: metrics.connections.activeConnections,
      failedConnections: metrics.connections.failedConnections,
      lastConnectionTime: metrics.connections.lastConnectionTime?.toISOString(),
      lastErrorTime: metrics.connections.lastErrorTime?.toISOString()
    };
  }

  private generateQueryReports(metrics: MetricsSnapshot): QueryReport[] {
    return Object.entries(metrics.queries.queryTypes).map(([queryType, timing]) => {
      const status = this.determineQueryStatus(timing);

      return {
        queryType,
        count: timing.count,
        averageTime: timing.averageTime,
        averageResults: timing.averageResults,
        status
      };
    });
  }

  private generatePerformanceReport(metrics: MetricsSnapshot): PerformanceReport {
    return {
      warnings: metrics.performance.warnings.map(w => this.convertWarning(w)),
      slowOperations: metrics.performance.slowOperations.map(op => this.convertSlowOperation(op)),
      slowQueries: metrics.queries.slowQueries.map(q => this.convertSlowQuery(q)),
      thresholds: metrics.performance.warningThresholds
    };
  }

  private determineHealthStatus(health: HealthStatus): 'healthy' | 'degraded' | 'unhealthy' {
    if (!health.healthy) return 'unhealthy';
    if (health.metrics.errorRate > 5) return 'degraded';
    if (health.metrics.averageResponseTime > 1000) return 'degraded';
    return 'healthy';
  }

  private determineOperationStatus(timing: any, successRate: number): 'healthy' | 'warning' | 'critical' {
    if (successRate < 0.95) return 'critical';
    if (timing.averageTime > 1000) return 'warning';
    return 'healthy';
  }

  private determineQueryStatus(timing: any): 'healthy' | 'warning' | 'critical' {
    if (timing.averageTime > 2000) return 'critical';
    if (timing.averageTime > 1000) return 'warning';
    return 'healthy';
  }

  private determineOverallPerformanceStatus(metrics: MetricsSnapshot): 'excellent' | 'good' | 'fair' | 'poor' {
    const errorRate = metrics.operations.totalOperations > 0
      ? (metrics.operations.failedOperations / metrics.operations.totalOperations) * 100
      : 0;
    
    const avgResponseTime = metrics.operations.averageResponseTime;

    if (errorRate > 10 || avgResponseTime > 2000) return 'poor';
    if (errorRate > 5 || avgResponseTime > 1000) return 'fair';
    if (errorRate > 1 || avgResponseTime > 500) return 'good';
    return 'excellent';
  }

  private extractKeyMetrics(metrics: MetricsSnapshot) {
    const successRate = metrics.operations.totalOperations > 0
      ? (metrics.operations.successfulOperations / metrics.operations.totalOperations) * 100
      : 0;
    
    const errorRate = metrics.operations.totalOperations > 0
      ? (metrics.operations.failedOperations / metrics.operations.totalOperations) * 100
      : 0;

    return {
      averageResponseTime: metrics.operations.averageResponseTime,
      successRate,
      errorRate,
      throughput: metrics.operations.totalOperations // This could be enhanced to be per-second
    };
  }

  private getTopSlowOperations(metrics: MetricsSnapshot): SlowOperationReport[] {
    return metrics.performance.slowOperations
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5)
      .map(op => this.convertSlowOperation(op));
  }

  private getCriticalWarnings(metrics: MetricsSnapshot): WarningReport[] {
    return metrics.performance.warnings
      .filter(w => w.duration > w.threshold * 2) // Critical if 2x threshold
      .map(w => this.convertWarning(w));
  }

  private convertWarning(warning: PerformanceWarning): WarningReport {
    const severity = this.determineSeverity(warning.duration, warning.threshold);
    
    return {
      type: warning.operationType,
      duration: warning.duration,
      threshold: warning.threshold,
      timestamp: warning.timestamp.toISOString(),
      severity
    };
  }

  private convertSlowOperation(operation: SlowOperation): SlowOperationReport {
    const severity = this.determineOperationSeverity(operation.duration);
    
    return {
      operation: operation.operationName,
      duration: operation.duration,
      timestamp: operation.timestamp.toISOString(),
      success: operation.success,
      severity
    };
  }

  private convertSlowQuery(query: SlowQuery): SlowQueryReport {
    const severity = this.determineQuerySeverity(query.duration);
    
    return {
      queryType: query.queryType,
      duration: query.duration,
      resultCount: query.resultCount,
      timestamp: query.timestamp.toISOString(),
      severity
    };
  }

  private determineSeverity(duration: number, threshold: number): 'low' | 'medium' | 'high' {
    if (duration > threshold * 3) return 'high';
    if (duration > threshold * 2) return 'medium';
    return 'low';
  }

  private determineOperationSeverity(duration: number): 'low' | 'medium' | 'high' {
    if (duration > 5000) return 'high';
    if (duration > 2000) return 'medium';
    return 'low';
  }

  private determineQuerySeverity(duration: number): 'low' | 'medium' | 'high' {
    if (duration > 10000) return 'high';
    if (duration > 5000) return 'medium';
    return 'low';
  }

  private formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private generateHealthRecommendations(health: HealthStatus): string[] {
    const recommendations: string[] = [];

    if (health.metrics.errorRate > 5) {
      recommendations.push('High error rate detected. Review error logs and connection stability.');
    }

    if (health.metrics.averageResponseTime > 1000) {
      recommendations.push('High response times detected. Consider optimizing queries or scaling resources.');
    }

    if (health.connectionStatus === 'error') {
      recommendations.push('Connection issues detected. Check network connectivity and database availability.');
    }

    if (health.metrics.connectionCount === 0) {
      recommendations.push('No active connections. Verify database configuration and connectivity.');
    }

    return recommendations;
  }

  private generatePerformanceRecommendations(metrics: MetricsSnapshot): string[] {
    const recommendations: string[] = [];

    if (metrics.performance.warnings.length > 10) {
      recommendations.push('High number of performance warnings. Review operation thresholds and optimize slow operations.');
    }

    if (metrics.queries.slowQueries.length > 5) {
      recommendations.push('Multiple slow queries detected. Consider adding indexes or optimizing query patterns.');
    }

    if (metrics.operations.averageResponseTime > 500) {
      recommendations.push('Average response time is high. Consider connection pooling or caching strategies.');
    }

    return recommendations;
  }
}