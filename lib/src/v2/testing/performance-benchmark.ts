/**
 * Performance Benchmark
 * Provides performance testing and benchmarking capabilities for database providers
 */

import { IDataAccessLayer, DatabaseKey, UnifiedQueryInput, UnifiedScanInput } from '../types/database-abstraction';
import { TestDataManager } from './test-data-manager';

export interface BenchmarkResult {
  operationType: string;
  totalOperations: number;
  totalDuration: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  throughput: number; // operations per second
  successRate: number;
  errors: number;
  provider: string;
}

export interface BenchmarkSuite {
  suiteName: string;
  results: BenchmarkResult[];
  totalDuration: number;
  summary: {
    totalOperations: number;
    overallThroughput: number;
    overallSuccessRate: number;
  };
}

export interface PerformanceThresholds {
  maxAverageLatency: number; // milliseconds
  minThroughput: number; // operations per second
  minSuccessRate: number; // percentage (0-1)
}

/**
 * Performance benchmarking utility for database providers
 */
export class PerformanceBenchmark {
  private testDataManager: TestDataManager;
  private defaultThresholds: PerformanceThresholds;

  constructor(testDataManager: TestDataManager, thresholds?: PerformanceThresholds) {
    this.testDataManager = testDataManager;
    this.defaultThresholds = thresholds || {
      maxAverageLatency: 100, // 100ms
      minThroughput: 50, // 50 ops/sec
      minSuccessRate: 0.99 // 99%
    };
  }

  /**
   * Benchmark single operations (CRUD)
   */
  async benchmarkSingleOperations(
    provider: IDataAccessLayer,
    operationCount: number = 100
  ): Promise<BenchmarkResult> {
    const operations: Array<() => Promise<void>> = [];
    const testItems = Array.from({ length: operationCount }, () => 
      this.testDataManager.generateTestItem()
    );

    // Prepare operations
    for (let i = 0; i < operationCount; i++) {
      const item = testItems[i];
      operations.push(async () => {
        // Put operation
        await provider.put(item);
        
        // Get operation
        await provider.get(item.key);
        
        // Update operation
        await provider.update({
          key: item.key,
          updates: { benchmarkUpdate: Date.now() }
        });
        
        // Delete operation
        await provider.delete(item.key);
      });
    }

    return await this.runBenchmark('single-operations', operations, provider);
  }

  /**
   * Benchmark batch operations
   */
  async benchmarkBatchOperations(
    provider: IDataAccessLayer,
    batchSize: number = 25,
    batchCount: number = 10
  ): Promise<BenchmarkResult> {
    const operations: Array<() => Promise<void>> = [];
    
    for (let batch = 0; batch < batchCount; batch++) {
      const batchItems = Array.from({ length: batchSize }, () => 
        this.testDataManager.generateTestItem()
      );

      operations.push(async () => {
        // Batch put operations
        const putPromises = batchItems.map(item => provider.put(item));
        await Promise.all(putPromises);

        // Batch get operations
        const keys = batchItems.map(item => item.key);
        await provider.batchGet(keys);

        // Cleanup
        const deletePromises = batchItems.map(item => provider.delete(item.key));
        await Promise.all(deletePromises);
      });
    }

    return await this.runBenchmark('batch-operations', operations, provider);
  }

  /**
   * Benchmark query operations
   */
  async benchmarkQueryOperations(
    provider: IDataAccessLayer,
    queryCount: number = 50
  ): Promise<BenchmarkResult> {
    // Setup test data with same partition keys
    const partitionGroups = 10;
    const itemsPerPartition = 20;
    
    for (let group = 0; group < partitionGroups; group++) {
      const items = this.testDataManager.generateTestItemsWithSamePartition(
        itemsPerPartition,
        `BENCHMARK#PARTITION#${group}`
      );
      
      for (const item of items) {
        await provider.put(item);
      }
    }

    const operations: Array<() => Promise<void>> = [];
    
    for (let i = 0; i < queryCount; i++) {
      const partitionIndex = i % partitionGroups;
      const queryInput: UnifiedQueryInput = {
        keyCondition: {
          field: 'pk',
          operator: '=',
          value: `BENCHMARK#PARTITION#${partitionIndex}`
        },
        limit: 10
      };

      operations.push(async () => {
        await provider.query(queryInput);
      });
    }

    const result = await this.runBenchmark('query-operations', operations, provider);

    // Cleanup test data
    for (let group = 0; group < partitionGroups; group++) {
      const items = this.testDataManager.generateTestItemsWithSamePartition(
        itemsPerPartition,
        `BENCHMARK#PARTITION#${group}`
      );
      
      for (const item of items) {
        try {
          await provider.delete(item.key);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }

    return result;
  }

  /**
   * Benchmark scan operations
   */
  async benchmarkScanOperations(
    provider: IDataAccessLayer,
    scanCount: number = 20
  ): Promise<BenchmarkResult> {
    // Setup test data
    const testItems = Array.from({ length: 100 }, () => 
      this.testDataManager.generateTestItem()
    );
    
    for (const item of testItems) {
      await provider.put(item);
    }

    const operations: Array<() => Promise<void>> = [];
    
    for (let i = 0; i < scanCount; i++) {
      const scanInput: UnifiedScanInput = {
        limit: 10,
        filterCondition: {
          field: 'type',
          operator: '=',
          value: 'test-item'
        }
      };

      operations.push(async () => {
        await provider.scan(scanInput);
      });
    }

    const result = await this.runBenchmark('scan-operations', operations, provider);

    // Cleanup test data
    for (const item of testItems) {
      try {
        await provider.delete(item.key);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    return result;
  }

  /**
   * Benchmark concurrent operations
   */
  async benchmarkConcurrentOperations(
    provider: IDataAccessLayer,
    concurrencyLevel: number = 10,
    operationsPerWorker: number = 20
  ): Promise<BenchmarkResult> {
    const workers: Array<() => Promise<void>> = [];
    
    for (let worker = 0; worker < concurrencyLevel; worker++) {
      workers.push(async () => {
        for (let op = 0; op < operationsPerWorker; op++) {
          const item = this.testDataManager.generateTestItem();
          
          await provider.put(item);
          await provider.get(item.key);
          await provider.update({
            key: item.key,
            updates: { workerUpdate: worker, opUpdate: op }
          });
          await provider.delete(item.key);
        }
      });
    }

    return await this.runBenchmark('concurrent-operations', workers, provider);
  }

  /**
   * Run a complete benchmark suite
   */
  async runBenchmarkSuite(
    provider: IDataAccessLayer,
    suiteName: string = 'default'
  ): Promise<BenchmarkSuite> {
    const startTime = Date.now();
    const results: BenchmarkResult[] = [];

    console.log(`Starting benchmark suite: ${suiteName} for provider: ${provider.getProviderType()}`);

    try {
      // Single operations benchmark
      console.log('Running single operations benchmark...');
      results.push(await this.benchmarkSingleOperations(provider, 50));

      // Batch operations benchmark
      console.log('Running batch operations benchmark...');
      results.push(await this.benchmarkBatchOperations(provider, 10, 5));

      // Query operations benchmark
      console.log('Running query operations benchmark...');
      results.push(await this.benchmarkQueryOperations(provider, 25));

      // Scan operations benchmark
      console.log('Running scan operations benchmark...');
      results.push(await this.benchmarkScanOperations(provider, 10));

      // Concurrent operations benchmark
      console.log('Running concurrent operations benchmark...');
      results.push(await this.benchmarkConcurrentOperations(provider, 5, 10));

    } catch (error) {
      console.error('Benchmark suite failed:', error);
      throw error;
    }

    const totalDuration = Date.now() - startTime;
    const totalOperations = results.reduce((sum, result) => sum + result.totalOperations, 0);
    const overallThroughput = totalOperations / (totalDuration / 1000);
    const overallSuccessRate = results.reduce((sum, result) => sum + result.successRate, 0) / results.length;

    const suite: BenchmarkSuite = {
      suiteName,
      results,
      totalDuration,
      summary: {
        totalOperations,
        overallThroughput,
        overallSuccessRate
      }
    };

    console.log(`Benchmark suite completed: ${suiteName}`);
    this.printBenchmarkSummary(suite);

    return suite;
  }

  /**
   * Compare performance between two providers
   */
  async compareProviders(
    provider1: IDataAccessLayer,
    provider2: IDataAccessLayer,
    suiteName: string = 'comparison'
  ): Promise<{ 
    provider1: BenchmarkSuite; 
    provider2: BenchmarkSuite; 
    comparison: any 
  }> {
    console.log('Starting provider comparison benchmark...');

    const [suite1, suite2] = await Promise.all([
      this.runBenchmarkSuite(provider1, `${suiteName}-${provider1.getProviderType()}`),
      this.runBenchmarkSuite(provider2, `${suiteName}-${provider2.getProviderType()}`)
    ]);

    const comparison = this.generateComparison(suite1, suite2);

    return {
      provider1: suite1,
      provider2: suite2,
      comparison
    };
  }

  /**
   * Validate performance against thresholds
   */
  validatePerformance(
    result: BenchmarkResult,
    thresholds?: PerformanceThresholds
  ): { passed: boolean; violations: string[] } {
    const limits = thresholds || this.defaultThresholds;
    const violations: string[] = [];

    if (result.averageLatency > limits.maxAverageLatency) {
      violations.push(
        `Average latency ${result.averageLatency}ms exceeds threshold ${limits.maxAverageLatency}ms`
      );
    }

    if (result.throughput < limits.minThroughput) {
      violations.push(
        `Throughput ${result.throughput} ops/sec below threshold ${limits.minThroughput} ops/sec`
      );
    }

    if (result.successRate < limits.minSuccessRate) {
      violations.push(
        `Success rate ${(result.successRate * 100).toFixed(2)}% below threshold ${(limits.minSuccessRate * 100).toFixed(2)}%`
      );
    }

    return {
      passed: violations.length === 0,
      violations
    };
  }

  /**
   * Run a benchmark with timing and error tracking
   */
  private async runBenchmark(
    operationType: string,
    operations: Array<() => Promise<void>>,
    provider: IDataAccessLayer
  ): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    let errors = 0;
    const startTime = Date.now();

    console.log(`Running ${operationType} benchmark with ${operations.length} operations...`);

    for (const operation of operations) {
      const opStartTime = Date.now();
      
      try {
        await operation();
        const latency = Date.now() - opStartTime;
        latencies.push(latency);
      } catch (error) {
        errors++;
        console.warn(`Operation failed:`, error);
      }
    }

    const totalDuration = Date.now() - startTime;
    const successfulOperations = latencies.length;
    const averageLatency = latencies.length > 0 ? 
      latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0;
    const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
    const throughput = successfulOperations / (totalDuration / 1000);
    const successRate = successfulOperations / operations.length;

    const result: BenchmarkResult = {
      operationType,
      totalOperations: operations.length,
      totalDuration,
      averageLatency,
      minLatency,
      maxLatency,
      throughput,
      successRate,
      errors,
      provider: provider.getProviderType()
    };

    console.log(`${operationType} completed: ${successfulOperations}/${operations.length} successful, ${throughput.toFixed(2)} ops/sec`);

    return result;
  }

  /**
   * Generate comparison between two benchmark suites
   */
  private generateComparison(suite1: BenchmarkSuite, suite2: BenchmarkSuite): any {
    const comparison: any = {
      summary: {
        throughputRatio: suite1.summary.overallThroughput / suite2.summary.overallThroughput,
        successRateComparison: {
          provider1: suite1.summary.overallSuccessRate,
          provider2: suite2.summary.overallSuccessRate
        }
      },
      operationComparisons: {}
    };

    // Compare individual operations
    for (const result1 of suite1.results) {
      const result2 = suite2.results.find(r => r.operationType === result1.operationType);
      if (result2) {
        comparison.operationComparisons[result1.operationType] = {
          latencyRatio: result1.averageLatency / result2.averageLatency,
          throughputRatio: result1.throughput / result2.throughput,
          successRateComparison: {
            provider1: result1.successRate,
            provider2: result2.successRate
          }
        };
      }
    }

    return comparison;
  }

  /**
   * Print benchmark summary to console
   */
  private printBenchmarkSummary(suite: BenchmarkSuite): void {
    console.log('\n=== Benchmark Summary ===');
    console.log(`Suite: ${suite.suiteName}`);
    console.log(`Total Duration: ${suite.totalDuration}ms`);
    console.log(`Total Operations: ${suite.summary.totalOperations}`);
    console.log(`Overall Throughput: ${suite.summary.overallThroughput.toFixed(2)} ops/sec`);
    console.log(`Overall Success Rate: ${(suite.summary.overallSuccessRate * 100).toFixed(2)}%`);
    
    console.log('\n--- Operation Details ---');
    for (const result of suite.results) {
      console.log(`${result.operationType}:`);
      console.log(`  Avg Latency: ${result.averageLatency.toFixed(2)}ms`);
      console.log(`  Throughput: ${result.throughput.toFixed(2)} ops/sec`);
      console.log(`  Success Rate: ${(result.successRate * 100).toFixed(2)}%`);
      console.log(`  Errors: ${result.errors}`);
    }
    console.log('========================\n');
  }
}