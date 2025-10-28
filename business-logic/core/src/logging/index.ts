/**
 * Logging and Monitoring Module
 * Exports all logging, metrics, and health check functionality
 */

// Core interfaces
export * from './interfaces';

// Logger implementation
export * from './logger';

// Metrics collection
export * from './metrics';

// Health checks
export * from './health-checks';

// Express middleware
export * from './middleware';

// Convenience exports for common use cases
export { LoggerFactory } from './logger';
export { MetricsCollectorFactory } from './metrics';
export { HealthCheckFactory, HealthCheckManager } from './health-checks';
export { CorrelationUtils } from './logger';

/**
 * Create a complete monitoring setup for a container service
 */
import { MonitoringConfiguration, ILogger, IMetricsCollector, IHealthCheckManager } from './interfaces';
import { LoggerFactory } from './logger';
import { MetricsCollectorFactory } from './metrics';
import { HealthCheckManager } from './health-checks';

export interface MonitoringSetup {
  logger: ILogger;
  metrics: IMetricsCollector;
  healthCheckManager: IHealthCheckManager;
}

export function createMonitoringSetup(config: MonitoringConfiguration): MonitoringSetup {
  const logger = LoggerFactory.create(config);
  const metrics = MetricsCollectorFactory.create(config);
  const healthCheckManager = new HealthCheckManager(config, logger);
  
  return {
    logger,
    metrics,
    healthCheckManager
  };
}

/**
 * Create monitoring setup from environment variables
 */
export function createMonitoringSetupFromEnv(serviceName: string): MonitoringSetup {
  const logger = LoggerFactory.createFromEnv(serviceName);
  
  const config: MonitoringConfiguration = {
    serviceName,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.SERVICE_VERSION,
    logging: {
      level: (process.env.LOG_LEVEL as any) || 'info',
      format: (process.env.LOG_FORMAT as any) || 'json',
      destinations: [],
      includeStack: process.env.LOG_INCLUDE_STACK === 'true',
      correlationId: true
    },
    metrics: {
      enabled: process.env.METRICS_ENABLED !== 'false',
      port: parseInt(process.env.METRICS_PORT || '9090'),
      path: process.env.METRICS_PATH || '/metrics'
    },
    healthChecks: {
      enabled: process.env.HEALTH_CHECKS_ENABLED !== 'false',
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
      timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),
      retries: parseInt(process.env.HEALTH_CHECK_RETRIES || '3')
    }
  };
  
  const metrics = MetricsCollectorFactory.create(config);
  const healthCheckManager = new HealthCheckManager(config, logger);
  
  return {
    logger,
    metrics,
    healthCheckManager
  };
}