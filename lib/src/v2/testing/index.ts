/**
 * Testing Framework Index
 * Exports all testing utilities and classes for the database abstraction layer
 */

// Core testing framework
export { AbstractTestSuite, TestSuiteOptions, TestResult, TestSuiteResult } from './abstract-test-suite';
export { TestDataManager, TestDataItem, TestDataSeed, TestRelationship, TestDataManagerOptions } from './test-data-manager';
export { TestDatabaseConfigManager, TestDatabaseConfig, TestDynamoDBConfig, TestMongoDBConfig, TestEnvironmentConfig } from './test-database-config';
export { PerformanceBenchmark, BenchmarkResult, BenchmarkSuite, PerformanceThresholds } from './performance-benchmark';

// Integration testing
export { 
  IntegrationTestSuite, 
  IntegrationTestOptions, 
  IntegrationTestResult, 
  ConsistencyTestResult, 
  CrossProviderTestResult 
} from './integration-test-suite';

// Test runner
export { TestRunner, TestRunnerOptions, TestRunnerResult } from './test-runner';

// Utility functions for common testing scenarios
export * from './test-utilities';