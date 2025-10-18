/**
 * Test Utilities
 * Helper functions and utilities for database abstraction testing
 */

import { 
  IDataAccessLayer, 
  DatabaseProviderType,
  DatabaseKey,
  UnifiedQueryInput,
  UnifiedScanInput 
} from '../types/database-abstraction';
import { TestRunner, TestRunnerOptions } from './test-runner';
import { TestDatabaseConfigManager } from './test-database-config';
import { TestDataManager } from './test-data-manager';

/**
 * Quick test runner for development and CI/CD
 */
export async function quickTest(providers?: DatabaseProviderType[]): Promise<boolean> {
  const runner = new TestRunner({
    providers: providers || ['dynamodb'],
    includePerformanceTests: false,
    includeIntegrationTests: false,
    testTimeout: 10000
  });

  const result = await runner.runAllTests();
  return result.summary.allTestsPassed;
}

/**
 * Full test suite runner
 */
export async function fullTest(options?: TestRunnerOptions): Promise<boolean> {
  const runner = new TestRunner({
    providers: ['dynamodb', 'mongodb'],
    includePerformanceTests: true,
    includeIntegrationTests: true,
    testTimeout: 30000,
    ...options
  });

  const result = await runner.runAllTests();
  return result.summary.allTestsPassed;
}

/**
 * Performance-only test runner
 */
export async function performanceTest(providers?: DatabaseProviderType[]): Promise<Map<DatabaseProviderType, any>> {
  const runner = new TestRunner({
    providers: providers || ['dynamodb', 'mongodb'],
    includePerformanceTests: true,
    includeIntegrationTests: false
  });

  return await runner.runPerformanceBenchmarks();
}

/**
 * Create a test environment for manual testing
 */
export async function createTestEnvironment(providerType: DatabaseProviderType): Promise<{
  provider: IDataAccessLayer;
  testDataManager: TestDataManager;
  cleanup: () => Promise<void>;
}> {
  const configManager = TestDatabaseConfigManager.getInstance();
  configManager.loadFromEnvironment();
  
  const config = configManager.getTestConfig(providerType);
  
  // Create provider based on type
  let provider: IDataAccessLayer;
  
  if (providerType === 'dynamodb') {
    const { DynamoDBProvider } = await import('../providers/dynamodb-provider');
    provider = new DynamoDBProvider(config.dynamodb!);
  } else if (providerType === 'mongodb') {
    const { MongoDBProvider } = await import('../providers/mongodb-provider');
    provider = new MongoDBProvider(config.mongodb!);
  } else {
    throw new Error(`Unsupported provider type: ${providerType}`);
  }

  await provider.connect();
  
  const testDataManager = new TestDataManager({ 
    provider,
    cleanupOnExit: false // Manual cleanup
  });

  const cleanup = async () => {
    await testDataManager.cleanupTestData();
    await provider.disconnect();
  };

  return { provider, testDataManager, cleanup };
}

/**
 * Validate provider implementation against interface
 */
export async function validateProviderImplementation(provider: IDataAccessLayer): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Check basic interface compliance
    if (typeof provider.connect !== 'function') {
      errors.push('Missing connect method');
    }
    
    if (typeof provider.disconnect !== 'function') {
      errors.push('Missing disconnect method');
    }
    
    if (typeof provider.isConnected !== 'function') {
      errors.push('Missing isConnected method');
    }
    
    if (typeof provider.getProviderType !== 'function') {
      errors.push('Missing getProviderType method');
    }
    
    if (typeof provider.healthCheck !== 'function') {
      errors.push('Missing healthCheck method');
    }

    // Check CRUD methods
    const crudMethods = ['get', 'put', 'update', 'delete'];
    for (const method of crudMethods) {
      if (typeof (provider as any)[method] !== 'function') {
        errors.push(`Missing ${method} method`);
      }
    }

    // Check query methods
    const queryMethods = ['query', 'scan', 'batchGet'];
    for (const method of queryMethods) {
      if (typeof (provider as any)[method] !== 'function') {
        errors.push(`Missing ${method} method`);
      }
    }

    // Check transaction methods
    const transactionMethods = ['beginTransaction', 'executeTransaction'];
    for (const method of transactionMethods) {
      if (typeof (provider as any)[method] !== 'function') {
        errors.push(`Missing ${method} method`);
      }
    }

    // Test basic functionality if no interface errors
    if (errors.length === 0) {
      try {
        await provider.connect();
        
        if (!provider.isConnected()) {
          warnings.push('Provider reports not connected after connect()');
        }
        
        const providerType = provider.getProviderType();
        if (!['dynamodb', 'mongodb'].includes(providerType)) {
          warnings.push(`Unknown provider type: ${providerType}`);
        }
        
        const health = await provider.healthCheck();
        if (!health.healthy) {
          warnings.push('Provider reports unhealthy status');
        }
        
        await provider.disconnect();
        
      } catch (error) {
        errors.push(`Basic functionality test failed: ${error}`);
      }
    }

  } catch (error) {
    errors.push(`Validation failed: ${error}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Generate test data for specific scenarios
 */
export class TestDataGenerator {
  static generateUserData(count: number = 10): any[] {
    return Array.from({ length: count }, (_, i) => ({
      pk: `USER#${i.toString().padStart(3, '0')}`,
      sk: 'PROFILE',
      type: 'user',
      data: {
        userId: `user-${i}`,
        email: `user${i}@example.com`,
        name: `Test User ${i}`,
        status: i % 2 === 0 ? 'active' : 'inactive',
        createdAt: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
        preferences: {
          theme: i % 2 === 0 ? 'light' : 'dark',
          notifications: i % 3 === 0
        }
      }
    }));
  }

  static generateOrderData(userCount: number = 5, ordersPerUser: number = 3): any[] {
    const orders: any[] = [];
    
    for (let userId = 0; userId < userCount; userId++) {
      for (let orderIndex = 0; orderIndex < ordersPerUser; orderIndex++) {
        orders.push({
          pk: `USER#${userId.toString().padStart(3, '0')}`,
          sk: `ORDER#${orderIndex.toString().padStart(3, '0')}`,
          type: 'order',
          data: {
            orderId: `order-${userId}-${orderIndex}`,
            userId: `user-${userId}`,
            status: ['pending', 'processing', 'shipped', 'delivered'][orderIndex % 4],
            total: Math.floor(Math.random() * 1000) + 10,
            items: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, (_, i) => ({
              productId: `product-${i}`,
              quantity: Math.floor(Math.random() * 3) + 1,
              price: Math.floor(Math.random() * 100) + 5
            })),
            createdAt: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString()
          }
        });
      }
    }
    
    return orders;
  }

  static generateTimeSeriesData(count: number = 100): any[] {
    const baseTime = Date.now() - (86400000 * 7); // 7 days ago
    
    return Array.from({ length: count }, (_, i) => ({
      pk: 'METRICS',
      sk: `TIMESTAMP#${(baseTime + (i * 60000)).toString()}`, // Every minute
      type: 'metric',
      data: {
        timestamp: new Date(baseTime + (i * 60000)).toISOString(),
        value: Math.floor(Math.random() * 100),
        metric: ['cpu', 'memory', 'disk', 'network'][i % 4],
        host: `server-${Math.floor(i / 25) + 1}`,
        tags: {
          environment: i % 2 === 0 ? 'production' : 'staging',
          region: ['us-east-1', 'us-west-2', 'eu-west-1'][i % 3]
        }
      }
    }));
  }
}

/**
 * Test assertion helpers
 */
export class TestAssertions {
  static async assertItemExists(provider: IDataAccessLayer, key: DatabaseKey): Promise<void> {
    const item = await provider.get(key);
    if (!item) {
      throw new Error(`Expected item to exist with key: ${JSON.stringify(key)}`);
    }
  }

  static async assertItemNotExists(provider: IDataAccessLayer, key: DatabaseKey): Promise<void> {
    const item = await provider.get(key);
    if (item) {
      throw new Error(`Expected item to not exist with key: ${JSON.stringify(key)}`);
    }
  }

  static async assertQueryReturnsCount(
    provider: IDataAccessLayer, 
    query: UnifiedQueryInput, 
    expectedCount: number
  ): Promise<void> {
    const results = await provider.query(query);
    if (results.length !== expectedCount) {
      throw new Error(`Expected query to return ${expectedCount} items, got ${results.length}`);
    }
  }

  static async assertScanReturnsMinimum(
    provider: IDataAccessLayer, 
    scan: UnifiedScanInput, 
    minimumCount: number
  ): Promise<void> {
    const results = await provider.scan(scan);
    if (results.items.length < minimumCount) {
      throw new Error(`Expected scan to return at least ${minimumCount} items, got ${results.items.length}`);
    }
  }

  static assertDataEqual(actual: any, expected: any, message?: string): void {
    const actualStr = JSON.stringify(actual, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);
    
    if (actualStr !== expectedStr) {
      throw new Error(message || `Data not equal:\nActual: ${actualStr}\nExpected: ${expectedStr}`);
    }
  }
}

/**
 * Environment setup helpers
 */
export class TestEnvironmentSetup {
  static setDynamoDBTestEnvironment(): void {
    process.env.TEST_DB_PROVIDER = 'dynamodb';
    process.env.TEST_DYNAMODB_REGION = 'us-east-1';
    process.env.TEST_DYNAMODB_PRIMARY_TABLE = 'test-primary-table';
    process.env.TEST_DYNAMODB_DATA_TABLE = 'test-data-table';
    process.env.TEST_DYNAMODB_LOCAL = 'true';
    process.env.TEST_DYNAMODB_ENDPOINT = 'http://localhost:8000';
  }

  static setMongoDBTestEnvironment(): void {
    process.env.TEST_DB_PROVIDER = 'mongodb';
    process.env.TEST_MONGODB_CONNECTION_STRING = 'mongodb://localhost:27017';
    process.env.TEST_MONGODB_DATABASE = 'test-database';
    process.env.TEST_MONGODB_PRIMARY_COLLECTION = 'test-primary';
    process.env.TEST_MONGODB_DATA_COLLECTION = 'test-data';
    process.env.TEST_MONGODB_DROP_DB = 'true';
  }

  static setBothProvidersTestEnvironment(): void {
    TestEnvironmentSetup.setDynamoDBTestEnvironment();
    TestEnvironmentSetup.setMongoDBTestEnvironment();
  }

  static clearTestEnvironment(): void {
    const testEnvVars = [
      'TEST_DB_PROVIDER',
      'TEST_DYNAMODB_REGION',
      'TEST_DYNAMODB_PRIMARY_TABLE',
      'TEST_DYNAMODB_DATA_TABLE',
      'TEST_DYNAMODB_LOCAL',
      'TEST_DYNAMODB_ENDPOINT',
      'TEST_MONGODB_CONNECTION_STRING',
      'TEST_MONGODB_DATABASE',
      'TEST_MONGODB_PRIMARY_COLLECTION',
      'TEST_MONGODB_DATA_COLLECTION',
      'TEST_MONGODB_DROP_DB'
    ];

    for (const envVar of testEnvVars) {
      delete process.env[envVar];
    }
  }
}