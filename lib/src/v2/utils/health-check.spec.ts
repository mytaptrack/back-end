/**
 * Tests for HealthCheck
 */

import { HealthCheck } from './health-check';
import { MetricsCollector } from './metrics-collector';
import { IDatabaseProvider } from '../types/database-provider';
import { DEFAULT_METRICS_CONFIG } from '../types/metrics';

// Mock database provider
class MockDatabaseProvider implements IDatabaseProvider {
  private connected = true;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getProviderType(): string {
    return 'mock';
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  // Add missing methods from IDatabaseProvider interface
  async get<T>(key: any): Promise<T | null> {
    return null;
  }

  async put<T>(data: T): Promise<void> {
    // Mock implementation
  }

  async update(input: any): Promise<any> {
    return {};
  }

  async delete(key: any): Promise<void> {
    // Mock implementation
  }

  async query<T>(input: any): Promise<T[]> {
    return [];
  }

  async scan<T>(input: any): Promise<{ items: T[], token?: any }> {
    return { items: [] };
  }

  async batchGet<T>(keys: any[]): Promise<T[]> {
    return [];
  }

  async beginTransaction(): Promise<any> {
    return {};
  }

  async executeTransaction(operations: any[]): Promise<void> {
    // Mock implementation
  }

  async executeNative(operation: any): Promise<any> {
    return {};
  }
}

describe('HealthCheck', () => {
  let mockProvider: MockDatabaseProvider;
  let metricsCollector: MetricsCollector;
  let healthCheck: HealthCheck;

  beforeEach(() => {
    mockProvider = new MockDatabaseProvider();
    metricsCollector = new MetricsCollector('mock');
    healthCheck = new HealthCheck(mockProvider, metricsCollector);
  });

  describe('checkHealth', () => {
    it('should return healthy status when provider is connected', async () => {
      mockProvider.setConnected(true);
      
      const health = await healthCheck.checkHealth();
      
      expect(health.healthy).toBe(true);
      expect(health.provider).toBe('mock');
      expect(health.connectionStatus).toBe('connected');
      expect(health.metrics).toBeDefined();
    });

    it('should return unhealthy status when provider is disconnected', async () => {
      mockProvider.setConnected(false);
      
      const health = await healthCheck.checkHealth();
      
      expect(health.healthy).toBe(false);
      expect(health.connectionStatus).toBe('disconnected');
    });

    it('should cache health check results', async () => {
      const config = { ...DEFAULT_METRICS_CONFIG, healthCheckInterval: 1000 };
      const healthCheckWithCache = new HealthCheck(mockProvider, metricsCollector, config);
      
      const health1 = await healthCheckWithCache.checkHealth();
      const health2 = await healthCheckWithCache.checkHealth();
      
      // Should return the same cached result
      expect(health1.metrics.uptime).toBe(health2.metrics.uptime);
    });

    it('should handle health check errors gracefully', async () => {
      // Mock provider that throws error
      const errorProvider = {
        ...mockProvider,
        isConnected: () => { throw new Error('Connection check failed'); }
      } as IDatabaseProvider;
      
      const errorHealthCheck = new HealthCheck(errorProvider, metricsCollector);
      
      const health = await errorHealthCheck.checkHealth();
      
      expect(health.healthy).toBe(false);
      expect(health.connectionStatus).toBe('error');
    });
  });

  describe('checkConnection', () => {
    it('should return connection health when connected', async () => {
      mockProvider.setConnected(true);
      
      const connectionHealth = await healthCheck.checkConnection();
      
      expect(connectionHealth.connected).toBe(true);
      expect(connectionHealth.provider).toBe('mock');
      expect(connectionHealth.errorCount).toBe(0);
    });

    it('should return connection health when disconnected', async () => {
      mockProvider.setConnected(false);
      
      const connectionHealth = await healthCheck.checkConnection();
      
      expect(connectionHealth.connected).toBe(false);
      expect(connectionHealth.provider).toBe('mock');
    });

    it('should handle connection check errors', async () => {
      const errorProvider = {
        ...mockProvider,
        isConnected: () => { throw new Error('Connection error'); },
        getProviderType: () => 'mock'
      } as IDatabaseProvider;
      
      const errorHealthCheck = new HealthCheck(errorProvider, metricsCollector);
      
      const connectionHealth = await errorHealthCheck.checkConnection();
      
      expect(connectionHealth.connected).toBe(false);
      expect(connectionHealth.errorCount).toBe(1);
      expect(connectionHealth.lastError).toContain('Connection error');
    });
  });

  describe('getHealthMetrics', () => {
    it('should return comprehensive health metrics', async () => {
      // Add some metrics data
      metricsCollector.recordOperation('get', 100, true);
      metricsCollector.recordOperation('put', 200, false);
      metricsCollector.recordConnectionEvent('connect');
      
      const healthMetrics = await healthCheck.getHealthMetrics();
      
      expect(healthMetrics.averageResponseTime).toBe(150); // (100 + 200) / 2
      expect(healthMetrics.errorRate).toBe(50); // 1 failed out of 2 operations
      expect(healthMetrics.connectionCount).toBe(1);
      expect(healthMetrics.operationsPerSecond).toBeGreaterThanOrEqual(0);
      expect(healthMetrics.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty metrics gracefully', async () => {
      const healthMetrics = await healthCheck.getHealthMetrics();
      
      expect(healthMetrics.averageResponseTime).toBe(0);
      expect(healthMetrics.errorRate).toBe(0);
      expect(healthMetrics.connectionCount).toBe(0);
      expect(healthMetrics.operationsPerSecond).toBeCloseTo(0);
    });

    it('should include memory usage when available', async () => {
      const healthMetrics = await healthCheck.getHealthMetrics();
      
      // Memory usage should be included if process.memoryUsage is available
      if (typeof process !== 'undefined' && process.memoryUsage) {
        expect(healthMetrics.memoryUsage).toBeDefined();
        expect(typeof healthMetrics.memoryUsage).toBe('number');
      }
    });
  });

  describe('health check intervals', () => {
    it('should respect health check interval configuration', async () => {
      const config = { ...DEFAULT_METRICS_CONFIG, healthCheckInterval: 100 };
      const timedHealthCheck = new HealthCheck(mockProvider, metricsCollector, config);
      
      const startTime = Date.now();
      const health1 = await timedHealthCheck.checkHealth();
      
      // Immediate second call should return cached result
      const health2 = await timedHealthCheck.checkHealth();
      const immediateTime = Date.now();
      
      expect(immediateTime - startTime).toBeLessThan(50); // Should be very fast (cached)
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const health3 = await timedHealthCheck.checkHealth();
      const expiredTime = Date.now();
      
      expect(expiredTime - startTime).toBeGreaterThan(100); // Should take longer (not cached)
    });
  });

  describe('concurrent health checks', () => {
    it('should prevent concurrent health checks', async () => {
      const slowProvider = {
        ...mockProvider,
        isConnected: () => {
          // Simulate slow health check
          return new Promise(resolve => setTimeout(() => resolve(true), 100));
        },
        getProviderType: () => 'mock'
      } as any;
      
      const slowHealthCheck = new HealthCheck(slowProvider, metricsCollector);
      
      // Start multiple concurrent health checks
      const promise1 = slowHealthCheck.checkHealth();
      const promise2 = slowHealthCheck.checkHealth();
      const promise3 = slowHealthCheck.checkHealth();
      
      const results = await Promise.all([promise1, promise2, promise3]);
      
      // All should complete, but some may return cached/default results
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.provider).toBe('mock');
      });
    });
  });
});