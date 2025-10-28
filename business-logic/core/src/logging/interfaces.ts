/**
 * Logging and Monitoring Interfaces
 * Provides structured logging and monitoring capabilities for container services
 */

/**
 * Log levels in order of severity
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log entry structure for consistent formatting across all services
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  correlationId?: string;
  userId?: string;
  requestId?: string;
  message: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  performance?: {
    duration?: number;
    operation?: string;
    resource?: string;
  };
}

/**
 * Logger interface for structured logging
 */
export interface ILogger {
  debug(message: string, metadata?: any): void;
  info(message: string, metadata?: any): void;
  warn(message: string, metadata?: any): void;
  error(message: string, error?: Error, metadata?: any): void;
  
  // Performance logging
  startTimer(operation: string, resource?: string): PerformanceTimer;
  logPerformance(operation: string, duration: number, resource?: string, metadata?: any): void;
  
  // Context management
  setCorrelationId(correlationId: string): void;
  setUserId(userId: string): void;
  setRequestId(requestId: string): void;
  clearContext(): void;
  
  // Child logger with additional context
  child(context: Record<string, any>): ILogger;
}

/**
 * Performance timer for measuring operation duration
 */
export interface PerformanceTimer {
  end(metadata?: any): void;
}

/**
 * Metrics collection interface
 */
export interface IMetricsCollector {
  // Counter metrics
  incrementCounter(name: string, labels?: Record<string, string>): void;
  
  // Gauge metrics
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
  
  // Histogram metrics for timing
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  
  // Database operation metrics
  recordDatabaseOperation(operation: string, duration: number, success: boolean, table?: string): void;
  
  // Message broker metrics
  recordMessageOperation(operation: string, duration: number, success: boolean, queue?: string): void;
  
  // API response metrics
  recordApiResponse(method: string, path: string, statusCode: number, duration: number): void;
  
  // Cache operation metrics
  recordCacheOperation(operation: string, duration: number, hit: boolean): void;
}

/**
 * Health check status
 */
export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded';

/**
 * Individual health check result
 */
export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Overall health check response
 */
export interface HealthCheckResponse {
  status: HealthStatus;
  timestamp: string;
  service: string;
  version?: string;
  uptime: number;
  checks: HealthCheckResult[];
  dependencies: {
    database: HealthCheckResult;
    messageBroker: HealthCheckResult;
    cache: HealthCheckResult;
    external?: HealthCheckResult[];
  };
}

/**
 * Health check interface
 */
export interface IHealthCheck {
  name: string;
  execute(): Promise<HealthCheckResult>;
}

/**
 * Health check manager interface
 */
export interface IHealthCheckManager {
  registerCheck(check: IHealthCheck): void;
  runHealthChecks(): Promise<HealthCheckResponse>;
  getHealthStatus(): Promise<HealthStatus>;
}

/**
 * Correlation ID context for request tracing
 */
export interface CorrelationContext {
  correlationId: string;
  userId?: string;
  requestId?: string;
  parentSpanId?: string;
  traceId?: string;
}

/**
 * Log destination configuration
 */
export interface LogDestination {
  type: 'console' | 'file' | 'elasticsearch' | 'cloudwatch';
  config?: any;
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfiguration {
  serviceName: string;
  version?: string;
  environment: string;
  
  logging: {
    level: LogLevel;
    format: 'json' | 'pretty';
    destinations: LogDestination[];
    includeStack: boolean;
    correlationId: boolean;
  };
  
  metrics: {
    enabled: boolean;
    port?: number;
    path?: string;
    prefix?: string;
  };
  
  healthChecks: {
    enabled: boolean;
    interval: number;
    timeout: number;
    retries: number;
  };
  
  tracing?: {
    enabled: boolean;
    provider?: 'jaeger' | 'zipkin';
    endpoint?: string;
    sampleRate?: number;
  };
}

/**
 * Performance metrics for operations
 */
export interface PerformanceMetrics {
  operation: string;
  resource?: string;
  duration: number;
  success: boolean;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Log aggregation configuration for container orchestration
 */
export interface LogAggregationConfig {
  enabled: boolean;
  format: 'json' | 'logfmt';
  fields: {
    service: boolean;
    version: boolean;
    environment: boolean;
    correlationId: boolean;
    userId: boolean;
    requestId: boolean;
  };
  labels?: Record<string, string>;
}