/**
 * Integration Test Suite
 * Validates identical behavior across different database providers
 */

import { 
  IDataAccessLayer, 
  DatabaseProviderType,
  DatabaseKey,
  UnifiedQueryInput,
  UnifiedScanInput,
  UnifiedUpdateInput,
  TransactionOperation
} from '../types/database-abstraction';
import { AbstractTestSuite, TestSuiteOptions, TestSuiteResult } from './abstract-test-suite';
import { TestDataManager } from './test-data-manager';
import { PerformanceBenchmark } from './performance-benchmark';

export interface IntegrationTestOptions {
  providers: IDataAccessLayer[];
  testDataManager: TestDataManager;
  performanceBenchmark?: PerformanceBenchmark;
  skipPerformanceTests?: boolean;
  testTimeout?: number;
  validateDataConsistency?: boolean;
}

export interface IntegrationTestResult {
  providerResults: Map<DatabaseProviderType, TestSuiteResult>;
  consistencyResults: ConsistencyTestResult[];
  crossProviderTests: CrossProviderTestResult[];
  summary: {
    totalProviders: number;
    allProvidersPassed: boolean;
    consistencyPassed: boolean;
    crossProviderTestsPassed: boolean;
  };
}

export interface ConsistencyTestResult {
  testName: string;
  providers: DatabaseProviderType[];
  dataConsistent: boolean;
  differences?: any[];
  error?: Error;
}

export interface CrossProviderTestResult {
  testName: string;
  sourceProvider: DatabaseProviderType;
  targetProvider: DatabaseProviderType;
  passed: boolean;
  error?: Error;
  duration: number;
}

/**
 * Integration test suite that validates behavior across multiple providers
 */
export class IntegrationTestSuite {
  private providers: IDataAccessLayer[];
  private testDataManager: TestDataManager;
  private performanceBenchmark?: PerformanceBenchmark;
  private options: IntegrationTestOptions;

  constructor(options: IntegrationTestOptions) {
    this.providers = options.providers;
    this.testDataManager = options.testDataManager;
    this.performanceBenchmark = options.performanceBenchmark;
    this.options = options;
  }

  /**
   * Run integration tests across all providers
   */
  async runIntegrationTests(): Promise<IntegrationTestResult> {
    console.log(`Starting integration tests across ${this.providers.length} providers...`);

    const providerResults = new Map<DatabaseProviderType, TestSuiteResult>();
    const consistencyResults: ConsistencyTestResult[] = [];
    const crossProviderTests: CrossProviderTestResult[] = [];

    try {
      // Run individual provider tests
      await this.runIndividualProviderTests(providerResults);

      // Run data consistency tests
      if (this.options.validateDataConsistency) {
        await this.runDataConsistencyTests(consistencyResults);
      }

      // Run cross-provider tests
      await this.runCrossProviderTests(crossProviderTests);

    } catch (error) {
      console.error('Integration test suite failed:', error);
    }

    const summary = this.generateSummary(providerResults, consistencyResults, crossProviderTests);

    return {
      providerResults,
      consistencyResults,
      crossProviderTests,
      summary
    };
  }

  /**
   * Run tests on each provider individually
   */
  private async runIndividualProviderTests(
    results: Map<DatabaseProviderType, TestSuiteResult>
  ): Promise<void> {
    console.log('Running individual provider tests...');

    for (const provider of this.providers) {
      console.log(`Testing provider: ${provider.getProviderType()}`);
      
      const testSuite = new ProviderTestSuite({
        provider,
        testDataManager: this.testDataManager,
        performanceBenchmark: this.performanceBenchmark,
        skipPerformanceTests: this.options.skipPerformanceTests,
        testTimeout: this.options.testTimeout
      });

      const result = await testSuite.runAllTests();
      results.set(provider.getProviderType(), result);

      console.log(`Provider ${provider.getProviderType()} tests completed: ${result.passedTests}/${result.totalTests} passed`);
    }
  }

  /**
   * Run data consistency tests across providers
   */
  private async runDataConsistencyTests(results: ConsistencyTestResult[]): Promise<void> {
    console.log('Running data consistency tests...');

    // Test basic CRUD consistency
    results.push(await this.testCRUDConsistency());
    
    // Test query consistency
    results.push(await this.testQueryConsistency());
    
    // Test transaction consistency
    results.push(await this.testTransactionConsistency());
    
    // Test batch operation consistency
    results.push(await this.testBatchConsistency());
  }

  /**
   * Run cross-provider tests (data migration scenarios)
   */
  private async runCrossProviderTests(results: CrossProviderTestResult[]): Promise<void> {
    console.log('Running cross-provider tests...');

    for (let i = 0; i < this.providers.length; i++) {
      for (let j = 0; j < this.providers.length; j++) {
        if (i !== j) {
          const sourceProvider = this.providers[i];
          const targetProvider = this.providers[j];
          
          const result = await this.testDataMigration(sourceProvider, targetProvider);
          results.push(result);
        }
      }
    }
  }

  /**
   * Test CRUD operation consistency across providers
   */
  private async testCRUDConsistency(): Promise<ConsistencyTestResult> {
    const testName = 'crud-consistency';
    const providers = this.providers.map(p => p.getProviderType());
    
    try {
      const testItem = this.testDataManager.generateTestItem();
      const results: any[] = [];

      // Perform CRUD operations on each provider
      for (const provider of this.providers) {
        await provider.connect();
        
        // Put
        await provider.put(testItem);
        
        // Get
        const retrieved = await provider.get(testItem.key);
        
        // Update
        const updateInput: UnifiedUpdateInput = {
          key: testItem.key,
          updates: { consistencyTest: true, timestamp: Date.now() }
        };
        await provider.update(updateInput);
        
        // Get updated
        const updated = await provider.get(testItem.key);
        
        // Store results
        results.push({
          provider: provider.getProviderType(),
          retrieved,
          updated
        });
        
        // Cleanup
        await provider.delete(testItem.key);
        await provider.disconnect();
      }

      // Check consistency
      const dataConsistent = this.compareResults(results, ['retrieved', 'updated']);

      return {
        testName,
        providers,
        dataConsistent,
        differences: dataConsistent ? undefined : results
      };

    } catch (error) {
      return {
        testName,
        providers,
        dataConsistent: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Test query operation consistency across providers
   */
  private async testQueryConsistency(): Promise<ConsistencyTestResult> {
    const testName = 'query-consistency';
    const providers = this.providers.map(p => p.getProviderType());
    
    try {
      const testItems = this.testDataManager.generateTestItemsWithSamePartition(5);
      const results: any[] = [];

      for (const provider of this.providers) {
        await provider.connect();
        
        // Put test items
        for (const item of testItems) {
          await provider.put(item);
        }
        
        // Query
        const queryInput: UnifiedQueryInput = {
          keyCondition: {
            field: 'pk',
            operator: '=',
            value: testItems[0].pk
          }
        };
        
        const queryResults = await provider.query(queryInput);
        
        results.push({
          provider: provider.getProviderType(),
          queryResults: queryResults.sort((a, b) => a.sk.localeCompare(b.sk))
        });
        
        // Cleanup
        for (const item of testItems) {
          await provider.delete(item.key);
        }
        
        await provider.disconnect();
      }

      const dataConsistent = this.compareResults(results, ['queryResults']);

      return {
        testName,
        providers,
        dataConsistent,
        differences: dataConsistent ? undefined : results
      };

    } catch (error) {
      return {
        testName,
        providers,
        dataConsistent: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Test transaction consistency across providers
   */
  private async testTransactionConsistency(): Promise<ConsistencyTestResult> {
    const testName = 'transaction-consistency';
    const providers = this.providers.map(p => p.getProviderType());
    
    try {
      const results: any[] = [];

      for (const provider of this.providers) {
        await provider.connect();
        
        const testItems = Array.from({ length: 3 }, () => this.testDataManager.generateTestItem());
        
        // Execute transaction
        const operations: TransactionOperation[] = testItems.map(item => ({
          type: 'put' as const,
          key: item.key,
          data: item
        }));
        
        await provider.executeTransaction(operations);
        
        // Verify all items exist
        const retrievedItems = [];
        for (const item of testItems) {
          const retrieved = await provider.get(item.key);
          retrievedItems.push(retrieved);
        }
        
        results.push({
          provider: provider.getProviderType(),
          transactionResults: retrievedItems.sort((a, b) => a.pk.localeCompare(b.pk))
        });
        
        // Cleanup
        for (const item of testItems) {
          await provider.delete(item.key);
        }
        
        await provider.disconnect();
      }

      const dataConsistent = this.compareResults(results, ['transactionResults']);

      return {
        testName,
        providers,
        dataConsistent,
        differences: dataConsistent ? undefined : results
      };

    } catch (error) {
      return {
        testName,
        providers,
        dataConsistent: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Test batch operation consistency across providers
   */
  private async testBatchConsistency(): Promise<ConsistencyTestResult> {
    const testName = 'batch-consistency';
    const providers = this.providers.map(p => p.getProviderType());
    
    try {
      const testItems = Array.from({ length: 10 }, () => this.testDataManager.generateTestItem());
      const results: any[] = [];

      for (const provider of this.providers) {
        await provider.connect();
        
        // Batch put
        for (const item of testItems) {
          await provider.put(item);
        }
        
        // Batch get
        const keys = testItems.map(item => item.key);
        const batchResults = await provider.batchGet(keys);
        
        results.push({
          provider: provider.getProviderType(),
          batchResults: batchResults.sort((a, b) => a.pk.localeCompare(b.pk))
        });
        
        // Cleanup
        for (const item of testItems) {
          await provider.delete(item.key);
        }
        
        await provider.disconnect();
      }

      const dataConsistent = this.compareResults(results, ['batchResults']);

      return {
        testName,
        providers,
        dataConsistent,
        differences: dataConsistent ? undefined : results
      };

    } catch (error) {
      return {
        testName,
        providers,
        dataConsistent: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Test data migration between providers
   */
  private async testDataMigration(
    sourceProvider: IDataAccessLayer,
    targetProvider: IDataAccessLayer
  ): Promise<CrossProviderTestResult> {
    const testName = 'data-migration';
    const startTime = Date.now();
    
    try {
      await sourceProvider.connect();
      await targetProvider.connect();
      
      // Create test data in source
      const testItems = Array.from({ length: 5 }, () => this.testDataManager.generateTestItem());
      
      for (const item of testItems) {
        await sourceProvider.put(item);
      }
      
      // Migrate data to target
      for (const item of testItems) {
        const sourceData = await sourceProvider.get(item.key);
        if (sourceData) {
          await targetProvider.put(sourceData);
        }
      }
      
      // Verify data in target
      for (const item of testItems) {
        const targetData = await targetProvider.get(item.key);
        if (!targetData) {
          throw new Error(`Data not found in target provider: ${item.key.primary}`);
        }
      }
      
      // Cleanup
      for (const item of testItems) {
        await sourceProvider.delete(item.key);
        await targetProvider.delete(item.key);
      }
      
      await sourceProvider.disconnect();
      await targetProvider.disconnect();
      
      return {
        testName,
        sourceProvider: sourceProvider.getProviderType(),
        targetProvider: targetProvider.getProviderType(),
        passed: true,
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        testName,
        sourceProvider: sourceProvider.getProviderType(),
        targetProvider: targetProvider.getProviderType(),
        passed: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Compare results from different providers for consistency
   */
  private compareResults(results: any[], fieldsToCompare: string[]): boolean {
    if (results.length < 2) return true;
    
    const baseResult = results[0];
    
    for (let i = 1; i < results.length; i++) {
      const currentResult = results[i];
      
      for (const field of fieldsToCompare) {
        const baseData = JSON.stringify(baseResult[field]);
        const currentData = JSON.stringify(currentResult[field]);
        
        if (baseData !== currentData) {
          console.warn(`Data inconsistency found in field ${field} between providers`);
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Generate test summary
   */
  private generateSummary(
    providerResults: Map<DatabaseProviderType, TestSuiteResult>,
    consistencyResults: ConsistencyTestResult[],
    crossProviderTests: CrossProviderTestResult[]
  ): IntegrationTestResult['summary'] {
    const allProvidersPassed = Array.from(providerResults.values())
      .every(result => result.failedTests === 0);
    
    const consistencyPassed = consistencyResults
      .every(result => result.dataConsistent);
    
    const crossProviderTestsPassed = crossProviderTests
      .every(result => result.passed);

    return {
      totalProviders: this.providers.length,
      allProvidersPassed,
      consistencyPassed,
      crossProviderTestsPassed
    };
  }
}

/**
 * Provider-specific test suite implementation
 */
class ProviderTestSuite extends AbstractTestSuite {
  constructor(options: TestSuiteOptions) {
    super(options);
  }
}