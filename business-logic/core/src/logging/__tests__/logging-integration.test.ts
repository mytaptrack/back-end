/**
 * Logging and Monitoring Integration Tests
 * Tests the comprehensive logging and monitoring system
 */

import test from 'node:test';
import test from 'node:test';
import { describe } from 'node:test';
import test from 'node:test';
import test from 'node:test';
import { describe } from 'node:test';
import test from 'node:test';
import test from 'node:test';
import test from 'node:test';
import test from 'node:test';
import { describe } from 'node:test';
import test from 'node:test';
import test from 'node:test';
import test from 'node:test';
import test from 'node:test';
import { describe } from 'node:test';
import test from 'node:test';
import test from 'node:test';
import test from 'node:test';
import test from 'node:test';
import test from 'node:test';
import test from 'node:test';
import { describe } from 'node:test';
import test from 'node:test';
import test from 'node:test';
import test from 'node:test';
import test from 'node:test';
import { describe } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { 
  ContainerLogger, 
  PrometheusMetricsCollector, 
  HealthCheckManager,
  DatabaseHealthCheck,
  MessageBrokerHealthCheck,
  CacheHealthCheck,
  MemoryHealthCheck,
  CorrelationUtils,
  createMonitoringSetup
} from '../index';

describe('Logging and Monitoring Integration', () => {
  let logger: ContainerLogger;
  let metrics: PrometheusMetricsCollector;
  let healthCheckManager: HealthCheckManager;
  
  const mockConfig = {
    serviceName: 'test-service',
    environment: 'test',
    version: '1.0.0',
    logging: {
      level: 'info' as const,
      format: 'json' as const,
      destinations: [],
      includeStack: true,
      correlationId: true
    },
    metrics: {
      enabled: true,
      port: 9090,
      path: '/metrics'
    },
    healthChecks: {
      enabled: true,
      interval: 30000,
      timeout: 5000,
      retries: 3
    }
  };
  
  beforeEach(() => {
    const setup = createMonitoringSetup(mockConfig);
    logger = setup.logger as ContainerLogger;
    metrics = setup.metrics as PrometheusMetricsCollector;
    healthCheckManager = setup.healthCheckManager as HealthCheckManager;
  });
  
  describe('Structured Logging', () => {
    test('should create structured log entries', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      logger.info('Test message', { key: 'value' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"info"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test message"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"service":"test-service"')
      );
      
      consoleSpy.mockRestore();
    });
    
    test('should include correlation ID in logs', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const correlationId = 'test-correlation-id';
      
      logger.setCorrelationId(correlationId);
      logger.info('Test message with correlation');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`"correlationId":"${correlationId}"`)
      );
      
      consoleSpy.mockRestore();
    });
    
    test('should log performance metrics', (done) => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const timer = logger.startTimer('test_operation', 'test_resource');
      
      // Simulate some work
      setTimeout(() => {
        timer.end({ additional: 'metadata' });
        
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"performance"')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"operation":"test_operation"')
        );
        
        consoleSpy.mockRestore();
        done();
      }, 10);
    });
    
    test('should create child loggers with context', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const childLogger = logger.child({ component: 'test-component' });
      childLogger.info('Child logger message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"component":"test-component"')
      );
      
      consoleSpy.mockRestore();
    });
  });
  
  describe('Metrics Collection', () => {
    test('should record counter metrics', () => {
      metrics.incrementCounter('test_counter', { label: 'value' });
      metrics.incrementCounter('test_counter', { label: 'value' });
      
      const prometheusMetrics = metrics.getPrometheusMetrics();
      
      expect(prometheusMetrics).toContain('test_counter');
      expect(prometheusMetrics).toContain('label="value"');
      expect(prometheusMetrics).toContain(' 2 ');
    });
    
    test('should record gauge metrics', () => {
      metrics.setGauge('test_gauge', 42.5, { type: 'memory' });
      
      const prometheusMetrics = metrics.getPrometheusMetrics();
      
      expect(prometheusMetrics).toContain('test_gauge');
      expect(prometheusMetrics).toContain('type="memory"');
      expect(prometheusMetrics).toContain(' 42.5 ');
    });
    
    test('should record histogram metrics', () => {
      metrics.recordHistogram('test_histogram', 100);
      metrics.recordHistogram('test_histogram', 200);
      metrics.recordHistogram('test_histogram', 150);
      
      const prometheusMetrics = metrics.getPrometheusMetrics();
      
      expect(prometheusMetrics).toContain('test_histogram');
    });
    
    test('should record database operation metrics', () => {
      metrics.recordDatabaseOperation('get', 50, true, 'users');
      metrics.recordDatabaseOperation('put', 100, false, 'users');
      
      const prometheusMetrics = metrics.getPrometheusMetrics();
      
      expect(prometheusMetrics).toContain('database_operations_total');
      expect(prometheusMetrics).toContain('database_operation_duration_ms');
      expect(prometheusMetrics).toContain('operation="get"');
      expect(prometheusMetrics).toContain('success="true"');
      expect(prometheusMetrics).toContain('success="false"');
    });
    
    test('should record API response metrics', () => {
      metrics.recordApiResponse('GET', '/api/users', 200, 150);
      metrics.recordApiResponse('POST', '/api/users', 400, 200);
      
      const prometheusMetrics = metrics.getPrometheusMetrics();
      
      expect(prometheusMetrics).toContain('http_requests_total');
      expect(prometheusMetrics).toContain('http_request_duration_ms');
      expect(prometheusMetrics).toContain('method="GET"');
      expect(prometheusMetrics).toContain('status_code="200"');
      expect(prometheusMetrics).toContain('status_code="400"');
    });
    
    test('should provide metrics in JSON format', () => {
      metrics.incrementCounter('test_counter');
      metrics.setGauge('test_gauge', 100);
      
      const jsonMetrics = metrics.getMetricsJson();
      
      expect(jsonMetrics).toHaveProperty('service', 'test-service');
      expect(jsonMetrics).toHaveProperty('environment', 'test');
      expect(jsonMetrics).toHaveProperty('metrics');
      expect(Object.keys(jsonMetrics.metrics)).toEqual(
        expect.arrayContaining([expect.stringContaining('test_counter')])
      );
    });
  });
  
  describe('Health Checks', () => {
    test('should register and run health checks', async () => {
      const mockDataAccess = {
        isConnected: jest.fn().mockResolvedValue(true)
      };
      
      const dbHealthCheck = new DatabaseHealthCheck(mockDataAccess, logger);
      healthCheckManager.registerCheck(dbHealthCheck);
      
      const result = await healthCheckManager.runHealthChecks();
      
      expect(result.status).toBe('healthy');
      expect(result.checks.length).toBeGreaterThanOrEqual(1); // at least database check
      expect(result.dependencies.database.status).toBe('healthy');
      expect(mockDataAccess.isConnected).toHaveBeenCalled();
    });
    
    test('should handle health check failures', async () => {
      const mockDataAccess = {
        isConnected: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };
      
      const dbHealthCheck = new DatabaseHealthCheck(mockDataAccess, logger);
      healthCheckManager.registerCheck(dbHealthCheck);
      
      const result = await healthCheckManager.runHealthChecks();
      
      expect(result.status).toBe('unhealthy');
      expect(result.dependencies.database.status).toBe('unhealthy');
      expect(result.dependencies.database.message).toContain('Connection failed');
    });
    
    test('should run memory health check', async () => {
      const memoryCheck = new MemoryHealthCheck(logger);
      const result = await memoryCheck.execute();
      
      expect(result.name).toBe('memory');
      expect(result.status).toMatch(/healthy|degraded|unhealthy/);
      expect(result.metadata).toHaveProperty('heapUsed');
      expect(result.metadata).toHaveProperty('heapTotal');
    });
    
    test('should handle health check timeouts', async () => {
      const slowDataAccess = {
        isConnected: () => new Promise(resolve => setTimeout(resolve, 10000))
      };
      
      const dbHealthCheck = new DatabaseHealthCheck(slowDataAccess, logger, 100);
      const result = await dbHealthCheck.execute();
      
      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('timeout');
    });
  });
  
  describe('Correlation ID Management', () => {
    test('should generate correlation IDs', () => {
      const correlationId = CorrelationUtils.generateId();
      
      expect(correlationId).toBeDefined();
      expect(typeof correlationId).toBe('string');
      expect(correlationId.length).toBeGreaterThan(0);
    });
    
    test('should extract correlation ID from headers', () => {
      const headers = {
        'x-correlation-id': 'test-correlation-id'
      };
      
      const correlationId = CorrelationUtils.extractFromHeaders(headers);
      
      expect(correlationId).toBe('test-correlation-id');
    });
    
    test('should generate correlation ID if not in headers', () => {
      const headers = {};
      
      const correlationId = CorrelationUtils.extractFromHeaders(headers);
      
      expect(correlationId).toBeDefined();
      expect(typeof correlationId).toBe('string');
    });
    
    test('should extract user ID from headers', () => {
      const headers = {
        'x-user-id': 'user-123'
      };
      
      const userId = CorrelationUtils.extractUserId(headers);
      
      expect(userId).toBe('user-123');
    });
  });
  
  describe('Error Handling', () => {
    test('should log errors with stack traces', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const error = new Error('Test error');
      
      logger.error('Error occurred', error, { context: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"error"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"name":"Error"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test error"')
      );
      
      consoleSpy.mockRestore();
    });
    
    test('should handle logging without errors', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      logger.warn('Warning message', { warning: true });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"warn"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.not.stringContaining('"error"')
      );
      
      consoleSpy.mockRestore();
    });
  });
  
  describe('Integration Tests', () => {
    test('should create complete monitoring setup', () => {
      const setup = createMonitoringSetup(mockConfig);
      
      expect(setup.logger).toBeDefined();
      expect(setup.metrics).toBeDefined();
      expect(setup.healthCheckManager).toBeDefined();
    });
    
    test('should work with async operations', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      logger.setCorrelationId('async-test');
      
      await CorrelationUtils.runWithContext(
        { correlationId: 'async-test', userId: 'user-123' },
        async () => {
          logger.info('Async operation');
          
          const timer = logger.startTimer('async_operation');
          
          await new Promise(resolve => setTimeout(resolve, 10));
          
          timer.end();
        }
      );
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"correlationId":"async-test"')
      );
      
      consoleSpy.mockRestore();
    });
  });
});