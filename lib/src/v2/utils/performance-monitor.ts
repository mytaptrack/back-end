/**
 * Performance monitor implementation for database operations
 */

import {
  IPerformanceMonitor,
  OperationTimer,
  OperationMetadata,
  PerformanceWarning,
  MetricsConfig,
  DEFAULT_METRICS_CONFIG
} from '../types/metrics';
import { MetricsCollector } from './metrics-collector';

export class PerformanceMonitor implements IPerformanceMonitor {
  private warningThresholds: Map<string, number> = new Map();
  private activeOperations: Map<string, OperationTimerImpl> = new Map();
  private config: MetricsConfig;

  constructor(
    private metricsCollector: MetricsCollector,
    config: Partial<MetricsConfig> = {}
  ) {
    this.config = { ...DEFAULT_METRICS_CONFIG, ...config };
    
    // Initialize warning thresholds
    for (const [operation, threshold] of Object.entries(this.config.warningThresholds)) {
      this.warningThresholds.set(operation, threshold);
    }
  }

  startOperation(operationName: string, metadata?: OperationMetadata): OperationTimer {
    const timer = new OperationTimerImpl(
      operationName,
      this.metricsCollector,
      this,
      metadata
    );
    
    const timerId = `${operationName}_${Date.now()}_${Math.random()}`;
    this.activeOperations.set(timerId, timer);
    
    // Clean up completed operations
    this.cleanupCompletedOperations();
    
    return timer;
  }

  isSlowOperation(operationName: string, duration: number): boolean {
    const threshold = this.warningThresholds.get(operationName) || 
                     this.warningThresholds.get('default') || 
                     1000; // Default 1 second
    
    return duration > threshold;
  }

  getPerformanceWarnings(): PerformanceWarning[] {
    const metrics = this.metricsCollector.getMetrics();
    return metrics.performance.warnings;
  }

  setWarningThreshold(operationType: string, thresholdMs: number): void {
    this.warningThresholds.set(operationType, thresholdMs);
  }

  getWarningThreshold(operationType: string): number {
    return this.warningThresholds.get(operationType) || 
           this.warningThresholds.get('default') || 
           1000;
  }

  getActiveOperationsCount(): number {
    return this.activeOperations.size;
  }

  private cleanupCompletedOperations(): void {
    // Remove completed operations (those that have been stopped)
    for (const [timerId, timer] of this.activeOperations) {
      if (timer.isCompleted()) {
        this.activeOperations.delete(timerId);
      }
    }
  }
}

class OperationTimerImpl implements OperationTimer {
  private startTime: number;
  private endTime?: number;
  private completed: boolean = false;

  constructor(
    private operationName: string,
    private metricsCollector: MetricsCollector,
    private performanceMonitor: PerformanceMonitor,
    private metadata?: OperationMetadata
  ) {
    this.startTime = Date.now();
  }

  stop(success: boolean, metadata?: OperationMetadata): void {
    if (this.completed) {
      return; // Already stopped
    }

    this.endTime = Date.now();
    this.completed = true;
    
    const duration = this.endTime - this.startTime;
    const combinedMetadata = { ...this.metadata, ...metadata };

    // Record the operation in metrics
    this.metricsCollector.recordOperation(
      this.operationName,
      duration,
      success,
      combinedMetadata
    );

    // Check if this is a slow operation and log warning if needed
    if (this.performanceMonitor.isSlowOperation(this.operationName, duration)) {
      this.logSlowOperationWarning(duration, success, combinedMetadata);
    }
  }

  getElapsed(): number {
    const currentTime = this.endTime || Date.now();
    return currentTime - this.startTime;
  }

  isCompleted(): boolean {
    return this.completed;
  }

  private logSlowOperationWarning(
    duration: number,
    success: boolean,
    metadata?: OperationMetadata
  ): void {
    const threshold = this.performanceMonitor.getWarningThreshold(this.operationName);
    
    console.warn(`Slow operation detected: ${this.operationName}`, {
      duration: `${duration}ms`,
      threshold: `${threshold}ms`,
      success,
      metadata,
      timestamp: new Date().toISOString()
    });
  }
}

export { OperationTimerImpl };