/**
 * Transaction Management System Examples
 * Demonstrates how to use the enhanced transaction management system
 */

import {
  TransactionManager,
  TransactionOptions,
  TransactionState,
  IEnhancedTransaction,
  createTransactionManager,
  isTransactionActive,
  getTransactionAge
} from '../utils/transaction-manager';

import { DynamoDBProvider } from '../providers/dynamodb-provider';
import { MongoDBProvider } from '../providers/mongodb-provider';
import { DatabaseFactory } from '../utils/database-factory';
import { DefaultMetricsCollector } from '../types/database-provider';

import {
  DatabaseKey,
  UnifiedUpdateInput,
  TransactionOperation,
  FilterCondition
} from '../types/database-abstraction';

import {
  TransactionError,
  ValidationError,
  ConnectionError
} from '../types/database-errors';

/**
 * Example 1: Basic Transaction Usage
 */
export async function basicTransactionExample(): Promise<void> {
  console.log('=== Basic Transaction Example ===');
  
  // Create transaction manager
  const transactionManager = createTransactionManager();
  
  // Get database provider (could be DynamoDB or MongoDB)
  const provider = DatabaseFactory.create({
    provider: 'dynamodb',
    dynamodb: {
      region: 'us-east-1',
      primaryTable: 'MyTable',
      dataTable: 'MyDataTable'
    }
  });
  
  await provider.connect();
  
  try {
    // Begin transaction
    const transaction = await transactionManager.beginTransaction(provider);
    
    console.log(`Started transaction: ${transaction.getTransactionId()}`);
    
    // Perform operations
    await transaction.put({
      pk: 'user#123',
      sk: 'profile',
      name: 'John Doe',
      email: 'john@example.com',
      version: 1
    });
    
    await transaction.update({
      key: { primary: 'user#123', sort: 'settings' },
      updates: {
        theme: 'dark',
        notifications: true
      }
    });
    
    // Commit transaction
    await transactionManager.executeTransaction(transaction);
    
    console.log(`Transaction committed successfully: ${transaction.getState()}`);
    
  } catch (error) {
    console.error('Transaction failed:', error);
  } finally {
    await provider.disconnect();
    transactionManager.destroy();
  }
}

/**
 * Example 2: Transaction with Retry and Timeout Options
 */
export async function advancedTransactionExample(): Promise<void> {
  console.log('=== Advanced Transaction Example ===');
  
  const metrics = new DefaultMetricsCollector();
  const transactionManager = new TransactionManager(metrics);
  
  const provider = DatabaseFactory.create({
    provider: 'mongodb',
    mongodb: {
      connectionString: 'mongodb://localhost:27017',
      database: 'myapp',
      collections: {
        primary: 'documents',
        data: 'data'
      }
    }
  });
  
  await provider.connect();
  
  const transactionOptions: TransactionOptions = {
    timeout: 60000, // 1 minute timeout
    maxRetries: 3,
    retryDelay: 2000, // 2 second delay between retries
    onRetry: (attempt, error) => {
      console.log(`Retry attempt ${attempt} due to error: ${error.message}`);
    },
    onRollback: (reason, error) => {
      console.log(`Transaction rolled back: ${reason}`, error?.message);
    }
  };
  
  try {
    const transaction = await transactionManager.beginTransaction(provider, transactionOptions);
    
    console.log(`Started advanced transaction: ${transaction.getTransactionId()}`);
    
    // Perform complex operations
    await transaction.put({
      pk: 'order#456',
      sk: 'details',
      customerId: 'user#123',
      items: [
        { productId: 'prod#1', quantity: 2, price: 29.99 },
        { productId: 'prod#2', quantity: 1, price: 49.99 }
      ],
      total: 109.97,
      status: 'pending'
    });
    
    // Update inventory
    await transaction.update({
      key: { primary: 'inventory', sort: 'prod#1' },
      updates: {},
      incrementFields: { quantity: -2 }
    });
    
    await transaction.update({
      key: { primary: 'inventory', sort: 'prod#2' },
      updates: {},
      incrementFields: { quantity: -1 }
    });
    
    // Add condition check to ensure customer exists
    await transaction.conditionCheck(
      { primary: 'user#123', sort: 'profile' },
      { field: 'status', operator: '=', value: 'active' }
    );
    
    // Commit with automatic retry on failure
    await transactionManager.executeTransaction(transaction);
    
    console.log('Advanced transaction completed successfully');
    
  } catch (error) {
    console.error('Advanced transaction failed:', error);
  } finally {
    await provider.disconnect();
    transactionManager.destroy();
  }
}

/**
 * Example 3: Fallback Transaction for Unsupported Providers
 */
export async function fallbackTransactionExample(): Promise<void> {
  console.log('=== Fallback Transaction Example ===');
  
  const transactionManager = createTransactionManager();
  
  // Simulate a provider that doesn't support transactions
  const provider = DatabaseFactory.create({
    provider: 'dynamodb', // Assume this is a limited provider
    dynamodb: {
      region: 'us-east-1',
      primaryTable: 'MyTable',
      dataTable: 'MyDataTable'
    }
  });
  
  await provider.connect();
  
  try {
    // Enable fallback for providers without full transaction support
    const transaction = await transactionManager.beginTransaction(provider, {
      enableFallback: true,
      onRollback: (reason) => {
        console.log(`Fallback transaction rolled back: ${reason}`);
      }
    });
    
    console.log(`Started fallback transaction: ${transaction.getTransactionId()}`);
    
    // Operations are queued and executed sequentially with rollback capability
    await transaction.put({
      pk: 'document#789',
      sk: 'metadata',
      title: 'Important Document',
      author: 'user#123',
      createdAt: new Date().toISOString()
    });
    
    await transaction.update({
      key: { primary: 'user#123', sort: 'stats' },
      updates: {},
      incrementFields: { documentsCreated: 1 }
    });
    
    // Commit fallback transaction
    await transactionManager.executeTransaction(transaction);
    
    console.log('Fallback transaction completed successfully');
    
  } catch (error) {
    console.error('Fallback transaction failed:', error);
  } finally {
    await provider.disconnect();
    transactionManager.destroy();
  }
}

/**
 * Example 4: Transaction Error Handling and Recovery
 */
export async function errorHandlingExample(): Promise<void> {
  console.log('=== Error Handling Example ===');
  
  const transactionManager = createTransactionManager();
  const provider = DatabaseFactory.create({
    provider: 'dynamodb',
    dynamodb: {
      region: 'us-east-1',
      primaryTable: 'MyTable',
      dataTable: 'MyDataTable'
    }
  });
  
  await provider.connect();
  
  try {
    const transaction = await transactionManager.beginTransaction(provider, {
      maxRetries: 2,
      retryDelay: 1000,
      onRetry: (attempt, error) => {
        console.log(`Retry ${attempt}: ${error.code} - ${error.message}`);
      }
    });
    
    console.log(`Started error handling transaction: ${transaction.getTransactionId()}`);
    
    // Simulate operations that might fail
    await transaction.put({
      pk: 'test#error',
      sk: 'data',
      value: 'test data'
    });
    
    // This might fail due to condition check
    await transaction.conditionCheck(
      { primary: 'nonexistent#key', sort: 'data' },
      { field: 'status', operator: '=', value: 'active' }
    );
    
    await transactionManager.executeTransaction(transaction);
    
  } catch (error) {
    if (error instanceof TransactionError) {
      console.log('Transaction error occurred:', error.message);
      console.log('Error code:', error.code);
      console.log('Retryable:', error.retryable);
    } else if (error instanceof ValidationError) {
      console.log('Validation error:', error.message);
    } else {
      console.log('Unexpected error:', error);
    }
  } finally {
    await provider.disconnect();
    transactionManager.destroy();
  }
}

/**
 * Example 5: Manual Transaction Management
 */
export async function manualTransactionExample(): Promise<void> {
  console.log('=== Manual Transaction Example ===');
  
  const transactionManager = createTransactionManager();
  const provider = DatabaseFactory.create({
    provider: 'mongodb',
    mongodb: {
      connectionString: 'mongodb://localhost:27017',
      database: 'myapp',
      collections: {
        primary: 'documents',
        data: 'data'
      }
    }
  });
  
  await provider.connect();
  
  let transaction: IEnhancedTransaction | null = null;
  
  try {
    transaction = await transactionManager.beginTransaction(provider, {
      timeout: 30000
    });
    
    console.log(`Started manual transaction: ${transaction.getTransactionId()}`);
    
    // Check if transaction is still active
    if (isTransactionActive(transaction)) {
      console.log(`Transaction age: ${getTransactionAge(transaction)}ms`);
      
      // Perform operations
      await transaction.put({
        pk: 'batch#001',
        sk: 'job',
        status: 'processing',
        startTime: new Date().toISOString()
      });
      
      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update status
      await transaction.update({
        key: { primary: 'batch#001', sort: 'job' },
        updates: {
          status: 'completed',
          endTime: new Date().toISOString()
        }
      });
      
      // Manual commit
      await transaction.commit();
      console.log(`Transaction state: ${transaction.getState()}`);
    }
    
  } catch (error) {
    console.error('Manual transaction error:', error);
    
    // Manual rollback on error
    if (transaction && isTransactionActive(transaction)) {
      try {
        await transactionManager.rollbackTransaction(transaction, 'Error occurred');
        console.log('Transaction rolled back successfully');
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
    }
  } finally {
    await provider.disconnect();
    transactionManager.destroy();
  }
}

/**
 * Example 6: Monitoring Active Transactions
 */
export async function monitoringExample(): Promise<void> {
  console.log('=== Monitoring Example ===');
  
  const transactionManager = createTransactionManager();
  const provider = DatabaseFactory.create({
    provider: 'dynamodb',
    dynamodb: {
      region: 'us-east-1',
      primaryTable: 'MyTable',
      dataTable: 'MyDataTable'
    }
  });
  
  await provider.connect();
  
  try {
    // Start multiple transactions
    const transaction1 = await transactionManager.beginTransaction(provider);
    const transaction2 = await transactionManager.beginTransaction(provider);
    const transaction3 = await transactionManager.beginTransaction(provider);
    
    console.log('Started 3 transactions');
    
    // Monitor active transactions
    const activeTransactions = transactionManager.getActiveTransactions();
    console.log(`Active transactions: ${activeTransactions.length}`);
    
    for (const txn of activeTransactions) {
      const context = txn.getContext();
      console.log(`- Transaction ${txn.getTransactionId()}: ${context.state} (age: ${getTransactionAge(txn)}ms)`);
    }
    
    // Complete some transactions
    await transaction1.put({ pk: 'test1', sk: 'data', value: 1 });
    await transactionManager.executeTransaction(transaction1);
    
    await transactionManager.rollbackTransaction(transaction2, 'Test rollback');
    
    // Check active transactions again
    const remainingTransactions = transactionManager.getActiveTransactions();
    console.log(`Remaining active transactions: ${remainingTransactions.length}`);
    
    // Cleanup remaining transactions
    for (const txn of remainingTransactions) {
      if (isTransactionActive(txn)) {
        await transactionManager.rollbackTransaction(txn, 'Cleanup');
      }
    }
    
    console.log('All transactions cleaned up');
    
  } catch (error) {
    console.error('Monitoring example error:', error);
  } finally {
    await provider.disconnect();
    transactionManager.destroy();
  }
}

/**
 * Example 7: Batch Operations with Transactions
 */
export async function batchOperationsExample(): Promise<void> {
  console.log('=== Batch Operations Example ===');
  
  const transactionManager = createTransactionManager();
  const provider = DatabaseFactory.create({
    provider: 'dynamodb',
    dynamodb: {
      region: 'us-east-1',
      primaryTable: 'MyTable',
      dataTable: 'MyDataTable'
    }
  });
  
  await provider.connect();
  
  try {
    const transaction = await transactionManager.beginTransaction(provider);
    
    console.log(`Started batch operations transaction: ${transaction.getTransactionId()}`);
    
    // Batch create users
    const users = [
      { id: 'user#001', name: 'Alice', email: 'alice@example.com' },
      { id: 'user#002', name: 'Bob', email: 'bob@example.com' },
      { id: 'user#003', name: 'Charlie', email: 'charlie@example.com' }
    ];
    
    for (const user of users) {
      await transaction.put({
        pk: user.id,
        sk: 'profile',
        name: user.name,
        email: user.email,
        createdAt: new Date().toISOString()
      });
      
      // Create user settings
      await transaction.put({
        pk: user.id,
        sk: 'settings',
        theme: 'light',
        notifications: true,
        language: 'en'
      });
    }
    
    // Update global stats
    await transaction.update({
      key: { primary: 'global', sort: 'stats' },
      updates: {},
      incrementFields: { totalUsers: users.length }
    });
    
    // Get current operations count
    const operations = transaction.getOperations();
    console.log(`Queued ${operations.length} operations for batch execution`);
    
    // Execute all operations atomically
    await transactionManager.executeTransaction(transaction);
    
    console.log('Batch operations completed successfully');
    
  } catch (error) {
    console.error('Batch operations failed:', error);
  } finally {
    await provider.disconnect();
    transactionManager.destroy();
  }
}

/**
 * Run all examples
 */
export async function runAllTransactionExamples(): Promise<void> {
  console.log('Running Transaction Management Examples...\n');
  
  try {
    await basicTransactionExample();
    console.log('\n');
    
    await advancedTransactionExample();
    console.log('\n');
    
    await fallbackTransactionExample();
    console.log('\n');
    
    await errorHandlingExample();
    console.log('\n');
    
    await manualTransactionExample();
    console.log('\n');
    
    await monitoringExample();
    console.log('\n');
    
    await batchOperationsExample();
    console.log('\n');
    
    console.log('All transaction examples completed!');
    
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Export for use in other modules
export {
  TransactionManager,
  TransactionOptions,
  TransactionState,
  IEnhancedTransaction
};