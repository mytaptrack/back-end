/**
 * Abstract Test Suite for Database Providers
 * Provides a unified testing framework that can run against both DynamoDB and MongoDB providers
 */

import { 
  IDataAccessLayer, 
  DatabaseKey, 
  UnifiedQueryInput, 
  UnifiedScanInput,
  UnifiedUpdateInput,
  TransactionOperation,
  QueryOptions,
  PutOptions,
  UpdateOptions,
  DeleteOptions,
  DatabaseProviderType 
} from '../types/database-abstraction';
import { TestDataManager } from './test-data-manager';
import { TestDatabaseConfig } from './test-database-config';
import { PerformanceBenchmark } from './performance-benchmark';

export interface TestSuiteOptions {
  provider: IDataAccessLayer;
  testDataManager: TestDataManager;
  performanceBenchmark?: PerformanceBenchmark;
  skipPerformanceTests?: boolean;
  testTimeout?: number;
}

export interface TestResult {
  testName: string;
  passed: boolean;
  error?: Error;
  duration: number;
  providerType: DatabaseProviderType;
}

export interface TestSuiteResult {
  providerType: DatabaseProviderType;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  totalDuration: number;
}

/**
 * Abstract test suite that validates database provider implementations
 * Can be run against any provider that implements IDataAccessLayer
 */
export abstract class AbstractTestSuite {
  protected provider: IDataAccessLayer;
  protected testDataManager: TestDataManager;
  protected performanceBenchmark?: PerformanceBenchmark;
  protected options: TestSuiteOptions;
  protected results: TestResult[] = [];

  constructor(options: TestSuiteOptions) {
    this.provider = options.provider;
    this.testDataManager = options.testDataManager;
    this.performanceBenchmark = options.performanceBenchmark;
    this.options = options;
  }

  /**
   * Run all tests in the suite
   */
  async runAllTests(): Promise<TestSuiteResult> {
    const startTime = Date.now();
    this.results = [];

    try {
      // Setup phase
      await this.setupTests();

      // Run core functionality tests
      await this.runCoreTests();

      // Run transaction tests
      await this.runTransactionTests();

      // Run query tests
      await this.runQueryTests();

      // Run performance tests (if enabled)
      if (!this.options.skipPerformanceTests && this.performanceBenchmark) {
        await this.runPerformanceTests();
      }

      // Cleanup phase
      await this.cleanupTests();

    } catch (error) {
      console.error('Test suite failed during execution:', error);
    }

    const totalDuration = Date.now() - startTime;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = this.results.filter(r => !r.passed).length;

    return {
      providerType: this.provider.getProviderType(),
      totalTests: this.results.length,
      passedTests,
      failedTests,
      results: this.results,
      totalDuration
    };
  }

  /**
   * Setup test environment
   */
  protected async setupTests(): Promise<void> {
    await this.runTest('setup-connection', async () => {
      await this.provider.connect();
      expect(this.provider.isConnected()).toBe(true);
    });

    await this.runTest('setup-test-data', async () => {
      await this.testDataManager.seedTestData();
    });
  }

  /**
   * Cleanup test environment
   */
  protected async cleanupTests(): Promise<void> {
    await this.runTest('cleanup-test-data', async () => {
      await this.testDataManager.cleanupTestData();
    });

    await this.runTest('cleanup-connection', async () => {
      await this.provider.disconnect();
    });
  }

  /**
   * Run core CRUD functionality tests
   */
  protected async runCoreTests(): Promise<void> {
    // Test basic CRUD operations
    await this.testPutOperation();
    await this.testGetOperation();
    await this.testUpdateOperation();
    await this.testDeleteOperation();
    await this.testBatchOperations();
  }

  /**
   * Run transaction tests
   */
  protected async runTransactionTests(): Promise<void> {
    await this.testTransactionCommit();
    await this.testTransactionRollback();
    await this.testTransactionConflicts();
  }

  /**
   * Run query and scan tests
   */
  protected async runQueryTests(): Promise<void> {
    await this.testQueryOperations();
    await this.testScanOperations();
    await this.testFilterConditions();
    await this.testPagination();
  }

  /**
   * Run performance benchmark tests
   */
  protected async runPerformanceTests(): Promise<void> {
    if (!this.performanceBenchmark) return;

    await this.runTest('performance-single-operations', async () => {
      const results = await this.performanceBenchmark!.benchmarkSingleOperations(this.provider);
      expect(results.averageLatency).toBeLessThan(1000); // 1 second max
    });

    await this.runTest('performance-batch-operations', async () => {
      const results = await this.performanceBenchmark!.benchmarkBatchOperations(this.provider);
      expect(results.throughput).toBeGreaterThan(10); // 10 ops/sec minimum
    });
  }

  // Individual test methods
  protected async testPutOperation(): Promise<void> {
    await this.runTest('put-operation', async () => {
      const testData = this.testDataManager.generateTestItem();
      await this.provider.put(testData);
      
      const retrieved = await this.provider.get(testData.key);
      expect(retrieved).toEqual(testData);
    });
  }

  protected async testGetOperation(): Promise<void> {
    await this.runTest('get-operation', async () => {
      const testData = this.testDataManager.generateTestItem();
      await this.provider.put(testData);
      
      const retrieved = await this.provider.get(testData.key);
      expect(retrieved).toBeDefined();
      expect(retrieved.key).toEqual(testData.key);
    });
  }

  protected async testUpdateOperation(): Promise<void> {
    await this.runTest('update-operation', async () => {
      const testData = this.testDataManager.generateTestItem();
      await this.provider.put(testData);
      
      const updateInput: UnifiedUpdateInput = {
        key: testData.key,
        updates: { updatedField: 'updated-value' }
      };
      
      await this.provider.update(updateInput);
      
      const retrieved = await this.provider.get(testData.key);
      expect(retrieved.updatedField).toBe('updated-value');
    });
  }

  protected async testDeleteOperation(): Promise<void> {
    await this.runTest('delete-operation', async () => {
      const testData = this.testDataManager.generateTestItem();
      await this.provider.put(testData);
      
      await this.provider.delete(testData.key);
      
      const retrieved = await this.provider.get(testData.key);
      expect(retrieved).toBeNull();
    });
  }

  protected async testBatchOperations(): Promise<void> {
    await this.runTest('batch-operations', async () => {
      const testItems = Array.from({ length: 5 }, () => this.testDataManager.generateTestItem());
      
      // Put all items
      for (const item of testItems) {
        await this.provider.put(item);
      }
      
      // Batch get
      const keys = testItems.map(item => item.key);
      const retrieved = await this.provider.batchGet(keys);
      
      expect(retrieved).toHaveLength(testItems.length);
    });
  }

  protected async testTransactionCommit(): Promise<void> {
    await this.runTest('transaction-commit', async () => {
      const transaction = await this.provider.beginTransaction();
      const testData = this.testDataManager.generateTestItem();
      
      await transaction.put(testData);
      await transaction.commit();
      
      const retrieved = await this.provider.get(testData.key);
      expect(retrieved).toEqual(testData);
    });
  }

  protected async testTransactionRollback(): Promise<void> {
    await this.runTest('transaction-rollback', async () => {
      const transaction = await this.provider.beginTransaction();
      const testData = this.testDataManager.generateTestItem();
      
      await transaction.put(testData);
      await transaction.rollback();
      
      const retrieved = await this.provider.get(testData.key);
      expect(retrieved).toBeNull();
    });
  }

  protected async testTransactionConflicts(): Promise<void> {
    await this.runTest('transaction-conflicts', async () => {
      const testData = this.testDataManager.generateTestItem();
      await this.provider.put(testData);
      
      const operations: TransactionOperation[] = [
        {
          type: 'update',
          updates: {
            key: testData.key,
            updates: { field1: 'value1' }
          }
        },
        {
          type: 'update',
          updates: {
            key: testData.key,
            updates: { field2: 'value2' }
          }
        }
      ];
      
      await this.provider.executeTransaction(operations);
      
      const retrieved = await this.provider.get(testData.key);
      expect(retrieved.field1).toBe('value1');
      expect(retrieved.field2).toBe('value2');
    });
  }

  protected async testQueryOperations(): Promise<void> {
    await this.runTest('query-operations', async () => {
      const testItems = this.testDataManager.generateTestItemsWithSamePartition(3);
      
      for (const item of testItems) {
        await this.provider.put(item);
      }
      
      const queryInput: UnifiedQueryInput = {
        keyCondition: {
          field: 'pk',
          operator: '=',
          value: testItems[0].pk
        }
      };
      
      const results = await this.provider.query(queryInput);
      expect(results).toHaveLength(3);
    });
  }

  protected async testScanOperations(): Promise<void> {
    await this.runTest('scan-operations', async () => {
      const testItems = Array.from({ length: 3 }, () => this.testDataManager.generateTestItem());
      
      for (const item of testItems) {
        await this.provider.put(item);
      }
      
      const scanInput: UnifiedScanInput = {
        limit: 10
      };
      
      const results = await this.provider.scan(scanInput);
      expect(results.items.length).toBeGreaterThanOrEqual(3);
    });
  }

  protected async testFilterConditions(): Promise<void> {
    await this.runTest('filter-conditions', async () => {
      const testItem = this.testDataManager.generateTestItem();
      testItem.status = 'active';
      await this.provider.put(testItem);
      
      const scanInput: UnifiedScanInput = {
        filterCondition: {
          field: 'status',
          operator: '=',
          value: 'active'
        }
      };
      
      const results = await this.provider.scan(scanInput);
      expect(results.items.length).toBeGreaterThanOrEqual(1);
      expect(results.items.some(item => item.status === 'active')).toBe(true);
    });
  }

  protected async testPagination(): Promise<void> {
    await this.runTest('pagination', async () => {
      const testItems = Array.from({ length: 5 }, () => this.testDataManager.generateTestItem());
      
      for (const item of testItems) {
        await this.provider.put(item);
      }
      
      const scanInput: UnifiedScanInput = {
        limit: 2
      };
      
      const firstPage = await this.provider.scan(scanInput);
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.token).toBeDefined();
      
      const secondPageInput: UnifiedScanInput = {
        limit: 2,
        startKey: firstPage.token
      };
      
      const secondPage = await this.provider.scan(secondPageInput);
      expect(secondPage.items.length).toBeGreaterThan(0);
    });
  }

  /**
   * Helper method to run individual tests with error handling and timing
   */
  protected async runTest(testName: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    let passed = false;
    let error: Error | undefined;

    try {
      await testFn();
      passed = true;
    } catch (err) {
      passed = false;
      error = err instanceof Error ? err : new Error(String(err));
      console.error(`Test ${testName} failed:`, error);
    }

    const duration = Date.now() - startTime;
    
    this.results.push({
      testName,
      passed,
      error,
      duration,
      providerType: this.provider.getProviderType()
    });
  }
}

// Jest-like expect function for testing
function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${actual} to be ${expected}`);
      }
    },
    toEqual: (expected: any) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
      }
    },
    toBeDefined: () => {
      if (actual === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toBeNull: () => {
      if (actual !== null) {
        throw new Error(`Expected ${actual} to be null`);
      }
    },
    toHaveLength: (length: number) => {
      if (!actual || actual.length !== length) {
        throw new Error(`Expected array to have length ${length}, got ${actual?.length}`);
      }
    },
    toBeGreaterThan: (value: number) => {
      if (actual <= value) {
        throw new Error(`Expected ${actual} to be greater than ${value}`);
      }
    },
    toBeGreaterThanOrEqual: (value: number) => {
      if (actual < value) {
        throw new Error(`Expected ${actual} to be greater than or equal to ${value}`);
      }
    },
    toBeLessThan: (value: number) => {
      if (actual >= value) {
        throw new Error(`Expected ${actual} to be less than ${value}`);
      }
    }
  };
}