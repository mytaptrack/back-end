/**
 * Tests for enhanced transaction management system
 */

import {
  TransactionManager,
  EnhancedTransaction,
  TransactionState,
  TransactionOptions,
  IEnhancedTransaction,
  createTransactionManager,
  isTransactionActive,
  getTransactionAge,
  isTransactionExpired
} from './transaction-manager';

import {
  IDataAccessLayer,
  ITransaction,
  DatabaseKey,
  UnifiedUpdateInput,
  PutOptions,
  DeleteOptions,
  TransactionOperation,
  FilterCondition
} from '../types/database-abstraction';

import {
  TransactionError,
  ValidationError,
  ConnectionError,
  DatabaseError
} from '../types/database-errors';

import { DefaultMetricsCollector } from '../types/database-provider';

// Mock implementations
class MockTransaction implements ITransaction {
  private active = true;
  private operations: TransactionOperation[] = [];

  isActive(): boolean {
    return this.active;
  }

  async get<T>(key: DatabaseKey): Promise<T | null> {
    if (!this.active) throw new TransactionError('Transaction not active');
    return null;
  }

  async put<T>(data: T, options?: PutOptions): Promise<void> {
    if (!this.active) throw new TransactionError('Transaction not active');
    this.operations.push({ type: 'put', data });
  }

  async update(input: UnifiedUpdateInput): Promise<void> {
    if (!this.active) throw new TransactionError('Transaction not active');
    this.operations.push({ type: 'update', updates: input });
  }

  async delete(key: DatabaseKey, options?: DeleteOptions): Promise<void> {
    if (!this.active) throw new TransactionError('Transaction not active');
    this.operations.push({ type: 'delete', key });
  }

  async conditionCheck(key: DatabaseKey, condition: FilterCondition): Promise<void> {
    if (!this.active) throw new TransactionError('Transaction not active');
    this.operations.push({ type: 'conditionCheck', key, condition });
  }

  async commit(): Promise<void> {
    if (!this.active) throw new TransactionError('Transaction not active');
    if (this.failOnCommit) {
      throw new Error('Commit failed');
    }
    this.active = false;
  }

  async rollback(): Promise<void> {
    this.active = false;
  }

  getOperations(): TransactionOperation[] {
    return [...this.operations];
  }

  private failOnCommit = false;

  setFailOnCommit(fail: boolean): void {
    this.failOnCommit = fail;
  }
}

class MockProvider implements IDataAccessLayer {
  private connected = true;
  private supportsTransactions = true;

  getProviderType() {
    return 'dynamodb' as any; // Use a supported provider type
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck() {
    return {
      healthy: this.connected,
      provider: 'mock' as any,
      connectionStatus: this.connected ? 'connected' as const : 'disconnected' as const,
      metrics: {
        averageResponseTime: 10,
        errorRate: 0,
        connectionCount: 1
      }
    };
  }

  async get<TResult = any>(key: DatabaseKey): Promise<TResult | null> {
    return null;
  }

  async put<TData = any>(data: TData): Promise<void> {
    // Mock implementation
  }

  async update(input: UnifiedUpdateInput): Promise<any> {
    return null;
  }

  async delete(key: DatabaseKey): Promise<void> {
    // Mock implementation
  }

  async query<TResult = any>(): Promise<TResult[]> {
    return [];
  }

  async scan<TResult = any>(): Promise<{ items: TResult[], token?: any }> {
    return { items: [] };
  }

  async batchGet<TResult = any>(): Promise<TResult[]> {
    return [];
  }

  async beginTransaction(): Promise<ITransaction> {
    if (!this.supportsTransactions) {
      throw new Error('Transactions not supported');
    }
    return new MockTransaction();
  }

  async executeTransaction(): Promise<void> {
    // Mock implementation
  }

  async executeNative(): Promise<any> {
    return null;
  }

  setSupportsTransactions(supports: boolean): void {
    this.supportsTransactions = supports;
  }
}

describe('TransactionManager', () => {
  let transactionManager: TransactionManager;
  let mockProvider: MockProvider;
  let metrics: DefaultMetricsCollector;

  beforeEach(() => {
    metrics = new DefaultMetricsCollector();
    transactionManager = new TransactionManager(metrics);
    mockProvider = new MockProvider();
  });

  afterEach(() => {
    transactionManager.destroy();
  });

  describe('beginTransaction', () => {
    it('should create an enhanced transaction for supported providers', async () => {
      const transaction = await transactionManager.beginTransaction(mockProvider);
      
      expect(transaction.isActive()).toBe(true);
      expect(transaction.getState()).toBe(TransactionState.ACTIVE);
      expect(transaction.getTransactionId()).toBeDefined();
    });

    it('should create fallback transaction when provider does not support transactions', async () => {
      mockProvider.setSupportsTransactions(false);
      
      const transaction = await transactionManager.beginTransaction(mockProvider, {
        enableFallback: true
      });
      
      expect(transaction.isActive()).toBe(true);
      expect(transaction.getState()).toBe(TransactionState.ACTIVE);
      expect(transaction.getTransactionId()).toContain('fallback_txn_');
    });

    it('should throw error when provider does not support transactions and fallback is disabled', async () => {
      mockProvider.setSupportsTransactions(false);
      
      await expect(
        transactionManager.beginTransaction(mockProvider, { enableFallback: false })
      ).rejects.toThrow('does not support transactions and fallback is disabled');
    });

    it('should apply transaction options correctly', async () => {
      const options: TransactionOptions = {
        timeout: 60000,
        maxRetries: 5,
        retryDelay: 2000
      };
      
      const transaction = await transactionManager.beginTransaction(mockProvider, options);
      const context = transaction.getContext();
      
      expect(context.options.timeout).toBe(60000);
      expect(context.options.maxRetries).toBe(5);
      expect(context.options.retryDelay).toBe(2000);
    });
  });

  describe('executeTransaction', () => {
    it('should execute transaction successfully', async () => {
      const transaction = await transactionManager.beginTransaction(mockProvider);
      
      await transaction.put({ pk: 'test', sk: 'item', data: 'value' });
      await transactionManager.executeTransaction(transaction);
      
      expect(transaction.getState()).toBe(TransactionState.COMMITTED);
      expect(transactionManager.getActiveTransactions()).toHaveLength(0);
    });

    it('should handle transaction execution failure', async () => {
      // Use a provider that supports transactions for this test
      mockProvider.setSupportsTransactions(true);
      const transaction = await transactionManager.beginTransaction(mockProvider);
      
      // Mock the underlying transaction to fail on commit
      const mockTransaction = (transaction as any).underlyingTransaction as MockTransaction;
      if (mockTransaction) {
        mockTransaction.setFailOnCommit(true);
      } else {
        // For fallback transactions, mock provider operations to fail
        const originalPut = mockProvider.put;
        mockProvider.put = jest.fn().mockRejectedValue(new Error('Put operation failed'));
        
        await transaction.put({ pk: 'test', sk: 'item', data: 'value' });
        
        await expect(
          transactionManager.executeTransaction(transaction)
        ).rejects.toThrow();
        
        expect(transactionManager.getActiveTransactions()).toHaveLength(0);
        
        // Restore original method
        mockProvider.put = originalPut;
        return;
      }
      
      await transaction.put({ pk: 'test', sk: 'item', data: 'value' });
      
      await expect(
        transactionManager.executeTransaction(transaction)
      ).rejects.toThrow();
      
      expect(transactionManager.getActiveTransactions()).toHaveLength(0);
    });

    it('should not execute inactive transaction', async () => {
      const transaction = await transactionManager.beginTransaction(mockProvider);
      await transaction.rollback();
      
      await expect(
        transactionManager.executeTransaction(transaction)
      ).rejects.toThrow(TransactionError);
    });
  });

  describe('rollbackTransaction', () => {
    it('should rollback transaction successfully', async () => {
      const transaction = await transactionManager.beginTransaction(mockProvider);
      
      await transaction.put({ pk: 'test', sk: 'item', data: 'value' });
      await transactionManager.rollbackTransaction(transaction, 'Test rollback');
      
      expect(transaction.getState()).toBe(TransactionState.ROLLED_BACK);
      expect(transactionManager.getActiveTransactions()).toHaveLength(0);
    });

    it('should call rollback callback when provided', async () => {
      const onRollback = jest.fn();
      const transaction = await transactionManager.beginTransaction(mockProvider, {
        onRollback
      });
      
      await transactionManager.rollbackTransaction(transaction, 'Test rollback');
      
      expect(onRollback).toHaveBeenCalledWith('Test rollback');
    });
  });

  describe('cleanupExpiredTransactions', () => {
    it('should cleanup expired transactions', async () => {
      const transaction = await transactionManager.beginTransaction(mockProvider, {
        timeout: 100 // Very short timeout
      });
      
      // Wait for transaction to expire
      await new Promise(resolve => setTimeout(resolve, 250));
      
      await transactionManager.cleanupExpiredTransactions();
      
      expect(transactionManager.getActiveTransactions()).toHaveLength(0);
    });
  });
});

describe('EnhancedTransaction', () => {
  let mockProvider: MockProvider;
  let mockTransaction: MockTransaction;
  let enhancedTransaction: EnhancedTransaction;

  beforeEach(() => {
    mockProvider = new MockProvider();
    mockTransaction = new MockTransaction();
    enhancedTransaction = new EnhancedTransaction(
      mockProvider,
      mockTransaction,
      {},
      new DefaultMetricsCollector()
    );
  });

  describe('basic operations', () => {
    it('should perform get operation', async () => {
      const key: DatabaseKey = { primary: 'test', sort: 'item' };
      const result = await enhancedTransaction.get(key);
      
      expect(result).toBeNull();
    });

    it('should perform put operation and track it', async () => {
      const data = { pk: 'test', sk: 'item', data: 'value' };
      
      await enhancedTransaction.put(data);
      
      const operations = enhancedTransaction.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe('put');
      expect(operations[0].data).toEqual(data);
    });

    it('should perform update operation and track it', async () => {
      const updateInput: UnifiedUpdateInput = {
        key: { primary: 'test', sort: 'item' },
        updates: { data: 'new value' }
      };
      
      await enhancedTransaction.update(updateInput);
      
      const operations = enhancedTransaction.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe('update');
      expect(operations[0].updates).toEqual(updateInput);
    });

    it('should perform delete operation and track it', async () => {
      const key: DatabaseKey = { primary: 'test', sort: 'item' };
      
      await enhancedTransaction.delete(key);
      
      const operations = enhancedTransaction.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe('delete');
      expect(operations[0].key).toEqual(key);
    });

    it('should perform condition check and track it', async () => {
      const key: DatabaseKey = { primary: 'test', sort: 'item' };
      const condition: FilterCondition = {
        field: 'status',
        operator: '=',
        value: 'active'
      };
      
      await enhancedTransaction.conditionCheck(key, condition);
      
      const operations = enhancedTransaction.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe('conditionCheck');
      expect(operations[0].key).toEqual(key);
      expect(operations[0].condition).toEqual(condition);
    });
  });

  describe('transaction lifecycle', () => {
    it('should commit successfully', async () => {
      await enhancedTransaction.put({ pk: 'test', sk: 'item', data: 'value' });
      await enhancedTransaction.commit();
      
      expect(enhancedTransaction.getState()).toBe(TransactionState.COMMITTED);
      expect(enhancedTransaction.isActive()).toBe(false);
    });

    it('should rollback successfully', async () => {
      await enhancedTransaction.put({ pk: 'test', sk: 'item', data: 'value' });
      await enhancedTransaction.rollback();
      
      expect(enhancedTransaction.getState()).toBe(TransactionState.ROLLED_BACK);
      expect(enhancedTransaction.isActive()).toBe(false);
    });

    it('should not allow operations on inactive transaction', async () => {
      await enhancedTransaction.rollback();
      
      await expect(
        enhancedTransaction.put({ pk: 'test', sk: 'item', data: 'value' })
      ).rejects.toThrow(TransactionError);
    });
  });

  describe('timeout handling', () => {
    it('should handle transaction timeout', async () => {
      const shortTimeoutTransaction = new EnhancedTransaction(
        mockProvider,
        mockTransaction,
        { timeout: 50 }, // Very short timeout
        new DefaultMetricsCollector()
      );
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(shortTimeoutTransaction.isActive()).toBe(false);
    });
  });

  describe('retry mechanism', () => {
    it('should retry on retryable errors', async () => {
      const onRetry = jest.fn();
      const retryTransaction = new EnhancedTransaction(
        mockProvider,
        mockTransaction,
        {
          maxRetries: 2,
          retryDelay: 10,
          onRetry
        },
        new DefaultMetricsCollector()
      );
      
      // Mock a retryable error on first attempt, success on second
      let attemptCount = 0;
      const originalCommit = mockTransaction.commit.bind(mockTransaction);
      mockTransaction.commit = jest.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          const error = new ConnectionError('Temporary connection error');
          throw error;
        }
        return originalCommit();
      });
      
      await retryTransaction.commit();
      
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(retryTransaction.getState()).toBe(TransactionState.COMMITTED);
    });
  });

  describe('configuration methods', () => {
    it('should update timeout', () => {
      enhancedTransaction.setTimeout(60000);
      expect(enhancedTransaction.getContext().options.timeout).toBe(60000);
    });

    it('should update retry options', () => {
      enhancedTransaction.setRetryOptions(5, 2000);
      const context = enhancedTransaction.getContext();
      expect(context.options.maxRetries).toBe(5);
      expect(context.options.retryDelay).toBe(2000);
    });

    it('should update fallback setting', () => {
      enhancedTransaction.enableFallback(false);
      expect(enhancedTransaction.getContext().options.enableFallback).toBe(false);
    });
  });
});

describe('Utility functions', () => {
  let mockProvider: MockProvider;
  let transaction: IEnhancedTransaction;

  beforeEach(async () => {
    mockProvider = new MockProvider();
    const manager = createTransactionManager();
    transaction = await manager.beginTransaction(mockProvider);
  });

  describe('createTransactionManager', () => {
    it('should create a transaction manager', () => {
      const manager = createTransactionManager();
      expect(manager).toBeInstanceOf(TransactionManager);
    });
  });

  describe('isTransactionActive', () => {
    it('should return true for active transaction', () => {
      expect(isTransactionActive(transaction)).toBe(true);
    });

    it('should return false for inactive transaction', async () => {
      await transaction.rollback();
      expect(isTransactionActive(transaction)).toBe(false);
    });
  });

  describe('getTransactionAge', () => {
    it('should return transaction age in milliseconds', () => {
      const age = getTransactionAge(transaction);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(1000); // Should be very recent
    });
  });

  describe('isTransactionExpired', () => {
    it('should return false for new transaction', () => {
      expect(isTransactionExpired(transaction)).toBe(false);
    });

    it('should return true for expired transaction', async () => {
      // Create transaction with very short timeout
      const manager = createTransactionManager();
      const shortTransaction = await manager.beginTransaction(mockProvider, {
        timeout: 1 // 1ms timeout
      });
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(isTransactionExpired(shortTransaction)).toBe(true);
    });
  });
});

describe('Fallback Transaction', () => {
  let mockProvider: MockProvider;
  let transactionManager: TransactionManager;

  beforeEach(() => {
    mockProvider = new MockProvider();
    mockProvider.setSupportsTransactions(false);
    transactionManager = new TransactionManager();
  });

  afterEach(() => {
    transactionManager.destroy();
  });

  it('should create fallback transaction when provider does not support transactions', async () => {
    const transaction = await transactionManager.beginTransaction(mockProvider, {
      enableFallback: true
    });
    
    expect(transaction.getTransactionId()).toContain('fallback_txn_');
    expect(transaction.isActive()).toBe(true);
  });

  it('should execute operations in fallback mode', async () => {
    const transaction = await transactionManager.beginTransaction(mockProvider, {
      enableFallback: true
    });
    
    await transaction.put({ pk: 'test', sk: 'item', data: 'value' });
    await transaction.update({
      key: { primary: 'test', sort: 'item' },
      updates: { data: 'updated' }
    });
    
    const operations = transaction.getOperations();
    expect(operations).toHaveLength(2);
    expect(operations[0].type).toBe('put');
    expect(operations[1].type).toBe('update');
  });

  it('should commit fallback transaction', async () => {
    const transaction = await transactionManager.beginTransaction(mockProvider, {
      enableFallback: true
    });
    
    await transaction.put({ pk: 'test', sk: 'item', data: 'value' });
    await transaction.commit();
    
    expect(transaction.getState()).toBe(TransactionState.COMMITTED);
  });

  it('should rollback fallback transaction', async () => {
    const transaction = await transactionManager.beginTransaction(mockProvider, {
      enableFallback: true
    });
    
    await transaction.put({ pk: 'test', sk: 'item', data: 'value' });
    await transaction.rollback();
    
    expect(transaction.getState()).toBe(TransactionState.ROLLED_BACK);
  });
});