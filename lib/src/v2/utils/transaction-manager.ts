/**
 * Enhanced transaction management system
 * Provides advanced transaction capabilities with error handling, rollback mechanisms, and fallback support
 */

import {
  ITransaction,
  IDataAccessLayer,
  DatabaseKey,
  UnifiedUpdateInput,
  PutOptions,
  DeleteOptions,
  TransactionOperation,
  FilterCondition,
  DatabaseProviderType
} from '../types/database-abstraction';

import {
  DatabaseError,
  TransactionError,
  ValidationError,
  ConnectionError,
  ErrorTranslatorFactory
} from '../types/database-errors';

import { IMetricsCollector, DefaultMetricsCollector } from '../types/database-provider';

// Transaction state enum
export enum TransactionState {
  ACTIVE = 'active',
  COMMITTED = 'committed',
  ROLLED_BACK = 'rolled_back',
  FAILED = 'failed'
}

// Transaction options interface
export interface TransactionOptions {
  timeout?: number; // Transaction timeout in milliseconds
  maxRetries?: number; // Maximum retry attempts for transient failures
  retryDelay?: number; // Delay between retries in milliseconds
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  enableFallback?: boolean; // Enable fallback for databases without full transaction support
  onRetry?: (attempt: number, error: DatabaseError) => void; // Retry callback
  onRollback?: (reason: string, error?: DatabaseError) => void; // Rollback callback
}

// Transaction context interface
export interface TransactionContext {
  transactionId: string;
  provider: DatabaseProviderType;
  startTime: Date;
  state: TransactionState;
  operations: TransactionOperation[];
  options: TransactionOptions;
  retryCount: number;
  lastError?: DatabaseError;
}

// Enhanced transaction interface
export interface IEnhancedTransaction extends ITransaction {
  getTransactionId(): string;
  getState(): TransactionState;
  getContext(): TransactionContext;
  addOperation(operation: TransactionOperation): void;
  getOperations(): TransactionOperation[];
  setTimeout(timeout: number): void;
  setRetryOptions(maxRetries: number, retryDelay: number): void;
  enableFallback(enabled: boolean): void;
}

// Transaction manager interface
export interface ITransactionManager {
  beginTransaction(provider: IDataAccessLayer, options?: TransactionOptions): Promise<IEnhancedTransaction>;
  executeTransaction(transaction: IEnhancedTransaction): Promise<void>;
  rollbackTransaction(transaction: IEnhancedTransaction, reason?: string): Promise<void>;
  getActiveTransactions(): IEnhancedTransaction[];
  cleanupExpiredTransactions(): Promise<void>;
}

// Enhanced transaction implementation
export class EnhancedTransaction implements IEnhancedTransaction {
  private context: TransactionContext;
  private underlyingTransaction: ITransaction;
  private provider: IDataAccessLayer;
  private metrics: IMetricsCollector;
  private timeoutHandle?: NodeJS.Timeout;

  constructor(
    provider: IDataAccessLayer,
    underlyingTransaction: ITransaction,
    options: TransactionOptions = {},
    metrics?: IMetricsCollector
  ) {
    this.provider = provider;
    this.underlyingTransaction = underlyingTransaction;
    this.metrics = metrics || new DefaultMetricsCollector();
    
    this.context = {
      transactionId: this.generateTransactionId(),
      provider: provider.getProviderType(),
      startTime: new Date(),
      state: TransactionState.ACTIVE,
      operations: [],
      options: {
        timeout: 30000, // 30 seconds default
        maxRetries: 3,
        retryDelay: 1000, // 1 second
        enableFallback: true,
        ...options
      },
      retryCount: 0
    };

    // Set up timeout if specified
    if (this.context.options.timeout) {
      this.setupTimeout();
    }
  }

  getTransactionId(): string {
    return this.context.transactionId;
  }

  getState(): TransactionState {
    return this.context.state;
  }

  getContext(): TransactionContext {
    return { ...this.context };
  }

  isActive(): boolean {
    return this.context.state === TransactionState.ACTIVE && this.underlyingTransaction.isActive();
  }

  addOperation(operation: TransactionOperation): void {
    this.validateActive();
    this.context.operations.push(operation);
  }

  getOperations(): TransactionOperation[] {
    return [...this.context.operations];
  }

  setTimeout(timeout: number): void {
    this.context.options.timeout = timeout;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
    this.setupTimeout();
  }

  setRetryOptions(maxRetries: number, retryDelay: number): void {
    this.context.options.maxRetries = maxRetries;
    this.context.options.retryDelay = retryDelay;
  }

  enableFallback(enabled: boolean): void {
    this.context.options.enableFallback = enabled;
  }

  async get<T>(key: DatabaseKey): Promise<T | null> {
    this.validateActive();
    
    try {
      const result = await this.underlyingTransaction.get<T>(key);
      this.metrics.recordOperation('transaction_get', Date.now() - this.context.startTime.getTime(), true, this.context.provider);
      return result;
    } catch (error) {
      this.metrics.recordOperation('transaction_get', Date.now() - this.context.startTime.getTime(), false, this.context.provider);
      throw this.handleTransactionError(error);
    }
  }

  async put<T>(data: T, options?: PutOptions): Promise<void> {
    this.validateActive();
    
    try {
      await this.underlyingTransaction.put(data, options);
      this.addOperation({
        type: 'put',
        data,
        condition: options?.condition
      });
      this.metrics.recordOperation('transaction_put', Date.now() - this.context.startTime.getTime(), true, this.context.provider);
    } catch (error) {
      this.metrics.recordOperation('transaction_put', Date.now() - this.context.startTime.getTime(), false, this.context.provider);
      throw this.handleTransactionError(error);
    }
  }

  async update(input: UnifiedUpdateInput): Promise<void> {
    this.validateActive();
    
    try {
      await this.underlyingTransaction.update(input);
      this.addOperation({
        type: 'update',
        updates: input
      });
      this.metrics.recordOperation('transaction_update', Date.now() - this.context.startTime.getTime(), true, this.context.provider);
    } catch (error) {
      this.metrics.recordOperation('transaction_update', Date.now() - this.context.startTime.getTime(), false, this.context.provider);
      throw this.handleTransactionError(error);
    }
  }

  async delete(key: DatabaseKey, options?: DeleteOptions): Promise<void> {
    this.validateActive();
    
    try {
      await this.underlyingTransaction.delete(key, options);
      this.addOperation({
        type: 'delete',
        key,
        condition: options?.condition
      });
      this.metrics.recordOperation('transaction_delete', Date.now() - this.context.startTime.getTime(), true, this.context.provider);
    } catch (error) {
      this.metrics.recordOperation('transaction_delete', Date.now() - this.context.startTime.getTime(), false, this.context.provider);
      throw this.handleTransactionError(error);
    }
  }

  async conditionCheck(key: DatabaseKey, condition: FilterCondition): Promise<void> {
    this.validateActive();
    
    try {
      await this.underlyingTransaction.conditionCheck(key, condition);
      this.addOperation({
        type: 'conditionCheck',
        key,
        condition
      });
      this.metrics.recordOperation('transaction_condition_check', Date.now() - this.context.startTime.getTime(), true, this.context.provider);
    } catch (error) {
      this.metrics.recordOperation('transaction_condition_check', Date.now() - this.context.startTime.getTime(), false, this.context.provider);
      throw this.handleTransactionError(error);
    }
  }

  async commit(): Promise<void> {
    this.validateActive();
    
    const startTime = Date.now();
    
    try {
      // Clear timeout before committing
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
      }

      await this.executeWithRetry(async () => {
        await this.underlyingTransaction.commit();
      });

      this.context.state = TransactionState.COMMITTED;
      this.metrics.recordOperation('transaction_commit', Date.now() - startTime, true, this.context.provider);
    } catch (error) {
      this.context.state = TransactionState.FAILED;
      this.context.lastError = this.handleTransactionError(error);
      this.metrics.recordOperation('transaction_commit', Date.now() - startTime, false, this.context.provider);
      
      // Attempt rollback on commit failure
      try {
        await this.rollback();
      } catch (rollbackError) {
        // Log rollback error but throw original commit error
        console.error('Failed to rollback after commit failure:', rollbackError);
      }
      
      throw this.context.lastError;
    }
  }

  async rollback(): Promise<void> {
    if (this.context.state === TransactionState.ROLLED_BACK) {
      return; // Already rolled back
    }

    const startTime = Date.now();
    
    try {
      // Clear timeout
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
      }

      // Call rollback callback if provided
      if (this.context.options.onRollback) {
        this.context.options.onRollback('Manual rollback', this.context.lastError);
      }

      await this.underlyingTransaction.rollback();
      this.context.state = TransactionState.ROLLED_BACK;
      this.metrics.recordOperation('transaction_rollback', Date.now() - startTime, true, this.context.provider);
    } catch (error) {
      this.context.state = TransactionState.FAILED;
      this.metrics.recordOperation('transaction_rollback', Date.now() - startTime, false, this.context.provider);
      throw this.handleTransactionError(error);
    }
  }

  private validateActive(): void {
    if (!this.isActive()) {
      throw new TransactionError(
        `Transaction ${this.context.transactionId} is not active (state: ${this.context.state})`,
        undefined,
        this.context.provider
      );
    }
  }

  private generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupTimeout(): void {
    if (this.context.options.timeout) {
      this.timeoutHandle = setTimeout(() => {
        this.handleTimeout();
      }, this.context.options.timeout);
    }
  }

  private async handleTimeout(): Promise<void> {
    if (this.isActive()) {
      const timeoutError = new TransactionError(
        `Transaction ${this.context.transactionId} timed out after ${this.context.options.timeout}ms`,
        undefined,
        this.context.provider
      );
      
      this.context.lastError = timeoutError;
      
      try {
        await this.rollback();
      } catch (rollbackError) {
        console.error('Failed to rollback timed out transaction:', rollbackError);
      }
    }
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: DatabaseError | undefined;
    
    for (let attempt = 0; attempt <= (this.context.options.maxRetries || 0); attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.handleTransactionError(error);
        
        // Don't retry if it's not a retryable error or we've exceeded max retries
        if (!lastError.retryable || attempt >= (this.context.options.maxRetries || 0)) {
          throw lastError;
        }
        
        this.context.retryCount++;
        
        // Call retry callback if provided
        if (this.context.options.onRetry) {
          this.context.options.onRetry(attempt + 1, lastError);
        }
        
        // Wait before retrying
        if (this.context.options.retryDelay && this.context.options.retryDelay > 0) {
          await this.delay(this.context.options.retryDelay);
        }
      }
    }
    
    throw lastError!;
  }

  private handleTransactionError(error: any): DatabaseError {
    if (error instanceof DatabaseError) {
      return error;
    }
    
    return ErrorTranslatorFactory.translateError(error, this.context.provider);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Transaction manager implementation
export class TransactionManager implements ITransactionManager {
  private activeTransactions: Map<string, IEnhancedTransaction> = new Map();
  private metrics: IMetricsCollector;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(metrics?: IMetricsCollector) {
    this.metrics = metrics || new DefaultMetricsCollector();
    
    // Start cleanup interval (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTransactions().catch(error => {
        console.error('Error during transaction cleanup:', error);
      });
    }, 5 * 60 * 1000);
  }

  async beginTransaction(
    provider: IDataAccessLayer, 
    options?: TransactionOptions
  ): Promise<IEnhancedTransaction> {
    try {
      let underlyingTransaction: ITransaction;
      
      try {
        underlyingTransaction = await provider.beginTransaction();
      } catch (error) {
        // If beginTransaction fails, check if we should use fallback
        if (options?.enableFallback !== false) {
          return this.createFallbackTransaction(provider, options);
        } else {
          throw new TransactionError(
            `Provider ${provider.getProviderType()} does not support transactions and fallback is disabled`,
            error,
            provider.getProviderType()
          );
        }
      }
      const enhancedTransaction = new EnhancedTransaction(
        provider,
        underlyingTransaction,
        options,
        this.metrics
      );

      this.activeTransactions.set(enhancedTransaction.getTransactionId(), enhancedTransaction);
      
      this.metrics.recordOperation('transaction_begin', 0, true, provider.getProviderType());
      
      return enhancedTransaction;
    } catch (error) {
      this.metrics.recordOperation('transaction_begin', 0, false, provider.getProviderType());
      throw ErrorTranslatorFactory.translateError(error, provider.getProviderType());
    }
  }

  async executeTransaction(transaction: IEnhancedTransaction): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (!transaction.isActive()) {
        throw new TransactionError(
          `Cannot execute transaction ${transaction.getTransactionId()} - not active`,
          undefined,
          transaction.getContext().provider
        );
      }

      await transaction.commit();
      
      // Remove from active transactions
      this.activeTransactions.delete(transaction.getTransactionId());
      
      this.metrics.recordOperation('transaction_execute', Date.now() - startTime, true, transaction.getContext().provider);
    } catch (error) {
      this.metrics.recordOperation('transaction_execute', Date.now() - startTime, false, transaction.getContext().provider);
      
      // Ensure transaction is removed from active list even on failure
      this.activeTransactions.delete(transaction.getTransactionId());
      
      throw error;
    }
  }

  async rollbackTransaction(transaction: IEnhancedTransaction, reason?: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (transaction.getContext().options.onRollback && reason) {
        transaction.getContext().options.onRollback(reason);
      }

      await transaction.rollback();
      
      // Remove from active transactions
      this.activeTransactions.delete(transaction.getTransactionId());
      
      this.metrics.recordOperation('transaction_rollback_manual', Date.now() - startTime, true, transaction.getContext().provider);
    } catch (error) {
      this.metrics.recordOperation('transaction_rollback_manual', Date.now() - startTime, false, transaction.getContext().provider);
      
      // Ensure transaction is removed from active list even on failure
      this.activeTransactions.delete(transaction.getTransactionId());
      
      throw error;
    }
  }

  getActiveTransactions(): IEnhancedTransaction[] {
    return Array.from(this.activeTransactions.values());
  }

  async cleanupExpiredTransactions(): Promise<void> {
    const now = Date.now();
    const expiredTransactions: IEnhancedTransaction[] = [];

    for (const transaction of this.activeTransactions.values()) {
      const context = transaction.getContext();
      const age = now - context.startTime.getTime();
      const timeout = context.options.timeout || 30000; // Default 30 seconds

      if (age > timeout * 2) { // Clean up transactions that are twice the timeout age
        expiredTransactions.push(transaction);
      }
    }

    for (const transaction of expiredTransactions) {
      try {
        await this.rollbackTransaction(transaction, 'Transaction expired during cleanup');
      } catch (error) {
        console.error(`Failed to rollback expired transaction ${transaction.getTransactionId()}:`, error);
        // Force remove from active list
        this.activeTransactions.delete(transaction.getTransactionId());
      }
    }

    if (expiredTransactions.length > 0) {
      console.log(`Cleaned up ${expiredTransactions.length} expired transactions`);
    }
  }

  private supportsTransactions(provider: IDataAccessLayer): boolean {
    // Both DynamoDB and MongoDB support transactions
    const providerType = provider.getProviderType();
    return providerType === 'dynamodb' || providerType === 'mongodb';
  }

  private createFallbackTransaction(
    provider: IDataAccessLayer, 
    options?: TransactionOptions
  ): IEnhancedTransaction {
    // Create a fallback transaction that simulates transaction behavior
    // This is useful for databases that don't support full ACID transactions
    return new FallbackTransaction(provider, options, this.metrics);
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Fallback transaction for databases without full transaction support
class FallbackTransaction implements IEnhancedTransaction {
  private context: TransactionContext;
  private provider: IDataAccessLayer;
  private metrics: IMetricsCollector;
  private operations: TransactionOperation[] = [];
  private executedOperations: Array<{ operation: TransactionOperation; rollbackData?: any }> = [];

  constructor(
    provider: IDataAccessLayer,
    options: TransactionOptions = {},
    metrics?: IMetricsCollector
  ) {
    this.provider = provider;
    this.metrics = metrics || new DefaultMetricsCollector();
    
    this.context = {
      transactionId: this.generateTransactionId(),
      provider: provider.getProviderType(),
      startTime: new Date(),
      state: TransactionState.ACTIVE,
      operations: [],
      options: {
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        enableFallback: true,
        ...options
      },
      retryCount: 0
    };
  }

  getTransactionId(): string {
    return this.context.transactionId;
  }

  getState(): TransactionState {
    return this.context.state;
  }

  getContext(): TransactionContext {
    return { ...this.context };
  }

  isActive(): boolean {
    return this.context.state === TransactionState.ACTIVE;
  }

  addOperation(operation: TransactionOperation): void {
    this.validateActive();
    this.operations.push(operation);
  }

  getOperations(): TransactionOperation[] {
    return [...this.operations];
  }

  setTimeout(timeout: number): void {
    this.context.options.timeout = timeout;
  }

  setRetryOptions(maxRetries: number, retryDelay: number): void {
    this.context.options.maxRetries = maxRetries;
    this.context.options.retryDelay = retryDelay;
  }

  enableFallback(enabled: boolean): void {
    this.context.options.enableFallback = enabled;
  }

  async get<T>(key: DatabaseKey): Promise<T | null> {
    this.validateActive();
    return this.provider.get<T>(key);
  }

  async put<T>(data: T, options?: PutOptions): Promise<void> {
    this.validateActive();
    this.addOperation({
      type: 'put',
      data,
      condition: options?.condition
    });
  }

  async update(input: UnifiedUpdateInput): Promise<void> {
    this.validateActive();
    this.addOperation({
      type: 'update',
      updates: input
    });
  }

  async delete(key: DatabaseKey, options?: DeleteOptions): Promise<void> {
    this.validateActive();
    this.addOperation({
      type: 'delete',
      key,
      condition: options?.condition
    });
  }

  async conditionCheck(key: DatabaseKey, condition: FilterCondition): Promise<void> {
    this.validateActive();
    // For fallback, we'll just check the condition immediately
    const item = await this.provider.get(key);
    if (!item) {
      throw new ValidationError('Condition check failed: item not found', undefined, this.context.provider);
    }
    // Additional condition validation would go here
  }

  async commit(): Promise<void> {
    this.validateActive();
    
    try {
      // Execute operations one by one, storing rollback data
      for (const operation of this.operations) {
        const rollbackData = await this.executeOperation(operation);
        this.executedOperations.push({ operation, rollbackData });
      }
      
      this.context.state = TransactionState.COMMITTED;
    } catch (error) {
      this.context.state = TransactionState.FAILED;
      
      // Attempt to rollback executed operations
      await this.rollbackExecutedOperations();
      
      throw error;
    }
  }

  async rollback(): Promise<void> {
    if (this.context.state === TransactionState.ROLLED_BACK) {
      return;
    }
    
    await this.rollbackExecutedOperations();
    this.context.state = TransactionState.ROLLED_BACK;
  }

  private async executeOperation(operation: TransactionOperation): Promise<any> {
    switch (operation.type) {
      case 'put':
        if (!operation.data) {
          throw new ValidationError('Put operation requires data field', undefined, this.context.provider);
        }
        // Store original data for rollback
        const key = this.extractKeyFromData(operation.data);
        const originalData = await this.provider.get(key);
        await this.provider.put(operation.data);
        return originalData;
      
      case 'update':
        if (!operation.updates) {
          throw new ValidationError('Update operation requires updates field', undefined, this.context.provider);
        }
        // Store original data for rollback
        const updateOriginal = await this.provider.get(operation.updates.key);
        await this.provider.update(operation.updates);
        return updateOriginal;
      
      case 'delete':
        if (!operation.key) {
          throw new ValidationError('Delete operation requires key field', undefined, this.context.provider);
        }
        // Store original data for rollback
        const deleteOriginal = await this.provider.get(operation.key);
        await this.provider.delete(operation.key);
        return deleteOriginal;
      
      default:
        throw new ValidationError(`Unsupported operation type: ${operation.type}`, undefined, this.context.provider);
    }
  }

  private async rollbackExecutedOperations(): Promise<void> {
    // Rollback operations in reverse order
    for (let i = this.executedOperations.length - 1; i >= 0; i--) {
      const { operation, rollbackData } = this.executedOperations[i];
      
      try {
        await this.rollbackOperation(operation, rollbackData);
      } catch (error) {
        console.error(`Failed to rollback operation ${i}:`, error);
        // Continue with other rollbacks even if one fails
      }
    }
  }

  private async rollbackOperation(operation: TransactionOperation, rollbackData: any): Promise<void> {
    switch (operation.type) {
      case 'put':
        const key = this.extractKeyFromData(operation.data);
        if (rollbackData) {
          // Restore original data
          await this.provider.put(rollbackData);
        } else {
          // Delete the newly created item
          await this.provider.delete(key);
        }
        break;
      
      case 'update':
        if (rollbackData && operation.updates) {
          // Restore original data
          await this.provider.put(rollbackData);
        }
        break;
      
      case 'delete':
        if (rollbackData && operation.key) {
          // Restore deleted data
          await this.provider.put(rollbackData);
        }
        break;
    }
  }

  private extractKeyFromData(data: any): DatabaseKey {
    return {
      primary: data.pk,
      sort: data.sk
    };
  }

  private validateActive(): void {
    if (!this.isActive()) {
      throw new TransactionError(
        `Fallback transaction ${this.context.transactionId} is not active (state: ${this.context.state})`,
        undefined,
        this.context.provider
      );
    }
  }

  private generateTransactionId(): string {
    return `fallback_txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Utility functions
export function createTransactionManager(metrics?: IMetricsCollector): ITransactionManager {
  return new TransactionManager(metrics);
}

export function isTransactionActive(transaction: IEnhancedTransaction): boolean {
  return transaction.isActive() && transaction.getState() === TransactionState.ACTIVE;
}

export function getTransactionAge(transaction: IEnhancedTransaction): number {
  return Date.now() - transaction.getContext().startTime.getTime();
}

export function isTransactionExpired(transaction: IEnhancedTransaction): boolean {
  const context = transaction.getContext();
  const age = getTransactionAge(transaction);
  const timeout = context.options.timeout || 30000;
  return age > timeout;
}