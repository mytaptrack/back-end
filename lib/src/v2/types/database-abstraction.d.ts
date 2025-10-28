/**
 * Core database abstraction interfaces and types
 * Provides unified interface for database operations across different providers
 */
export type DatabaseProviderType = 'dynamodb' | 'mongodb';
export interface DatabaseKey {
    primary: string | number;
    sort?: string | number;
    [key: string]: any;
}
export interface KeyCondition {
    field: string;
    operator: '=' | 'begins_with' | 'between';
    value: any;
    value2?: any;
}
export interface FilterCondition {
    field: string;
    operator: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'contains' | 'exists' | 'not_exists' | 'in';
    value?: any;
    values?: any[];
}
export interface UnifiedQueryInput {
    keyCondition?: KeyCondition;
    filterCondition?: FilterCondition;
    projection?: string[];
    indexName?: string;
    limit?: number;
    sortOrder?: 'ASC' | 'DESC';
    startKey?: any;
}
export interface UnifiedScanInput {
    filterCondition?: FilterCondition;
    projection?: string[];
    indexName?: string;
    limit?: number;
    startKey?: any;
}
export interface UnifiedUpdateInput {
    key: DatabaseKey;
    updates: Record<string, any>;
    condition?: FilterCondition;
    incrementFields?: Record<string, number>;
    appendToList?: Record<string, any[]>;
    removeFromList?: Record<string, any[]>;
}
export interface QueryOptions {
    consistentRead?: boolean;
    projection?: string[];
    limit?: number;
}
export interface PutOptions {
    ensureNotExists?: boolean;
    condition?: FilterCondition;
}
export interface UpdateOptions {
    condition?: FilterCondition;
    returnValues?: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW';
}
export interface DeleteOptions {
    condition?: FilterCondition;
    returnValues?: 'NONE' | 'ALL_OLD';
}
export interface BatchOptions {
    consistentRead?: boolean;
    projection?: string[];
}
export interface TransactionOperation {
    type: 'put' | 'update' | 'delete' | 'conditionCheck';
    key?: DatabaseKey;
    data?: any;
    updates?: UnifiedUpdateInput;
    condition?: FilterCondition;
}
export interface IDatabaseProvider {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getProviderType(): DatabaseProviderType;
    healthCheck(): Promise<HealthStatus>;
}
export interface IDataAccessLayer<T = any> extends IDatabaseProvider {
    get<TResult = T>(key: DatabaseKey, options?: QueryOptions): Promise<TResult | null>;
    put<TData = T>(data: TData, options?: PutOptions): Promise<void>;
    update(input: UnifiedUpdateInput, options?: UpdateOptions): Promise<any>;
    delete(key: DatabaseKey, options?: DeleteOptions): Promise<void>;
    query<TResult = T>(input: UnifiedQueryInput): Promise<TResult[]>;
    scan<TResult = T>(input: UnifiedScanInput): Promise<{
        items: TResult[];
        token?: any;
    }>;
    batchGet<TResult = T>(keys: DatabaseKey[], options?: BatchOptions): Promise<TResult[]>;
    beginTransaction(): Promise<ITransaction>;
    executeTransaction(operations: TransactionOperation[]): Promise<void>;
    executeNative(operation: any): Promise<any>;
}
export interface ITransaction {
    get<T>(key: DatabaseKey): Promise<T | null>;
    put<T>(data: T, options?: PutOptions): Promise<void>;
    update(input: UnifiedUpdateInput): Promise<void>;
    delete(key: DatabaseKey, options?: DeleteOptions): Promise<void>;
    conditionCheck(key: DatabaseKey, condition: FilterCondition): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    isActive(): boolean;
}
export interface HealthStatus {
    healthy: boolean;
    provider: DatabaseProviderType;
    connectionStatus: 'connected' | 'disconnected' | 'error';
    lastSuccessfulOperation?: Date;
    metrics: {
        averageResponseTime: number;
        errorRate: number;
        connectionCount: number;
    };
}
export interface DatabaseConfig {
    provider: DatabaseProviderType;
    dynamodb?: DynamoDBConfig;
    mongodb?: MongoDBConfig;
    migration?: MigrationConfig;
}
export interface DynamoDBConfig {
    region: string;
    primaryTable: string;
    dataTable: string;
    consistentRead?: boolean;
    endpoint?: string;
}
export interface MongoDBConfig {
    connectionString: string;
    database: string;
    collections: {
        primary: string;
        data: string;
    };
    options?: {
        maxPoolSize?: number;
        minPoolSize?: number;
        maxIdleTimeMS?: number;
        serverSelectionTimeoutMS?: number;
    };
}
export interface MigrationConfig {
    enabled: boolean;
    batchSize: number;
    validateAfterMigration?: boolean;
}
//# sourceMappingURL=database-abstraction.d.ts.map