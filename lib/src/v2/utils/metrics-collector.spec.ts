/**
 * Tests for MetricsCollector
 */

import { MetricsCollector } from './metrics-collector';
import { DEFAULT_METRICS_CONFIG } from '../types/metrics';

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;

  beforeEach(() => {
    metricsCollector = new MetricsCollector('test-provider');
  });

  describe('recordOperation', () => {
    it('should record successful operations', () => {
      metricsCollector.recordOperation('get', 100, true);
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.operations.totalOperations).toBe(1);
      expect(metrics.operations.successfulOperations).toBe(1);
      expect(metrics.operations.failedOperations).toBe(0);
      expect(metrics.operations.averageResponseTime).toBe(100);
      expect(metrics.operations.operationTimings.get).toBeDefined();
      expect(metrics.operations.operationTimings.get.count).toBe(1);
      expect(metrics.operations.operationTimings.get.averageTime).toBe(100);
      expect(metrics.operations.operationTimings.get.successCount).toBe(1);
    });

    it('should record failed operations', () => {
      metricsCollector.recordOperation('put', 200, false);
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.operations.totalOperations).toBe(1);
      expect(metrics.operations.successfulOperations).toBe(0);
      expect(metrics.operations.failedOperations).toBe(1);
      expect(metrics.operations.operationTimings.put.failureCount).toBe(1);
    });

    it('should calculate timing statistics correctly', () => {
      metricsCollector.recordOperation('query', 100, true);
      metricsCollector.recordOperation('query', 200, true);
      metricsCollector.recordOperation('query', 300, true);
      
      const metrics = metricsCollector.getMetrics();
      const queryTiming = metrics.operations.operationTimings.query;
      
      expect(queryTiming.count).toBe(3);
      expect(queryTiming.averageTime).toBe(200);
      expect(queryTiming.minTime).toBe(100);
      expect(queryTiming.maxTime).toBe(300);
      expect(queryTiming.totalTime).toBe(600);
    });

    it('should record slow operations when threshold exceeded', () => {
      const config = { ...DEFAULT_METRICS_CONFIG, warningThresholds: { get: 50 } };
      const collector = new MetricsCollector('test-provider', config);
      
      collector.recordOperation('get', 100, true); // Exceeds threshold of 50ms
      
      const metrics = collector.getMetrics();
      
      expect(metrics.performance.slowOperations).toHaveLength(1);
      expect(metrics.performance.slowOperations[0].operationName).toBe('get');
      expect(metrics.performance.slowOperations[0].duration).toBe(100);
    });

    it('should not record operations when disabled', () => {
      const config = { ...DEFAULT_METRICS_CONFIG, enabled: false };
      const collector = new MetricsCollector('test-provider', config);
      
      collector.recordOperation('get', 100, true);
      
      const metrics = collector.getMetrics();
      
      expect(metrics.operations.totalOperations).toBe(0);
    });
  });

  describe('recordConnectionEvent', () => {
    it('should record connect events', () => {
      metricsCollector.recordConnectionEvent('connect');
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.connections.totalConnections).toBe(1);
      expect(metrics.connections.activeConnections).toBe(1);
      expect(metrics.connections.connectionEvents.connect).toBe(1);
      expect(metrics.connections.lastConnectionTime).toBeDefined();
    });

    it('should record disconnect events', () => {
      metricsCollector.recordConnectionEvent('connect');
      metricsCollector.recordConnectionEvent('disconnect');
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.connections.activeConnections).toBe(0);
      expect(metrics.connections.connectionEvents.disconnect).toBe(1);
      expect(metrics.connections.lastDisconnectionTime).toBeDefined();
    });

    it('should record error events', () => {
      metricsCollector.recordConnectionEvent('error');
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.connections.failedConnections).toBe(1);
      expect(metrics.connections.connectionEvents.error).toBe(1);
      expect(metrics.connections.lastErrorTime).toBeDefined();
    });
  });

  describe('recordQueryPerformance', () => {
    it('should record query performance metrics', () => {
      metricsCollector.recordQueryPerformance('scan', 500, 10);
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.queries.totalQueries).toBe(1);
      expect(metrics.queries.averageQueryTime).toBe(500);
      expect(metrics.queries.averageResultCount).toBe(10);
      expect(metrics.queries.queryTypes.scan).toBeDefined();
      expect(metrics.queries.queryTypes.scan.count).toBe(1);
      expect(metrics.queries.queryTypes.scan.averageTime).toBe(500);
      expect(metrics.queries.queryTypes.scan.averageResults).toBe(10);
    });

    it('should record slow queries', () => {
      const config = { ...DEFAULT_METRICS_CONFIG, slowQueryThreshold: 100 };
      const collector = new MetricsCollector('test-provider', config);
      
      collector.recordQueryPerformance('scan', 200, 5); // Exceeds threshold
      
      const metrics = collector.getMetrics();
      
      expect(metrics.queries.slowQueries).toHaveLength(1);
      expect(metrics.queries.slowQueries[0].queryType).toBe('scan');
      expect(metrics.queries.slowQueries[0].duration).toBe(200);
      expect(metrics.queries.slowQueries[0].resultCount).toBe(5);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      metricsCollector.recordOperation('get', 100, true);
      metricsCollector.recordConnectionEvent('connect');
      metricsCollector.recordQueryPerformance('scan', 200, 5);
      
      metricsCollector.reset();
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.operations.totalOperations).toBe(0);
      expect(metrics.connections.totalConnections).toBe(0);
      expect(metrics.queries.totalQueries).toBe(0);
      expect(metrics.performance.slowOperations).toHaveLength(0);
      expect(metrics.performance.warnings).toHaveLength(0);
    });
  });

  describe('getMetrics', () => {
    it('should return complete metrics snapshot', () => {
      metricsCollector.recordOperation('get', 100, true);
      metricsCollector.recordConnectionEvent('connect');
      metricsCollector.recordQueryPerformance('scan', 200, 5);
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.timestamp).toBeInstanceOf(Date);
      expect(metrics.provider).toBe('test-provider');
      expect(metrics.operations).toBeDefined();
      expect(metrics.connections).toBeDefined();
      expect(metrics.queries).toBeDefined();
      expect(metrics.performance).toBeDefined();
    });
  });

  describe('configuration limits', () => {
    it('should limit slow operations to maxSlowQueries', () => {
      const config = { 
        ...DEFAULT_METRICS_CONFIG, 
        warningThresholds: { get: 10 },
        maxSlowQueries: 2 
      };
      const collector = new MetricsCollector('test-provider', config);
      
      // Record 3 slow operations
      collector.recordOperation('get', 50, true);
      collector.recordOperation('get', 60, true);
      collector.recordOperation('get', 70, true);
      
      const metrics = collector.getMetrics();
      
      expect(metrics.performance.slowOperations).toHaveLength(2);
      expect(metrics.performance.slowOperations[0].duration).toBe(60);
      expect(metrics.performance.slowOperations[1].duration).toBe(70);
    });

    it('should limit warnings to maxWarnings', () => {
      const config = { 
        ...DEFAULT_METRICS_CONFIG, 
        warningThresholds: { get: 10 },
        maxWarnings: 2 
      };
      const collector = new MetricsCollector('test-provider', config);
      
      // Record 3 operations that exceed threshold
      collector.recordOperation('get', 50, true);
      collector.recordOperation('get', 60, true);
      collector.recordOperation('get', 70, true);
      
      const metrics = collector.getMetrics();
      
      expect(metrics.performance.warnings).toHaveLength(2);
    });
  });
});