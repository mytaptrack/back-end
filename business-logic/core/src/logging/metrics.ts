/**
 * Metrics Collection Implementation
 * Provides performance metrics collection for database operations, message processing, and API response times
 */

import { IMetricsCollector, MonitoringConfiguration } from './interfaces';

/**
 * Metric types
 */
type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Metric entry for collection
 */
interface MetricEntry {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Prometheus-style metrics collector
 */
export class PrometheusMetricsCollector implements IMetricsCollector {
  private metrics: Map<string, MetricEntry> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private serviceName: string;
  private environment: string;
  private version?: string;
  
  constructor(config: MonitoringConfiguration) {
    this.serviceName = config.serviceName;
    this.environment = config.environment;
    this.version = config.version;
  }
  
  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const key = this.getMetricKey(name, labels);
    const existing = this.metrics.get(key);
    
    this.metrics.set(key, {
      name,
      type: 'counter',
      value: (existing?.value || 0) + 1,
      labels: { ...this.getDefaultLabels(), ...labels },
      timestamp: Date.now()
    });
  }
  
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.getMetricKey(name, labels);
    
    this.metrics.set(key, {
      name,
      type: 'gauge',
      value,
      labels: { ...this.getDefaultLabels(), ...labels },
      timestamp: Date.now()
    });
  }
  
  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.getMetricKey(name, labels);
    
    // Store histogram values for percentile calculation
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    
    const values = this.histograms.get(key)!;
    values.push(value);
    
    // Keep only last 1000 values to prevent memory issues
    if (values.length > 1000) {
      values.shift();
    }
    
    this.metrics.set(key, {
      name,
      type: 'histogram',
      value,
      labels: { ...this.getDefaultLabels(), ...labels },
      timestamp: Date.now()
    });
  }
  
  recordDatabaseOperation(
    operation: string, 
    duration: number, 
    success: boolean, 
    table?: string
  ): void {
    const labels = {
      operation,
      success: success.toString(),
      ...(table && { table })
    };
    
    this.incrementCounter('database_operations_total', labels);
    this.recordHistogram('database_operation_duration_ms', duration, labels);
    
    if (!success) {
      this.incrementCounter('database_errors_total', labels);
    }
  }
  
  recordMessageOperation(
    operation: string, 
    duration: number, 
    success: boolean, 
    queue?: string
  ): void {
    const labels = {
      operation,
      success: success.toString(),
      ...(queue && { queue })
    };
    
    this.incrementCounter('message_operations_total', labels);
    this.recordHistogram('message_operation_duration_ms', duration, labels);
    
    if (!success) {
      this.incrementCounter('message_errors_total', labels);
    }
  }
  
  recordApiResponse(
    method: string, 
    path: string, 
    statusCode: number, 
    duration: number
  ): void {
    const labels = {
      method: method.toUpperCase(),
      path: this.normalizePath(path),
      status_code: statusCode.toString(),
      status_class: `${Math.floor(statusCode / 100)}xx`
    };
    
    this.incrementCounter('http_requests_total', labels);
    this.recordHistogram('http_request_duration_ms', duration, labels);
    
    if (statusCode >= 400) {
      this.incrementCounter('http_errors_total', labels);
    }
  }
  
  recordCacheOperation(operation: string, duration: number, hit: boolean): void {
    const labels = {
      operation,
      result: hit ? 'hit' : 'miss'
    };
    
    this.incrementCounter('cache_operations_total', labels);
    this.recordHistogram('cache_operation_duration_ms', duration, labels);
    
    if (operation === 'get') {
      this.incrementCounter('cache_requests_total', { result: labels.result });
    }
  }
  
  /**
   * Get metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];
    const metricGroups = new Map<string, MetricEntry[]>();
    
    // Group metrics by name
    for (const metric of this.metrics.values()) {
      if (!metricGroups.has(metric.name)) {
        metricGroups.set(metric.name, []);
      }
      metricGroups.get(metric.name)!.push(metric);
    }
    
    // Generate Prometheus format
    for (const [name, metrics] of metricGroups) {
      const firstMetric = metrics[0];
      
      // Add help and type comments
      lines.push(`# HELP ${name} ${this.getMetricHelp(name)}`);
      lines.push(`# TYPE ${name} ${firstMetric.type}`);
      
      // Add metric values
      for (const metric of metrics) {
        const labelStr = this.formatLabels(metric.labels);
        lines.push(`${name}${labelStr} ${metric.value} ${metric.timestamp}`);
      }
      
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  /**
   * Get metrics as JSON
   */
  getMetricsJson(): Record<string, any> {
    const result: Record<string, any> = {
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      environment: this.environment,
      version: this.version,
      metrics: {}
    };
    
    for (const [key, metric] of this.metrics) {
      result.metrics[key] = {
        name: metric.name,
        type: metric.type,
        value: metric.value,
        labels: metric.labels,
        timestamp: new Date(metric.timestamp).toISOString()
      };
    }
    
    return result;
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.histograms.clear();
  }
  
  private getMetricKey(name: string, labels: Record<string, string>): string {
    const sortedLabels = Object.keys(labels)
      .sort()
      .map(key => `${key}=${labels[key]}`)
      .join(',');
    
    return `${name}{${sortedLabels}}`;
  }
  
  private getDefaultLabels(): Record<string, string> {
    return {
      service: this.serviceName,
      environment: this.environment,
      ...(this.version && { version: this.version })
    };
  }
  
  private normalizePath(path: string): string {
    // Replace dynamic path segments with placeholders
    return path
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
      .replace(/\/[a-f0-9]{24}/g, '/:objectid');
  }
  
  private formatLabels(labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) {
      return '';
    }
    
    const labelPairs = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');
    
    return `{${labelPairs}}`;
  }
  
  private getMetricHelp(name: string): string {
    const helpTexts: Record<string, string> = {
      'database_operations_total': 'Total number of database operations',
      'database_operation_duration_ms': 'Duration of database operations in milliseconds',
      'database_errors_total': 'Total number of database errors',
      'message_operations_total': 'Total number of message broker operations',
      'message_operation_duration_ms': 'Duration of message operations in milliseconds',
      'message_errors_total': 'Total number of message broker errors',
      'http_requests_total': 'Total number of HTTP requests',
      'http_request_duration_ms': 'Duration of HTTP requests in milliseconds',
      'http_errors_total': 'Total number of HTTP errors',
      'cache_operations_total': 'Total number of cache operations',
      'cache_operation_duration_ms': 'Duration of cache operations in milliseconds',
      'cache_requests_total': 'Total number of cache requests'
    };
    
    return helpTexts[name] || `Metric: ${name}`;
  }
}

/**
 * Simple in-memory metrics collector for development
 */
export class SimpleMetricsCollector implements IMetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  
  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }
  
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.gauges.set(key, value);
  }
  
  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(value);
  }
  
  recordDatabaseOperation(operation: string, duration: number, success: boolean, table?: string): void {
    this.incrementCounter('db_ops', { operation, success: success.toString(), table: table || 'unknown' });
    this.recordHistogram('db_duration', duration, { operation });
  }
  
  recordMessageOperation(operation: string, duration: number, success: boolean, queue?: string): void {
    this.incrementCounter('msg_ops', { operation, success: success.toString(), queue: queue || 'unknown' });
    this.recordHistogram('msg_duration', duration, { operation });
  }
  
  recordApiResponse(method: string, path: string, statusCode: number, duration: number): void {
    this.incrementCounter('api_requests', { method, path, status: statusCode.toString() });
    this.recordHistogram('api_duration', duration, { method, path });
  }
  
  recordCacheOperation(operation: string, duration: number, hit: boolean): void {
    this.incrementCounter('cache_ops', { operation, hit: hit.toString() });
    this.recordHistogram('cache_duration', duration, { operation });
  }
  
  getStats(): any {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([key, values]) => [
          key,
          {
            count: values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((a, b) => a + b, 0) / values.length
          }
        ])
      )
    };
  }
}

/**
 * Metrics collector factory
 */
export class MetricsCollectorFactory {
  static create(config: MonitoringConfiguration): IMetricsCollector {
    if (config.environment === 'development') {
      return new SimpleMetricsCollector();
    }
    
    return new PrometheusMetricsCollector(config);
  }
}