/**
 * Secure Data Access Layer
 * Integrates all security features into a unified DAL wrapper
 */

import {
  IDataAccessLayer,
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
  HealthStatus,
  DatabaseProviderType
} from '../types/database-abstraction';

import {
  IAccessControlProvider,
  SecurityContext,
  createOperationDefinition,
  createResourceDefinition
} from './access-control';

import {
  IFieldEncryption,
  ENCRYPTION_PROFILES
} from './field-encryption';

import {
  IAuditLogger,
  AuditEventType
} from './audit-logger';

import {
  ICredentialManager
} from './credential-manager';

// Security configuration for the DAL
export interface SecurityDALConfig {
  accessControl?: {
    enabled: boolean;
    provider: IAccessControlProvider;
  };
  fieldEncryption?: {
    enabled: boolean;
    provider: IFieldEncryption;
    encryptionProfiles: string[];
    fieldsToEncrypt: string[];
  };
  auditLogging?: {
    enabled: boolean;
    provider: IAuditLogger;
    logAllOperations: boolean;
    logDataAccess: boolean;
  };
  credentialManagement?: {
    enabled: boolean;
    provider: ICredentialManager;
  };
}

// Secure transaction wrapper
export class SecureTransaction implements ITransaction {
  private transaction: ITransaction;
  private securityContext: SecurityContext;
  private secureDAL: SecureDataAccessLayer;

  constructor(
    transaction: ITransaction,
    securityContext: SecurityContext,
    secureDAL: SecureDataAccessLayer
  ) {
    this.transaction = transaction;
    this.securityContext = securityContext;
    this.secureDAL = secureDAL;
  }

  async get<T>(key: DatabaseKey): Promise<T | null> {
    return this.secureDAL.get<T>(key, undefined, this.securityContext);
  }

  async put<T>(data: T, options?: PutOptions): Promise<void> {
    return this.secureDAL.put(data, options, this.securityContext);
  }

  async update(input: UnifiedUpdateInput): Promise<void> {
    return this.secureDAL.update(input, undefined, this.securityContext);
  }

  async delete(key: DatabaseKey, options?: DeleteOptions): Promise<void> {
    return this.secureDAL.delete(key, options, this.securityContext);
  }

  async conditionCheck(key: DatabaseKey, condition: any): Promise<void> {
    // Validate access before condition check
    await this.secureDAL.validateAccess('read', key, this.securityContext);
    return this.transaction.conditionCheck(key, condition);
  }

  async commit(): Promise<void> {
    const startTime = Date.now();
    try {
      await this.transaction.commit();
      
      // Log successful transaction commit
      if (this.secureDAL.config.auditLogging?.enabled) {
        await this.secureDAL.config.auditLogging.provider.logDatabaseOperation(
          'TRANSACTION_COMMIT',
          'COMMIT_TRANSACTION',
          { type: 'transaction', identifier: 'transaction_commit' },
          this.securityContext,
          { success: true, duration: Date.now() - startTime }
        );
      }
    } catch (error) {
      // Log failed transaction commit
      if (this.secureDAL.config.auditLogging?.enabled) {
        await this.secureDAL.config.auditLogging.provider.logDatabaseOperation(
          'TRANSACTION_COMMIT',
          'COMMIT_TRANSACTION',
          { type: 'transaction', identifier: 'transaction_commit' },
          this.securityContext,
          { success: false, error, duration: Date.now() - startTime }
        );
      }
      throw error;
    }
  }

  async rollback(): Promise<void> {
    const startTime = Date.now();
    try {
      await this.transaction.rollback();
      
      // Log transaction rollback
      if (this.secureDAL.config.auditLogging?.enabled) {
        await this.secureDAL.config.auditLogging.provider.logDatabaseOperation(
          'TRANSACTION_ROLLBACK',
          'ROLLBACK_TRANSACTION',
          { type: 'transaction', identifier: 'transaction_rollback' },
          this.securityContext,
          { success: true, duration: Date.now() - startTime }
        );
      }
    } catch (error) {
      // Log failed transaction rollback
      if (this.secureDAL.config.auditLogging?.enabled) {
        await this.secureDAL.config.auditLogging.provider.logDatabaseOperation(
          'TRANSACTION_ROLLBACK',
          'ROLLBACK_TRANSACTION',
          { type: 'transaction', identifier: 'transaction_rollback' },
          this.securityContext,
          { success: false, error, duration: Date.now() - startTime }
        );
      }
      throw error;
    }
  }

  isActive(): boolean {
    return this.transaction.isActive();
  }
}

// Main secure DAL implementation
export class SecureDataAccessLayer implements IDataAccessLayer {
  private dal: IDataAccessLayer;
  public config: SecurityDALConfig;

  constructor(dal: IDataAccessLayer, config: SecurityDALConfig) {
    this.dal = dal;
    this.config = config;
  }

  // Connection management
  async connect(): Promise<void> {
    return this.dal.connect();
  }

  async disconnect(): Promise<void> {
    return this.dal.disconnect();
  }

  isConnected(): boolean {
    return this.dal.isConnected();
  }

  getProviderType(): DatabaseProviderType {
    return this.dal.getProviderType();
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.dal.healthCheck();
  }

  // CRUD Operations with security
  async get<T>(
    key: DatabaseKey,
    options?: QueryOptions,
    securityContext?: SecurityContext
  ): Promise<T | null> {
    const context = securityContext || this.createDefaultSecurityContext();
    const startTime = Date.now();

    try {
      // Validate access
      await this.validateAccess('read', key, context);

      // Perform the operation
      const result = await this.dal.get<T>(key, options);

      // Decrypt fields if needed
      const decryptedResult = result ? await this.decryptFields(result) : null;

      // Log the operation
      await this.logOperation('READ', 'GET_RECORD', key, context, true, Date.now() - startTime);

      return decryptedResult;
    } catch (error) {
      await this.logOperation('READ', 'GET_RECORD', key, context, false, Date.now() - startTime, error);
      throw error;
    }
  }

  async put<T>(
    data: T,
    options?: PutOptions,
    securityContext?: SecurityContext
  ): Promise<void> {
    const context = securityContext || this.createDefaultSecurityContext();
    const startTime = Date.now();

    try {
      // Extract key for access validation
      const key = this.extractKeyFromData(data);
      
      // Validate access
      await this.validateAccess('write', key, context, data);

      // Encrypt fields if needed
      const encryptedData = await this.encryptFields(data);

      // Perform the operation
      await this.dal.put(encryptedData, options);

      // Log the operation
      await this.logOperation('CREATE', 'PUT_RECORD', key, context, true, Date.now() - startTime);
    } catch (error) {
      const key = this.extractKeyFromData(data);
      await this.logOperation('CREATE', 'PUT_RECORD', key, context, false, Date.now() - startTime, error);
      throw error;
    }
  }

  async update(
    input: UnifiedUpdateInput,
    options?: UpdateOptions,
    securityContext?: SecurityContext
  ): Promise<any> {
    const context = securityContext || this.createDefaultSecurityContext();
    const startTime = Date.now();

    try {
      // Validate access
      await this.validateAccess('write', input.key, context, input.updates);

      // Encrypt fields in updates if needed
      const encryptedInput = {
        ...input,
        updates: await this.encryptFields(input.updates)
      };

      // Perform the operation
      const result = await this.dal.update(encryptedInput, options);

      // Log the operation
      await this.logOperation('UPDATE', 'UPDATE_RECORD', input.key, context, true, Date.now() - startTime);

      return result;
    } catch (error) {
      await this.logOperation('UPDATE', 'UPDATE_RECORD', input.key, context, false, Date.now() - startTime, error);
      throw error;
    }
  }

  async delete(
    key: DatabaseKey,
    options?: DeleteOptions,
    securityContext?: SecurityContext
  ): Promise<void> {
    const context = securityContext || this.createDefaultSecurityContext();
    const startTime = Date.now();

    try {
      // Validate access
      await this.validateAccess('delete', key, context);

      // Perform the operation
      await this.dal.delete(key, options);

      // Log the operation
      await this.logOperation('DELETE', 'DELETE_RECORD', key, context, true, Date.now() - startTime);
    } catch (error) {
      await this.logOperation('DELETE', 'DELETE_RECORD', key, context, false, Date.now() - startTime, error);
      throw error;
    }
  }

  // Query operations with security
  async query<T>(
    input: UnifiedQueryInput,
    securityContext?: SecurityContext
  ): Promise<T[]> {
    const context = securityContext || this.createDefaultSecurityContext();
    const startTime = Date.now();

    try {
      // Validate query access
      await this.validateQueryAccess(input, context);

      // Perform the operation
      const results = await this.dal.query<T>(input);

      // Decrypt fields in results if needed
      const decryptedResults = await Promise.all(
        results.map(result => this.decryptFields(result))
      );

      // Log the operation
      await this.logQueryOperation('QUERY', input, context, true, Date.now() - startTime, results.length);

      return decryptedResults;
    } catch (error) {
      await this.logQueryOperation('QUERY', input, context, false, Date.now() - startTime, 0, error);
      throw error;
    }
  }

  async scan<T>(
    input: UnifiedScanInput,
    securityContext?: SecurityContext
  ): Promise<{ items: T[], token?: any }> {
    const context = securityContext || this.createDefaultSecurityContext();
    const startTime = Date.now();

    try {
      // Validate scan access
      await this.validateScanAccess(input, context);

      // Perform the operation
      const result = await this.dal.scan<T>(input);

      // Decrypt fields in results if needed
      const decryptedItems = await Promise.all(
        result.items.map(item => this.decryptFields(item))
      );

      // Log the operation
      await this.logQueryOperation('SCAN', input, context, true, Date.now() - startTime, result.items.length);

      return { ...result, items: decryptedItems };
    } catch (error) {
      await this.logQueryOperation('SCAN', input, context, false, Date.now() - startTime, 0, error);
      throw error;
    }
  }

  async batchGet<T>(
    keys: DatabaseKey[],
    options?: BatchOptions,
    securityContext?: SecurityContext
  ): Promise<T[]> {
    const context = securityContext || this.createDefaultSecurityContext();
    const startTime = Date.now();

    try {
      // Validate access for all keys
      for (const key of keys) {
        await this.validateAccess('read', key, context);
      }

      // Perform the operation
      const results = await this.dal.batchGet<T>(keys, options);

      // Decrypt fields in results if needed
      const decryptedResults = await Promise.all(
        results.map(result => this.decryptFields(result))
      );

      // Log the operation
      await this.logBatchOperation('BATCH_READ', keys, context, true, Date.now() - startTime, results.length);

      return decryptedResults;
    } catch (error) {
      await this.logBatchOperation('BATCH_READ', keys, context, false, Date.now() - startTime, 0, error);
      throw error;
    }
  }

  // Transaction operations with security
  async beginTransaction(securityContext?: SecurityContext): Promise<ITransaction> {
    const context = securityContext || this.createDefaultSecurityContext();
    const startTime = Date.now();

    try {
      const transaction = await this.dal.beginTransaction();
      
      // Log transaction start
      await this.logOperation('TRANSACTION_START', 'BEGIN_TRANSACTION', 
        { primary: 'transaction' }, context, true, Date.now() - startTime);

      return new SecureTransaction(transaction, context, this);
    } catch (error) {
      await this.logOperation('TRANSACTION_START', 'BEGIN_TRANSACTION', 
        { primary: 'transaction' }, context, false, Date.now() - startTime, error);
      throw error;
    }
  }

  async executeTransaction(
    operations: TransactionOperation[],
    securityContext?: SecurityContext
  ): Promise<void> {
    const context = securityContext || this.createDefaultSecurityContext();
    const startTime = Date.now();

    try {
      // Validate access for all operations
      for (const operation of operations) {
        if (operation.key) {
          const operationType = operation.type === 'put' ? 'write' : 
                               operation.type === 'delete' ? 'delete' : 'read';
          await this.validateAccess(operationType, operation.key, context, operation.data);
        }
      }

      // Encrypt data in operations if needed
      const encryptedOperations = await Promise.all(
        operations.map(async op => ({
          ...op,
          data: op.data ? await this.encryptFields(op.data) : op.data,
          updates: op.updates ? {
            ...op.updates,
            updates: await this.encryptFields(op.updates.updates)
          } : op.updates
        }))
      );

      // Perform the operation
      await this.dal.executeTransaction(encryptedOperations);

      // Log the operation
      await this.logTransactionOperation(operations, context, true, Date.now() - startTime);
    } catch (error) {
      await this.logTransactionOperation(operations, context, false, Date.now() - startTime, error);
      throw error;
    }
  }

  // Provider-specific operations
  async executeNative(operation: any): Promise<any> {
    // Note: Native operations bypass security - use with caution
    console.warn('executeNative bypasses security controls');
    return this.dal.executeNative(operation);
  }

  // Security validation methods
  public async validateAccess(
    operationType: 'read' | 'write' | 'delete',
    key: DatabaseKey,
    context: SecurityContext,
    data?: any
  ): Promise<void> {
    if (!this.config.accessControl?.enabled) {
      return;
    }

    const operation = createOperationDefinition(
      operationType,
      createResourceDefinition('record', this.keyToString(key), { userId: context.userId }),
      data
    );

    const result = await this.config.accessControl.provider.validateAccess(operation, context);
    
    if (!result.allowed) {
      // Log authorization failure
      if (this.config.auditLogging?.enabled) {
        await this.config.auditLogging.provider.logAuthorizationEvent(
          operationType,
          this.keyToString(key),
          false,
          context,
          result.reason
        );
      }
      
      throw new Error(`Access denied: ${result.reason}`);
    }

    // Log successful authorization
    if (this.config.auditLogging?.enabled) {
      await this.config.auditLogging.provider.logAuthorizationEvent(
        operationType,
        this.keyToString(key),
        true,
        context
      );
    }
  }

  private async validateQueryAccess(input: UnifiedQueryInput, context: SecurityContext): Promise<void> {
    if (!this.config.accessControl?.enabled) {
      return;
    }

    const operation = createOperationDefinition(
      'query',
      createResourceDefinition('table', input.indexName || 'primary'),
      input
    );

    const result = await this.config.accessControl.provider.validateAccess(operation, context);
    
    if (!result.allowed) {
      throw new Error(`Query access denied: ${result.reason}`);
    }
  }

  private async validateScanAccess(input: UnifiedScanInput, context: SecurityContext): Promise<void> {
    if (!this.config.accessControl?.enabled) {
      return;
    }

    const operation = createOperationDefinition(
      'scan',
      createResourceDefinition('table', input.indexName || 'primary'),
      input
    );

    const result = await this.config.accessControl.provider.validateAccess(operation, context);
    
    if (!result.allowed) {
      throw new Error(`Scan access denied: ${result.reason}`);
    }
  }

  // Field encryption methods
  private async encryptFields<T>(data: T): Promise<T> {
    if (!this.config.fieldEncryption?.enabled || !data || typeof data !== 'object') {
      return data;
    }

    const fieldsToEncrypt = this.getFieldsToEncrypt();
    return this.config.fieldEncryption.provider.encryptFields(
      data as Record<string, any>,
      fieldsToEncrypt
    ) as T;
  }

  private async decryptFields<T>(data: T): Promise<T> {
    if (!this.config.fieldEncryption?.enabled || !data || typeof data !== 'object') {
      return data;
    }

    return this.config.fieldEncryption.provider.decryptFields(
      data as Record<string, any>
    ) as T;
  }

  private getFieldsToEncrypt(): string[] {
    const fields: string[] = [];
    
    if (this.config.fieldEncryption?.fieldsToEncrypt) {
      fields.push(...this.config.fieldEncryption.fieldsToEncrypt);
    }

    if (this.config.fieldEncryption?.encryptionProfiles) {
      for (const profile of this.config.fieldEncryption.encryptionProfiles) {
        if (profile in ENCRYPTION_PROFILES) {
          fields.push(...ENCRYPTION_PROFILES[profile as keyof typeof ENCRYPTION_PROFILES]);
        }
      }
    }

    return [...new Set(fields)]; // Remove duplicates
  }

  // Audit logging methods
  private async logOperation(
    eventType: AuditEventType,
    operation: string,
    key: DatabaseKey,
    context: SecurityContext,
    success: boolean,
    duration: number,
    error?: Error
  ): Promise<void> {
    if (!this.config.auditLogging?.enabled || !this.config.auditLogging.logAllOperations) {
      return;
    }

    await this.config.auditLogging.provider.logDatabaseOperation(
      eventType,
      operation,
      { type: 'record', identifier: this.keyToString(key) },
      context,
      { success, error, duration }
    );
  }

  private async logQueryOperation(
    eventType: AuditEventType,
    input: UnifiedQueryInput | UnifiedScanInput,
    context: SecurityContext,
    success: boolean,
    duration: number,
    resultCount: number,
    error?: Error
  ): Promise<void> {
    if (!this.config.auditLogging?.enabled) {
      return;
    }

    await this.config.auditLogging.provider.logDatabaseOperation(
      eventType,
      eventType.toLowerCase(),
      { type: 'query', identifier: (input as any).indexName || 'primary' },
      context,
      { success, error, duration },
      {
        dataDetails: {
          recordCount: resultCount,
          queryType: eventType.toLowerCase(),
          indexUsed: (input as any).indexName
        }
      }
    );
  }

  private async logBatchOperation(
    eventType: AuditEventType,
    keys: DatabaseKey[],
    context: SecurityContext,
    success: boolean,
    duration: number,
    resultCount: number,
    error?: Error
  ): Promise<void> {
    if (!this.config.auditLogging?.enabled) {
      return;
    }

    await this.config.auditLogging.provider.logDatabaseOperation(
      eventType,
      'batch_operation',
      { type: 'batch', identifier: `${keys.length}_records` },
      context,
      { success, error, duration },
      {
        dataDetails: {
          recordCount: resultCount,
          recordsRequested: keys.length
        }
      }
    );
  }

  private async logTransactionOperation(
    operations: TransactionOperation[],
    context: SecurityContext,
    success: boolean,
    duration: number,
    error?: Error
  ): Promise<void> {
    if (!this.config.auditLogging?.enabled) {
      return;
    }

    await this.config.auditLogging.provider.logDatabaseOperation(
      'TRANSACTION_COMMIT',
      'execute_transaction',
      { type: 'transaction', identifier: `${operations.length}_operations` },
      context,
      { success, error, duration },
      {
        dataDetails: {
          recordCount: operations.length
        }
      }
    );
  }

  // Utility methods
  private extractKeyFromData(data: any): DatabaseKey {
    if (data && typeof data === 'object') {
      return {
        primary: data.pk || data.id || 'unknown',
        sort: data.sk || data.sortKey
      };
    }
    return { primary: 'unknown' };
  }

  private keyToString(key: DatabaseKey): string {
    return key.sort ? `${key.primary}#${key.sort}` : String(key.primary);
  }

  private createDefaultSecurityContext(): SecurityContext {
    return {
      timestamp: new Date(),
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  // Configuration methods
  updateSecurityConfig(config: Partial<SecurityDALConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getSecurityConfig(): SecurityDALConfig {
    return { ...this.config };
  }
}

// Helper function to create secure DAL
export function createSecureDAL(
  dal: IDataAccessLayer,
  config: SecurityDALConfig
): SecureDataAccessLayer {
  return new SecureDataAccessLayer(dal, config);
}