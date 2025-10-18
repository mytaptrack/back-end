/**
 * Test Runner
 * Main entry point for running database abstraction tests
 */

import { 
  IDataAccessLayer, 
  DatabaseProviderType,
  DatabaseConfig 
} from '../types/database-abstraction';
import { DynamoDBProvider } from '../providers/dynamodb-provider';
import { MongoDBProvider } from '../providers/mongodb-provider';
import { TestDatabaseConfigManager, TestDatabaseConfig } from './test-database-config';
import { TestDataManager } from './test-data-manager';
import { PerformanceBenchmark } from './performance-benchmark';
import { IntegrationTestSuite, IntegrationTestResult } from './integration-test-suite';
import { AbstractTestSuite, TestSuiteResult } from './abstract-test-suite';

export interface TestRunnerOptions {
  providers?: DatabaseProviderType[];
  includePerformanceTests?: boolean;
  includeIntegrationTests?: boolean;
  testTimeout?: number;
  configName?: string;
  customConfigs?: Map<DatabaseProviderType, TestDatabaseConfig>;
}

export interface TestRunnerResult {
  individualResults: Map<DatabaseProviderType, TestSuiteResult>;
  integrationResult?: IntegrationTestResult;
  summary: {
    totalProviders: number;
    allTestsPassed: boolean;
    totalDuration: number;
    errors: string[];
  };
}

/**
 * Main test runner for database abstraction layer
 */
export class TestRunner {
  private configManager: TestDatabaseConfigManager;
  private options: TestRunnerOptions;

  constructor(options: TestRunnerOptions = {}) {
    this.configManager = TestDatabaseConfigManager.getInstance();
    this.options = {
      providers: ['dynamodb', 'mongodb'],
      includePerformanceTests: true,
      includeIntegrationTests: true,
      testTimeout: 30000,
      ...options
    };
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<TestRunnerResult> {
    const startTime = Date.now();
    console.log('Starting database abstraction layer tests...');

    // Load environment configuration
    this.configManager.loadFromEnvironment();

    const individualResults = new Map<DatabaseProviderType, TestSuiteResult>();
    let integrationResult: IntegrationTestResult | undefined;
    const errors: string[] = [];

    try {
      // Run individual provider tests
      await this.runIndividualProviderTests(individualResults, errors);

      // Run integration tests if enabled
      if (this.options.includeIntegrationTests && this.options.providers!.length > 1) {
        integrationResult = await this.runIntegrationTests(errors);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Test runner failed: ${errorMessage}`);
      console.error('Test runner failed:', error);
    }

    const totalDuration = Date.now() - startTime;
    const allTestsPassed = this.determineOverallSuccess(individualResults, integrationResult, errors);

    const result: TestRunnerResult = {
      individualResults,
      integrationResult,
      summary: {
        totalProviders: this.options.providers!.length,
        allTestsPassed,
        totalDuration,
        errors
      }
    };

    this.printTestSummary(result);
    return result;
  }

  /**
   * Run tests for individual providers
   */
  private async runIndividualProviderTests(
    results: Map<DatabaseProviderType, TestSuiteResult>,
    errors: string[]
  ): Promise<void> {
    console.log('Running individual provider tests...');

    for (const providerType of this.options.providers!) {
      try {
        console.log(`\nTesting ${providerType} provider...`);
        
        const provider = await this.createProvider(providerType);
        const testDataManager = new TestDataManager({ provider });
        const performanceBenchmark = this.options.includePerformanceTests ? 
          new PerformanceBenchmark(testDataManager) : undefined;

        const testSuite = new ProviderTestSuite({
          provider,
          testDataManager,
          performanceBenchmark,
          skipPerformanceTests: !this.options.includePerformanceTests,
          testTimeout: this.options.testTimeout
        });

        const result = await testSuite.runAllTests();
        results.set(providerType, result);

        console.log(`${providerType} tests completed: ${result.passedTests}/${result.totalTests} passed`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`${providerType} provider test failed: ${errorMessage}`);
        console.error(`Failed to test ${providerType} provider:`, error);
      }
    }
  }

  /**
   * Run integration tests across providers
   */
  private async runIntegrationTests(errors: string[]): Promise<IntegrationTestResult | undefined> {
    console.log('\nRunning integration tests...');

    try {
      const providers: IDataAccessLayer[] = [];
      
      // Create providers for integration testing
      for (const providerType of this.options.providers!) {
        try {
          const provider = await this.createProvider(providerType);
          providers.push(provider);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to create ${providerType} provider for integration tests: ${errorMessage}`);
        }
      }

      if (providers.length < 2) {
        console.warn('Integration tests require at least 2 providers');
        return undefined;
      }

      const testDataManager = new TestDataManager({ provider: providers[0] });
      const performanceBenchmark = this.options.includePerformanceTests ? 
        new PerformanceBenchmark(testDataManager) : undefined;

      const integrationSuite = new IntegrationTestSuite({
        providers,
        testDataManager,
        performanceBenchmark,
        skipPerformanceTests: !this.options.includePerformanceTests,
        testTimeout: this.options.testTimeout,
        validateDataConsistency: true
      });

      const result = await integrationSuite.runIntegrationTests();
      
      console.log(`Integration tests completed: ${result.summary.allProvidersPassed ? 'PASSED' : 'FAILED'}`);
      
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Integration tests failed: ${errorMessage}`);
      console.error('Integration tests failed:', error);
      return undefined;
    }
  }

  /**
   * Create a provider instance for testing
   */
  private async createProvider(providerType: DatabaseProviderType): Promise<IDataAccessLayer> {
    let config: TestDatabaseConfig;

    // Use custom config if provided
    if (this.options.customConfigs?.has(providerType)) {
      config = this.options.customConfigs.get(providerType)!;
    } else {
      config = this.configManager.getTestConfig(providerType, this.options.configName);
    }

    // Validate configuration
    const validation = this.configManager.validateTestConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid ${providerType} configuration: ${validation.errors.join(', ')}`);
    }

    // Create provider instance
    switch (providerType) {
      case 'dynamodb':
        if (!config.dynamodb) {
          throw new Error('DynamoDB configuration is required');
        }
        return new DynamoDBProvider(config.dynamodb);

      case 'mongodb':
        if (!config.mongodb) {
          throw new Error('MongoDB configuration is required');
        }
        return new MongoDBProvider(config.mongodb);

      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }
  }

  /**
   * Determine overall test success
   */
  private determineOverallSuccess(
    individualResults: Map<DatabaseProviderType, TestSuiteResult>,
    integrationResult?: IntegrationTestResult,
    errors: string[] = []
  ): boolean {
    // Check for any errors
    if (errors.length > 0) {
      return false;
    }

    // Check individual provider results
    for (const result of individualResults.values()) {
      if (result.failedTests > 0) {
        return false;
      }
    }

    // Check integration test results
    if (integrationResult) {
      if (!integrationResult.summary.allProvidersPassed ||
          !integrationResult.summary.consistencyPassed ||
          !integrationResult.summary.crossProviderTestsPassed) {
        return false;
      }
    }

    return true;
  }

  /**
   * Print comprehensive test summary
   */
  private printTestSummary(result: TestRunnerResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('DATABASE ABSTRACTION LAYER TEST SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`Total Duration: ${result.summary.totalDuration}ms`);
    console.log(`Overall Result: ${result.summary.allTestsPassed ? 'PASSED' : 'FAILED'}`);
    console.log(`Providers Tested: ${result.summary.totalProviders}`);

    // Individual provider results
    console.log('\n--- Individual Provider Results ---');
    for (const [provider, providerResult] of result.individualResults) {
      const status = providerResult.failedTests === 0 ? 'PASSED' : 'FAILED';
      console.log(`${provider.toUpperCase()}: ${status} (${providerResult.passedTests}/${providerResult.totalTests})`);
      
      if (providerResult.failedTests > 0) {
        const failedTests = providerResult.results.filter(r => !r.passed);
        console.log(`  Failed tests: ${failedTests.map(t => t.testName).join(', ')}`);
      }
    }

    // Integration test results
    if (result.integrationResult) {
      console.log('\n--- Integration Test Results ---');
      const integration = result.integrationResult.summary;
      console.log(`Provider Tests: ${integration.allProvidersPassed ? 'PASSED' : 'FAILED'}`);
      console.log(`Consistency Tests: ${integration.consistencyPassed ? 'PASSED' : 'FAILED'}`);
      console.log(`Cross-Provider Tests: ${integration.crossProviderTestsPassed ? 'PASSED' : 'FAILED'}`);
    }

    // Errors
    if (result.summary.errors.length > 0) {
      console.log('\n--- Errors ---');
      for (const error of result.summary.errors) {
        console.log(`  • ${error}`);
      }
    }

    console.log('='.repeat(60));
  }

  /**
   * Run tests for a specific provider only
   */
  async runProviderTests(providerType: DatabaseProviderType): Promise<TestSuiteResult> {
    console.log(`Running tests for ${providerType} provider only...`);

    const provider = await this.createProvider(providerType);
    const testDataManager = new TestDataManager({ provider });
    const performanceBenchmark = this.options.includePerformanceTests ? 
      new PerformanceBenchmark(testDataManager) : undefined;

    const testSuite = new ProviderTestSuite({
      provider,
      testDataManager,
      performanceBenchmark,
      skipPerformanceTests: !this.options.includePerformanceTests,
      testTimeout: this.options.testTimeout
    });

    return await testSuite.runAllTests();
  }

  /**
   * Run performance benchmarks only
   */
  async runPerformanceBenchmarks(): Promise<Map<DatabaseProviderType, any>> {
    console.log('Running performance benchmarks...');

    const results = new Map<DatabaseProviderType, any>();

    for (const providerType of this.options.providers!) {
      try {
        const provider = await this.createProvider(providerType);
        const testDataManager = new TestDataManager({ provider });
        const benchmark = new PerformanceBenchmark(testDataManager);

        const result = await benchmark.runBenchmarkSuite(provider, `${providerType}-benchmark`);
        results.set(providerType, result);

      } catch (error) {
        console.error(`Failed to benchmark ${providerType}:`, error);
      }
    }

    return results;
  }
}

/**
 * Provider-specific test suite implementation
 */
class ProviderTestSuite extends AbstractTestSuite {
  // Inherits all functionality from AbstractTestSuite
}