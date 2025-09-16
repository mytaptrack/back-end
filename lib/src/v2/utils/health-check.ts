/**
 * Health check implementation for database providers
 */

import {
  IHealthCheck,
  HealthStatus,
  ConnectionHealth,
  HealthMetrics,
  ConnectionStatus,
  MetricsConfig,
  DEFAULT_METRICS_CONFIG
} from '../types/metrics';
import { MetricsCollector } from './metrics-collector';
import { IDatabaseProvider } from '../types/database-provider';

export class HealthCheck implements IHealthCheck {
  private config: MetricsConfig;
  private lastHealthCheck?: Date;
  private cachedHealthStatus?: HealthStatus;
  private healthCheckInProgress: boolean = false;

  constructor(
    private provider: IDatabaseProvider,
    private metricsCollector: MetricsCollector,
    config: Partial<MetricsConfig> = {}
  ) {
    this.config = { ...DEFAULT_METRICS_CONFIG, ...config };
  }

  async checkHealth(): Promise<HealthStatus> {
    // Return cached result if recent enough
    if (this.cachedHealthStatus && this.lastHealthCheck) {
      const timeSinceLastCheck = Date.now() - this.lastHealthCheck.getTime();
      if (timeSinceLastCheck < this.config.healthCheckInterval) {
        return this.cachedHealthStatus;
      }
    }

    // Prevent concurrent health checks
    if (this.healthCheckInProgress) {
      return this.cachedHealthStatus || this.createUnhealthyStatus('Health check in progress');
    }

    try {
      this.healthCheckInProgress = true;
      const healthStatus = await this.performHealthCheck();
      
      this.cachedHealthStatus = healthStatus;
      this.lastHealthCheck = new Date();
      
      return healthStatus;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown health check error';
      return this.createUnhealthyStatus(errorMessage);
    } finally {
      this.healthCheckInProgress = false;
    }
  }

  async checkConnection(): Promise<ConnectionHealth> {
    try {
      const isConnected = this.provider.isConnected();
      const metrics = this.metricsCollector.getMetrics();
      
      return {
        connected: isConnected,
        provider: this.provider.getProviderType(),
        lastConnectionTime: metrics.connections.lastConnectionTime,
        connectionDuration: this.calculateConnectionDuration(metrics.connections.lastConnectionTime),
        errorCount: metrics.connections.failedConnections,
        lastError: this.getLastConnectionError()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
      
      return {
        connected: false,
        provider: this.provider.getProviderType(),
        errorCount: 1,
        lastError: errorMessage
      };
    }
  }

  async getHealthMetrics(): Promise<HealthMetrics> {
    const metrics = this.metricsCollector.getMetrics();
    const uptime = this.calculateUptime();
    
    return {
      averageResponseTime: metrics.operations.averageResponseTime,
      errorRate: this.calculateErrorRate(metrics.operations),
      connectionCount: metrics.connections.activeConnections,
      operationsPerSecond: this.calculateOperationsPerSecond(metrics.operations),
      uptime,
      memoryUsage: this.getMemoryUsage()
    };
  }

  private async performHealthCheck(): Promise<HealthStatus> {
    try {
      // Check basic connection
      const connectionHealth = await this.checkConnection();
      
      // Perform a simple operation to verify functionality
      const operationHealthy = await this.performHealthCheckOperation();
      
      // Get current metrics
      const healthMetrics = await this.getHealthMetrics();
      
      // Determine overall health
      const healthy = connectionHealth.connected && operationHealthy;
      
      const metrics = this.metricsCollector.getMetrics();
      
      return {
        healthy,
        provider: this.provider.getProviderType(),
        connectionStatus: this.determineConnectionStatus(connectionHealth),
        lastSuccessfulOperation: this.getLastSuccessfulOperation(metrics),
        lastFailedOperation: this.getLastFailedOperation(metrics),
        metrics: healthMetrics
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Health check failed';
      return this.createUnhealthyStatus(errorMessage);
    }
  }

  private async performHealthCheckOperation(): Promise<boolean> {
    try {
      // This would be implemented by each provider to perform a lightweight operation
      // For now, we'll just check if the provider is connected
      return this.provider.isConnected();
    } catch (error) {
      console.warn('Health check operation failed:', error);
      return false;
    }
  }

  private determineConnectionStatus(connectionHealth: ConnectionHealth): ConnectionStatus {
    if (connectionHealth.connected) {
      return 'connected';
    } else if (connectionHealth.errorCount > 0) {
      return 'error';
    } else {
      return 'disconnected';
    }
  }

  private calculateConnectionDuration(lastConnectionTime?: Date): number | undefined {
    if (!lastConnectionTime) {
      return undefined;
    }
    
    return Date.now() - lastConnectionTime.getTime();
  }

  private calculateErrorRate(operationMetrics: any): number {
    const total = operationMetrics.totalOperations;
    const failed = operationMetrics.failedOperations;
    
    if (total === 0) {
      return 0;
    }
    
    return (failed / total) * 100;
  }

  private calculateOperationsPerSecond(operationMetrics: any): number {
    const uptime = this.calculateUptime();
    const total = operationMetrics.totalOperations;
    
    if (uptime === 0) {
      return 0;
    }
    
    return total / (uptime / 1000); // Convert uptime to seconds
  }

  private calculateUptime(): number {
    // This would typically be tracked from when the provider was initialized
    // For now, we'll use a simple calculation
    return Date.now() - (this.lastHealthCheck?.getTime() || Date.now());
  }

  private getMemoryUsage(): number | undefined {
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const usage = process.memoryUsage();
        return usage.heapUsed;
      }
    } catch (error) {
      // Memory usage not available
    }
    
    return undefined;
  }

  private getLastConnectionError(): string | undefined {
    const metrics = this.metricsCollector.getMetrics();
    
    // This would need to be enhanced to track actual error messages
    if (metrics.connections.failedConnections > 0) {
      return 'Connection error occurred';
    }
    
    return undefined;
  }

  private getLastSuccessfulOperation(metrics: any): Date | undefined {
    // This would need to be enhanced to track actual operation timestamps
    if (metrics.operations.successfulOperations > 0) {
      return new Date(); // Placeholder
    }
    
    return undefined;
  }

  private getLastFailedOperation(metrics: any): Date | undefined {
    // This would need to be enhanced to track actual operation timestamps
    if (metrics.operations.failedOperations > 0) {
      return new Date(); // Placeholder
    }
    
    return undefined;
  }

  private createUnhealthyStatus(reason: string): HealthStatus {
    return {
      healthy: false,
      provider: typeof this.provider.getProviderType === 'function' ? this.provider.getProviderType() : 'unknown',
      connectionStatus: 'error',
      metrics: {
        averageResponseTime: 0,
        errorRate: 100,
        connectionCount: 0,
        operationsPerSecond: 0,
        uptime: 0
      }
    };
  }
}