/**
 * Batch operation optimization for bulk data operations
 * Provides efficient batching strategies for different database providers
 */

import { 
  DatabaseKey, 
  UnifiedUpdateInput,
  PutOptions,
  UpdateOptions,
  DeleteOptions,
  DatabaseProviderType,
  IDataAccessLayer
} from '../types/database-abstraction';

// Batch operation configuration
export interface BatchConfig {
  maxBatchSize: number;
  maxConcurrentBatches: number;
  retryAttempts: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  timeoutMs: number;
}

// Batch operation types
export type BatchOperation = 
  | { type: 'put'; data: any; options?: PutOptions }
  | { type: 'update'; input: UnifiedUpdateInput; options?: UpdateOptions }
  | { type: 'delete'; key: DatabaseKey; options?: DeleteOptions };

// Batch execution result
export interface BatchResult {
  successful: number;
  failed: number;
  errors: BatchError[];
  executionTime: number;
  throughput: number; // Operations per second
}

// Batch error information
export interface BatchError {
  operation: BatchOperation;
  error: Error;
  retryCount: number;
}

// Batch execution statistics
export interface BatchStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageLatency: number;
  throughput: number;
  errorRate: number;
}

/**
 * Batch optimizer for database operations
 */
export class BatchOptimizer {
  private provider: IDataAccessLayer;
  private config: BatchConfig;
  private stats: BatchStats;
  private providerType: DatabaseProviderType;

  constructor(provider: IDataAccessLayer, config?: Partial<BatchConfig>) {
    this.provider = provider;
    this.providerType = provider.getProviderType();
    
    // Set default config based on provider type
    this.config = {
      ...this.getDefaultConfig(),
      ...config
    };

    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageLatency: 0,
      throughput: 0,
      errorRate: 0
    };
  }

  /**
   * Execute batch operations with optimization
   */
  async executeBatch(operations: BatchOperation[]): Promise<BatchResult> {
    const startTime = Date.now();
    const result: BatchResult = {
      successful: 0,
      failed: 0,
      errors: [],
      executionTime: 0,
      throughput: 0
    };

    if (operations.length === 0) {
      return result;
    }

    // Group operations by type for better batching
    const groupedOps = this.groupOperationsByType(operations);
    
    // Execute each group with provider-specific optimization
    const promises: Promise<void>[] = [];
    
    for (const [opType, ops] of groupedOps.entries()) {
      if (opType === 'put') {
        promises.push(this.executeBatchPuts(ops as Array<{ type: 'put'; data: any; options?: PutOptions }>, result));
      } else if (opType === 'update') {
        promises.push(this.executeBatchUpdates(ops as Array<{ type: 'update'; input: UnifiedUpdateInput; options?: UpdateOptions }>, result));
      } else if (opType === 'delete') {
        promises.push(this.executeBatchDeletes(ops as Array<{ type: 'delete'; key: DatabaseKey; options?: DeleteOptions }>, result));
      }
    }

    await Promise.all(promises);

    // Calculate final metrics
    const endTime = Date.now();
    result.executionTime = endTime - startTime;
    result.throughput = operations.length / (result.executionTime / 1000);

    // Update statistics
    this.updateStats(operations.length, result);

    return result;
  }

  /**
   * Execute batch put operations
   */
  async executeBatchPuts(operations: Array<{ type: 'put'; data: any; options?: PutOptions }>, result: BatchResult): Promise<void> {
    const batches = this.createBatches(operations, this.config.maxBatchSize);
    
    await this.executeBatchesWithConcurrency(batches, async (batch) => {
      if (this.providerType === 'dynamodb') {
        await this.executeDynamoDBBatchPuts(batch, result);
      } else if (this.providerType === 'mongodb') {
        await this.executeMongoDBBatchPuts(batch, result);
      } else {
        // Fallback to individual operations
        await this.executeIndividualPuts(batch, result);
      }
    });
  }

  /**
   * Execute batch update operations
   */
  async executeBatchUpdates(operations: Array<{ type: 'update'; input: UnifiedUpdateInput; options?: UpdateOptions }>, result: BatchResult): Promise<void> {
    const batches = this.createBatches(operations, this.config.maxBatchSize);
    
    await this.executeBatchesWithConcurrency(batches, async (batch) => {
      if (this.providerType === 'mongodb') {
        await this.executeMongoDBBatchUpdates(batch, result);
      } else {
        // DynamoDB and fallback - execute individually
        await this.executeIndividualUpdates(batch, result);
      }
    });
  }

  /**
   * Execute batch delete operations
   */
  async executeBatchDeletes(operations: Array<{ type: 'delete'; key: DatabaseKey; options?: DeleteOptions }>, result: BatchResult): Promise<void> {
    const batches = this.createBatches(operations, this.config.maxBatchSize);
    
    await this.executeBatchesWithConcurrency(batches, async (batch) => {
      if (this.providerType === 'dynamodb') {
        await this.executeDynamoDBBatchDeletes(batch, result);
      } else if (this.providerType === 'mongodb') {
        await this.executeMongoDBBatchDeletes(batch, result);
      } else {
        // Fallback to individual operations
        await this.executeIndividualDeletes(batch, result);
      }
    });
  }

  /**
   * Execute optimized batch gets
   */
  async executeBatchGet<T>(keys: DatabaseKey[]): Promise<T[]> {
    if (keys.length === 0) {
      return [];
    }

    const batches = this.createBatches(keys, this.config.maxBatchSize);
    const results: T[] = [];
    
    await this.executeBatchesWithConcurrency(batches, async (batch) => {
      const batchResults = await this.provider.batchGet<T>(batch);
      results.push(...batchResults);
    });

    return results;
  }

  /**
   * Get batch execution statistics
   */
  getStats(): BatchStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageLatency: 0,
      throughput: 0,
      errorRate: 0
    };
  }

  // Private methods

  private getDefaultConfig(): BatchConfig {
    if (this.providerType === 'dynamodb') {
      return {
        maxBatchSize: 25, // DynamoDB batch limit
        maxConcurrentBatches: 10,
        retryAttempts: 3,
        retryDelayMs: 100,
        backoffMultiplier: 2,
        timeoutMs: 30000
      };
    } else if (this.providerType === 'mongodb') {
      return {
        maxBatchSize: 1000, // MongoDB can handle larger batches
        maxConcurrentBatches: 5,
        retryAttempts: 3,
        retryDelayMs: 100,
        backoffMultiplier: 2,
        timeoutMs: 30000
      };
    } else {
      return {
        maxBatchSize: 100,
        maxConcurrentBatches: 5,
        retryAttempts: 3,
        retryDelayMs: 100,
        backoffMultiplier: 2,
        timeoutMs: 30000
      };
    }
  }

  private groupOperationsByType(operations: BatchOperation[]): Map<string, BatchOperation[]> {
    const groups = new Map<string, BatchOperation[]>();
    
    for (const op of operations) {
      const existing = groups.get(op.type) || [];
      existing.push(op);
      groups.set(op.type, existing);
    }
    
    return groups;
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  private async executeBatchesWithConcurrency<T>(
    batches: T[][],
    executor: (batch: T[]) => Promise<void>
  ): Promise<void> {
    const semaphore = new Semaphore(this.config.maxConcurrentBatches);
    
    const promises = batches.map(async (batch) => {
      await semaphore.acquire();
      try {
        await this.executeWithRetry(() => executor(batch));
      } finally {
        semaphore.release();
      }
    });
    
    await Promise.all(promises);
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await Promise.race([
          operation(),
          this.createTimeoutPromise<T>()
        ]);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelayMs * Math.pow(this.config.backoffMultiplier, attempt);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError!;
  }

  private createTimeoutPromise<T>(): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Provider-specific batch implementations

  private async executeDynamoDBBatchPuts(
    operations: Array<{ type: 'put'; data: any; options?: PutOptions }>,
    result: BatchResult
  ): Promise<void> {
    try {
      // DynamoDB batch write implementation would go here
      // For now, simulate batch operation
      for (const op of operations) {
        try {
          await this.provider.put(op.data, op.options);
          result.successful++;
        } catch (error) {
          result.failed++;
          result.errors.push({
            operation: op,
            error: error as Error,
            retryCount: 0
          });
        }
      }
    } catch (error) {
      // Handle batch-level errors
      result.failed += operations.length;
      for (const op of operations) {
        result.errors.push({
          operation: op,
          error: error as Error,
          retryCount: 0
        });
      }
    }
  }

  private async executeMongoDBBatchPuts(
    operations: Array<{ type: 'put'; data: any; options?: PutOptions }>,
    result: BatchResult
  ): Promise<void> {
    try {
      // MongoDB bulk insert implementation would go here
      const documents = operations.map(op => op.data);
      
      // Simulate MongoDB bulk insert
      for (const op of operations) {
        try {
          await this.provider.put(op.data, op.options);
          result.successful++;
        } catch (error) {
          result.failed++;
          result.errors.push({
            operation: op,
            error: error as Error,
            retryCount: 0
          });
        }
      }
    } catch (error) {
      result.failed += operations.length;
      for (const op of operations) {
        result.errors.push({
          operation: op,
          error: error as Error,
          retryCount: 0
        });
      }
    }
  }

  private async executeIndividualPuts(
    operations: Array<{ type: 'put'; data: any; options?: PutOptions }>,
    result: BatchResult
  ): Promise<void> {
    for (const op of operations) {
      try {
        await this.provider.put(op.data, op.options);
        result.successful++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          operation: op,
          error: error as Error,
          retryCount: 0
        });
      }
    }
  }

  private async executeDynamoDBBatchDeletes(
    operations: Array<{ type: 'delete'; key: DatabaseKey; options?: DeleteOptions }>,
    result: BatchResult
  ): Promise<void> {
    // Similar to puts but for deletes
    for (const op of operations) {
      try {
        await this.provider.delete(op.key, op.options);
        result.successful++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          operation: op,
          error: error as Error,
          retryCount: 0
        });
      }
    }
  }

  private async executeMongoDBBatchDeletes(
    operations: Array<{ type: 'delete'; key: DatabaseKey; options?: DeleteOptions }>,
    result: BatchResult
  ): Promise<void> {
    // MongoDB bulk delete implementation
    for (const op of operations) {
      try {
        await this.provider.delete(op.key, op.options);
        result.successful++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          operation: op,
          error: error as Error,
          retryCount: 0
        });
      }
    }
  }

  private async executeIndividualDeletes(
    operations: Array<{ type: 'delete'; key: DatabaseKey; options?: DeleteOptions }>,
    result: BatchResult
  ): Promise<void> {
    for (const op of operations) {
      try {
        await this.provider.delete(op.key, op.options);
        result.successful++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          operation: op,
          error: error as Error,
          retryCount: 0
        });
      }
    }
  }

  private async executeMongoDBBatchUpdates(
    operations: Array<{ type: 'update'; input: UnifiedUpdateInput; options?: UpdateOptions }>,
    result: BatchResult
  ): Promise<void> {
    // MongoDB bulk update implementation
    for (const op of operations) {
      try {
        await this.provider.update(op.input, op.options);
        result.successful++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          operation: op,
          error: error as Error,
          retryCount: 0
        });
      }
    }
  }

  private async executeIndividualUpdates(
    operations: Array<{ type: 'update'; input: UnifiedUpdateInput; options?: UpdateOptions }>,
    result: BatchResult
  ): Promise<void> {
    for (const op of operations) {
      try {
        await this.provider.update(op.input, op.options);
        result.successful++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          operation: op,
          error: error as Error,
          retryCount: 0
        });
      }
    }
  }

  private updateStats(totalOps: number, result: BatchResult): void {
    this.stats.totalOperations += totalOps;
    this.stats.successfulOperations += result.successful;
    this.stats.failedOperations += result.failed;
    
    // Update average latency
    const newLatency = result.executionTime / totalOps;
    this.stats.averageLatency = (this.stats.averageLatency + newLatency) / 2;
    
    // Update throughput
    this.stats.throughput = this.stats.successfulOperations / (this.stats.averageLatency / 1000);
    
    // Update error rate
    this.stats.errorRate = this.stats.failedOperations / this.stats.totalOperations;
  }
}

/**
 * Simple semaphore implementation for concurrency control
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.waiting.push(resolve);
      }
    });
  }

  release(): void {
    this.permits++;
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      this.permits--;
      next();
    }
  }
}