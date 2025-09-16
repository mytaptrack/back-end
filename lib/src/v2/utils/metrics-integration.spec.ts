/**
 * Integration tests for the complete metrics system
 */

import { MetricsManager } from './metrics-manager';
import { DynamoDBProvider } from '../providers/dynamodb-provider';
import { MongoDBProvider } from '../providers/mongodb-provider';
import { DEFAULT_METRICS_CONFIG } from '../types/metrics';

// Mock providers for testing
class MockDynamoDBProvider extends DynamoDBProvider {
  constructor() {
    super({
      region: 'us-east-1',
      primaryTable: 'test-primary',
      dataTable: 'test-data'
    });
  }

  async connect(): Promise<void> {
    // Mock connection
  }

  async disconnect(): Promise<void> {
    // Mock disconnection
  }

  isConnected(): boolean {
    return true;
  }
}

class MockMongoDBProvider extends MongoDBProvider {
  constructor() {
    super({
      connectionString: 'mongodb://localhost:27017',
      database: 'test',
      collections: { primary: 'primary', data: 'data' }
    });
  }

  async connect(): Promise<void> {
    // Mock connection
  }

  async disconnect(): Promise<void> {
    // Mock disconnection
  }

  isConnected(): boolean {
    return true;
  }
}

describe('Metrics System Integration', () => {
  describe('DynamoDB Provider Integration', () => {
    let provider: MockDynamoDBProvider;
    let metricsManager: MetricsManager;

    beforeEach(() => {
      provider = new MockDynamoDBProvider();
      metricsManager = new MetricsManager(provider);
    });

    afterEach(() => {
      metricsManager.destroy();
    });

    it('should integrate with DynamoDB provider', async () => {
      await provider.connect();

      // Record some operations
      const getTimer = metricsManager.startOperation('get');
      await new Promise(resolve => setTimeout(resolve, 10));
      getTimer.stop(true, { tableName: 'users' });

      const putTimer = metricsManager.startOperation('put');
      await new Promise(resolve => setTimeout(resolve, 15));
      putTimer.stop(true, { tableName: 'users', itemSize: 1024 });

      // Get metrics
      const metrics = metricsManager.getMetrics();
      expect(metrics.provider).toBe('dynamodb');
      expect(metrics.operations.totalOperations).toBe(2);
      expect(metrics.operations.successfulOperations).toBe(2);

      // Generate report
      const report = metricsManager.generateReport();
      expect(report.provider).toBe('dynamodb');
      expect(report.operations).toHaveLength(2);

      await provider.disconnect();
    });

    it('should monitor health for DynamoDB provider', async () => {
      await provider.connect();

      const health = await metricsManager.getHealth();
      expect(health.provider).toBe('dynamodb');
      expect(health.healthy).toBe(true);

      const healthReport = await metricsManager.generateHealthReport();
      expect(healthReport.provider).toBe('dynamodb');

      await provider.disconnect();
    });
  });

  describe('MongoDB Provider Integration', () => {
    let provider: MockMongoDBProvider;
    let metricsManager: MetricsManager;

    beforeEach(() => {
      provider = new MockMongoDBProvider();
      metricsManager = new MetricsManager(provider);
    });

    afterEach(() => {
      metricsManager.destroy();
    });

    it('should integrate with MongoDB provider', async () => {
      await provider.connect();

      // Record some operations
      metricsManager.recordOperation('query', 150, true, { 
        collection: 'users',
        resultCount: 10 
      });

      metricsManager.recordOperation('update', 80, false, { 
        collection: 'users',
        errorCode: 'DUPLICATE_KEY' 
      });

      // Get metrics
      const metrics = metricsManager.getMetrics();
      expect(metrics.provider).toBe('mongodb');
      expect(metrics.operations.totalOperations).toBe(2);
      expect(metrics.operations.successfulOperations).toBe(1);
      expect(metrics.operations.failedOperations).toBe(1);

      await provider.disconnect();
    });

    it('should monitor health for MongoDB provider', async () => {
      await provider.connect();

      const health = await metricsManager.getHealth();
      expect(health.provider).toBe('mongodb');
      expect(health.healthy).toBe(true);

      await provider.disconnect();
    });
  });

  describe('Cross-Provider Consistency', () => {
    it('should provide consistent metrics across providers', async () => {
      const dynamoProvider = new MockDynamoDBProvider();
      const mongoProvider = new MockMongoDBProvider();
      
      const dynamoMetrics = new MetricsManager(dynamoProvider);
      const mongoMetrics = new MetricsManager(mongoProvider);

      try {
        await dynamoProvider.connect();
        await mongoProvider.connect();

        // Perform identical operations on both providers
        const operations = [
          { name: 'get', duration: 100, success: true },
          { name: 'put', duration: 150, success: true },
          { name: 'query', duration: 200, success: false }
        ];

        for (const op of operations) {
          dynamoMetrics.recordOperation(op.name, op.duration, op.success);
          mongoMetrics.recordOperation(op.name, op.duration, op.success);
        }

        // Compare metrics
        const dynamoSnapshot = dynamoMetrics.getMetrics();
        const mongoSnapshot = mongoMetrics.getMetrics();

        expect(dynamoSnapshot.operations.totalOperations).toBe(mongoSnapshot.operations.totalOperations);
        expect(dynamoSnapshot.operations.successfulOperations).toBe(mongoSnapshot.operations.successfulOperations);
        expect(dynamoSnapshot.operations.failedOperations).toBe(mongoSnapshot.operations.failedOperations);
        expect(dynamoSnapshot.operations.averageResponseTime).toBe(mongoSnapshot.operations.averageResponseTime);

        // Compare reports
        const dynamoReport = dynamoMetrics.generateReport();
        const mongoReport = mongoMetrics.generateReport();

        expect(dynamoReport.summary.totalOperations).toBe(mongoReport.summary.totalOperations);
        expect(dynamoReport.summary.successRate).toBe(mongoReport.summary.successRate);
        expect(dynamoReport.summary.averageResponseTime).toBe(mongoReport.summary.averageResponseTime);

      } finally {
        await dynamoProvider.disconnect();
        await mongoProvider.disconnect();
        dynamoMetrics.destroy();
        mongoMetrics.destroy();
      }
    });
  });

  describe('Performance Monitoring Integration', () => {
    let provider: MockDynamoDBProvider;
    let metricsManager: MetricsManager;

    beforeEach(() => {
      provider = new MockDynamoDBProvider();
      const config = {
        ...DEFAULT_METRICS_CONFIG,
        warningThresholds: { get: 50, put: 100 }
      };
      metricsManager = new MetricsManager(provider, config);
    });

    afterEach(() => {
      metricsManager.destroy();
    });

    it('should detect slow operations across the system', async () => {
      await provider.connect();

      // Record fast operations (should not trigger warnings)
      metricsManager.recordOperation('get', 30, true);
      metricsManager.recordOperation('put', 80, true);

      // Record slow operations (should trigger warnings)
      metricsManager.recordOperation('get', 100, true); // Exceeds 50ms threshold
      metricsManager.recordOperation('put', 200, true); // Exceeds 100ms threshold

      const warnings = metricsManager.getPerformanceWarnings();
      expect(warnings.length).toBeGreaterThan(0);

      const perfSummary = metricsManager.generatePerformanceSummary();
      expect(perfSummary.criticalWarnings.length).toBeGreaterThan(0);

      await provider.disconnect();
    });

    it('should provide performance recommendations', async () => {
      await provider.connect();

      // Create conditions that should trigger recommendations
      for (let i = 0; i < 15; i++) {
        metricsManager.recordOperation('get', 200, true); // Many slow operations
      }

      const recommendations = metricsManager.getPerformanceRecommendations();
      expect(recommendations.length).toBeGreaterThan(0);

      const perfSummary = metricsManager.generatePerformanceSummary();
      expect(perfSummary.recommendations.length).toBeGreaterThan(0);

      await provider.disconnect();
    });
  });

  describe('Export and Reporting Integration', () => {
    let provider: MockDynamoDBProvider;
    let metricsManager: MetricsManager;

    beforeEach(() => {
      provider = new MockDynamoDBProvider();
      metricsManager = new MetricsManager(provider);
    });

    afterEach(() => {
      metricsManager.destroy();
    });

    it('should export metrics in multiple formats', async () => {
      await provider.connect();

      // Generate some metrics data
      metricsManager.recordOperation('get', 100, true);
      metricsManager.recordOperation('put', 150, false);
      metricsManager.recordOperation('query', 200, true);

      // Test JSON export
      const jsonExport = metricsManager.exportMetrics('json');
      expect(typeof jsonExport).toBe('string');
      
      const parsedJson = JSON.parse(jsonExport);
      expect(parsedJson.provider).toBe('dynamodb');
      expect(parsedJson.summary.totalOperations).toBe(3);

      // Test CSV export
      const csvExport = metricsManager.exportMetrics('csv');
      expect(typeof csvExport).toBe('string');
      expect(csvExport).toContain('Timestamp,Provider,Operation');
      expect(csvExport).toContain('get');
      expect(csvExport).toContain('put');
      expect(csvExport).toContain('query');

      await provider.disconnect();
    });

    it('should generate comprehensive reports', async () => {
      await provider.connect();

      // Generate varied metrics data
      const operations = [
        { name: 'get', duration: 50, success: true },
        { name: 'get', duration: 75, success: true },
        { name: 'put', duration: 120, success: true },
        { name: 'put', duration: 180, success: false },
        { name: 'query', duration: 300, success: true },
        { name: 'scan', duration: 1500, success: true }
      ];

      operations.forEach(op => {
        metricsManager.recordOperation(op.name, op.duration, op.success);
      });

      // Generate all report types
      const metricsReport = metricsManager.generateReport();
      const healthReport = await metricsManager.generateHealthReport();
      const perfSummary = metricsManager.generatePerformanceSummary();

      // Verify report completeness
      expect(metricsReport.operations.length).toBeGreaterThan(0);
      expect(metricsReport.summary.totalOperations).toBe(6);
      expect(metricsReport.performance.slowOperations.length).toBeGreaterThan(0);

      expect(healthReport.status).toBeDefined();
      expect(healthReport.metrics.averageResponseTime).toBeGreaterThan(0);

      expect(perfSummary.overallStatus).toBeDefined();
      expect(perfSummary.keyMetrics.averageResponseTime).toBeGreaterThan(0);

      await provider.disconnect();
    });
  });

  describe('Configuration Integration', () => {
    it('should work with custom configurations', async () => {
      const provider = new MockDynamoDBProvider();
      
      const customConfig = {
        ...DEFAULT_METRICS_CONFIG,
        enabled: true,
        warningThresholds: {
          get: 25,
          put: 50,
          query: 100
        },
        slowQueryThreshold: 200,
        maxSlowQueries: 5,
        maxWarnings: 10,
        healthCheckInterval: 5000
      };

      const metricsManager = new MetricsManager(provider, customConfig);

      try {
        await provider.connect();

        // Test custom thresholds
        metricsManager.recordOperation('get', 30, true); // Should trigger warning (threshold: 25ms)
        
        const warnings = metricsManager.getPerformanceWarnings();
        expect(warnings.length).toBeGreaterThan(0);

        // Test configuration updates
        metricsManager.updateConfig({
          warningThresholds: { get: 50 } // Relax threshold
        });

        metricsManager.recordOperation('get', 40, true); // Should not trigger warning now
        
        await provider.disconnect();
      } finally {
        metricsManager.destroy();
      }
    });
  });
});