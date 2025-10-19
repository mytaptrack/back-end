# Performance Tuning Guide - Database Providers

## Overview

This guide provides comprehensive performance optimization strategies for both DynamoDB and MongoDB providers in the Data Access Abstraction Layer. It covers configuration optimization, query patterns, caching strategies, and monitoring techniques.

## Table of Contents

- [General Performance Principles](#general-performance-principles)
- [DynamoDB Performance Tuning](#dynamodb-performance-tuning)
- [MongoDB Performance Tuning](#mongodb-performance-tuning)
- [Caching Strategies](#caching-strategies)
- [Connection Optimization](#connection-optimization)
- [Query Optimization](#query-optimization)
- [Batch Operations](#batch-operations)
- [Monitoring and Metrics](#monitoring-and-metrics)
- [Performance Testing](#performance-testing)

## General Performance Principles

### 1. Understand Your Access Patterns

Before optimizing, analyze your data access patterns:

```typescript
import { AccessPatternAnalyzer } from '@mytaptrack/lib/v2/utils';

const analyzer = new AccessPatternAnalyzer();

// Analyze query patterns over time
const analysis = await analyzer.analyzePatterns(dal, {
  timeRange: '7d',
  includeSlowQueries: true,
  groupByOperation: true
});

console.log('Access Pattern Analysis:', analysis);
// Output:
// {
//   totalOperations: 150000,
//   readWriteRatio: 0.8, // 80% reads, 20% writes
//   hotKeys: ['USER#123', 'USER#456'],
//   slowQueries: [...],
//   peakHours: [9, 10, 11, 14, 15, 16]
// }
```

### 2. Choose the Right Data Model

```typescript
// Good: Denormalized for read performance
interface UserProfileStorage {
  pk: string;           // USER#123
  sk: string;           // PROFILE
  userId: string;
  name: string;
  email: string;
  studentCount: number; // Denormalized count
  lastLoginDate: Date;  // Frequently accessed
}

// Good: Separate entity for less frequently accessed data
interface UserSettingsStorage {
  pk: string;           // USER#123
  sk: string;           // SETTINGS
  userId: string;
  preferences: object;  // Complex nested data
  notifications: object;
}
```

### 3. Implement Proper Error Handling and Retries

```typescript
class PerformantDataService {
  private retryConfig = {
    maxRetries: 3,
    baseDelay: 100,
    maxDelay: 1000,
    backoffMultiplier: 2
  };
  
  async performOperationWithRetry<T>(
    operation: () => Promise<T>,
    operationType: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();
        const duration = Date.now() - startTime;
        
        // Log performance metrics
        this.logPerformanceMetric(operationType, duration, true);
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (!this.isRetryableError(error) || attempt === this.retryConfig.maxRetries) {
          this.logPerformanceMetric(operationType, Date.now() - startTime, false);
          throw error;
        }
        
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        );
        
        await this.delay(delay);
      }
    }
    
    throw lastError;
  }
}
```

## DynamoDB Performance Tuning

### 1. Table Design Optimization

```typescript
// Optimal table configuration
const dynamoConfig = {
  provider: 'dynamodb',
  dynamodb: {
    region: 'us-east-1',
    primaryTable: 'MyTapTrack-Primary',
    dataTable: 'MyTapTrack-Data',
    consistentRead: false, // Use eventually consistent reads when possible
    
    // Connection optimization
    httpOptions: {
      timeout: 30000,
      connectTimeout: 5000,
      maxRetries: 3
    },
    
    // Request optimization
    maxRetries: 3,
    retryDelayOptions: {
      customBackoff: (retryCount: number) => Math.pow(2, retryCount) * 100
    }
  }
};
```

### 2. Read Capacity Optimization

```typescript
class DynamoDBReadOptimizer {
  async optimizeReads(queryInput: QueryInput): Promise<any[]> {
    // Use eventually consistent reads for better performance
    const optimizedInput = {
      ...queryInput,
      consistentRead: false
    };
    
    // Use projection to reduce data transfer
    if (!queryInput.projection) {
      optimizedInput.projection = this.getRequiredFields(queryInput);
    }
    
    // Implement parallel queries for large datasets
    if (this.shouldUseParallelQuery(queryInput)) {
      return await this.executeParallelQuery(optimizedInput);
    }
    
    return await dal.query(optimizedInput);
  }
  
  private async executeParallelQuery(queryInput: QueryInput): Promise<any[]> {
    const segments = this.createQuerySegments(queryInput);
    
    const results = await Promise.all(
      segments.map(segment => dal.query(segment))
    );
    
    return results.flat();
  }
  
  private createQuerySegments(queryInput: QueryInput): QueryInput[] {
    // Split query into parallel segments based on sort key ranges
    const segments: QueryInput[] = [];
    const segmentCount = 4; // Optimal for most use cases
    
    for (let i = 0; i < segmentCount; i++) {
      segments.push({
        ...queryInput,
        segment: i,
        totalSegments: segmentCount
      });
    }
    
    return segments;
  }
}
```

### 3. Write Capacity Optimization

```typescript
class DynamoDBWriteOptimizer {
  async optimizeBatchWrites(items: any[]): Promise<void> {
    const batchSize = 25; // DynamoDB batch write limit
    const batches = this.createBatches(items, batchSize);
    
    // Process batches with controlled concurrency
    const concurrency = 5; // Prevent throttling
    
    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);
      
      await Promise.all(
        concurrentBatches.map(batch => this.processBatchWithRetry(batch))
      );
    }
  }
  
  private async processBatchWithRetry(batch: any[]): Promise<void> {
    let unprocessedItems = batch;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (unprocessedItems.length > 0 && retryCount < maxRetries) {
      try {
        const result = await dal.batchPut(unprocessedItems);
        unprocessedItems = result.unprocessedItems || [];
        
        if (unprocessedItems.length > 0) {
          // Exponential backoff for throttling
          await this.delay(Math.pow(2, retryCount) * 100);
          retryCount++;
        }
      } catch (error) {
        if (error.code === 'ProvisionedThroughputExceededException') {
          await this.delay(Math.pow(2, retryCount) * 1000);
          retryCount++;
        } else {
          throw error;
        }
      }
    }
    
    if (unprocessedItems.length > 0) {
      throw new Error(`Failed to process ${unprocessedItems.length} items after ${maxRetries} retries`);
    }
  }
}
```

### 4. Global Secondary Index (GSI) Optimization

```typescript
class GSIOptimizer {
  async optimizeGSIQueries(queryInput: QueryInput): Promise<any[]> {
    // Choose the most efficient GSI
    const optimalGSI = this.selectOptimalGSI(queryInput);
    
    if (optimalGSI) {
      return await dal.query({
        ...queryInput,
        indexName: optimalGSI.name,
        // Adjust key conditions for GSI
        keyCondition: this.adaptKeyConditionForGSI(queryInput.keyCondition, optimalGSI)
      });
    }
    
    return await dal.query(queryInput);
  }
  
  private selectOptimalGSI(queryInput: QueryInput): GSIInfo | null {
    const availableGSIs = [
      { name: 'UserIndex', pk: 'userId', sk: 'createdAt' },
      { name: 'EmailIndex', pk: 'email', sk: 'updatedAt' },
      { name: 'StatusIndex', pk: 'status', sk: 'priority' }
    ];
    
    // Select GSI based on query conditions
    for (const gsi of availableGSIs) {
      if (this.canUseGSI(queryInput, gsi)) {
        return gsi;
      }
    }
    
    return null;
  }
}
```

### 5. DynamoDB Streams Optimization

```typescript
class DynamoDBStreamsOptimizer {
  async optimizeStreamProcessing(streamRecord: any): Promise<void> {
    // Batch stream records for efficient processing
    const batchProcessor = new StreamBatchProcessor({
      batchSize: 100,
      batchTimeout: 5000, // 5 seconds
      maxConcurrency: 10
    });
    
    await batchProcessor.process(streamRecord, async (batch) => {
      // Process batch of stream records
      await this.processBatch(batch);
    });
  }
  
  private async processBatch(records: any[]): Promise<void> {
    // Group records by operation type for efficient processing
    const grouped = this.groupRecordsByOperation(records);
    
    await Promise.all([
      this.processInserts(grouped.INSERT || []),
      this.processUpdates(grouped.MODIFY || []),
      this.processDeletes(grouped.REMOVE || [])
    ]);
  }
}
```

## MongoDB Performance Tuning

### 1. Connection Pool Optimization

```typescript
const mongoConfig = {
  provider: 'mongodb',
  mongodb: {
    connectionString: 'mongodb://localhost:27017',
    database: 'mytaptrack',
    collections: {
      primary: 'primary_data',
      data: 'data_records'
    },
    options: {
      // Connection pool settings
      maxPoolSize: 20,        // Maximum connections
      minPoolSize: 5,         // Minimum connections
      maxIdleTimeMS: 30000,   // Close idle connections after 30s
      waitQueueTimeoutMS: 5000, // Wait 5s for available connection
      
      // Performance settings
      maxConnecting: 2,       // Maximum connecting at once
      heartbeatFrequencyMS: 10000, // Heartbeat every 10s
      serverSelectionTimeoutMS: 5000, // Server selection timeout
      
      // Read/Write settings
      readPreference: 'secondaryPreferred', // Use secondaries when possible
      readConcern: { level: 'local' },      // Local read concern for performance
      writeConcern: { w: 1, j: false },     // Fast writes without journaling
      
      // Compression
      compressors: ['zstd', 'zlib', 'snappy']
    }
  }
};
```

### 2. Index Optimization

```typescript
class MongoDBIndexOptimizer {
  async createOptimalIndexes(collection: string): Promise<void> {
    const indexes = [
      // Compound index for common query patterns
      { pk: 1, sk: 1 },
      { pk: 1, createdAt: -1 },
      { userId: 1, active: 1, createdAt: -1 },
      
      // Partial indexes for specific conditions
      { email: 1 },
      { 'data.status': 1 },
      
      // Text index for search functionality
      { name: 'text', 'data.description': 'text' },
      
      // TTL index for automatic cleanup
      { expiresAt: 1 }
    ];
    
    for (const index of indexes) {
      await this.createIndexIfNotExists(collection, index);
    }
  }
  
  async optimizeQueryWithHints(queryInput: QueryInput): Promise<any[]> {
    // Add index hints for complex queries
    const optimizedQuery = {
      ...queryInput,
      hint: this.selectOptimalIndex(queryInput)
    };
    
    return await dal.query(optimizedQuery);
  }
  
  private selectOptimalIndex(queryInput: QueryInput): any {
    // Analyze query conditions and select best index
    const conditions = queryInput.keyCondition || {};
    
    if (conditions.pk && conditions.sk) {
      return { pk: 1, sk: 1 };
    }
    
    if (conditions.userId && conditions.createdAt) {
      return { userId: 1, createdAt: -1 };
    }
    
    return null; // Let MongoDB choose
  }
}
```

### 3. Aggregation Pipeline Optimization

```typescript
class MongoDBAggregationOptimizer {
  async optimizeAggregation(pipeline: any[]): Promise<any[]> {
    // Optimize pipeline order for performance
    const optimizedPipeline = this.optimizePipelineOrder(pipeline);
    
    // Add performance hints
    const options = {
      allowDiskUse: true,     // Allow disk usage for large datasets
      maxTimeMS: 30000,       // 30 second timeout
      hint: this.getAggregationHint(pipeline)
    };
    
    return await dal.aggregate(optimizedPipeline, options);
  }
  
  private optimizePipelineOrder(pipeline: any[]): any[] {
    // Move $match stages to the beginning
    const matchStages = pipeline.filter(stage => stage.$match);
    const otherStages = pipeline.filter(stage => !stage.$match);
    
    // Move $limit stages early when possible
    const limitStages = otherStages.filter(stage => stage.$limit);
    const remainingStages = otherStages.filter(stage => !stage.$limit);
    
    return [
      ...matchStages,
      ...limitStages,
      ...remainingStages
    ];
  }
  
  async createOptimizedUserSummary(userId: string): Promise<any> {
    const pipeline = [
      // Match early to reduce dataset
      { $match: { userId: userId } },
      
      // Limit early if possible
      { $limit: 1000 },
      
      // Group efficiently
      {
        $group: {
          _id: '$userId',
          totalStudents: { $sum: 1 },
          activeStudents: {
            $sum: { $cond: [{ $eq: ['$active', true] }, 1, 0] }
          },
          lastActivity: { $max: '$updatedAt' }
        }
      },
      
      // Project only needed fields
      {
        $project: {
          userId: '$_id',
          totalStudents: 1,
          activeStudents: 1,
          lastActivity: 1,
          _id: 0
        }
      }
    ];
    
    const result = await this.optimizeAggregation(pipeline);
    return result[0];
  }
}
```

### 4. Write Optimization

```typescript
class MongoDBWriteOptimizer {
  async optimizeBulkWrites(operations: any[]): Promise<void> {
    const batchSize = 1000; // MongoDB bulk operation limit
    const batches = this.createBatches(operations, batchSize);
    
    // Process batches with controlled concurrency
    const concurrency = 3;
    
    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);
      
      await Promise.all(
        concurrentBatches.map(batch => this.processBulkBatch(batch))
      );
    }
  }
  
  private async processBulkBatch(operations: any[]): Promise<void> {
    const bulkOps = operations.map(op => {
      switch (op.type) {
        case 'insert':
          return { insertOne: { document: op.document } };
        case 'update':
          return { 
            updateOne: { 
              filter: op.filter, 
              update: op.update,
              upsert: op.upsert || false
            }
          };
        case 'delete':
          return { deleteOne: { filter: op.filter } };
        default:
          throw new Error(`Unknown operation type: ${op.type}`);
      }
    });
    
    const options = {
      ordered: false,  // Allow parallel execution
      writeConcern: { w: 1, j: false } // Fast writes
    };
    
    await dal.bulkWrite(bulkOps, options);
  }
  
  async optimizeUpserts(documents: any[]): Promise<void> {
    // Use upserts efficiently
    const upsertOperations = documents.map(doc => ({
      updateOne: {
        filter: { pk: doc.pk, sk: doc.sk },
        update: { $set: doc },
        upsert: true
      }
    }));
    
    await dal.bulkWrite(upsertOperations, {
      ordered: false,
      writeConcern: { w: 1 }
    });
  }
}
```

## Caching Strategies

### 1. Multi-Level Caching

```typescript
import { 
  CachedDataAccessLayer, 
  MemoryCache, 
  RedisCache, 
  CacheStrategy 
} from '@mytaptrack/lib/v2/optimization';

class MultiLevelCacheStrategy implements CacheStrategy {
  private l1Cache: MemoryCache;
  private l2Cache: RedisCache;
  
  constructor() {
    this.l1Cache = new MemoryCache({
      maxSize: 1000,
      ttl: 60000 // 1 minute
    });
    
    this.l2Cache = new RedisCache({
      connectionString: 'redis://localhost:6379',
      ttl: 300000, // 5 minutes
      keyPrefix: 'dal:'
    });
  }
  
  async get<T>(key: string): Promise<T | null> {
    // Try L1 cache first
    let value = await this.l1Cache.get<T>(key);
    if (value) {
      return value;
    }
    
    // Try L2 cache
    value = await this.l2Cache.get<T>(key);
    if (value) {
      // Populate L1 cache
      await this.l1Cache.set(key, value);
      return value;
    }
    
    return null;
  }
  
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Set in both caches
    await Promise.all([
      this.l1Cache.set(key, value, ttl),
      this.l2Cache.set(key, value, ttl)
    ]);
  }
  
  async delete(key: string): Promise<void> {
    // Delete from both caches
    await Promise.all([
      this.l1Cache.delete(key),
      this.l2Cache.delete(key)
    ]);
  }
}
```

### 2. Smart Cache Invalidation

```typescript
class SmartCacheInvalidator {
  private cacheStrategy: CacheStrategy;
  private invalidationRules: Map<string, string[]>;
  
  constructor(cacheStrategy: CacheStrategy) {
    this.cacheStrategy = cacheStrategy;
    this.setupInvalidationRules();
  }
  
  private setupInvalidationRules() {
    this.invalidationRules = new Map([
      // When user is updated, invalidate related caches
      ['USER#*#PROFILE', ['USER#*#*', 'STUDENT#*#USER#*']],
      
      // When student is updated, invalidate user summaries
      ['USER#*#STUDENT#*', ['USER#*#SUMMARY', 'USER#*#STATS']],
      
      // When settings change, invalidate user cache
      ['USER#*#SETTINGS', ['USER#*#PROFILE']]
    ]);
  }
  
  async invalidateRelatedCaches(key: string): Promise<void> {
    const patterns = this.getInvalidationPatterns(key);
    
    await Promise.all(
      patterns.map(pattern => this.invalidatePattern(pattern))
    );
  }
  
  private getInvalidationPatterns(key: string): string[] {
    const patterns: string[] = [];
    
    for (const [rulePattern, invalidationPatterns] of this.invalidationRules) {
      if (this.matchesPattern(key, rulePattern)) {
        patterns.push(...invalidationPatterns);
      }
    }
    
    return patterns;
  }
  
  private async invalidatePattern(pattern: string): Promise<void> {
    // Implementation depends on cache provider
    if (pattern.includes('*')) {
      await this.cacheStrategy.deletePattern(pattern);
    } else {
      await this.cacheStrategy.delete(pattern);
    }
  }
}
```

### 3. Cache-Aside Pattern with Write-Through

```typescript
class CacheAsideDataService {
  private dal: IDataAccessLayer;
  private cache: CacheStrategy;
  private invalidator: SmartCacheInvalidator;
  
  constructor(dal: IDataAccessLayer, cache: CacheStrategy) {
    this.dal = dal;
    this.cache = cache;
    this.invalidator = new SmartCacheInvalidator(cache);
  }
  
  async get<T>(key: DatabaseKey): Promise<T | null> {
    const cacheKey = this.generateCacheKey(key);
    
    // Try cache first
    let value = await this.cache.get<T>(cacheKey);
    if (value) {
      return value;
    }
    
    // Cache miss - get from database
    value = await this.dal.get<T>(key);
    if (value) {
      // Cache the result
      await this.cache.set(cacheKey, value, this.getTTL(key));
    }
    
    return value;
  }
  
  async put<T>(data: T): Promise<void> {
    // Write to database first
    await this.dal.put(data);
    
    // Update cache (write-through)
    const cacheKey = this.generateCacheKey(this.extractKey(data));
    await this.cache.set(cacheKey, data, this.getTTL(this.extractKey(data)));
    
    // Invalidate related caches
    await this.invalidator.invalidateRelatedCaches(cacheKey);
  }
  
  async update<T>(key: DatabaseKey, updates: any): Promise<void> {
    // Update database first
    await this.dal.update(key, updates);
    
    // Invalidate cache (let next read populate it)
    const cacheKey = this.generateCacheKey(key);
    await this.cache.delete(cacheKey);
    
    // Invalidate related caches
    await this.invalidator.invalidateRelatedCaches(cacheKey);
  }
  
  private getTTL(key: DatabaseKey): number {
    // Different TTL based on data type
    if (key.sort === 'PROFILE') {
      return 300000; // 5 minutes for user profiles
    }
    if (key.sort?.startsWith('STUDENT#')) {
      return 600000; // 10 minutes for student data
    }
    return 180000; // 3 minutes default
  }
}
```

## Connection Optimization

### 1. Connection Pool Management

```typescript
class ConnectionPoolManager {
  private pools: Map<string, ConnectionPool> = new Map();
  private healthChecker: ConnectionHealthChecker;
  
  constructor() {
    this.healthChecker = new ConnectionHealthChecker();
    this.startHealthChecking();
  }
  
  getOptimalPool(provider: string): ConnectionPool {
    let pool = this.pools.get(provider);
    
    if (!pool) {
      pool = this.createOptimalPool(provider);
      this.pools.set(provider, pool);
    }
    
    return pool;
  }
  
  private createOptimalPool(provider: string): ConnectionPool {
    const config = this.getOptimalPoolConfig(provider);
    
    switch (provider) {
      case 'dynamodb':
        return new DynamoDBConnectionPool(config);
      case 'mongodb':
        return new MongoDBConnectionPool(config);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
  
  private getOptimalPoolConfig(provider: string): PoolConfig {
    // Calculate optimal pool size based on system resources
    const cpuCount = require('os').cpus().length;
    const memoryGB = require('os').totalmem() / (1024 * 1024 * 1024);
    
    return {
      minSize: Math.max(2, Math.floor(cpuCount / 2)),
      maxSize: Math.min(20, cpuCount * 2),
      idleTimeout: 30000,
      acquireTimeout: 5000,
      maxRetries: 3
    };
  }
  
  private startHealthChecking(): void {
    setInterval(async () => {
      for (const [provider, pool] of this.pools) {
        const health = await this.healthChecker.checkPool(pool);
        
        if (!health.healthy) {
          console.warn(`Pool ${provider} is unhealthy:`, health.issues);
          await this.recreatePool(provider);
        }
      }
    }, 30000); // Check every 30 seconds
  }
}
```

### 2. Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  
  constructor(
    private failureThreshold = 5,
    private recoveryTimeout = 60000, // 1 minute
    private successThreshold = 3
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
      }
    }
  }
  
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

## Query Optimization

### 1. Query Plan Analysis

```typescript
class QueryPlanAnalyzer {
  async analyzeQuery(queryInput: QueryInput): Promise<QueryPlan> {
    const plan = await this.generateQueryPlan(queryInput);
    
    return {
      estimatedCost: plan.cost,
      indexUsage: plan.indexes,
      recommendations: this.generateRecommendations(plan),
      optimizedQuery: this.optimizeQuery(queryInput, plan)
    };
  }
  
  private generateRecommendations(plan: QueryPlan): string[] {
    const recommendations: string[] = [];
    
    if (plan.cost > 100) {
      recommendations.push('Consider adding an index for this query pattern');
    }
    
    if (plan.scanCount > 1000) {
      recommendations.push('Query scans too many items - add more specific conditions');
    }
    
    if (!plan.indexes.length) {
      recommendations.push('Query is not using any indexes - performance will be poor');
    }
    
    return recommendations;
  }
  
  async benchmarkQuery(queryInput: QueryInput, iterations: number = 10): Promise<QueryBenchmark> {
    const results: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      await dal.query(queryInput);
      results.push(Date.now() - startTime);
    }
    
    return {
      averageTime: results.reduce((a, b) => a + b) / results.length,
      minTime: Math.min(...results),
      maxTime: Math.max(...results),
      standardDeviation: this.calculateStandardDeviation(results)
    };
  }
}
```

### 2. Adaptive Query Optimization

```typescript
class AdaptiveQueryOptimizer {
  private queryStats: Map<string, QueryStats> = new Map();
  
  async executeOptimizedQuery<T>(queryInput: QueryInput): Promise<T[]> {
    const queryHash = this.hashQuery(queryInput);
    const stats = this.queryStats.get(queryHash);
    
    // Adapt query based on historical performance
    const optimizedInput = this.adaptQuery(queryInput, stats);
    
    const startTime = Date.now();
    const result = await dal.query<T>(optimizedInput);
    const duration = Date.now() - startTime;
    
    // Update statistics
    this.updateQueryStats(queryHash, duration, result.length);
    
    return result;
  }
  
  private adaptQuery(queryInput: QueryInput, stats?: QueryStats): QueryInput {
    if (!stats) {
      return queryInput;
    }
    
    const adapted = { ...queryInput };
    
    // If query is consistently slow, add limit
    if (stats.averageDuration > 1000 && !adapted.limit) {
      adapted.limit = 100;
    }
    
    // If query returns too many results, suggest pagination
    if (stats.averageResultCount > 1000) {
      adapted.limit = Math.min(adapted.limit || 1000, 500);
    }
    
    // Use eventually consistent reads for better performance
    if (stats.averageDuration > 500) {
      adapted.consistentRead = false;
    }
    
    return adapted;
  }
  
  private updateQueryStats(queryHash: string, duration: number, resultCount: number): void {
    const existing = this.queryStats.get(queryHash) || {
      executionCount: 0,
      totalDuration: 0,
      totalResultCount: 0,
      averageDuration: 0,
      averageResultCount: 0
    };
    
    existing.executionCount++;
    existing.totalDuration += duration;
    existing.totalResultCount += resultCount;
    existing.averageDuration = existing.totalDuration / existing.executionCount;
    existing.averageResultCount = existing.totalResultCount / existing.executionCount;
    
    this.queryStats.set(queryHash, existing);
  }
}
```

## Batch Operations

### 1. Intelligent Batching

```typescript
class IntelligentBatcher {
  private batchConfigs: Map<string, BatchConfig> = new Map();
  
  constructor() {
    this.initializeBatchConfigs();
  }
  
  private initializeBatchConfigs(): void {
    this.batchConfigs.set('dynamodb', {
      maxBatchSize: 25,
      optimalBatchSize: 20,
      maxConcurrency: 5,
      retryDelay: 100
    });
    
    this.batchConfigs.set('mongodb', {
      maxBatchSize: 1000,
      optimalBatchSize: 500,
      maxConcurrency: 3,
      retryDelay: 50
    });
  }
  
  async executeBatchOperation<T>(
    items: T[],
    operation: (batch: T[]) => Promise<void>,
    provider: string
  ): Promise<void> {
    const config = this.batchConfigs.get(provider);
    if (!config) {
      throw new Error(`No batch configuration for provider: ${provider}`);
    }
    
    const batches = this.createOptimalBatches(items, config);
    
    // Execute batches with controlled concurrency
    for (let i = 0; i < batches.length; i += config.maxConcurrency) {
      const concurrentBatches = batches.slice(i, i + config.maxConcurrency);
      
      await Promise.all(
        concurrentBatches.map(batch => 
          this.executeBatchWithRetry(batch, operation, config)
        )
      );
    }
  }
  
  private createOptimalBatches<T>(items: T[], config: BatchConfig): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += config.optimalBatchSize) {
      batches.push(items.slice(i, i + config.optimalBatchSize));
    }
    
    return batches;
  }
  
  private async executeBatchWithRetry<T>(
    batch: T[],
    operation: (batch: T[]) => Promise<void>,
    config: BatchConfig
  ): Promise<void> {
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        await operation(batch);
        return;
      } catch (error) {
        if (this.isRetryableError(error) && retryCount < maxRetries - 1) {
          await this.delay(config.retryDelay * Math.pow(2, retryCount));
          retryCount++;
        } else {
          throw error;
        }
      }
    }
  }
}
```

### 2. Adaptive Batch Sizing

```typescript
class AdaptiveBatchSizer {
  private performanceHistory: Map<string, PerformanceMetric[]> = new Map();
  private currentBatchSizes: Map<string, number> = new Map();
  
  async executeBatchWithAdaptiveSize<T>(
    items: T[],
    operation: (batch: T[]) => Promise<void>,
    provider: string
  ): Promise<void> {
    let batchSize = this.getCurrentBatchSize(provider);
    const batches = this.createBatches(items, batchSize);
    
    for (const batch of batches) {
      const startTime = Date.now();
      
      try {
        await operation(batch);
        const duration = Date.now() - startTime;
        
        // Record successful performance
        this.recordPerformance(provider, batchSize, duration, true);
        
        // Adjust batch size based on performance
        batchSize = this.adjustBatchSize(provider, duration);
        
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Record failed performance
        this.recordPerformance(provider, batchSize, duration, false);
        
        // Reduce batch size on failure
        batchSize = Math.max(1, Math.floor(batchSize * 0.5));
        this.currentBatchSizes.set(provider, batchSize);
        
        throw error;
      }
    }
  }
  
  private adjustBatchSize(provider: string, duration: number): number {
    const current = this.getCurrentBatchSize(provider);
    const targetDuration = 1000; // 1 second target
    
    if (duration < targetDuration * 0.5) {
      // Performance is good, try larger batches
      return Math.min(current * 1.2, this.getMaxBatchSize(provider));
    } else if (duration > targetDuration * 1.5) {
      // Performance is poor, use smaller batches
      return Math.max(current * 0.8, 1);
    }
    
    return current; // Keep current size
  }
  
  private recordPerformance(
    provider: string,
    batchSize: number,
    duration: number,
    success: boolean
  ): void {
    const history = this.performanceHistory.get(provider) || [];
    
    history.push({
      batchSize,
      duration,
      success,
      timestamp: Date.now()
    });
    
    // Keep only recent history (last 100 operations)
    if (history.length > 100) {
      history.shift();
    }
    
    this.performanceHistory.set(provider, history);
  }
}
```

## Monitoring and Metrics

### 1. Comprehensive Performance Monitoring

```typescript
class PerformanceMonitor {
  private metricsCollector: MetricsCollector;
  private alertManager: AlertManager;
  
  constructor() {
    this.metricsCollector = new MetricsCollector();
    this.alertManager = new AlertManager();
    this.startMonitoring();
  }
  
  private startMonitoring(): void {
    // Monitor every 30 seconds
    setInterval(async () => {
      await this.collectAndAnalyzeMetrics();
    }, 30000);
  }
  
  private async collectAndAnalyzeMetrics(): Promise<void> {
    const metrics = await this.metricsCollector.collectAllMetrics();
    
    // Analyze performance trends
    const analysis = this.analyzePerformanceTrends(metrics);
    
    // Check for performance issues
    await this.checkPerformanceThresholds(analysis);
    
    // Generate recommendations
    const recommendations = this.generatePerformanceRecommendations(analysis);
    
    if (recommendations.length > 0) {
      console.log('Performance Recommendations:', recommendations);
    }
  }
  
  private analyzePerformanceTrends(metrics: PerformanceMetrics): PerformanceAnalysis {
    return {
      averageResponseTime: this.calculateAverageResponseTime(metrics),
      throughput: this.calculateThroughput(metrics),
      errorRate: this.calculateErrorRate(metrics),
      resourceUtilization: this.calculateResourceUtilization(metrics),
      trends: this.identifyTrends(metrics)
    };
  }
  
  private async checkPerformanceThresholds(analysis: PerformanceAnalysis): Promise<void> {
    // Response time threshold
    if (analysis.averageResponseTime > 1000) {
      await this.alertManager.sendAlert('HIGH_RESPONSE_TIME', {
        currentValue: analysis.averageResponseTime,
        threshold: 1000
      });
    }
    
    // Error rate threshold
    if (analysis.errorRate > 0.05) {
      await this.alertManager.sendAlert('HIGH_ERROR_RATE', {
        currentValue: analysis.errorRate,
        threshold: 0.05
      });
    }
    
    // Throughput threshold
    if (analysis.throughput < 100) {
      await this.alertManager.sendAlert('LOW_THROUGHPUT', {
        currentValue: analysis.throughput,
        threshold: 100
      });
    }
  }
}
```

### 2. Real-time Performance Dashboard

```typescript
class PerformanceDashboard {
  private metrics: Map<string, MetricValue[]> = new Map();
  private subscribers: Set<(data: DashboardData) => void> = new Set();
  
  constructor() {
    this.startDataCollection();
  }
  
  subscribe(callback: (data: DashboardData) => void): () => void {
    this.subscribers.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }
  
  private startDataCollection(): void {
    setInterval(() => {
      const dashboardData = this.generateDashboardData();
      
      // Notify all subscribers
      this.subscribers.forEach(callback => {
        try {
          callback(dashboardData);
        } catch (error) {
          console.error('Dashboard callback error:', error);
        }
      });
    }, 1000); // Update every second
  }
  
  private generateDashboardData(): DashboardData {
    return {
      timestamp: Date.now(),
      responseTime: this.getRecentMetric('responseTime'),
      throughput: this.getRecentMetric('throughput'),
      errorRate: this.getRecentMetric('errorRate'),
      connectionCount: this.getRecentMetric('connectionCount'),
      cacheHitRate: this.getRecentMetric('cacheHitRate'),
      topSlowQueries: this.getTopSlowQueries(),
      systemHealth: this.getSystemHealth()
    };
  }
  
  private getTopSlowQueries(): SlowQuery[] {
    // Return top 10 slowest queries from recent history
    return this.slowQueryTracker.getTopSlowQueries(10);
  }
  
  private getSystemHealth(): SystemHealth {
    return {
      cpu: this.getCPUUsage(),
      memory: this.getMemoryUsage(),
      connections: this.getConnectionHealth(),
      database: this.getDatabaseHealth()
    };
  }
}
```

## Performance Testing

### 1. Load Testing Framework

```typescript
class LoadTestFramework {
  async runLoadTest(config: LoadTestConfig): Promise<LoadTestResults> {
    const results: LoadTestResults = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      maxResponseTime: 0,
      minResponseTime: Infinity,
      throughput: 0,
      errors: []
    };
    
    const startTime = Date.now();
    const workers = this.createWorkers(config);
    
    // Run load test
    const workerResults = await Promise.all(
      workers.map(worker => worker.run())
    );
    
    // Aggregate results
    this.aggregateResults(results, workerResults);
    
    const duration = Date.now() - startTime;
    results.throughput = results.totalRequests / (duration / 1000);
    
    return results;
  }
  
  private createWorkers(config: LoadTestConfig): LoadTestWorker[] {
    const workers: LoadTestWorker[] = [];
    
    for (let i = 0; i < config.concurrency; i++) {
      workers.push(new LoadTestWorker({
        workerId: i,
        requestsPerWorker: Math.floor(config.totalRequests / config.concurrency),
        testScenario: config.scenario,
        dal: config.dal
      }));
    }
    
    return workers;
  }
}

class LoadTestWorker {
  constructor(private config: WorkerConfig) {}
  
  async run(): Promise<WorkerResults> {
    const results: WorkerResults = {
      requests: 0,
      successes: 0,
      failures: 0,
      responseTimes: [],
      errors: []
    };
    
    for (let i = 0; i < this.config.requestsPerWorker; i++) {
      const startTime = Date.now();
      
      try {
        await this.executeTestScenario();
        results.successes++;
        results.responseTimes.push(Date.now() - startTime);
      } catch (error) {
        results.failures++;
        results.errors.push(error.message);
      }
      
      results.requests++;
    }
    
    return results;
  }
  
  private async executeTestScenario(): Promise<void> {
    switch (this.config.testScenario) {
      case 'read-heavy':
        await this.executeReadHeavyScenario();
        break;
      case 'write-heavy':
        await this.executeWriteHeavyScenario();
        break;
      case 'mixed':
        await this.executeMixedScenario();
        break;
      default:
        throw new Error(`Unknown test scenario: ${this.config.testScenario}`);
    }
  }
}
```

### 2. Performance Regression Testing

```typescript
class PerformanceRegressionTester {
  private baselineMetrics: Map<string, PerformanceBaseline> = new Map();
  
  async establishBaseline(testSuite: string): Promise<void> {
    console.log(`Establishing performance baseline for ${testSuite}...`);
    
    const metrics = await this.runPerformanceTests(testSuite);
    this.baselineMetrics.set(testSuite, {
      averageResponseTime: metrics.averageResponseTime,
      throughput: metrics.throughput,
      errorRate: metrics.errorRate,
      timestamp: Date.now()
    });
    
    console.log(`Baseline established for ${testSuite}:`, metrics);
  }
  
  async checkForRegressions(testSuite: string): Promise<RegressionReport> {
    const baseline = this.baselineMetrics.get(testSuite);
    if (!baseline) {
      throw new Error(`No baseline found for test suite: ${testSuite}`);
    }
    
    const currentMetrics = await this.runPerformanceTests(testSuite);
    
    const report: RegressionReport = {
      testSuite,
      baseline,
      current: currentMetrics,
      regressions: [],
      improvements: []
    };
    
    // Check for response time regression
    const responseTimeChange = (currentMetrics.averageResponseTime - baseline.averageResponseTime) / baseline.averageResponseTime;
    if (responseTimeChange > 0.1) { // 10% regression threshold
      report.regressions.push({
        metric: 'averageResponseTime',
        baseline: baseline.averageResponseTime,
        current: currentMetrics.averageResponseTime,
        changePercent: responseTimeChange * 100
      });
    }
    
    // Check for throughput regression
    const throughputChange = (currentMetrics.throughput - baseline.throughput) / baseline.throughput;
    if (throughputChange < -0.1) { // 10% regression threshold
      report.regressions.push({
        metric: 'throughput',
        baseline: baseline.throughput,
        current: currentMetrics.throughput,
        changePercent: throughputChange * 100
      });
    }
    
    return report;
  }
}
```

This comprehensive performance tuning guide provides the strategies and tools needed to optimize database performance across both DynamoDB and MongoDB providers while maintaining the abstraction layer's benefits.