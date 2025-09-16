/**
 * DynamoDB provider implementation
 * Implements the unified database abstraction layer for DynamoDB
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand, 
  QueryCommand, 
  ScanCommand, 
  BatchGetCommand,
  TransactWriteCommand,
  TransactGetCommand
} from '@aws-sdk/lib-dynamodb';

import {
  BaseDatabaseProvider,
  BaseTransaction,
  ConnectionState,
  IConnectionManager,
  DefaultMetricsCollector,
  IMetricsCollector
} from '../types/database-provider';

import {
  DatabaseKey,
  UnifiedQueryInput,
  UnifiedScanInput,
  UnifiedUpdateInput,
  QueryOptions,
  PutOptions,
  UpdateOptions,
  DeleteOptions,
  BatchOptions,
  TransactionOperation,
  ITransaction,
  DynamoDBConfig,
  HealthStatus
} from '../types/database-abstraction';

import {
  DatabaseError,
  ErrorTranslatorFactory,
  ConnectionError,
  ValidationError,
  TransactionError,
  ItemNotFoundError
} from '../types/database-errors';

import { 
  ILogger, 
  LoggerFactory, 
  PerformanceLogger, 
  ConnectionLogger,
  withLogging,
  logDatabaseOperation
} from '../utils/database-logger';

import { 
  DatabaseErrorHandler, 
  ErrorHandlerFactory, 
  ErrorContext 
} from '../utils/error-handler';

import { 
  ResilienceManager, 
  ResilienceManagerFactory 
} from '../utils/retry-manager';


// DynamoDB connection manager
class DynamoDBConnectionManager implements IConnectionManager {
  private client: DynamoDBClient;
  private docClient: DynamoDBDocumentClient;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private config: DynamoDBConfig;
  private metrics: IMetricsCollector;
  private listeners: Map<string, Function[]> = new Map();
  private logger: ILogger;
  private connectionLogger: ConnectionLogger;
  private errorHandler: DatabaseErrorHandler;
  private resilienceManager: ResilienceManager;

  constructor(config: DynamoDBConfig, metrics: IMetricsCollector) {
    this.config = config;
    this.metrics = metrics;
    this.logger = LoggerFactory.getLogger('DynamoDBConnectionManager', { provider: 'dynamodb' });
    this.connectionLogger = LoggerFactory.createConnectionLogger('DynamoDBConnectionManager');
    this.errorHandler = ErrorHandlerFactory.getHandler('dynamodb');
    this.resilienceManager = ResilienceManagerFactory.getManager('dynamodb');
    this.initializeClients();
  }

  private initializeClients(): void {
    const clientConfig: any = {
      region: this.config.region
    };

    // Add endpoint for local development
    if (this.config.endpoint) {
      clientConfig.endpoint = this.config.endpoint;
    }

    this.client = new DynamoDBClient(clientConfig);
    this.docClient = DynamoDBDocumentClient.from(this.client, {
      marshallOptions: { removeUndefinedValues: true }
    });
  }

  async connect(): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.connectionState = ConnectionState.CONNECTING;
      this.connectionLogger.logConnectionAttempt('dynamodb', {
        region: this.config.region,
        primaryTable: this.config.primaryTable,
        endpoint: this.config.endpoint
      });
      this.emit('connecting');

      // Test connection by describing one of the tables
      await this.resilienceManager.executeWithResilience(
        async () => {
          await this.docClient.send(new GetCommand({
            TableName: this.config.primaryTable,
            Key: { pk: '__connection_test__', sk: '__connection_test__' }
          }));
        },
        'connection_test',
        'dynamodb'
      );

      this.connectionState = ConnectionState.CONNECTED;
      const duration = Date.now() - startTime;
      this.metrics.recordConnectionEvent('connect', 'dynamodb');
      this.connectionLogger.logConnectionSuccess('dynamodb', duration);
      this.emit('connected');
    } catch (error) {
      this.connectionState = ConnectionState.ERROR;
      const duration = Date.now() - startTime;
      
      const context: ErrorContext = {
        operation: 'connect',
        provider: 'dynamodb',
        table: this.config.primaryTable,
        duration
      };
      
      const dbError = this.errorHandler.handleError(error, context);
      this.metrics.recordConnectionEvent('error', 'dynamodb');
      this.connectionLogger.logConnectionFailure('dynamodb', dbError, duration);
      this.emit('error', dbError);
      this.metrics.recordConnectionEvent('error', 'dynamodb');
      this.emit('error', ErrorTranslatorFactory.translateError(error, 'dynamodb'));
      throw new ConnectionError('Failed to connect to DynamoDB', error, 'dynamodb');
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        this.client.destroy();
      }
      this.connectionState = ConnectionState.DISCONNECTED;
      this.metrics.recordConnectionEvent('disconnect', 'dynamodb');
      this.emit('disconnected');
    } catch (error) {
      this.emit('error', ErrorTranslatorFactory.translateError(error, 'dynamodb'));
      throw new ConnectionError('Failed to disconnect from DynamoDB', error, 'dynamodb');
    }
  }

  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();
    let healthy = false;
    let connectionStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';

    try {
      // Simple health check - try to get a non-existent item
      await this.docClient.send(new GetCommand({
        TableName: this.config.primaryTable,
        Key: { pk: '__health_check__', sk: '__health_check__' }
      }));
      
      healthy = true;
      connectionStatus = 'connected';
    } catch (error) {
      connectionStatus = 'error';
    }

    const responseTime = Date.now() - startTime;
    const metrics = this.metrics.getMetrics();

    return {
      healthy,
      provider: 'dynamodb',
      connectionStatus,
      lastSuccessfulOperation: healthy ? new Date() : undefined,
      metrics: {
        averageResponseTime: responseTime,
        errorRate: metrics.operations.errorRate,
        connectionCount: 1 // DynamoDB doesn't have persistent connections
      }
    };
  }

  async reconnect(): Promise<void> {
    this.connectionState = ConnectionState.RECONNECTING;
    this.emit('reconnecting');
    
    await this.disconnect();
    await this.connect();
  }

  // Event emitter methods
  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  emit(event: string, ...args: any[]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
    }
  }

  getDocumentClient(): DynamoDBDocumentClient {
    return this.docClient;
  }

  getConfig(): DynamoDBConfig {
    return this.config;
  }
}

// DynamoDB provider implementation
export class DynamoDBProvider extends BaseDatabaseProvider {
  protected connectionManager: DynamoDBConnectionManager;
  private metrics: IMetricsCollector;
  private errorTranslator = ErrorTranslatorFactory.getTranslator('dynamodb');
  private logger: ILogger;
  private performanceLogger: PerformanceLogger;
  private errorHandler: DatabaseErrorHandler;
  private resilienceManager: ResilienceManager;

  constructor(config: DynamoDBConfig, metrics?: IMetricsCollector) {
    super('dynamodb', config);
    this.metrics = metrics || new DefaultMetricsCollector();
    this.connectionManager = new DynamoDBConnectionManager(config, this.metrics);
    
    // Initialize logging and error handling
    this.logger = LoggerFactory.getLogger('DynamoDBProvider', { provider: 'dynamodb' });
    this.performanceLogger = LoggerFactory.createPerformanceLogger('DynamoDBProvider');
    this.errorHandler = ErrorHandlerFactory.getHandler('dynamodb');
    this.resilienceManager = ResilienceManagerFactory.getManager('dynamodb');
    
    this.logger.info('DynamoDB provider initialized', {
      region: config.region,
      primaryTable: config.primaryTable,
      dataTable: config.dataTable
    });
  }

  // Connection management (delegated to connection manager)
  async connect(): Promise<void> {
    return this.connectionManager.connect();
  }

  async disconnect(): Promise<void> {
    return this.connectionManager.disconnect();
  }

  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.connectionManager.healthCheck();
  }

  // CRUD Operations
  async get<TResult = any>(key: DatabaseKey, options?: QueryOptions): Promise<TResult | null> {
    return withLogging(
      this.logger,
      'get',
      'dynamodb',
      async () => {
        const startTime = Date.now();
        const logContext = logDatabaseOperation(this.logger, 'get', 'dynamodb', key, options);
        
        try {
          this.validateKey(key);
          this.validateConnection();

          const dynamoKey = this.convertToDynamoKey(key);
          const tableName = this.getTableName(key);

          const command = new GetCommand({
            TableName: tableName,
            Key: dynamoKey,
            ProjectionExpression: options?.projection?.join(', '),
            ConsistentRead: options?.consistentRead ?? this.config.consistentRead ?? false
          });

          const response = await this.resilienceManager.executeWithResilience(
            () => this.connectionManager.getDocumentClient().send(command),
            'get',
            'dynamodb',
            { key, table: tableName }
          );
          
          const duration = Date.now() - startTime;
          this.metrics.recordOperation('get', duration, true, 'dynamodb');
          this.performanceLogger.logOperation({
            operation: 'get',
            provider: 'dynamodb',
            duration,
            success: true,
            itemCount: response.Item ? 1 : 0
          });
          
          return response.Item as TResult || null;
        } catch (error) {
          const duration = Date.now() - startTime;
          this.metrics.recordOperation('get', duration, false, 'dynamodb');
          
          const context: ErrorContext = {
            operation: 'get',
            provider: 'dynamodb',
            table: this.getTableName(key),
            key,
            duration,
            ...logContext
          };
          
          const dbError = this.errorHandler.handleError(error, context);
          this.performanceLogger.logOperation({
            operation: 'get',
            provider: 'dynamodb',
            duration,
            success: false
          });
          throw this.errorTranslator.translateError(error, 'dynamodb');
        }
      }
    );
  }

  async put<TData = any>(data: TData, options?: PutOptions): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.validateData(data);
      this.validateConnection();

      const tableName = this.getTableName(data);
      const command = new PutCommand({
        TableName: tableName,
        Item: data,
        ConditionExpression: options?.ensureNotExists ? 'attribute_not_exists(pk)' : options?.condition ? this.buildConditionExpression(options.condition) : undefined
      });

      await this.connectionManager.getDocumentClient().send(command);
      
      this.metrics.recordOperation('put', Date.now() - startTime, true, 'dynamodb');
    } catch (error) {
      this.metrics.recordOperation('put', Date.now() - startTime, false, 'dynamodb');
      throw this.errorTranslator.translateError(error, 'dynamodb');
    }
  }

  async update(input: UnifiedUpdateInput, options?: UpdateOptions): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.validateConnection();
      this.validateKey(input.key);

      const dynamoKey = this.convertToDynamoKey(input.key);
      const tableName = this.getTableName(input.key);
      
      const updateExpression = this.buildUpdateExpression(input);
      
      const command = new UpdateCommand({
        TableName: tableName,
        Key: dynamoKey,
        UpdateExpression: updateExpression.expression,
        ExpressionAttributeNames: updateExpression.attributeNames,
        ExpressionAttributeValues: updateExpression.attributeValues,
        ConditionExpression: options?.condition ? this.buildConditionExpression(options.condition) : undefined,
        ReturnValues: options?.returnValues || 'NONE'
      });

      const response = await this.connectionManager.getDocumentClient().send(command);
      
      this.metrics.recordOperation('update', Date.now() - startTime, true, 'dynamodb');
      
      return response.Attributes;
    } catch (error) {
      this.metrics.recordOperation('update', Date.now() - startTime, false, 'dynamodb');
      throw this.errorTranslator.translateError(error, 'dynamodb');
    }
  }

  async delete(key: DatabaseKey, options?: DeleteOptions): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.validateConnection();
      this.validateKey(key);

      const dynamoKey = this.convertToDynamoKey(key);
      const tableName = this.getTableName(key);

      const command = new DeleteCommand({
        TableName: tableName,
        Key: dynamoKey,
        ConditionExpression: options?.condition ? this.buildConditionExpression(options.condition) : undefined,
        ReturnValues: options?.returnValues || 'NONE'
      });

      await this.connectionManager.getDocumentClient().send(command);
      
      this.metrics.recordOperation('delete', Date.now() - startTime, true, 'dynamodb');
    } catch (error) {
      this.metrics.recordOperation('delete', Date.now() - startTime, false, 'dynamodb');
      throw this.errorTranslator.translateError(error, 'dynamodb');
    }
  }

  // Query Operations
  async query<TResult = any>(input: UnifiedQueryInput): Promise<TResult[]> {
    const startTime = Date.now();
    
    try {
      this.validateConnection();

      const tableName = this.getTableNameFromQuery(input);
      const queryExpression = this.buildQueryExpression(input);
      
      let token: any;
      const results: TResult[] = [];
      
      do {
        const command = new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: queryExpression.keyCondition,
          FilterExpression: queryExpression.filterExpression,
          ExpressionAttributeNames: queryExpression.attributeNames,
          ExpressionAttributeValues: queryExpression.attributeValues,
          ProjectionExpression: input.projection?.join(', '),
          IndexName: input.indexName,
          Limit: input.limit,
          ScanIndexForward: input.sortOrder !== 'DESC',
          ExclusiveStartKey: token
        });

        const response = await this.connectionManager.getDocumentClient().send(command);
        
        if (response.Items) {
          results.push(...response.Items as TResult[]);
        }
        
        // Continue pagination if no limit specified
        if (input.limit === undefined) {
          token = response.LastEvaluatedKey;
        } else {
          token = undefined;
        }
      } while (token);

      this.metrics.recordQueryPerformance('query', Date.now() - startTime, results.length, 'dynamodb');
      
      return results;
    } catch (error) {
      this.metrics.recordOperation('query', Date.now() - startTime, false, 'dynamodb');
      throw this.errorTranslator.translateError(error, 'dynamodb');
    }
  }

  async scan<TResult = any>(input: UnifiedScanInput): Promise<{ items: TResult[], token?: any }> {
    const startTime = Date.now();
    
    try {
      this.validateConnection();

      const tableName = this.getTableNameFromScan(input);
      const filterExpression = input.filterCondition ? this.buildFilterExpression(input.filterCondition) : undefined;

      const command = new ScanCommand({
        TableName: tableName,
        FilterExpression: filterExpression?.expression,
        ExpressionAttributeNames: filterExpression?.attributeNames,
        ExpressionAttributeValues: filterExpression?.attributeValues,
        ProjectionExpression: input.projection?.join(', '),
        IndexName: input.indexName,
        Limit: input.limit,
        ExclusiveStartKey: input.startKey
      });

      const response = await this.connectionManager.getDocumentClient().send(command);
      
      const items = (response.Items || []) as TResult[];
      
      this.metrics.recordQueryPerformance('scan', Date.now() - startTime, items.length, 'dynamodb');
      
      return {
        items,
        token: response.LastEvaluatedKey
      };
    } catch (error) {
      this.metrics.recordOperation('scan', Date.now() - startTime, false, 'dynamodb');
      throw this.errorTranslator.translateError(error, 'dynamodb');
    }
  }

  async batchGet<TResult = any>(keys: DatabaseKey[], options?: BatchOptions): Promise<TResult[]> {
    const startTime = Date.now();
    
    try {
      if (keys.length === 0) {
        return [];
      }

      this.validateConnection();

      const results: TResult[] = [];
      
      // Process in batches of 100 (DynamoDB limit)
      for (let i = 0; i < keys.length; i += 100) {
        const batch = keys.slice(i, i + 100);
        const batchResults = await this.processBatchGet(batch, options);
        results.push(...batchResults);
      }

      this.metrics.recordOperation('batchGet', Date.now() - startTime, true, 'dynamodb');
      
      return results;
    } catch (error) {
      this.metrics.recordOperation('batchGet', Date.now() - startTime, false, 'dynamodb');
      throw this.errorTranslator.translateError(error, 'dynamodb');
    }
  }

  private async processBatchGet<TResult = any>(keys: DatabaseKey[], options?: BatchOptions): Promise<TResult[]> {
    // Group keys by table
    const keysByTable = new Map<string, any[]>();
    
    for (const key of keys) {
      const tableName = this.getTableName(key);
      const dynamoKey = this.convertToDynamoKey(key);
      
      if (!keysByTable.has(tableName)) {
        keysByTable.set(tableName, []);
      }
      keysByTable.get(tableName)!.push(dynamoKey);
    }

    const results: TResult[] = [];
    
    for (const [tableName, tableKeys] of keysByTable) {
      const command = new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: tableKeys,
            ProjectionExpression: options?.projection?.join(', '),
            ConsistentRead: options?.consistentRead ?? this.config.consistentRead ?? false
          }
        }
      });

      const response = await this.connectionManager.getDocumentClient().send(command);
      
      if (response.Responses && response.Responses[tableName]) {
        results.push(...response.Responses[tableName] as TResult[]);
      }
    }

    return results;
  }

  // Transaction Operations
  async beginTransaction(): Promise<ITransaction> {
    this.validateConnection();
    return new DynamoDBTransaction(this, this.connectionManager, this.metrics);
  }

  async executeTransaction(operations: TransactionOperation[]): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (operations.length === 0) {
        return;
      }

      if (operations.length > 25) {
        throw new ValidationError('DynamoDB transactions support maximum 25 operations', undefined, 'dynamodb');
      }

      this.validateConnection();

      const transactItems = operations.map(op => this.convertToTransactItem(op));

      const command = new TransactWriteCommand({
        TransactItems: transactItems
      });

      await this.connectionManager.getDocumentClient().send(command);
      
      this.metrics.recordOperation('transaction', Date.now() - startTime, true, 'dynamodb');
    } catch (error) {
      this.metrics.recordOperation('transaction', Date.now() - startTime, false, 'dynamodb');
      throw this.errorTranslator.translateError(error, 'dynamodb');
    }
  }

  // Provider-specific operations
  async executeNative(operation: any): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.validateConnection();
      
      const response = await this.connectionManager.getDocumentClient().send(operation);
      
      this.metrics.recordOperation('native', Date.now() - startTime, true, 'dynamodb');
      
      return response;
    } catch (error) {
      this.metrics.recordOperation('native', Date.now() - startTime, false, 'dynamodb');
      throw this.errorTranslator.translateError(error, 'dynamodb');
    }
  }

  // Helper methods
  private convertToDynamoKey(key: DatabaseKey): any {
    return {
      pk: key.primary.toString(),
      sk: key.sort?.toString() || key.primary.toString()
    };
  }

  private getTableName(keyOrData: any): string {
    // Default to primary table, could be enhanced with logic to determine table based on data
    return this.config.primaryTable;
  }

  private getTableNameFromQuery(input: UnifiedQueryInput): string {
    // Default to primary table, could be enhanced with logic based on query
    return this.config.primaryTable;
  }

  private getTableNameFromScan(input: UnifiedScanInput): string {
    // Default to primary table, could be enhanced with logic based on scan
    return this.config.primaryTable;
  }

  private buildConditionExpression(condition: any): string {
    // Simplified condition building - would need full implementation
    return 'attribute_exists(pk)';
  }

  private buildUpdateExpression(input: UnifiedUpdateInput): {
    expression: string;
    attributeNames?: Record<string, string>;
    attributeValues?: Record<string, any>;
  } {
    const setParts: string[] = [];
    const addParts: string[] = [];
    const removeParts: string[] = [];
    const attributeNames: Record<string, string> = {};
    const attributeValues: Record<string, any> = {};

    let nameCounter = 0;
    let valueCounter = 0;

    // Handle regular updates
    for (const [field, value] of Object.entries(input.updates)) {
      const nameKey = `#n${nameCounter++}`;
      const valueKey = `:v${valueCounter++}`;
      
      attributeNames[nameKey] = field;
      attributeValues[valueKey] = value;
      setParts.push(`${nameKey} = ${valueKey}`);
    }

    // Handle increment fields
    if (input.incrementFields) {
      for (const [field, value] of Object.entries(input.incrementFields)) {
        const nameKey = `#n${nameCounter++}`;
        const valueKey = `:v${valueCounter++}`;
        
        attributeNames[nameKey] = field;
        attributeValues[valueKey] = value;
        addParts.push(`${nameKey} ${valueKey}`);
      }
    }

    // Handle list operations
    if (input.appendToList) {
      for (const [field, values] of Object.entries(input.appendToList)) {
        const nameKey = `#n${nameCounter++}`;
        const valueKey = `:v${valueCounter++}`;
        
        attributeNames[nameKey] = field;
        attributeValues[valueKey] = values;
        setParts.push(`${nameKey} = list_append(if_not_exists(${nameKey}, :empty_list), ${valueKey})`);
        attributeValues[':empty_list'] = [];
      }
    }

    const expressionParts: string[] = [];
    if (setParts.length > 0) {
      expressionParts.push(`SET ${setParts.join(', ')}`);
    }
    if (addParts.length > 0) {
      expressionParts.push(`ADD ${addParts.join(', ')}`);
    }
    if (removeParts.length > 0) {
      expressionParts.push(`REMOVE ${removeParts.join(', ')}`);
    }

    return {
      expression: expressionParts.join(' '),
      attributeNames: Object.keys(attributeNames).length > 0 ? attributeNames : undefined,
      attributeValues: Object.keys(attributeValues).length > 0 ? attributeValues : undefined
    };
  }

  private buildQueryExpression(input: UnifiedQueryInput): {
    keyCondition?: string;
    filterExpression?: string;
    attributeNames?: Record<string, string>;
    attributeValues?: Record<string, any>;
  } {
    const attributeNames: Record<string, string> = {};
    const attributeValues: Record<string, any> = {};
    let nameCounter = 0;
    let valueCounter = 0;

    let keyCondition: string | undefined;
    let filterExpression: string | undefined;

    // Build key condition
    if (input.keyCondition) {
      const nameKey = `#k${nameCounter++}`;
      const valueKey = `:v${valueCounter++}`;
      
      attributeNames[nameKey] = input.keyCondition.field;
      attributeValues[valueKey] = input.keyCondition.value;
      
      switch (input.keyCondition.operator) {
        case '=':
          keyCondition = `${nameKey} = ${valueKey}`;
          break;
        case 'begins_with':
          keyCondition = `begins_with(${nameKey}, ${valueKey})`;
          break;
        case 'between':
          const valueKey2 = `:v${valueCounter++}`;
          attributeValues[valueKey2] = input.keyCondition.value2;
          keyCondition = `${nameKey} BETWEEN ${valueKey} AND ${valueKey2}`;
          break;
      }
    }

    // Build filter expression
    if (input.filterCondition) {
      const filterExpr = this.buildFilterExpression(input.filterCondition);
      filterExpression = filterExpr.expression;
      
      // Merge attribute names and values
      if (filterExpr.attributeNames) {
        Object.assign(attributeNames, filterExpr.attributeNames);
      }
      if (filterExpr.attributeValues) {
        Object.assign(attributeValues, filterExpr.attributeValues);
      }
    }

    return {
      keyCondition,
      filterExpression,
      attributeNames: Object.keys(attributeNames).length > 0 ? attributeNames : undefined,
      attributeValues: Object.keys(attributeValues).length > 0 ? attributeValues : undefined
    };
  }

  private buildFilterExpression(condition: any): {
    expression: string;
    attributeNames?: Record<string, string>;
    attributeValues?: Record<string, any>;
  } {
    // Simplified filter expression building - would need full implementation
    return {
      expression: 'attribute_exists(pk)',
      attributeNames: { '#pk': 'pk' },
      attributeValues: {}
    };
  }

  private convertToTransactItem(operation: TransactionOperation): any {
    const tableName = this.getTableName(operation.key || {});
    
    switch (operation.type) {
      case 'put':
        return {
          Put: {
            TableName: tableName,
            Item: operation.data
          }
        };
      
      case 'update':
        if (!operation.updates) {
          throw new ValidationError('Update operation requires updates field', undefined, 'dynamodb');
        }
        const updateExpr = this.buildUpdateExpression(operation.updates);
        return {
          Update: {
            TableName: tableName,
            Key: this.convertToDynamoKey(operation.updates.key),
            UpdateExpression: updateExpr.expression,
            ExpressionAttributeNames: updateExpr.attributeNames,
            ExpressionAttributeValues: updateExpr.attributeValues
          }
        };
      
      case 'delete':
        return {
          Delete: {
            TableName: tableName,
            Key: this.convertToDynamoKey(operation.key!)
          }
        };
      
      case 'conditionCheck':
        return {
          ConditionCheck: {
            TableName: tableName,
            Key: this.convertToDynamoKey(operation.key!),
            ConditionExpression: operation.condition ? this.buildConditionExpression(operation.condition) : 'attribute_exists(pk)'
          }
        };
      
      default:
        throw new ValidationError(`Unsupported transaction operation type: ${operation.type}`, undefined, 'dynamodb');
    }
  }

  // Getter for configuration (used by transaction)
  getConfig(): DynamoDBConfig {
    return this.config as DynamoDBConfig;
  }

  // Getter for connection manager (used by transaction)
  getConnectionManager(): DynamoDBConnectionManager {
    return this.connectionManager;
  }
}

// DynamoDB Transaction implementation
class DynamoDBTransaction extends BaseTransaction {
  protected provider: DynamoDBProvider;
  private connectionManager: DynamoDBConnectionManager;
  private metrics: IMetricsCollector;
  private transactionOperations: TransactionOperation[] = [];

  constructor(
    provider: DynamoDBProvider, 
    connectionManager: DynamoDBConnectionManager, 
    metrics: IMetricsCollector
  ) {
    super(provider);
    this.provider = provider;
    this.connectionManager = connectionManager;
    this.metrics = metrics;
  }

  async get<T>(key: DatabaseKey): Promise<T | null> {
    this.validateActive();
    
    try {
      // For DynamoDB, we can't do transactional reads in the same way as writes
      // We'll use TransactGet for reading within transaction context
      const dynamoKey = this.provider['convertToDynamoKey'](key);
      const tableName = this.provider['getTableName'](key);

      const command = new TransactGetCommand({
        TransactItems: [{
          Get: {
            TableName: tableName,
            Key: dynamoKey
          }
        }]
      });

      const response = await this.connectionManager.getDocumentClient().send(command);
      
      return response.Responses?.[0]?.Item as T || null;
    } catch (error) {
      throw ErrorTranslatorFactory.translateError(error, 'dynamodb');
    }
  }

  async put<T>(data: T, options?: PutOptions): Promise<void> {
    this.validateActive();
    
    // Add to transaction operations
    this.transactionOperations.push({
      type: 'put',
      data,
      condition: options?.condition
    });
  }

  async update(input: UnifiedUpdateInput): Promise<void> {
    this.validateActive();
    
    // Add to transaction operations
    this.transactionOperations.push({
      type: 'update',
      updates: input
    });
  }

  async delete(key: DatabaseKey, options?: DeleteOptions): Promise<void> {
    this.validateActive();
    
    // Add to transaction operations
    this.transactionOperations.push({
      type: 'delete',
      key,
      condition: options?.condition
    });
  }

  async conditionCheck(key: DatabaseKey, condition: any): Promise<void> {
    this.validateActive();
    
    // Add to transaction operations
    this.transactionOperations.push({
      type: 'conditionCheck',
      key,
      condition
    });
  }

  async commit(): Promise<void> {
    this.validateActive();
    
    const startTime = Date.now();
    
    try {
      if (this.transactionOperations.length === 0) {
        this.active = false;
        return;
      }

      if (this.transactionOperations.length > 25) {
        throw new ValidationError('DynamoDB transactions support maximum 25 operations', undefined, 'dynamodb');
      }

      // Execute the transaction
      await this.provider.executeTransaction(this.transactionOperations);
      
      this.active = false;
      this.metrics.recordOperation('transaction_commit', Date.now() - startTime, true, 'dynamodb');
    } catch (error) {
      this.active = false;
      this.metrics.recordOperation('transaction_commit', Date.now() - startTime, false, 'dynamodb');
      throw ErrorTranslatorFactory.translateError(error, 'dynamodb');
    }
  }

  async rollback(): Promise<void> {
    this.validateActive();
    
    // For DynamoDB, rollback just means clearing the operations and marking inactive
    // The actual rollback happens automatically if commit fails
    this.transactionOperations = [];
    this.active = false;
    
    this.metrics.recordOperation('transaction_rollback', Date.now(), true, 'dynamodb');
  }
}