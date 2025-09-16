/**
 * Tests for MetricsManager
 */

import { MetricsManager } from './metrics-manager';
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
}

describe('MetricsManager', () => {
  let mockProvider: MockDatabaseProvider;
  let metricsManager: MetricsManager;

  beforeEach(() => {
    mockProvider = new MockDatabaseProvider();
    metricsManager = new MetricsManager(mockProvider);
  });

  afterEach(() => {
    metricsManager.destroy();
  });

  describe('startOperation', () => {
    it('should return an operation timer', () => {
      const timer = metricsManager.startOperation('get');
      
      expect(timer).toBeDefined();
      expect(typeof timer.stop).toBe('function');
      expect(typeof timer.getElapsed).toBe('function');
    });

    it('should record operation when timer is stopped', () => {
      const timer = metricsManager.startOperation('get');
      timer.stop(true);
      
      const metrics = metricsManager.getMetrics();
      
      expect(metrics.operations.totalOperations).toBe(1);
      expect(metrics.operations.successfulOperations).toBe(1);
    });
  });

  describe('recordOperation', () => {
    it('should record operation metrics', () => {
      metricsManager.recordOperation('put', 150, true, { tableName: 'users' });
      
      const metrics = metricsManager.getMetrics();
      
      expect(metrics.operations.totalOperations).toBe(1);
      expect(metrics.operations.successfulOperations).toBe(1);
      expect(metrics.operations.operationTimings.put.averageTime).toBe(150);
    });
  });

  describe('getHealth', () => {
    it('should return health status', async () => {
      const health = await metricsManager.getHealth();
      
      expect(health).toBeDefined();
      expect(health.provider).toBe('mock');
      expect(health.healthy).toBe(true);
      expect(health.metrics).toBeDefined();
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive metrics report', () => {
      metricsManager.recordOperation('get', 100, true);
      metricsManager.recordOperation('put', 200, false);
      
      const report = metricsManager.generateReport();
      
      expect(report.timestamp).toBeDefined();
      expect(report.provider).toBe('mock');
      expect(report.summary.totalOperations).toBe(2);
      expect(report.summary.successRate).toBe(50);
      expect(report.operations).toHaveLength(2);
    });
  });

  describe('generateHealthReport', () => {
    it('should generate health report', async () => {
      const healthReport = await metricsManager.generateHealthReport();
      
      expect(healthReport.status).toBeDefined();
      expect(healthReport.provider).toBe('mock');
      expect(healthReport.metrics).toBeDefined();
      expect(healthReport.recommendations).toBeDefined();
    });
  });

  describe('generatePerformanceSummary', () => {
    it('should generate performance summary', () => {
      metricsManager.recordOperation('get', 100, true);
      metricsManager.recordOperation('put', 200, true);
      
      const summary = metricsManager.generatePerformanceSummary();
      
      expect(summary.overallStatus).toBeDefined();
      expect(summary.keyMetrics).toBeDefined();
      expect(summary.keyMetrics.averageResponseTime).toBe(150);
      expect(summary.keyMetrics.successRate).toBe(100);
      expect(summary.recommendations).toBeDefined();
    });
  });

  describe('exportMetrics', () => {
    it('should export metrics as JSON', () => {
      metricsManager.recordOperation('get', 100, true);
      
      const jsonExport = metricsManager.exportMetrics('json');
      
      expect(typeof jsonExport).toBe('string');
      const parsed = JSON.parse(jsonExport);
      expect(parsed.provider).toBe('mock');
      expect(parsed.summary.totalOperations).toBe(1);
    });

    it('should export metrics as CSV', () => {
      metricsManager.recordOperation('get', 100, true);
      
      const csvExport = metricsManager.exportMetrics('csv');
      
      expect(typeof csvExport).toBe('string');
      expect(csvExport).toContain('Timestamp,Provider,Operation');
      expect(csvExport).toContain('get');
    });

    it('should throw error for unsupported format', () => {
      expect(() => {
        metricsManager.exportMetrics('xml' as any);
      }).toThrow('Unsupported export format: xml');
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      metricsManager.recordOperation('get', 100, true);
      
      let metrics = metricsManager.getMetrics();
      expect(metrics.operations.totalOperations).toBe(1);
      
      metricsManager.reset();
      
      metrics = metricsManager.getMetrics();
      expect(metrics.operations.totalOperations).toBe(0);
    });
  });

  describe('setEnabled', () => {
    it('should enable/disable metrics collection', () => {
      metricsManager.setEnabled(false);
      metricsManager.recordOperation('get', 100, true);
      
      let metrics = metricsManager.getMetrics();
      expect(metrics.operations.totalOperations).toBe(0);
      
      metricsManager.setEnabled(true);
      metricsManager.recordOperation('put', 200, true);
      
      metrics = metricsManager.getMetrics();
      expect(metrics.operations.totalOperations).toBe(1);
    });
  });

  describe('updateConfig', () => {
    it('should update warning thresholds', () => {
      metricsManager.updateConfig({
        warningThresholds: { get: 50, put: 100 }
      });
      
      const warnings = metricsManager.getPerformanceWarnings();
      expect(warnings).toBeDefined();
    });

    it('should restart health checks when interval changes', () => {
      const config = { healthCheckInterval: 5000 };
      
      expect(() => {
        metricsManager.updateConfig(config);
      }).not.toThrow();
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      metricsManager.recordOperation('get', 100, true);
      metricsManager.recordOperation('put', 200, false);
      metricsManager.recordOperation('query', 300, true);
    });

    it('should get operation breakdown', () => {
      const breakdown = metricsManager.getOperationBreakdown();
      
      expect(breakdown.get).toBeDefined();
      expect(breakdown.put).toBeDefined();
      expect(breakdown.query).toBeDefined();
      expect(breakdown.get.averageTime).toBe(100);
    });

    it('should get connection stats', () => {
      const stats = metricsManager.getConnectionStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalConnections).toBeDefined();
      expect(stats.activeConnections).toBeDefined();
    });

    it('should get query stats', () => {
      const stats = metricsManager.getQueryStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalQueries).toBeDefined();
    });

    it('should check if operation is healthy', () => {
      expect(metricsManager.isOperationHealthy('get')).toBe(true);
      expect(metricsManager.isOperationHealthy('put')).toBe(false); // Failed operation
      expect(metricsManager.isOperationHealthy('nonexistent')).toBe(true); // No data
    });

    it('should get performance recommendations', () => {
      const recommendations = metricsManager.getPerformanceRecommendations();
      
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('logMetrics', () => {
    it('should log metrics to console', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      metricsManager.recordOperation('get', 100, true);
      metricsManager.logMetrics();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Database Metrics Report')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('configuration with health checks', () => {
    it('should start periodic health checks when enabled', () => {
      const config = { 
        ...DEFAULT_METRICS_CONFIG, 
        enabled: true, 
        healthCheckInterval: 100 
      };
      
      const managerWithHealthChecks = new MetricsManager(mockProvider, config);
      
      // Health checks should be running
      expect(() => {
        managerWithHealthChecks.destroy();
      }).not.toThrow();
    });

    it('should not start health checks when disabled', () => {
      const config = { 
        ...DEFAULT_METRICS_CONFIG, 
        enabled: false 
      };
      
      const managerWithoutHealthChecks = new MetricsManager(mockProvider, config);
      
      expect(() => {
        managerWithoutHealthChecks.destroy();
      }).not.toThrow();
    });
  });
});