/**
 * Comprehensive metrics manager that coordinates all monitoring components
 */

import {
  IMetricsCollector,
  IPerformanceMonitor,
  IHealthCheck,
  MetricsSnapshot,
  HealthStatus,
  PerformanceWarning,
  MetricsConfig,
  DEFAULT_METRICS_CONFIG,
  OperationTimer,
  OperationMetadata
} from '../types/metrics';
import { IDatabaseProvider } from '../types/database-provider';
import { MetricsCollector } from './metrics-collector';
import { PerformanceMonitor } from './performance-monitor';
import { HealthCheck } from './health-check';
import { MetricsReporter, IMetricsReporter, MetricsReport, HealthReport, PerformanceSummary } from './metrics-reporter';

export interface IMetricsManager {
  /**
   * Start monitoring an operation
   */
  startOperation(operationName: string, metadata?: OperationMetadata): OperationTimer;
  
  /**
   * Record a completed operation
   */
  recordOperation(operation: string, duration: number, success: boolean, metadata?: OperationMetadata): void;
  
  /**
   * Get current metrics snapshot
   */
  getMetrics(): MetricsSnapshot;
  
  /**
   * Get health status
   */
  getHealth(): Promise<HealthStatus>;
  
  /**
   * Get performance warnings
   */
  getPerformanceWarnings(): PerformanceWarning[];
  
  /**
   * Generate comprehensive metrics report
   */
  generateReport(): MetricsReport;
  
  /**
   * Generate health report
   */
  generateHealthReport(): Promise<HealthReport>;
  
  /**
   * Generate performance summary
   */
  generatePerformanceSummary(): PerformanceSummary;
  
  /**
   * Export metrics in various formats
   */
  exportMetrics(format: 'json' | 'csv'): string;
  
  /**
   * Reset all metrics
   */
  reset(): void;
  
  /**
   * Enable or disable metrics collection
   */
  setEnabled(enabled: boolean): void;
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<MetricsConfig>): void;
}

export class MetricsManager implements IMetricsManager {
  private metricsCollector: IMetricsCollector;
  private performanceMonitor: IPerformanceMonitor;
  private healthCheck: IHealthCheck;
  private metricsReporter: IMetricsReporter;
  private config: MetricsConfig;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    private provider: IDatabaseProvider,
    config: Partial<MetricsConfig> = {}
  ) {
    this.config = { ...DEFAULT_METRICS_CONFIG, ...config };
    
    // Initialize components
    this.metricsCollector = new MetricsCollector(
      provider.getProviderType(),
      this.config
    );
    
    this.performanceMonitor = new PerformanceMonitor(
      this.metricsCollector as MetricsCollector,
      this.config
    );
    
    this.healthCheck = new HealthCheck(
      provider,
      this.metricsCollector as MetricsCollector,
      this.config
    );
    
    this.metricsReporter = new MetricsReporter();
    
    // Start periodic health checks if enabled
    if (this.config.enabled && this.config.healthCheckInterval > 0) {
      this.startPeriodicHealthChecks();
    }
  }

  startOperation(operationName: string, metadata?: OperationMetadata): OperationTimer {
    return this.performanceMonitor.startOperation(operationName, metadata);
  }

  recordOperation(
    operation: string,
    duration: number,
    success: boolean,
    metadata?: OperationMetadata
  ): void {
    this.metricsCollector.recordOperation(operation, duration, success, metadata);
  }

  getMetrics(): MetricsSnapshot {
    return this.metricsCollector.getMetrics();
  }

  async getHealth(): Promise<HealthStatus> {
    return await this.healthCheck.checkHealth();
  }

  getPerformanceWarnings(): PerformanceWarning[] {
    return this.performanceMonitor.getPerformanceWarnings();
  }

  generateReport(): MetricsReport {
    const metrics = this.getMetrics();
    return this.metricsReporter.generateReport(metrics);
  }

  async generateHealthReport(): Promise<HealthReport> {
    const health = await this.getHealth();
    return this.metricsReporter.generateHealthReport(health);
  }

  generatePerformanceSummary(): PerformanceSummary {
    const metrics = this.getMetrics();
    return this.metricsReporter.generatePerformanceSummary(metrics);
  }

  exportMetrics(format: 'json' | 'csv'): string {
    const metrics = this.getMetrics();
    
    switch (format) {
      case 'json':
        return this.metricsReporter.exportMetricsAsJson(metrics);
      case 'csv':
        return this.metricsReporter.exportMetricsAsCsv(metrics);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  reset(): void {
    this.metricsCollector.reset();
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    
    // Update the metrics collector configuration
    this.metricsCollector = new MetricsCollector(
      this.provider.getProviderType(),
      { ...this.config, enabled }
    );
    
    // Update performance monitor with new collector
    this.performanceMonitor = new PerformanceMonitor(
      this.metricsCollector as MetricsCollector,
      this.config
    );
    
    // Update health check with new collector
    this.healthCheck = new HealthCheck(
      this.provider,
      this.metricsCollector as MetricsCollector,
      this.config
    );
    
    if (enabled && !this.healthCheckInterval) {
      this.startPeriodicHealthChecks();
    } else if (!enabled && this.healthCheckInterval) {
      this.stopPeriodicHealthChecks();
    }
  }

  updateConfig(config: Partial<MetricsConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update warning thresholds in performance monitor
    if (config.warningThresholds) {
      for (const [operation, threshold] of Object.entries(config.warningThresholds)) {
        this.performanceMonitor.setWarningThreshold(operation, threshold);
      }
    }
    
    // Restart health checks if interval changed
    if (config.healthCheckInterval !== undefined) {
      this.stopPeriodicHealthChecks();
      if (this.config.enabled && this.config.healthCheckInterval > 0) {
        this.startPeriodicHealthChecks();
      }
    }
  }

  /**
   * Get detailed metrics breakdown by operation type
   */
  getOperationBreakdown(): Record<string, any> {
    const metrics = this.getMetrics();
    return metrics.operations.operationTimings;
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): any {
    const metrics = this.getMetrics();
    return metrics.connections;
  }

  /**
   * Get query performance statistics
   */
  getQueryStats(): any {
    const metrics = this.getMetrics();
    return metrics.queries;
  }

  /**
   * Check if a specific operation is performing well
   */
  isOperationHealthy(operationName: string): boolean {
    const metrics = this.getMetrics();
    const operationTiming = metrics.operations.operationTimings[operationName];
    
    if (!operationTiming) {
      return true; // No data means no problems
    }
    
    const successRate = operationTiming.successCount / operationTiming.count;
    const avgTime = operationTiming.averageTime;
    const threshold = this.config.warningThresholds[operationName] || 1000;
    
    return successRate >= 0.95 && avgTime <= threshold;
  }

  /**
   * Get recommendations for performance improvements
   */
  getPerformanceRecommendations(): string[] {
    const summary = this.generatePerformanceSummary();
    return summary.recommendations;
  }

  /**
   * Log current metrics to console (for debugging)
   */
  logMetrics(): void {
    const metrics = this.getMetrics();
    const report = this.generateReport();
    
    console.log('=== Database Metrics Report ===');
    console.log(`Provider: ${report.provider}`);
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`Total Operations: ${report.summary.totalOperations}`);
    console.log(`Success Rate: ${report.summary.successRate.toFixed(2)}%`);
    console.log(`Average Response Time: ${report.summary.averageResponseTime.toFixed(2)}ms`);
    console.log(`Active Connections: ${report.summary.activeConnections}`);
    console.log(`Error Rate: ${report.summary.errorRate.toFixed(2)}%`);
    
    if (report.performance.warnings.length > 0) {
      console.log('\n=== Performance Warnings ===');
      report.performance.warnings.forEach(warning => {
        console.log(`${warning.type}: ${warning.duration}ms (threshold: ${warning.threshold}ms) - ${warning.severity}`);
      });
    }
    
    if (report.performance.slowOperations.length > 0) {
      console.log('\n=== Slow Operations ===');
      report.performance.slowOperations.forEach(op => {
        console.log(`${op.operation}: ${op.duration}ms - ${op.success ? 'SUCCESS' : 'FAILED'} - ${op.severity}`);
      });
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopPeriodicHealthChecks();
  }

  private startPeriodicHealthChecks(): void {
    if (this.healthCheckInterval) {
      return; // Already started
    }
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.healthCheck.checkHealth();
        
        // Log health issues
        if (!health.healthy) {
          console.warn('Database health check failed:', {
            provider: health.provider,
            connectionStatus: health.connectionStatus,
            errorRate: health.metrics.errorRate,
            averageResponseTime: health.metrics.averageResponseTime
          });
        }
      } catch (error) {
        console.error('Health check error:', error);
      }
    }, this.config.healthCheckInterval);
  }

  private stopPeriodicHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }
}