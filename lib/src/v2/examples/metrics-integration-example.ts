/**
 * Example demonstrating how to integrate the metrics system with database providers
 */

import { MetricsManager } from '../utils/metrics-manager';
import { DynamoDBProvider } from '../providers/dynamodb-provider';
import { MongoDBProvider } from '../providers/mongodb-provider';
import { DatabaseConfig } from '../utils/database-config';
import { DEFAULT_METRICS_CONFIG } from '../types/metrics';

/**
 * Example: Basic metrics integration with DynamoDB provider
 */
async function basicMetricsExample() {
  console.log('=== Basic Metrics Integration Example ===');
  
  // Create DynamoDB provider
  const config: DatabaseConfig = {
    provider: 'dynamodb',
    dynamodb: {
      region: 'us-east-1',
      primaryTable: 'MyTapTrack-Primary',
      dataTable: 'MyTapTrack-Data'
    }
  };
  
  const provider = new DynamoDBProvider(config.dynamodb!);
  
  // Create metrics manager with custom configuration
  const metricsConfig = {
    ...DEFAULT_METRICS_CONFIG,
    warningThresholds: {
      get: 100,      // 100ms warning threshold for get operations
      put: 200,      // 200ms warning threshold for put operations
      query: 500,    // 500ms warning threshold for queries
      scan: 1000     // 1000ms warning threshold for scans
    },
    healthCheckInterval: 30000 // Health check every 30 seconds
  };
  
  const metricsManager = new MetricsManager(provider, metricsConfig);
  
  try {
    // Connect to database
    await provider.connect();
    
    // Perform some operations with metrics tracking
    await performOperationsWithMetrics(provider, metricsManager);
    
    // Generate and display reports
    await displayMetricsReports(metricsManager);
    
  } finally {
    await provider.disconnect();
    metricsManager.destroy();
  }
}

/**
 * Example: Advanced metrics with custom monitoring
 */
async function advancedMetricsExample() {
  console.log('\n=== Advanced Metrics Example ===');
  
  const config: DatabaseConfig = {
    provider: 'mongodb',
    mongodb: {
      connectionString: 'mongodb://localhost:27017',
      database: 'mytaptrack',
      collections: {
        primary: 'primary_data',
        data: 'user_data'
      }
    }
  };
  
  const provider = new MongoDBProvider(config.mongodb!);
  const metricsManager = new MetricsManager(provider);
  
  try {
    await provider.connect();
    
    // Demonstrate operation timing with custom metadata
    await demonstrateOperationTiming(provider, metricsManager);
    
    // Show performance monitoring
    await demonstratePerformanceMonitoring(metricsManager);
    
    // Show health monitoring
    await demonstrateHealthMonitoring(metricsManager);
    
  } finally {
    await provider.disconnect();
    metricsManager.destroy();
  }
}

/**
 * Perform database operations with metrics tracking
 */
async function performOperationsWithMetrics(provider: any, metricsManager: MetricsManager) {
  console.log('\nPerforming operations with metrics tracking...');
  
  // Example 1: Using operation timer
  const getTimer = metricsManager.startOperation('get', { 
    tableName: 'users',
    operation: 'getUserById' 
  });
  
  try {
    // Simulate get operation
    await simulateOperation(50); // 50ms operation
    getTimer.stop(true, { itemCount: 1 });
  } catch (error) {
    getTimer.stop(false, { errorCode: 'ITEM_NOT_FOUND' });
  }
  
  // Example 2: Direct operation recording
  metricsManager.recordOperation('put', 120, true, {
    tableName: 'users',
    itemSize: 1024
  });
  
  // Example 3: Query operation with timing
  const queryTimer = metricsManager.startOperation('query');
  await simulateOperation(300); // 300ms query
  queryTimer.stop(true, { resultCount: 25 });
  
  // Example 4: Failed operation
  const failedTimer = metricsManager.startOperation('update');
  await simulateOperation(80);
  failedTimer.stop(false, { errorCode: 'CONDITIONAL_CHECK_FAILED' });
  
  console.log('Operations completed with metrics tracking');
}

/**
 * Demonstrate operation timing with detailed metadata
 */
async function demonstrateOperationTiming(provider: any, metricsManager: MetricsManager) {
  console.log('\nDemonstrating operation timing...');
  
  // Batch operations
  for (let i = 0; i < 10; i++) {
    const timer = metricsManager.startOperation('batchGet', {
      batchSize: 25,
      tableName: 'users'
    });
    
    await simulateOperation(Math.random() * 200 + 50); // 50-250ms
    timer.stop(true, { itemsRetrieved: 25 });
  }
  
  // Some slow operations to trigger warnings
  const slowTimer = metricsManager.startOperation('scan');
  await simulateOperation(1500); // 1.5 second scan
  slowTimer.stop(true, { itemsScanned: 1000, itemsReturned: 50 });
  
  console.log('Operation timing demonstration completed');
}

/**
 * Demonstrate performance monitoring features
 */
async function demonstratePerformanceMonitoring(metricsManager: MetricsManager) {
  console.log('\nDemonstrating performance monitoring...');
  
  // Get performance warnings
  const warnings = metricsManager.getPerformanceWarnings();
  console.log(`Performance warnings: ${warnings.length}`);
  
  warnings.forEach(warning => {
    console.log(`  - ${warning.operationType}: ${warning.duration}ms (threshold: ${warning.threshold}ms)`);
  });
  
  // Check operation health
  const operations = ['get', 'put', 'query', 'scan', 'batchGet'];
  operations.forEach(op => {
    const isHealthy = metricsManager.isOperationHealthy(op);
    console.log(`  ${op}: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
  });
  
  // Get performance recommendations
  const recommendations = metricsManager.getPerformanceRecommendations();
  if (recommendations.length > 0) {
    console.log('\nPerformance recommendations:');
    recommendations.forEach(rec => console.log(`  - ${rec}`));
  }
}

/**
 * Demonstrate health monitoring
 */
async function demonstrateHealthMonitoring(metricsManager: MetricsManager) {
  console.log('\nDemonstrating health monitoring...');
  
  // Get current health status
  const health = await metricsManager.getHealth();
  console.log(`Health status: ${health.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
  console.log(`Connection status: ${health.connectionStatus}`);
  console.log(`Average response time: ${health.metrics.averageResponseTime.toFixed(2)}ms`);
  console.log(`Error rate: ${health.metrics.errorRate.toFixed(2)}%`);
  console.log(`Operations per second: ${health.metrics.operationsPerSecond.toFixed(2)}`);
  
  // Generate health report
  const healthReport = await metricsManager.generateHealthReport();
  console.log(`\nHealth report status: ${healthReport.status}`);
  
  if (healthReport.recommendations.length > 0) {
    console.log('Health recommendations:');
    healthReport.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }
}

/**
 * Display comprehensive metrics reports
 */
async function displayMetricsReports(metricsManager: MetricsManager) {
  console.log('\n=== Metrics Reports ===');
  
  // Basic metrics snapshot
  const metrics = metricsManager.getMetrics();
  console.log(`\nMetrics Snapshot (${metrics.timestamp.toISOString()}):`);
  console.log(`  Provider: ${metrics.provider}`);
  console.log(`  Total operations: ${metrics.operations.totalOperations}`);
  console.log(`  Success rate: ${((metrics.operations.successfulOperations / metrics.operations.totalOperations) * 100).toFixed(2)}%`);
  console.log(`  Average response time: ${metrics.operations.averageResponseTime.toFixed(2)}ms`);
  
  // Detailed report
  const report = metricsManager.generateReport();
  console.log(`\nDetailed Report:`);
  console.log(`  Summary: ${report.summary.totalOperations} ops, ${report.summary.successRate.toFixed(2)}% success`);
  
  console.log(`  Operations:`);
  report.operations.forEach(op => {
    console.log(`    ${op.operation}: ${op.count} ops, ${op.averageTime.toFixed(2)}ms avg, ${op.status}`);
  });
  
  // Performance summary
  const perfSummary = metricsManager.generatePerformanceSummary();
  console.log(`\nPerformance Summary:`);
  console.log(`  Overall status: ${perfSummary.overallStatus}`);
  console.log(`  Key metrics:`);
  console.log(`    Average response time: ${perfSummary.keyMetrics.averageResponseTime.toFixed(2)}ms`);
  console.log(`    Success rate: ${perfSummary.keyMetrics.successRate.toFixed(2)}%`);
  console.log(`    Error rate: ${perfSummary.keyMetrics.errorRate.toFixed(2)}%`);
  
  // Export examples
  console.log('\n=== Export Examples ===');
  
  // JSON export (truncated for display)
  const jsonExport = metricsManager.exportMetrics('json');
  console.log(`JSON export length: ${jsonExport.length} characters`);
  
  // CSV export (first few lines)
  const csvExport = metricsManager.exportMetrics('csv');
  const csvLines = csvExport.split('\n');
  console.log(`CSV export (first 3 lines):`);
  csvLines.slice(0, 3).forEach(line => console.log(`  ${line}`));
}

/**
 * Example: Metrics with custom configuration and monitoring
 */
async function customMetricsConfigExample() {
  console.log('\n=== Custom Metrics Configuration Example ===');
  
  const provider = new DynamoDBProvider({
    region: 'us-east-1',
    primaryTable: 'MyTapTrack-Primary',
    dataTable: 'MyTapTrack-Data'
  });
  
  // Custom metrics configuration
  const customConfig = {
    enabled: true,
    warningThresholds: {
      get: 50,       // Very strict threshold for gets
      put: 100,      // Moderate threshold for puts
      query: 200,    // Relaxed threshold for queries
      scan: 2000,    // Very relaxed threshold for scans
      batchGet: 150  // Custom threshold for batch operations
    },
    slowQueryThreshold: 500,  // 500ms threshold for slow queries
    maxSlowQueries: 20,       // Keep last 20 slow queries
    maxWarnings: 30,          // Keep last 30 warnings
    healthCheckInterval: 15000 // Health check every 15 seconds
  };
  
  const metricsManager = new MetricsManager(provider, customConfig);
  
  try {
    await provider.connect();
    
    // Demonstrate configuration updates
    console.log('Initial warning threshold for get:', customConfig.warningThresholds.get);
    
    // Update configuration at runtime
    metricsManager.updateConfig({
      warningThresholds: {
        ...customConfig.warningThresholds,
        get: 75 // Relax the get threshold
      }
    });
    
    console.log('Updated warning threshold for get: 75ms');
    
    // Perform operations to test new thresholds
    const timer = metricsManager.startOperation('get');
    await simulateOperation(60); // Should not trigger warning now
    timer.stop(true);
    
    const warnings = metricsManager.getPerformanceWarnings();
    console.log(`Warnings after threshold update: ${warnings.length}`);
    
    // Demonstrate enabling/disabling metrics
    metricsManager.setEnabled(false);
    console.log('Metrics disabled');
    
    const disabledTimer = metricsManager.startOperation('put');
    await simulateOperation(100);
    disabledTimer.stop(true);
    
    const metricsDisabled = metricsManager.getMetrics();
    console.log(`Operations recorded while disabled: ${metricsDisabled.operations.totalOperations}`);
    
    metricsManager.setEnabled(true);
    console.log('Metrics re-enabled');
    
  } finally {
    await provider.disconnect();
    metricsManager.destroy();
  }
}

/**
 * Simulate an async operation with specified duration
 */
async function simulateOperation(durationMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, durationMs));
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await basicMetricsExample();
    await advancedMetricsExample();
    await customMetricsConfigExample();
    
    console.log('\n=== All Examples Completed Successfully ===');
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Export examples for use in other modules
export {
  basicMetricsExample,
  advancedMetricsExample,
  customMetricsConfigExample,
  runAllExamples
};

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}