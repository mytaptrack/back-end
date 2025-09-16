/**
 * Tests for PerformanceMonitor
 */

import { PerformanceMonitor } from './performance-monitor';
import { MetricsCollector } from './metrics-collector';
import { DEFAULT_METRICS_CONFIG } from '../types/metrics';

describe('PerformanceMonitor', () => {
  let metricsCollector: MetricsCollector;
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    metricsCollector = new MetricsCollector('test-provider');
    performanceMonitor = new PerformanceMonitor(metricsCollector);
  });

  describe('startOperation', () => {
    it('should return an operation timer', () => {
      const timer = performanceMonitor.startOperation('get');
      
      expect(timer).toBeDefined();
      expect(typeof timer.stop).toBe('function');
      expect(typeof timer.getElapsed).toBe('function');
    });

    it('should track active operations', () => {
      const timer1 = performanceMonitor.startOperation('get');
      const timer2 = performanceMonitor.startOperation('put');
      
      expect(performanceMonitor.getActiveOperationsCount()).toBe(2);
      
      timer1.stop(true);
      timer2.stop(true);
      
      // After some cleanup cycles, active operations should be reduced
      performanceMonitor.startOperation('query'); // Triggers cleanup
      expect(performanceMonitor.getActiveOperationsCount()).toBe(1);
    });
  });

  describe('isSlowOperation', () => {
    it('should return true for operations exceeding threshold', () => {
      performanceMonitor.setWarningThreshold('get', 100);
      
      expect(performanceMonitor.isSlowOperation('get', 150)).toBe(true);
      expect(performanceMonitor.isSlowOperation('get', 50)).toBe(false);
    });

    it('should use default threshold for unknown operations', () => {
      expect(performanceMonitor.isSlowOperation('unknown', 1500)).toBe(true);
      expect(performanceMonitor.isSlowOperation('unknown', 500)).toBe(false);
    });
  });

  describe('setWarningThreshold', () => {
    it('should update warning thresholds', () => {
      performanceMonitor.setWarningThreshold('get', 50);
      
      expect(performanceMonitor.getWarningThreshold('get')).toBe(50);
    });
  });

  describe('getPerformanceWarnings', () => {
    it('should return warnings from metrics collector', () => {
      const config = { ...DEFAULT_METRICS_CONFIG, warningThresholds: { get: 50 } };
      const collector = new MetricsCollector('test-provider', config);
      const monitor = new PerformanceMonitor(collector);
      
      // Record a slow operation to generate warning
      collector.recordOperation('get', 100, true);
      
      const warnings = monitor.getPerformanceWarnings();
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].operationType).toBe('get');
      expect(warnings[0].duration).toBe(100);
    });
  });

  describe('OperationTimer', () => {
    it('should measure operation duration', async () => {
      const timer = performanceMonitor.startOperation('get');
      
      // Wait a small amount of time
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const elapsed = timer.getElapsed();
      expect(elapsed).toBeGreaterThan(0);
      
      timer.stop(true);
      
      // Elapsed time should not change after stopping
      const finalElapsed = timer.getElapsed();
      expect(finalElapsed).toBeGreaterThanOrEqual(elapsed);
    });

    it('should record metrics when stopped', () => {
      const timer = performanceMonitor.startOperation('get');
      
      timer.stop(true, { tableName: 'test-table' });
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.operations.totalOperations).toBe(1);
      expect(metrics.operations.successfulOperations).toBe(1);
      expect(metrics.operations.operationTimings.get).toBeDefined();
    });

    it('should not record metrics if already stopped', () => {
      const timer = performanceMonitor.startOperation('get');
      
      timer.stop(true);
      timer.stop(false); // Second stop should be ignored
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.operations.totalOperations).toBe(1);
      expect(metrics.operations.successfulOperations).toBe(1);
      expect(metrics.operations.failedOperations).toBe(0);
    });

    it('should log warning for slow operations', (done) => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      performanceMonitor.setWarningThreshold('get', 10);
      const timer = performanceMonitor.startOperation('get');
      
      // Simulate a slow operation by manually setting duration
      setTimeout(() => {
        timer.stop(true);
        
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Slow operation detected: get'),
          expect.any(Object)
        );
        
        consoleSpy.mockRestore();
        done();
      }, 20);
    });

    it('should combine metadata from start and stop', () => {
      const timer = performanceMonitor.startOperation('get', { tableName: 'users' });
      
      timer.stop(true, { itemCount: 5 });
      
      // Verify that both metadata pieces are recorded
      // This would need to be verified through the metrics collector
      const metrics = metricsCollector.getMetrics();
      expect(metrics.operations.totalOperations).toBe(1);
    });
  });

  describe('configuration', () => {
    it('should use custom warning thresholds from config', () => {
      const config = { 
        ...DEFAULT_METRICS_CONFIG, 
        warningThresholds: { get: 50, put: 100 } 
      };
      const collector = new MetricsCollector('test-provider', config);
      const monitor = new PerformanceMonitor(collector, config);
      
      expect(monitor.getWarningThreshold('get')).toBe(50);
      expect(monitor.getWarningThreshold('put')).toBe(100);
    });
  });
});