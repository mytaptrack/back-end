/**
 * DynamoDB Provider Integration Example
 * Demonstrates how to use the DynamoDB provider with the existing DAL structure
 */

import { DynamoDBProvider } from '../providers/dynamodb-provider';
import { 
  DatabaseKey, 
  DynamoDBConfig, 
  UnifiedUpdateInput,
  TransactionOperation 
} from '../types/database-abstraction';

// Example configuration
const config: DynamoDBConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  primaryTable: process.env.PrimaryTable || 'MyTapTrack-Primary',
  dataTable: process.env.DataTable || 'MyTapTrack-Data',
  consistentRead: process.env.STRONGLY_CONSISTENT_READ === 'true'
};

// Create provider instance
const dynamoProvider = new DynamoDBProvider(config);

/**
 * Example: Basic CRUD operations
 */
export async function basicCrudExample() {
  try {
    // Connect to database
    await dynamoProvider.connect();
    
    // Create a user record
    const userData = {
      pk: 'U#user123',
      sk: 'PROFILE',
      userId: 'user123',
      email: 'user@example.com',
      name: 'John Doe',
      createdAt: new Date().toISOString(),
      version: 1
    };
    
    // Put operation
    await dynamoProvider.put(userData);
    console.log('User created successfully');
    
    // Get operation
    const key: DatabaseKey = { primary: 'U#user123', sort: 'PROFILE' };
    const retrievedUser = await dynamoProvider.get(key);
    console.log('Retrieved user:', retrievedUser);
    
    // Update operation
    const updateInput: UnifiedUpdateInput = {
      key,
      updates: {
        name: 'John Smith',
        updatedAt: new Date().toISOString()
      },
      incrementFields: {
        version: 1
      }
    };
    
    await dynamoProvider.update(updateInput);
    console.log('User updated successfully');
    
    // Query operation - get all records for user
    const queryResult = await dynamoProvider.query({
      keyCondition: {
        field: 'pk',
        operator: '=',
        value: 'U#user123'
      }
    });
    console.log('Query results:', queryResult);
    
    // Delete operation
    await dynamoProvider.delete(key);
    console.log('User deleted successfully');
    
  } catch (error) {
    console.error('CRUD example error:', error);
  } finally {
    await dynamoProvider.disconnect();
  }
}

/**
 * Example: Transaction operations
 */
export async function transactionExample() {
  try {
    await dynamoProvider.connect();
    
    // Create multiple related records in a transaction
    const operations: TransactionOperation[] = [
      {
        type: 'put',
        data: {
          pk: 'U#user456',
          sk: 'PROFILE',
          userId: 'user456',
          email: 'jane@example.com',
          name: 'Jane Doe'
        }
      },
      {
        type: 'put',
        data: {
          pk: 'U#user456',
          sk: 'SETTINGS',
          userId: 'user456',
          theme: 'dark',
          notifications: true
        }
      },
      {
        type: 'put',
        data: {
          pk: 'STATS',
          sk: 'USER_COUNT',
          count: 1
        }
      }
    ];
    
    await dynamoProvider.executeTransaction(operations);
    console.log('Transaction completed successfully');
    
    // Alternative: Using transaction object
    const transaction = await dynamoProvider.beginTransaction();
    
    await transaction.put({
      pk: 'U#user789',
      sk: 'PROFILE',
      userId: 'user789',
      email: 'bob@example.com'
    });
    
    await transaction.update({
      key: { primary: 'STATS', sort: 'USER_COUNT' },
      updates: {},
      incrementFields: { count: 1 }
    });
    
    await transaction.commit();
    console.log('Transaction object completed successfully');
    
  } catch (error) {
    console.error('Transaction example error:', error);
  } finally {
    await dynamoProvider.disconnect();
  }
}

/**
 * Example: Batch operations
 */
export async function batchExample() {
  try {
    await dynamoProvider.connect();
    
    // Batch get multiple records
    const keys: DatabaseKey[] = [
      { primary: 'U#user456', sort: 'PROFILE' },
      { primary: 'U#user456', sort: 'SETTINGS' },
      { primary: 'U#user789', sort: 'PROFILE' }
    ];
    
    const batchResults = await dynamoProvider.batchGet(keys);
    console.log('Batch get results:', batchResults);
    
    // Scan operation with filter
    const scanResults = await dynamoProvider.scan({
      filterCondition: {
        field: 'pk',
        operator: 'contains',
        value: 'U#'
      },
      limit: 10
    });
    console.log('Scan results:', scanResults);
    
  } catch (error) {
    console.error('Batch example error:', error);
  } finally {
    await dynamoProvider.disconnect();
  }
}

/**
 * Example: Error handling and health checks
 */
export async function healthAndErrorExample() {
  try {
    // Health check before connecting
    const healthBefore = await dynamoProvider.healthCheck();
    console.log('Health before connection:', healthBefore);
    
    await dynamoProvider.connect();
    
    // Health check after connecting
    const healthAfter = await dynamoProvider.healthCheck();
    console.log('Health after connection:', healthAfter);
    
    // Demonstrate error handling
    try {
      const invalidKey = {} as DatabaseKey;
      await dynamoProvider.get(invalidKey);
    } catch (error) {
      console.log('Caught validation error:', error.message);
    }
    
    // Native operation example (escape hatch)
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
    const nativeResult = await dynamoProvider.executeNative(
      new GetCommand({
        TableName: config.primaryTable,
        Key: { pk: 'U#user456', sk: 'PROFILE' }
      })
    );
    console.log('Native operation result:', nativeResult);
    
  } catch (error) {
    console.error('Health and error example error:', error);
  } finally {
    await dynamoProvider.disconnect();
  }
}

/**
 * Example: Integration with existing DAL pattern
 */
export class ModernUserDal {
  private provider: DynamoDBProvider;
  
  constructor(provider: DynamoDBProvider) {
    this.provider = provider;
  }
  
  async getUserProfile(userId: string) {
    const key: DatabaseKey = { 
      primary: `U#${userId}`, 
      sort: 'PROFILE' 
    };
    
    return this.provider.get(key);
  }
  
  async createUser(userData: any) {
    const record = {
      pk: `U#${userData.userId}`,
      sk: 'PROFILE',
      ...userData,
      createdAt: new Date().toISOString(),
      version: 1
    };
    
    await this.provider.put(record, { ensureNotExists: true });
  }
  
  async updateUserProfile(userId: string, updates: any) {
    const updateInput: UnifiedUpdateInput = {
      key: { primary: `U#${userId}`, sort: 'PROFILE' },
      updates: {
        ...updates,
        updatedAt: new Date().toISOString()
      },
      incrementFields: {
        version: 1
      }
    };
    
    return this.provider.update(updateInput);
  }
  
  async getUsersByEmail(email: string) {
    return this.provider.query({
      indexName: 'EmailIndex', // Assuming GSI exists
      keyCondition: {
        field: 'email',
        operator: '=',
        value: email
      }
    });
  }
  
  async deleteUser(userId: string) {
    const transaction = await this.provider.beginTransaction();
    
    try {
      // Delete profile
      await transaction.delete({ 
        primary: `U#${userId}`, 
        sort: 'PROFILE' 
      });
      
      // Delete settings
      await transaction.delete({ 
        primary: `U#${userId}`, 
        sort: 'SETTINGS' 
      });
      
      // Update user count
      await transaction.update({
        key: { primary: 'STATS', sort: 'USER_COUNT' },
        updates: {},
        incrementFields: { count: -1 }
      });
      
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

/**
 * Example usage of the modern DAL
 */
export async function modernDalExample() {
  const provider = new DynamoDBProvider(config);
  const userDal = new ModernUserDal(provider);
  
  try {
    await provider.connect();
    
    // Create user
    await userDal.createUser({
      userId: 'modern123',
      email: 'modern@example.com',
      name: 'Modern User'
    });
    
    // Get user
    const user = await userDal.getUserProfile('modern123');
    console.log('Modern DAL user:', user);
    
    // Update user
    await userDal.updateUserProfile('modern123', {
      name: 'Updated Modern User',
      lastLogin: new Date().toISOString()
    });
    
    // Delete user (with transaction)
    await userDal.deleteUser('modern123');
    console.log('Modern DAL operations completed');
    
  } catch (error) {
    console.error('Modern DAL example error:', error);
  } finally {
    await provider.disconnect();
  }
}

// Export the provider for use in other modules
export { dynamoProvider };

// Example of how to run all examples
export async function runAllExamples() {
  console.log('Running DynamoDB Provider Examples...');
  
  await basicCrudExample();
  await transactionExample();
  await batchExample();
  await healthAndErrorExample();
  await modernDalExample();
  
  console.log('All examples completed!');
}