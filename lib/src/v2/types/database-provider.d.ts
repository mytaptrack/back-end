/**
 * Base database provider interface with connection management
 * Defines the contract that all database providers must implement
 */
import { DatabaseProviderType, IDataAccessLayer, ITransaction, HealthStatus, DatabaseKey, UnifiedQueryInput, UnifiedScanInput, UnifiedUpdateInput, QueryOptions, PutOptions, UpdateOptions, DeleteOptions, BatchOptions, TransactionOperation } from './database-abstraction';
import { DatabaseError } from './database-errors';
import { MetricsSnapshot } from './metrics';
export { IDatabaseProvider } from './database-abstraction';
export declare enum ConnectionState {
    DISCONNECTED = "disconnected",
    CONNECTING = "connecting",
    CONNECTED = "connected",
    RECONNECTING = "reconnecting",
    ERROR = "error"
}
export interface IConnectionEventEmitter {
    on(event: 'connected', listener: () => void): void;
    on(event: 'disconnected', listener: () => void): void;
    on(event: 'error', listener: (error: DatabaseError) => void): void;
    on(event: 'reconnecting', listener: () => void): void;
    emit(event: string, ...args: any[]): void;
}
export interface IConnectionManager extends IConnectionEventEmitter {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getConnectionState(): ConnectionState;
    healthCheck(): Promise<HealthStatus>;
    reconnect(): Promise<void>;
}
export declare abstract class BaseDatabaseProvider implements IDataAccessLayer {
    protected connectionManager: IConnectionManager;
    protected providerType: DatabaseProviderType;
    protected config: any;
    constructor(providerType: DatabaseProviderType, config: any);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getProviderType(): DatabaseProviderType;
    healthCheck(): Promise<HealthStatus>;
    abstract get<TResult = any>(key: DatabaseKey, options?: QueryOptions): Promise<TResult | null>;
    abstract put<TData = any>(data: TData, options?: PutOptions): Promise<void>;
    abstract update(input: UnifiedUpdateInput, options?: UpdateOptions): Promise<any>;
    abstract delete(key: DatabaseKey, options?: DeleteOptions): Promise<void>;
    abstract query<TResult = any>(input: UnifiedQueryInput): Promise<TResult[]>;
    abstract scan<TResult = any>(input: UnifiedScanInput): Promise<{
        items: TResult[];
        token?: any;
    }>;
    abstract batchGet<TResult = any>(keys: DatabaseKey[], options?: BatchOptions): Promise<TResult[]>;
    abstract beginTransaction(): Promise<ITransaction>;
    abstract executeTransaction(operations: TransactionOperation[]): Promise<void>;
    abstract executeNative(operation: any): Promise<any>;
    protected validateConnection(): void;
    protected validateKey(key: DatabaseKey): void;
    protected validateData(data: any): void;
}
export declare abstract class BaseTransaction implements ITransaction {
    protected provider: BaseDatabaseProvider;
    protected active: boolean;
    protected operations: TransactionOperation[];
    constructor(provider: BaseDatabaseProvider);
    isActive(): boolean;
    protected validateActive(): void;
    abstract get<T>(key: DatabaseKey): Promise<T | null>;
    abstract put<T>(data: T, options?: PutOptions): Promise<void>;
    abstract update(input: UnifiedUpdateInput): Promise<void>;
    abstract delete(key: DatabaseKey, options?: DeleteOptions): Promise<void>;
    abstract conditionCheck(key: DatabaseKey, condition: any): Promise<void>;
    abstract commit(): Promise<void>;
    abstract rollback(): Promise<void>;
}
export interface IDatabaseProviderFactory {
    createProvider(providerType: DatabaseProviderType, config: any): IDataAccessLayer;
    getSupportedProviders(): DatabaseProviderType[];
}
export interface IMetricsCollector {
    recordOperation(operation: string, duration: number, success: boolean, provider: string): void;
    recordConnectionEvent(event: 'connect' | 'disconnect' | 'error', provider: string): void;
    recordQueryPerformance(queryType: string, duration: number, resultCount: number, provider: string): void;
    getMetrics(): MetricsSnapshot;
}
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
export declare class DefaultMetricsCollector implements IMetricsCollector {
    private metrics;
    recordOperation(operation: string, duration: number, success: boolean, provider: string): void;
    recordConnectionEvent(event: 'connect' | 'disconnect' | 'error', provider: string): void;
    recordQueryPerformance(queryType: string, duration: number, resultCount: number, provider: string): void;
    getMetrics(): MetricsSnapshot;
    private getOrCreateMetrics;
    reset(): void;
    private createEmptyMetrics;
}
export { DatabaseProviderType, HealthStatus };
//# sourceMappingURL=database-provider.d.ts.map