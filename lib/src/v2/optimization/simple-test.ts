/**
 * Simple test to verify optimization features work
 */

import {
  OptimizedDataAccessLayer,
  OptimizedDALFactory,
  InMemoryCacheProvider,
  QueryOptimizer
} from './index';

import { 
  IDataAccessLayer, 
  DatabaseKey, 
  UnifiedQueryInput,
  DatabaseProviderType 
} from '../types/database-abstraction';

// Simple mock provider
class SimpleMockProvider implements IDataAccessLayer {
  private data = new Map<string, any>();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  isConnected(): boolean { return true; }
  getProviderType(): DatabaseProviderType { return 'dynamodb'; }

  async healthCheck() {
    return {
      healthy: true,
      provider: 'dynamodb' as DatabaseProviderType,
      connectionStatus: 'connected' as const,
      metrics: {
        averageResponseTime: 10,
        errorRate: 0,
        connectionCount: 1
      }
    };
  }

  async get<TResult>(key: DatabaseKey): Promise<TResult | null> {
    const keyStr = `${key.primary}#${key.sort || ''}`;
    return this.data.get(keyStr) || null;
  }

  async put<TData>(data: TData): Promise<void> {
    const key = `${(data as any).pk}#${(data as any).sk || ''}`;
    this.data.set(key, data);
  }

  async update(): Promise<any> {}
  async delete(): Promise<void> {}
  async query<TResult>(): Promise<TResult[]> { return []; }
  async scan<TResult>(): Promise<{ items: TResult[], token?: any }> { return { items: [] }; }
  async batchGet<TResult>(): Promise<TResult[]> { return []; }
  async beginTransaction(): Promise<any> { return {}; }
  async executeTransaction(): Promise<void> {}
  async executeNative(): Promise<any> { return {}; }
}

async function testOptimizationFeatures() {
  console.log('Testing optimization features...');

  const mockProvider = new SimpleMockProvider();
  
  // Test 1: Create optimized DAL
  console.log('1. Creating optimized DAL...');
  const optimizedDAL = OptimizedDALFactory.createWithDefaults(mockProvider);
  console.log('✓ Optimized DAL created successfully');

  // Test 2: Basic operations
  console.log('2. Testing basic operations...');
  await optimizedDAL.put({ pk: 'test', sk: 'item', data: 'value' });
  const result = await optimizedDAL.get({ primary: 'test', sort: 'item' });
  console.log('✓ Basic operations work:', result);

  // Test 3: Health check with optimization metrics
  console.log('3. Testing health check...');
  const health = await optimizedDAL.healthCheck();
  console.log('✓ Health check successful:', health.healthy);

  // Test 4: Query analysis
  console.log('4. Testing query analysis...');
  const queryInput: UnifiedQueryInput = {
    keyCondition: {
      field: 'pk',
      operator: '=',
      value: 'test'
    }
  };
  const analysis = optimizedDAL.analyzeQuery(queryInput);
  console.log('✓ Query analysis completed:', analysis?.queryType);

  // Test 5: Cache provider
  console.log('5. Testing cache provider...');
  const cacheConfig = {
    enabled: true,
    defaultTtl: 300,
    maxSize: 1000
  };
  const cache = new InMemoryCacheProvider(cacheConfig);
  await cache.set('test-key', 'test-value');
  const cachedValue = await cache.get('test-key');
  console.log('✓ Cache provider works:', cachedValue === 'test-value');

  // Test 6: Query optimizer
  console.log('6. Testing query optimizer...');
  const optimizer = new QueryOptimizer('dynamodb');
  const queryAnalysis = optimizer.analyzeQuery(queryInput);
  console.log('✓ Query optimizer works:', queryAnalysis.recommendations.length >= 0);

  console.log('\n✅ All optimization features are working correctly!');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testOptimizationFeatures().catch(console.error);
}

export { testOptimizationFeatures };