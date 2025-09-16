/**
 * MongoDB Provider Integration Example
 * Demonstrates how to use the MongoDB provider implementation
 */

import { MongoDBProvider } from '../providers/mongodb-provider';
import { MongoDBConfig, DatabaseKey, UnifiedUpdateInput } from '../types/database-abstraction';

/**
 * Example configuration for MongoDB provider
 */
const mongoConfig: MongoDBConfig = {
  connectionString: process.env.MONGODB_CONNECTION_STRING || 'mongodb://localhost:27017',
  database: process.env.MONGODB_DATABASE || 'mytaptrack_dev',
  collections: {
    primary: 'primary_data',
    data: 'secondary_data'
  },
  options: {
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000
  }
};

/**
 * Example usage of MongoDB provider
 */
export async function mongoDBProviderExample() {
  console.log('MongoDB Provider Integration Example');
  console.log('====================================');

  // Create MongoDB provider instance
  const provider = new MongoDBProvider(mongoConfig);

  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await provider.connect();
    console.log('✓ Connected successfully');

    // Check health
    const health = await provider.healthCheck();
    console.log('Health Status:', {
      healthy: health.healthy,
      provider: health.provider,
      connectionStatus: health.connectionStatus
    });

    // Example 1: Basic CRUD Operations
    console.log('\n1. Basic CRUD Operations');
    console.log('------------------------');

    // Create a user document
    const userData = {
      pk: 'user#123',
      sk: 'profile',
      pksk: 'user#123#profile',
      userId: 'user123',
      name: 'John Doe',
      email: 'john.doe@example.com',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('Creating user document...');
    await provider.put(userData);
    console.log('✓ User document created');

    // Retrieve the user document
    const userKey: DatabaseKey = { primary: 'user#123', sort: 'profile' };
    console.log('Retrieving user document...');
    const retrievedUser = await provider.get(userKey);
    console.log('✓ User retrieved:', retrievedUser?.name);

    // Update the user document
    const updateInput: UnifiedUpdateInput = {
      key: userKey,
      updates: {
        name: 'John Smith',
        lastLogin: new Date()
      },
      incrementFields: {
        loginCount: 1
      }
    };

    console.log('Updating user document...');
    await provider.update(updateInput);
    console.log('✓ User document updated');

    // Example 2: Query Operations
    console.log('\n2. Query Operations');
    console.log('------------------');

    // Create additional test data
    const testUsers = [
      {
        pk: 'user#124',
        sk: 'profile',
        pksk: 'user#124#profile',
        userId: 'user124',
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        status: 'active'
      },
      {
        pk: 'user#125',
        sk: 'profile',
        pksk: 'user#125#profile',
        userId: 'user125',
        name: 'Bob Wilson',
        email: 'bob.wilson@example.com',
        status: 'inactive'
      }
    ];

    console.log('Creating additional test users...');
    for (const user of testUsers) {
      await provider.put(user);
    }
    console.log('✓ Test users created');

    // Query users by status
    console.log('Querying active users...');
    const activeUsers = await provider.query({
      filterCondition: {
        field: 'status',
        operator: '=',
        value: 'active'
      },
      projection: ['name', 'email', 'status']
    });
    console.log(`✓ Found ${activeUsers.length} active users`);

    // Scan all user profiles
    console.log('Scanning user profiles...');
    const scanResult = await provider.scan({
      filterCondition: {
        field: 'sk',
        operator: '=',
        value: 'profile'
      },
      limit: 10
    });
    console.log(`✓ Scanned ${scanResult.items.length} user profiles`);

    // Batch get multiple users
    console.log('Batch retrieving users...');
    const userKeys: DatabaseKey[] = [
      { primary: 'user#123', sort: 'profile' },
      { primary: 'user#124', sort: 'profile' },
      { primary: 'user#125', sort: 'profile' }
    ];
    const batchUsers = await provider.batchGet(userKeys);
    console.log(`✓ Batch retrieved ${batchUsers.length} users`);

    // Example 3: Transaction Operations
    console.log('\n3. Transaction Operations');
    console.log('------------------------');

    console.log('Executing transaction...');
    const transaction = await provider.beginTransaction();

    try {
      // Add operations to transaction
      await transaction.put({
        pk: 'user#126',
        sk: 'profile',
        pksk: 'user#126#profile',
        userId: 'user126',
        name: 'Alice Johnson',
        email: 'alice.johnson@example.com',
        status: 'active'
      });

      await transaction.update({
        key: { primary: 'user#123', sort: 'profile' },
        updates: { lastTransactionUpdate: new Date() }
      });

      // Commit transaction
      await transaction.commit();
      console.log('✓ Transaction committed successfully');
    } catch (error) {
      console.log('Transaction failed, rolling back...');
      await transaction.rollback();
      throw error;
    }

    // Example 4: Native MongoDB Operations
    console.log('\n4. Native MongoDB Operations');
    console.log('----------------------------');

    console.log('Executing native aggregation...');
    const aggregationResult = await provider.executeNative(async (db) => {
      return await db.collection(mongoConfig.collections.primary)
        .aggregate([
          { $match: { sk: 'profile' } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
        .toArray();
    });
    console.log('✓ Aggregation result:', aggregationResult);

    // Example 5: Error Handling
    console.log('\n5. Error Handling');
    console.log('----------------');

    try {
      // Try to get a non-existent document
      const nonExistent = await provider.get({ primary: 'nonexistent', sort: 'item' });
      console.log('Non-existent document result:', nonExistent);
    } catch (error) {
      console.log('Expected error for non-existent document:', error.message);
    }

    try {
      // Try to delete a non-existent document
      await provider.delete({ primary: 'nonexistent', sort: 'item' });
    } catch (error) {
      console.log('Expected error for deleting non-existent document:', error.constructor.name);
    }

    // Cleanup: Delete test documents
    console.log('\n6. Cleanup');
    console.log('---------');

    const testKeys = [
      { primary: 'user#123', sort: 'profile' },
      { primary: 'user#124', sort: 'profile' },
      { primary: 'user#125', sort: 'profile' },
      { primary: 'user#126', sort: 'profile' }
    ];

    console.log('Cleaning up test documents...');
    for (const key of testKeys) {
      try {
        await provider.delete(key);
      } catch (error) {
        // Ignore errors for documents that might not exist
      }
    }
    console.log('✓ Cleanup completed');

  } catch (error) {
    console.error('Error during MongoDB provider example:', error);
    throw error;
  } finally {
    // Always disconnect
    console.log('\nDisconnecting from MongoDB...');
    await provider.disconnect();
    console.log('✓ Disconnected successfully');
  }
}

/**
 * Example of using MongoDB provider with configuration from environment
 */
export async function mongoDBProviderWithEnvConfig() {
  console.log('MongoDB Provider with Environment Configuration');
  console.log('=============================================');

  // Load configuration from environment variables
  const envConfig: MongoDBConfig = {
    connectionString: process.env.MONGODB_URL || 'mongodb://localhost:27017',
    database: process.env.MONGODB_DB_NAME || 'mytaptrack',
    collections: {
      primary: process.env.MONGODB_PRIMARY_COLLECTION || 'primary_data',
      data: process.env.MONGODB_DATA_COLLECTION || 'data'
    },
    options: {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10'),
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2'),
      maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS || '30000'),
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '5000')
    }
  };

  console.log('Configuration loaded from environment:');
  console.log('- Database:', envConfig.database);
  console.log('- Primary Collection:', envConfig.collections.primary);
  console.log('- Data Collection:', envConfig.collections.data);
  console.log('- Max Pool Size:', envConfig.options?.maxPoolSize);

  const provider = new MongoDBProvider(envConfig);

  try {
    await provider.connect();
    console.log('✓ Connected with environment configuration');

    const health = await provider.healthCheck();
    console.log('Health check passed:', health.healthy);

  } catch (error) {
    console.error('Failed to connect with environment configuration:', error.message);
    throw error;
  } finally {
    await provider.disconnect();
    console.log('✓ Disconnected');
  }
}

/**
 * Example of MongoDB provider performance testing
 */
export async function mongoDBProviderPerformanceTest() {
  console.log('MongoDB Provider Performance Test');
  console.log('================================');

  const provider = new MongoDBProvider(mongoConfig);

  try {
    await provider.connect();
    console.log('✓ Connected for performance testing');

    // Test batch operations
    const batchSize = 100;
    const testDocuments = Array.from({ length: batchSize }, (_, i) => ({
      pk: `perf_test#${i}`,
      sk: 'data',
      pksk: `perf_test#${i}#data`,
      index: i,
      data: `Test data ${i}`,
      timestamp: new Date()
    }));

    console.log(`\nInserting ${batchSize} documents...`);
    const insertStart = Date.now();
    
    // Insert documents in parallel batches
    const batchPromises = [];
    const parallelBatchSize = 10;
    
    for (let i = 0; i < testDocuments.length; i += parallelBatchSize) {
      const batch = testDocuments.slice(i, i + parallelBatchSize);
      const batchPromise = Promise.all(batch.map(doc => provider.put(doc)));
      batchPromises.push(batchPromise);
    }
    
    await Promise.all(batchPromises);
    const insertTime = Date.now() - insertStart;
    console.log(`✓ Inserted ${batchSize} documents in ${insertTime}ms (${(batchSize / insertTime * 1000).toFixed(2)} docs/sec)`);

    // Test batch retrieval
    console.log(`\nRetrieving ${batchSize} documents...`);
    const retrieveStart = Date.now();
    
    const keys = testDocuments.map(doc => ({ primary: doc.pk, sort: doc.sk }));
    const retrieved = await provider.batchGet(keys);
    
    const retrieveTime = Date.now() - retrieveStart;
    console.log(`✓ Retrieved ${retrieved.length} documents in ${retrieveTime}ms (${(retrieved.length / retrieveTime * 1000).toFixed(2)} docs/sec)`);

    // Test query performance
    console.log('\nTesting query performance...');
    const queryStart = Date.now();
    
    const queryResults = await provider.query({
      keyCondition: {
        field: 'pk',
        operator: 'begins_with',
        value: 'perf_test#'
      },
      limit: 50
    });
    
    const queryTime = Date.now() - queryStart;
    console.log(`✓ Queried ${queryResults.length} documents in ${queryTime}ms`);

    // Cleanup performance test data
    console.log('\nCleaning up performance test data...');
    const cleanupStart = Date.now();
    
    const deletePromises = keys.map(key => 
      provider.delete(key).catch(() => {}) // Ignore errors
    );
    await Promise.all(deletePromises);
    
    const cleanupTime = Date.now() - cleanupStart;
    console.log(`✓ Cleaned up in ${cleanupTime}ms`);

  } catch (error) {
    console.error('Performance test failed:', error);
    throw error;
  } finally {
    await provider.disconnect();
    console.log('✓ Disconnected after performance test');
  }
}

// Export for use in other modules
export { mongoConfig };

// Run example if this file is executed directly
if (require.main === module) {
  (async () => {
    try {
      await mongoDBProviderExample();
      console.log('\n' + '='.repeat(50));
      await mongoDBProviderWithEnvConfig();
      console.log('\n' + '='.repeat(50));
      await mongoDBProviderPerformanceTest();
    } catch (error) {
      console.error('Example failed:', error);
      process.exit(1);
    }
  })();
}