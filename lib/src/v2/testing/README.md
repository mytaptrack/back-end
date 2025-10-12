# Database Abstraction Layer Testing Framework

This comprehensive testing framework provides utilities for testing database abstraction layer implementations across different providers (DynamoDB and MongoDB).

## Features

- **Abstract Test Suite**: Unified testing interface that works with any database provider
- **Test Data Management**: Automated test data seeding and cleanup
- **Performance Benchmarking**: Performance testing and comparison between providers
- **Integration Testing**: Cross-provider consistency validation
- **Test Configuration**: Environment-based configuration management
- **Utility Functions**: Helper functions for common testing scenarios

## Quick Start

### Basic Usage

```typescript
import { quickTest, fullTest, TestEnvironmentSetup } from '@mytaptrack/lib/v2/testing';

// Setup test environment
TestEnvironmentSetup.setDynamoDBTestEnvironment();

// Run quick tests
const passed = await quickTest(['dynamodb']);
console.log('Tests passed:', passed);

// Run full test suite
const fullPassed = await fullTest({
  providers: ['dynamodb', 'mongodb'],
  includePerformanceTests: true,
  includeIntegrationTests: true
});
```

### Manual Testing Environment

```typescript
import { createTestEnvironment } from '@mytaptrack/lib/v2/testing';

const { provider, testDataManager, cleanup } = await createTestEnvironment('dynamodb');

try {
  // Use provider for testing
  const testItem = testDataManager.generateTestItem();
  await provider.put(testItem);
  
  const retrieved = await provider.get(testItem.key);
  console.log('Retrieved item:', retrieved);
  
} finally {
  await cleanup();
}
```

## Core Components

### TestRunner

Main entry point for running comprehensive tests:

```typescript
import { TestRunner } from '@mytaptrack/lib/v2/testing';

const runner = new TestRunner({
  providers: ['dynamodb', 'mongodb'],
  includePerformanceTests: true,
  includeIntegrationTests: true,
  testTimeout: 30000
});

const result = await runner.runAllTests();
console.log('All tests passed:', result.summary.allTestsPassed);
```

### AbstractTestSuite

Base class for creating custom test suites:

```typescript
import { AbstractTestSuite } from '@mytaptrack/lib/v2/testing';

class CustomTestSuite extends AbstractTestSuite {
  protected async runCustomTests(): Promise<void> {
    await this.runTest('custom-test', async () => {
      // Your custom test logic
    });
  }
}
```

### TestDataManager

Manages test data lifecycle:

```typescript
import { TestDataManager } from '@mytaptrack/lib/v2/testing';

const testDataManager = new TestDataManager({ provider });

// Generate test data
const testItem = testDataManager.generateTestItem();
const relatedItems = testDataManager.generateTestItemsWithSamePartition(5);

// Seed test data
await testDataManager.seedTestData();

// Cleanup when done
await testDataManager.cleanupTestData();
```

### PerformanceBenchmark

Performance testing and benchmarking:

```typescript
import { PerformanceBenchmark } from '@mytaptrack/lib/v2/testing';

const benchmark = new PerformanceBenchmark(testDataManager);

// Run individual benchmarks
const singleOpResults = await benchmark.benchmarkSingleOperations(provider);
const batchOpResults = await benchmark.benchmarkBatchOperations(provider);

// Run full benchmark suite
const suite = await benchmark.runBenchmarkSuite(provider);

// Compare providers
const comparison = await benchmark.compareProviders(provider1, provider2);
```

### IntegrationTestSuite

Cross-provider integration testing:

```typescript
import { IntegrationTestSuite } from '@mytaptrack/lib/v2/testing';

const integrationSuite = new IntegrationTestSuite({
  providers: [dynamoProvider, mongoProvider],
  testDataManager,
  validateDataConsistency: true
});

const result = await integrationSuite.runIntegrationTests();
console.log('Integration tests passed:', result.summary.allProvidersPassed);
```

## Configuration

### Environment Variables

Set up test environment using environment variables:

```bash
# DynamoDB Configuration
export TEST_DB_PROVIDER=dynamodb
export TEST_DYNAMODB_REGION=us-east-1
export TEST_DYNAMODB_PRIMARY_TABLE=test-primary-table
export TEST_DYNAMODB_DATA_TABLE=test-data-table
export TEST_DYNAMODB_LOCAL=true
export TEST_DYNAMODB_ENDPOINT=http://localhost:8000

# MongoDB Configuration
export TEST_MONGODB_CONNECTION_STRING=mongodb://localhost:27017
export TEST_MONGODB_DATABASE=test-database
export TEST_MONGODB_PRIMARY_COLLECTION=test-primary
export TEST_MONGODB_DATA_COLLECTION=test-data
export TEST_MONGODB_DROP_DB=true
```

### Programmatic Configuration

```typescript
import { TestDatabaseConfigManager } from '@mytaptrack/lib/v2/testing';

const configManager = TestDatabaseConfigManager.getInstance();

// Create custom configurations
const dynamoConfig = configManager.createDynamoDBTestConfig({
  region: 'us-west-2',
  primaryTable: 'my-test-table'
});

const mongoConfig = configManager.createMongoDBTestConfig({
  connectionString: 'mongodb://localhost:27017',
  database: 'my-test-db'
});
```

## Test Data Generation

### Built-in Generators

```typescript
import { TestDataGenerator } from '@mytaptrack/lib/v2/testing';

// Generate user data
const users = TestDataGenerator.generateUserData(10);

// Generate order data
const orders = TestDataGenerator.generateOrderData(5, 3); // 5 users, 3 orders each

// Generate time series data
const metrics = TestDataGenerator.generateTimeSeriesData(100);
```

### Custom Test Data

```typescript
const testDataManager = new TestDataManager({ provider });

// Generate single item
const item = testDataManager.generateTestItem({
  type: 'custom-type',
  data: { customField: 'customValue' }
});

// Generate related items
const relatedData = testDataManager.generateRelatedTestItems();
```

## Assertions and Utilities

### Test Assertions

```typescript
import { TestAssertions } from '@mytaptrack/lib/v2/testing';

// Assert item exists
await TestAssertions.assertItemExists(provider, key);

// Assert item doesn't exist
await TestAssertions.assertItemNotExists(provider, key);

// Assert query returns expected count
await TestAssertions.assertQueryReturnsCount(provider, query, 5);

// Assert data equality
TestAssertions.assertDataEqual(actual, expected);
```

### Provider Validation

```typescript
import { validateProviderImplementation } from '@mytaptrack/lib/v2/testing';

const validation = await validateProviderImplementation(provider);
if (!validation.valid) {
  console.error('Provider validation failed:', validation.errors);
}
```

## Performance Testing

### Benchmarking

```typescript
const benchmark = new PerformanceBenchmark(testDataManager, {
  maxAverageLatency: 100, // 100ms
  minThroughput: 50,      // 50 ops/sec
  minSuccessRate: 0.99    // 99%
});

const results = await benchmark.benchmarkSingleOperations(provider);
const validation = benchmark.validatePerformance(results);

if (!validation.passed) {
  console.warn('Performance thresholds not met:', validation.violations);
}
```

### Provider Comparison

```typescript
const comparison = await benchmark.compareProviders(dynamoProvider, mongoProvider);

console.log('Throughput ratio:', comparison.comparison.summary.throughputRatio);
console.log('Operation comparisons:', comparison.comparison.operationComparisons);
```

## Integration with Jest

The framework works seamlessly with Jest:

```typescript
describe('Database Provider Tests', () => {
  let testEnv: any;

  beforeAll(async () => {
    TestEnvironmentSetup.setDynamoDBTestEnvironment();
    testEnv = await createTestEnvironment('dynamodb');
  });

  afterAll(async () => {
    await testEnv.cleanup();
    TestEnvironmentSetup.clearTestEnvironment();
  });

  it('should perform CRUD operations', async () => {
    const testItem = testEnv.testDataManager.generateTestItem();
    
    await testEnv.provider.put(testItem);
    const retrieved = await testEnv.provider.get(testItem.key);
    
    expect(retrieved).toBeDefined();
    expect(retrieved.pk).toBe(testItem.pk);
  });
});
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Database Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      dynamodb:
        image: amazon/dynamodb-local
        ports:
          - 8000:8000
      mongodb:
        image: mongo:latest
        ports:
          - 27017:27017

    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      
      - run: npm install
      - run: npm run test:database
        env:
          TEST_DYNAMODB_LOCAL: true
          TEST_DYNAMODB_ENDPOINT: http://localhost:8000
          TEST_MONGODB_CONNECTION_STRING: mongodb://localhost:27017
```

### NPM Scripts

```json
{
  "scripts": {
    "test:database": "jest --testPathPattern=testing",
    "test:database:quick": "node -e \"require('./dist/v2/testing').quickTest().then(r => process.exit(r ? 0 : 1))\"",
    "test:database:full": "node -e \"require('./dist/v2/testing').fullTest().then(r => process.exit(r ? 0 : 1))\"",
    "test:performance": "node -e \"require('./dist/v2/testing').performanceTest().then(() => process.exit(0))\""
  }
}
```

## Best Practices

1. **Environment Isolation**: Always use separate test databases/tables
2. **Data Cleanup**: Ensure test data is cleaned up after tests
3. **Timeout Configuration**: Set appropriate timeouts for different test types
4. **Performance Baselines**: Establish performance baselines for regression testing
5. **Error Handling**: Test both success and failure scenarios
6. **Consistency Validation**: Use integration tests to ensure consistent behavior

## Troubleshooting

### Common Issues

1. **Connection Timeouts**: Increase test timeout or check database connectivity
2. **Data Conflicts**: Ensure unique test data keys
3. **Performance Variations**: Run performance tests multiple times for accuracy
4. **Environment Setup**: Verify all required environment variables are set

### Debug Mode

Enable debug logging:

```typescript
process.env.DEBUG = 'database-testing';
```

### Health Checks

```typescript
const health = await provider.healthCheck();
console.log('Provider health:', health);
```

## Examples

See `example-test.spec.ts` for comprehensive usage examples and real-world testing scenarios.