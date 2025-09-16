/**
 * Base database provider interface with connection management
 * Defines the contract that all database providers must implement
 */

import { 
  DatabaseProviderType, 
  IDatabaseProvider, 
  IDataAccessLayer, 
  ITransaction,
  HealthStatus,
  DatabaseKey,
  UnifiedQueryInput,
  UnifiedScanInput,
  UnifiedUpdateInput,
  QueryOptions,
  PutOptions,
  UpdateOptions,
  DeleteOptions,
  BatchOptions,
  TransactionOperation
} from './database-abstraction';
import { DatabaseError, ConnectionError, ValidationError, TransactionError } from './database-errors';
import { MetricsSnapshot, ConnectionMetrics, QueryMetrics, PerformanceMetrics, ConnectionEvent } from './metrics';

// Re-export commonly used types
export { IDatabaseProvider } from './database-abstraction';

// Connection state enum
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

// Connection events interface
export interface IConnectionEventEmitter {
  on(event: 'connected', listener: () => void): void;
  on(event: 'disconnected', listener: () => void): void;
  on(event: 'error', listener: (error: DatabaseError) => void): void;
  on(event: 'reconnecting', listener: () => void): void;
  emit(event: string, ...args: any[]): void;
}

// Base connection manager interface
export interface IConnectionManager extends IConnectionEventEmitter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getConnectionState(): ConnectionState;
  healthCheck(): Promise<HealthStatus>;
  reconnect(): Promise<void>;
}

// Abstract base database provider
export abstract class BaseDatabaseProvider implements IDataAccessLayer {
  protected connectionManager: IConnectionManager;
  protected providerType: DatabaseProviderType;
  protected config: any;

  constructor(providerType: DatabaseProviderType, config: any) {
    this.providerType = providerType;
    this.config = config;
  }

  // Connection management methods (delegated to connection manager)
  async connect(): Promise<void> {
    return this.connectionManager.connect();
  }

  async disconnect(): Promise<void> {
    return this.connectionManager.disconnect();
  }

  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  getProviderType(): DatabaseProviderType {
    return this.providerType;
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.connectionManager.healthCheck();
  }

  // Abstract methods that must be implemented by concrete providers
  abstract get<TResult = any>(key: DatabaseKey, options?: QueryOptions): Promise<TResult | null>;
  abstract put<TData = any>(data: TData, options?: PutOptions): Promise<void>;
  abstract update(input: UnifiedUpdateInput, options?: UpdateOptions): Promise<any>;
  abstract delete(key: DatabaseKey, options?: DeleteOptions): Promise<void>;
  abstract query<TResult = any>(input: UnifiedQueryInput): Promise<TResult[]>;
  abstract scan<TResult = any>(input: UnifiedScanInput): Promise<{ items: TResult[], token?: any }>;
  abstract batchGet<TResult = any>(keys: DatabaseKey[], options?: BatchOptions): Promise<TResult[]>;
  abstract beginTransaction(): Promise<ITransaction>;
  abstract executeTransaction(operations: TransactionOperation[]): Promise<void>;
  abstract executeNative(operation: any): Promise<any>;

  // Utility methods for subclasses
  protected validateConnection(): void {
    if (!this.isConnected()) {
      throw new ConnectionError('Database not connected', undefined, this.providerType);
    }
  }

  protected validateKey(key: DatabaseKey): void {
    if (!key || !key.primary) {
      throw new ValidationError('Invalid database key: primary key is required', undefined, this.providerType);
    }
  }

  protected validateData(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Invalid data: must be a non-null object', undefined, this.providerType);
    }
  }
}

// Abstract base transaction class
export abstract class BaseTransaction implements ITransaction {
  protected provider: BaseDatabaseProvider;
  protected active: boolean = true;
  protected operations: TransactionOperation[] = [];

  constructor(provider: BaseDatabaseProvider) {
    this.provider = provider;
  }

  isActive(): boolean {
    return this.active;
  }

  protected validateActive(): void {
    if (!this.active) {
      throw new TransactionError('Transaction is not active', undefined, this.provider.getProviderType());
    }
  }

  // Abstract methods that must be implemented by concrete transactions
  abstract get<T>(key: DatabaseKey): Promise<T | null>;
  abstract put<T>(data: T, options?: PutOptions): Promise<void>;
  abstract update(input: UnifiedUpdateInput): Promise<void>;
  abstract delete(key: DatabaseKey, options?: DeleteOptions): Promise<void>;
  abstract conditionCheck(key: DatabaseKey, condition: any): Promise<void>;
  abstract commit(): Promise<void>;
  abstract rollback(): Promise<void>;
}

// Provider factory interface
export interface IDatabaseProviderFactory {
  createProvider(providerType: DatabaseProviderType, config: any): IDataAccessLayer;
  getSupportedProviders(): DatabaseProviderType[];
}

// Metrics collection interface
export interface IMetricsCollector {
  recordOperation(operation: string, duration: number, success: boolean, provider: string): void;
  recordConnectionEvent(event: 'connect' | 'disconnect' | 'error', provider: string): void;
  recordQueryPerformance(queryType: string, duration: number, resultCount: number, provider: string): void;
  getMetrics(): MetricsSnapshot;
}

// Operation metrics interface
export interface OperationMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  errorRate: number;
  connectionEvents: {
    connects: number;
    disconnects: number;
    errors: number;
  };
  queryMetrics: {
    [queryType: string]: {
      count: number;
      averageTime: number;
      averageResultCount: number;
    };
  };
}

// Default metrics collector implementation
export class DefaultMetricsCollector implements IMetricsCollector {
  private metrics: Map<string, OperationMetrics> = new Map();

  recordOperation(operation: string, duration: number, success: boolean, provider: string): void {
    const metrics = this.getOrCreateMetrics(provider);
    metrics.totalOperations++;
    
    if (success) {
      metrics.successfulOperations++;
    } else {
      metrics.failedOperations++;
    }
    
    // Update average response time
    const totalTime = metrics.averageResponseTime * (metrics.totalOperations - 1) + duration;
    metrics.averageResponseTime = totalTime / metrics.totalOperations;
    
    // Update error rate
    metrics.errorRate = metrics.failedOperations / metrics.totalOperations;
  }

  recordConnectionEvent(event: 'connect' | 'disconnect' | 'error', provider: string): void {
    const metrics = this.getOrCreateMetrics(provider);
    metrics.connectionEvents[`${event}s` as keyof typeof metrics.connectionEvents]++;
  }

  recordQueryPerformance(queryType: string, duration: number, resultCount: number, provider: string): void {
    const metrics = this.getOrCreateMetrics(provider);
    
    if (!metrics.queryMetrics[queryType]) {
      metrics.queryMetrics[queryType] = {
        count: 0,
        averageTime: 0,
        averageResultCount: 0
      };
    }
    
    const queryMetrics = metrics.queryMetrics[queryType];
    queryMetrics.count++;
    
    // Update averages
    const totalTime = queryMetrics.averageTime * (queryMetrics.count - 1) + duration;
    queryMetrics.averageTime = totalTime / queryMetrics.count;
    
    const totalResults = queryMetrics.averageResultCount * (queryMetrics.count - 1) + resultCount;
    queryMetrics.averageResultCount = totalResults / queryMetrics.count;
  }

  getMetrics(): MetricsSnapshot {
    // Aggregate metrics across all providers
    const aggregated = this.createEmptyMetrics();
    for (const metrics of this.metrics.values()) {
      aggregated.totalOperations += metrics.totalOperations;
      aggregated.successfulOperations += metrics.successfulOperations;
      aggregated.failedOperations += metrics.failedOperations;
      aggregated.connectionEvents.connects += metrics.connectionEvents.connects;
      aggregated.connectionEvents.disconnects += metrics.connectionEvents.disconnects;
      aggregated.connectionEvents.errors += metrics.connectionEvents.errors;
      
      // Merge query metrics
      for (const [queryType, queryMetrics] of Object.entries(metrics.queryMetrics)) {
        if (!aggregated.queryMetrics[queryType]) {
          aggregated.queryMetrics[queryType] = { ...queryMetrics };
        } else {
          const existing = aggregated.queryMetrics[queryType];
          const totalCount = existing.count + queryMetrics.count;
          existing.averageTime = (existing.averageTime * existing.count + queryMetrics.averageTime * queryMetrics.count) / totalCount;
          existing.averageResultCount = (existing.averageResultCount * existing.count + queryMetrics.averageResultCount * queryMetrics.count) / totalCount;
          existing.count = totalCount;
        }
      }
    }
    
    // Calculate aggregated averages
    if (aggregated.totalOperations > 0) {
      aggregated.errorRate = aggregated.failedOperations / aggregated.totalOperations;
    }
    
    return {
      timestamp: new Date(),
      provider: 'aggregated',
      operations: {
        totalOperations: aggregated.totalOperations,
        successfulOperations: aggregated.successfulOperations,
        failedOperations: aggregated.failedOperations,
        averageResponseTime: aggregated.averageResponseTime,
        errorRate: aggregated.errorRate,
        operationCounts: {},
        operationTimings: {}
      },
      connections: {
        activeConnections: 0,
        totalConnections: aggregated.connectionEvents.connects,
        failedConnections: aggregated.connectionEvents.errors,
        connectionEvents: {
          connect: aggregated.connectionEvents.connects,
          disconnect: aggregated.connectionEvents.disconnects,
          error: aggregated.connectionEvents.errors,
          reconnect: 0
        }
      },
      queries: {
        totalQueries: 0,
        averageQueryTime: 0,
        averageResultCount: 0,
        queryTypes: {},
        slowQueries: []
      },
      performance: {
        warningThresholds: {},
        warnings: [],
        slowOperations: []
      }
    };
  }

  private getOrCreateMetrics(provider: string): OperationMetrics {
    if (!this.metrics.has(provider)) {
      this.metrics.set(provider, this.createEmptyMetrics());
    }
    return this.metrics.get(provider)!;
  }

  reset(): void {
    this.metrics.clear();
  }

  private createEmptyMetrics(): OperationMetrics {
    return {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageResponseTime: 0,
      errorRate: 0,
      connectionEvents: {
        connects: 0,
        disconnects: 0,
        errors: 0
      },
      queryMetrics: {}
    };
  }
}