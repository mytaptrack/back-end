/**
 * MongoDB provider implementation
 * Implements the unified database abstraction layer for MongoDB
 */

import { MongoClient, Db, Collection, ClientSession, TransactionOptions } from 'mongodb';

import {
  BaseDatabaseProvider,
  BaseTransaction,
  ConnectionState,
  IConnectionManager,
  IMetricsCollector,
  DefaultMetricsCollector
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
  MongoDBConfig,
  HealthStatus,
  KeyCondition,
  FilterCondition
} from '../types/database-abstraction';

import {
  DatabaseError,
  ErrorTranslatorFactory,
  ConnectionError,
  ValidationError,
  TransactionError,
  ItemNotFoundError,
  DuplicateKeyError
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

// MongoDB connection manager
class MongoDBConnectionManager implements IConnectionManager {
  private client: MongoClient | null = null;
  private database: Db | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private config: MongoDBConfig;
  private logger: ILogger;
  private connectionLogger: ConnectionLogger;
  private errorHandler: DatabaseErrorHandler;
  private resilienceManager: ResilienceManager;
  private metrics: IMetricsCollector;
  private listeners: Map<string, Function[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(config: MongoDBConfig, metrics: IMetricsCollector) {
    this.config = config;
    this.metrics = metrics;
  }

  async connect(): Promise<void> {
    try {
      this.connectionState = ConnectionState.CONNECTING;
      this.emit('connecting');

      const clientOptions = {
        maxPoolSize: this.config.options?.maxPoolSize || 10,
        minPoolSize: this.config.options?.minPoolSize || 2,
        maxIdleTimeMS: this.config.options?.maxIdleTimeMS || 30000,
        serverSelectionTimeoutMS: this.config.options?.serverSelectionTimeoutMS || 5000,
        retryWrites: true,
        retryReads: true
      };

      this.client = new MongoClient(this.config.connectionString, clientOptions);
      await this.client.connect();
      
      this.database = this.client.db(this.config.database);
      
      // Test the connection
      await this.database.admin().ping();

      this.connectionState = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      this.metrics.recordConnectionEvent('connect', 'mongodb');
      this.emit('connected');
    } catch (error) {
      this.connectionState = ConnectionState.ERROR;
      this.metrics.recordConnectionEvent('error', 'mongodb');
      this.emit('error', ErrorTranslatorFactory.translateError(error, 'mongodb'));
      throw new ConnectionError('Failed to connect to MongoDB', error, 'mongodb');
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.database = null;
      }
      this.connectionState = ConnectionState.DISCONNECTED;
      this.metrics.recordConnectionEvent('disconnect', 'mongodb');
      this.emit('disconnected');
    } catch (error) {
      this.emit('error', ErrorTranslatorFactory.translateError(error, 'mongodb'));
      throw new ConnectionError('Failed to disconnect from MongoDB', error, 'mongodb');
    }
  }

  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED && 
           this.client !== null && 
           this.database !== null;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();
    let healthy = false;
    let connectionStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';

    try {
      if (this.database) {
        await this.database.admin().ping();
        healthy = true;
        connectionStatus = 'connected';
      }
    } catch (error) {
      connectionStatus = 'error';
    }

    const responseTime = Date.now() - startTime;
    const metrics = this.metrics.getMetrics();

    return {
      healthy,
      provider: 'mongodb',
      connectionStatus,
      lastSuccessfulOperation: healthy ? new Date() : undefined,
      metrics: {
        averageResponseTime: responseTime,
        errorRate: metrics.operations.errorRate,
        connectionCount: this.client ? 1 : 0
      }
    };
  }

  async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new ConnectionError('Maximum reconnection attempts exceeded', undefined, 'mongodb');
    }

    this.connectionState = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;
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

  getDatabase(): Db {
    if (!this.database) {
      throw new ConnectionError('Database not connected', undefined, 'mongodb');
    }
    return this.database;
  }

  getClient(): MongoClient {
    if (!this.client) {
      throw new ConnectionError('Client not connected', undefined, 'mongodb');
    }
    return this.client;
  }

  getConfig(): MongoDBConfig {
    return this.config;
  }
}

// MongoDB provider implementation
export class MongoDBProvider extends BaseDatabaseProvider {
  protected connectionManager: MongoDBConnectionManager;
  private metrics: IMetricsCollector;
  private errorTranslator = ErrorTranslatorFactory.getTranslator('mongodb');

  constructor(config: MongoDBConfig, metrics?: IMetricsCollector) {
    super('mongodb', config);
    this.metrics = metrics || new DefaultMetricsCollector();
    this.connectionManager = new MongoDBConnectionManager(config, this.metrics);
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
    const startTime = Date.now();
    
    try {
      this.validateKey(key);
      this.validateConnection();

      const collection = this.getCollection(key);
      const mongoQuery = this.convertKeyToMongoQuery(key);
      
      const projection = options?.projection ? 
        Object.fromEntries(options.projection.map(field => [field, 1])) : 
        undefined;

      const document = await collection.findOne(mongoQuery, { projection });
      
      this.metrics.recordOperation('get', Date.now() - startTime, true, 'mongodb');
      
      return document ? this.transformFromMongo(document) : null;
    } catch (error) {
      this.metrics.recordOperation('get', Date.now() - startTime, false, 'mongodb');
      throw this.errorTranslator.translateError(error, 'mongodb');
    }
  }

  async put<TData = any>(data: TData, options?: PutOptions): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.validateData(data);
      this.validateConnection();

      const collection = this.getCollection(data);
      const mongoDoc = this.transformToMongo(data);
      
      // Add timestamps
      mongoDoc.createdAt = new Date();
      mongoDoc.updatedAt = new Date();

      if (options?.ensureNotExists) {
        // Use insertOne to ensure document doesn't exist
        await collection.insertOne(mongoDoc);
      } else if (options?.condition) {
        // Use replaceOne with condition
        const conditionQuery = this.buildConditionQuery(options.condition);
        const result = await collection.replaceOne(
          { ...this.extractKeyFromData(data), ...conditionQuery },
          mongoDoc,
          { upsert: true }
        );
        
        if (result.matchedCount === 0 && result.upsertedCount === 0) {
          throw new ValidationError('Condition check failed', undefined, 'mongodb');
        }
      } else {
        // Use replaceOne with upsert
        const keyQuery = this.extractKeyFromData(data);
        await collection.replaceOne(keyQuery, mongoDoc, { upsert: true });
      }
      
      this.metrics.recordOperation('put', Date.now() - startTime, true, 'mongodb');
    } catch (error) {
      this.metrics.recordOperation('put', Date.now() - startTime, false, 'mongodb');
      
      // Handle duplicate key error
      if (error.code === 11000) {
        throw new DuplicateKeyError('Document already exists', error, 'mongodb');
      }
      
      throw this.errorTranslator.translateError(error, 'mongodb');
    }
  }

  async update(input: UnifiedUpdateInput, options?: UpdateOptions): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.validateConnection();
      this.validateKey(input.key);

      const collection = this.getCollection(input.key);
      const keyQuery = this.convertKeyToMongoQuery(input.key);
      const updateDoc = this.buildUpdateDocument(input);
      
      // Add condition if specified
      let query = keyQuery;
      if (options?.condition) {
        const conditionQuery = this.buildConditionQuery(options.condition);
        query = { ...keyQuery, ...conditionQuery };
      }

      const result = await collection.findOneAndUpdate(
        query,
        updateDoc,
        {
          returnDocument: this.mapReturnValues(options?.returnValues),
          upsert: false
        }
      );

      this.metrics.recordOperation('update', Date.now() - startTime, true, 'mongodb');
      
      return result.value ? this.transformFromMongo(result.value) : null;
    } catch (error) {
      this.metrics.recordOperation('update', Date.now() - startTime, false, 'mongodb');
      throw this.errorTranslator.translateError(error, 'mongodb');
    }
  }

  async delete(key: DatabaseKey, options?: DeleteOptions): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.validateConnection();
      this.validateKey(key);

      const collection = this.getCollection(key);
      const keyQuery = this.convertKeyToMongoQuery(key);
      
      // Add condition if specified
      let query = keyQuery;
      if (options?.condition) {
        const conditionQuery = this.buildConditionQuery(options.condition);
        query = { ...keyQuery, ...conditionQuery };
      }

      const result = await collection.deleteOne(query);
      
      if (result.deletedCount === 0) {
        throw new ItemNotFoundError('Item not found or condition not met', undefined, 'mongodb');
      }
      
      this.metrics.recordOperation('delete', Date.now() - startTime, true, 'mongodb');
    } catch (error) {
      this.metrics.recordOperation('delete', Date.now() - startTime, false, 'mongodb');
      throw this.errorTranslator.translateError(error, 'mongodb');
    }
  }

  // Query Operations
  async query<TResult = any>(input: UnifiedQueryInput): Promise<TResult[]> {
    const startTime = Date.now();
    
    try {
      this.validateConnection();

      const collection = this.getCollectionFromQuery(input);
      const mongoQuery = this.buildMongoQuery(input);
      
      let cursor = collection.find(mongoQuery.filter);
      
      // Apply projection
      if (input.projection) {
        const projection = Object.fromEntries(input.projection.map(field => [field, 1]));
        cursor = cursor.project(projection);
      }
      
      // Apply sorting
      if (mongoQuery.sort) {
        cursor = cursor.sort(mongoQuery.sort);
      }
      
      // Apply limit
      if (input.limit) {
        cursor = cursor.limit(input.limit);
      }
      
      // Apply skip for pagination
      if (input.startKey) {
        const skip = this.calculateSkipFromStartKey(input.startKey);
        cursor = cursor.skip(skip);
      }

      const documents = await cursor.toArray();
      const results = documents.map(doc => this.transformFromMongo(doc));

      this.metrics.recordQueryPerformance('query', Date.now() - startTime, results.length, 'mongodb');
      
      return results;
    } catch (error) {
      this.metrics.recordOperation('query', Date.now() - startTime, false, 'mongodb');
      throw this.errorTranslator.translateError(error, 'mongodb');
    }
  }

  async scan<TResult = any>(input: UnifiedScanInput): Promise<{ items: TResult[], token?: any }> {
    const startTime = Date.now();
    
    try {
      this.validateConnection();

      const collection = this.getCollectionFromScan(input);
      const mongoQuery = input.filterCondition ? 
        this.buildFilterQuery(input.filterCondition) : 
        {};
      
      let cursor = collection.find(mongoQuery);
      
      // Apply projection
      if (input.projection) {
        const projection = Object.fromEntries(input.projection.map(field => [field, 1]));
        cursor = cursor.project(projection);
      }
      
      // Apply limit
      if (input.limit) {
        cursor = cursor.limit(input.limit);
      }
      
      // Apply skip for pagination
      if (input.startKey) {
        const skip = this.calculateSkipFromStartKey(input.startKey);
        cursor = cursor.skip(skip);
      }

      const documents = await cursor.toArray();
      const items = documents.map(doc => this.transformFromMongo(doc));
      
      // Generate next token for pagination
      const token = (input.limit && documents.length === input.limit) ? 
        this.generateNextToken(documents) : 
        undefined;

      this.metrics.recordQueryPerformance('scan', Date.now() - startTime, items.length, 'mongodb');
      
      return { items, token };
    } catch (error) {
      this.metrics.recordOperation('scan', Date.now() - startTime, false, 'mongodb');
      throw this.errorTranslator.translateError(error, 'mongodb');
    }
  }

  async batchGet<TResult = any>(keys: DatabaseKey[], options?: BatchOptions): Promise<TResult[]> {
    const startTime = Date.now();
    
    try {
      if (keys.length === 0) {
        return [];
      }

      this.validateConnection();

      // Group keys by collection
      const keysByCollection = this.groupKeysByCollection(keys);
      const results: TResult[] = [];
      
      for (const [collectionName, collectionKeys] of keysByCollection) {
        const collection = this.connectionManager.getDatabase().collection(collectionName);
        
        // Build $or query for all keys
        const orQuery = collectionKeys.map(key => this.convertKeyToMongoQuery(key));
        const mongoQuery = { $or: orQuery };
        
        let cursor = collection.find(mongoQuery);
        
        // Apply projection
        if (options?.projection) {
          const projection = Object.fromEntries(options.projection.map(field => [field, 1]));
          cursor = cursor.project(projection);
        }

        const documents = await cursor.toArray();
        const transformedDocs = documents.map(doc => this.transformFromMongo(doc));
        results.push(...transformedDocs);
      }

      this.metrics.recordOperation('batchGet', Date.now() - startTime, true, 'mongodb');
      
      return results;
    } catch (error) {
      this.metrics.recordOperation('batchGet', Date.now() - startTime, false, 'mongodb');
      throw this.errorTranslator.translateError(error, 'mongodb');
    }
  }

  // Transaction Operations
  async beginTransaction(): Promise<ITransaction> {
    this.validateConnection();
    return new MongoDBTransaction(this, this.connectionManager, this.metrics);
  }

  async executeTransaction(operations: TransactionOperation[]): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (operations.length === 0) {
        return;
      }

      this.validateConnection();

      const session = this.connectionManager.getClient().startSession();
      
      try {
        await session.withTransaction(async () => {
          for (const operation of operations) {
            await this.executeTransactionOperation(operation, session);
          }
        });
      } finally {
        await session.endSession();
      }
      
      this.metrics.recordOperation('transaction', Date.now() - startTime, true, 'mongodb');
    } catch (error) {
      this.metrics.recordOperation('transaction', Date.now() - startTime, false, 'mongodb');
      throw this.errorTranslator.translateError(error, 'mongodb');
    }
  }

  // Provider-specific operations
  async executeNative(operation: any): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.validateConnection();
      
      // Execute native MongoDB operation
      // This is an escape hatch for MongoDB-specific operations
      const result = await operation(this.connectionManager.getDatabase());
      
      this.metrics.recordOperation('native', Date.now() - startTime, true, 'mongodb');
      
      return result;
    } catch (error) {
      this.metrics.recordOperation('native', Date.now() - startTime, false, 'mongodb');
      throw this.errorTranslator.translateError(error, 'mongodb');
    }
  }

  // Helper methods
  private getCollection(keyOrData: any): Collection {
    // Default to primary collection, could be enhanced with logic to determine collection
    const collectionName = this.config.collections.primary;
    return this.connectionManager.getDatabase().collection(collectionName);
  }

  private getCollectionFromQuery(input: UnifiedQueryInput): Collection {
    // Default to primary collection, could be enhanced with logic based on query
    const collectionName = this.config.collections.primary;
    return this.connectionManager.getDatabase().collection(collectionName);
  }

  private getCollectionFromScan(input: UnifiedScanInput): Collection {
    // Default to primary collection, could be enhanced with logic based on scan
    const collectionName = this.config.collections.primary;
    return this.connectionManager.getDatabase().collection(collectionName);
  }

  private convertKeyToMongoQuery(key: DatabaseKey): any {
    return {
      pk: key.primary.toString(),
      sk: key.sort?.toString() || key.primary.toString()
    };
  }

  private extractKeyFromData(data: any): any {
    return {
      pk: data.pk,
      sk: data.sk
    };
  }

  private transformToMongo(data: any): any {
    // Transform data to MongoDB document structure
    const mongoDoc = { ...data };
    
    // Ensure pk and sk are strings
    if (mongoDoc.pk) {
      mongoDoc.pk = mongoDoc.pk.toString();
    }
    if (mongoDoc.sk) {
      mongoDoc.sk = mongoDoc.sk.toString();
    }
    
    // Generate pksk composite key for indexing
    if (mongoDoc.pk && mongoDoc.sk) {
      mongoDoc.pksk = `${mongoDoc.pk}#${mongoDoc.sk}`;
    }
    
    return mongoDoc;
  }

  private transformFromMongo(document: any): any {
    // Transform MongoDB document back to application format
    const result = { ...document };
    
    // Remove MongoDB-specific _id field
    delete result._id;
    
    return result;
  }

  private buildConditionQuery(condition: FilterCondition): any {
    const field = condition.field;
    const value = condition.value;
    
    switch (condition.operator) {
      case '=':
        return { [field]: value };
      case '!=':
        return { [field]: { $ne: value } };
      case '<':
        return { [field]: { $lt: value } };
      case '<=':
        return { [field]: { $lte: value } };
      case '>':
        return { [field]: { $gt: value } };
      case '>=':
        return { [field]: { $gte: value } };
      case 'contains':
        return { [field]: { $regex: value, $options: 'i' } };
      case 'exists':
        return { [field]: { $exists: true } };
      case 'not_exists':
        return { [field]: { $exists: false } };
      case 'in':
        return { [field]: { $in: condition.values || [] } };
      default:
        throw new ValidationError(`Unsupported condition operator: ${condition.operator}`, undefined, 'mongodb');
    }
  }

  private buildUpdateDocument(input: UnifiedUpdateInput): any {
    const updateDoc: any = {};
    
    // Handle regular updates
    if (Object.keys(input.updates).length > 0) {
      updateDoc.$set = { ...input.updates };
      updateDoc.$set.updatedAt = new Date();
    }
    
    // Handle increment fields
    if (input.incrementFields && Object.keys(input.incrementFields).length > 0) {
      updateDoc.$inc = input.incrementFields;
    }
    
    // Handle list operations
    if (input.appendToList && Object.keys(input.appendToList).length > 0) {
      updateDoc.$push = {};
      for (const [field, values] of Object.entries(input.appendToList)) {
        updateDoc.$push[field] = { $each: values };
      }
    }
    
    if (input.removeFromList && Object.keys(input.removeFromList).length > 0) {
      updateDoc.$pullAll = input.removeFromList;
    }
    
    return updateDoc;
  }

  private buildMongoQuery(input: UnifiedQueryInput): { filter: any; sort?: any } {
    let filter: any = {};
    let sort: any = undefined;
    
    // Build key condition
    if (input.keyCondition) {
      const keyFilter = this.buildKeyConditionQuery(input.keyCondition);
      filter = { ...filter, ...keyFilter };
    }
    
    // Build filter condition
    if (input.filterCondition) {
      const filterQuery = this.buildFilterQuery(input.filterCondition);
      filter = { ...filter, ...filterQuery };
    }
    
    // Build sort
    if (input.keyCondition && input.keyCondition.field === 'sk') {
      sort = { sk: input.sortOrder === 'DESC' ? -1 : 1 };
    }
    
    return { filter, sort };
  }

  private buildKeyConditionQuery(condition: KeyCondition): any {
    const field = condition.field;
    const value = condition.value;
    
    switch (condition.operator) {
      case '=':
        return { [field]: value };
      case 'begins_with':
        return { [field]: { $regex: `^${this.escapeRegex(value)}` } };
      case 'between':
        return { [field]: { $gte: value, $lte: condition.value2 } };
      default:
        throw new ValidationError(`Unsupported key condition operator: ${condition.operator}`, undefined, 'mongodb');
    }
  }

  private buildFilterQuery(condition: FilterCondition): any {
    return this.buildConditionQuery(condition);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private mapReturnValues(returnValues?: string): 'before' | 'after' | undefined {
    switch (returnValues) {
      case 'ALL_OLD':
      case 'UPDATED_OLD':
        return 'before';
      case 'ALL_NEW':
      case 'UPDATED_NEW':
        return 'after';
      default:
        return undefined;
    }
  }

  private calculateSkipFromStartKey(startKey: any): number {
    // Simple implementation - in production, this would need more sophisticated pagination
    return startKey.skip || 0;
  }

  private generateNextToken(documents: any[]): any {
    // Simple implementation - in production, this would generate a proper pagination token
    return { skip: documents.length };
  }

  private groupKeysByCollection(keys: DatabaseKey[]): Map<string, DatabaseKey[]> {
    const groups = new Map<string, DatabaseKey[]>();
    
    for (const key of keys) {
      // Default to primary collection
      const collectionName = this.config.collections.primary;
      
      if (!groups.has(collectionName)) {
        groups.set(collectionName, []);
      }
      groups.get(collectionName)!.push(key);
    }
    
    return groups;
  }

  private async executeTransactionOperation(operation: TransactionOperation, session: ClientSession): Promise<void> {
    switch (operation.type) {
      case 'put':
        if (!operation.data) {
          throw new ValidationError('Put operation requires data field', undefined, 'mongodb');
        }
        const collection = this.getCollection(operation.data);
        const mongoDoc = this.transformToMongo(operation.data);
        mongoDoc.createdAt = new Date();
        mongoDoc.updatedAt = new Date();
        await collection.replaceOne(
          this.extractKeyFromData(operation.data),
          mongoDoc,
          { upsert: true, session }
        );
        break;
      
      case 'update':
        if (!operation.updates) {
          throw new ValidationError('Update operation requires updates field', undefined, 'mongodb');
        }
        const updateCollection = this.getCollection(operation.updates.key);
        const keyQuery = this.convertKeyToMongoQuery(operation.updates.key);
        const updateDoc = this.buildUpdateDocument(operation.updates);
        await updateCollection.updateOne(keyQuery, updateDoc, { session });
        break;
      
      case 'delete':
        if (!operation.key) {
          throw new ValidationError('Delete operation requires key field', undefined, 'mongodb');
        }
        const deleteCollection = this.getCollection(operation.key);
        const deleteQuery = this.convertKeyToMongoQuery(operation.key);
        await deleteCollection.deleteOne(deleteQuery, { session });
        break;
      
      case 'conditionCheck':
        if (!operation.key) {
          throw new ValidationError('Condition check operation requires key field', undefined, 'mongodb');
        }
        const checkCollection = this.getCollection(operation.key);
        const checkQuery = this.convertKeyToMongoQuery(operation.key);
        
        if (operation.condition) {
          const conditionQuery = this.buildConditionQuery(operation.condition);
          Object.assign(checkQuery, conditionQuery);
        }
        
        const document = await checkCollection.findOne(checkQuery, { session });
        if (!document) {
          throw new ValidationError('Condition check failed', undefined, 'mongodb');
        }
        break;
      
      default:
        throw new ValidationError(`Unsupported transaction operation type: ${operation.type}`, undefined, 'mongodb');
    }
  }

  // Getter methods for transaction access
  getConnectionManager(): MongoDBConnectionManager {
    return this.connectionManager;
  }

  getConfig(): MongoDBConfig {
    return this.config as MongoDBConfig;
  }
}

// MongoDB Transaction implementation
class MongoDBTransaction extends BaseTransaction {
  protected provider: MongoDBProvider;
  private connectionManager: MongoDBConnectionManager;
  private metrics: IMetricsCollector;
  private session: ClientSession | null = null;
  private transactionOperations: TransactionOperation[] = [];

  constructor(
    provider: MongoDBProvider, 
    connectionManager: MongoDBConnectionManager, 
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
      if (!this.session) {
        this.session = this.connectionManager.getClient().startSession();
      }

      const collection = this.provider['getCollection'](key);
      const mongoQuery = this.provider['convertKeyToMongoQuery'](key);
      
      const document = await collection.findOne(mongoQuery, { session: this.session });
      
      return document ? this.provider['transformFromMongo'](document) : null;
    } catch (error) {
      throw ErrorTranslatorFactory.translateError(error, 'mongodb');
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

  async conditionCheck(key: DatabaseKey, condition: FilterCondition): Promise<void> {
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

      if (!this.session) {
        this.session = this.connectionManager.getClient().startSession();
      }

      await this.session.withTransaction(async () => {
        for (const operation of this.transactionOperations) {
          await this.provider['executeTransactionOperation'](operation, this.session!);
        }
      });
      
      this.active = false;
      this.metrics.recordOperation('transaction_commit', Date.now() - startTime, true, 'mongodb');
    } catch (error) {
      this.active = false;
      this.metrics.recordOperation('transaction_commit', Date.now() - startTime, false, 'mongodb');
      throw ErrorTranslatorFactory.translateError(error, 'mongodb');
    } finally {
      if (this.session) {
        await this.session.endSession();
        this.session = null;
      }
    }
  }

  async rollback(): Promise<void> {
    this.validateActive();
    
    try {
      // For MongoDB, rollback just means aborting the session and clearing operations
      if (this.session) {
        await this.session.abortTransaction();
        await this.session.endSession();
        this.session = null;
      }
      
      this.transactionOperations = [];
      this.active = false;
      
      this.metrics.recordOperation('transaction_rollback', Date.now(), true, 'mongodb');
    } catch (error) {
      this.active = false;
      throw ErrorTranslatorFactory.translateError(error, 'mongodb');
    }
  }
}