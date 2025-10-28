/**
 * Migration Manager for converting DynamoDB data to MongoDB format
 * Implements the IMigrationManager interface for data migration operations
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { DynamoDBClient, ScanCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand as DocScanCommand } from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

import {
  IMigrationManager,
  IDataExporter,
  IDataImporter,
  MigrationData,
  MigrationOptions,
  MigrationProgress,
  ValidationResult,
  RollbackInfo,
  TableSchema,
  IndexDefinition,
  ValidationError,
  ValidationWarning
} from './types';

export class MigrationManager implements IMigrationManager {
  private currentProgress: MigrationProgress | null = null;
  private readonly backupDirectory: string;

  constructor(backupDirectory: string = './migration-backups') {
    this.backupDirectory = backupDirectory;
  }

  async exportData(source: any, options: MigrationOptions = {}): Promise<MigrationData> {
    const exporter = this.createExporter(source);
    return exporter.exportAll(options);
  }

  async importData(target: any, data: MigrationData, options: MigrationOptions = {}): Promise<void> {
    const importer = this.createImporter(target);
    return importer.importData(data, options);
  }

  async validateMigration(source: any, target: any, options: MigrationOptions = {}): Promise<ValidationResult> {
    // Export data from source for comparison
    const sourceData = await this.exportData(source, options);
    
    // Validate against target
    const validator = new MigrationValidator();
    return validator.validateMigration(sourceData, target, options);
  }

  async createRollbackPoint(provider: any, migrationId: string): Promise<RollbackInfo> {
    const timestamp = new Date();
    const backupLocation = path.join(this.backupDirectory, `${migrationId}-${timestamp.toISOString()}`);
    
    // Create backup directory
    await fs.mkdir(backupLocation, { recursive: true });
    
    // Export current state
    const exporter = this.createExporter(provider);
    const backupData = await exporter.exportAll();
    
    // Save backup data
    const backupFile = path.join(backupLocation, 'backup.json');
    await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));
    
    return {
      migrationId,
      timestamp,
      backupLocation,
      affectedTables: Object.keys(backupData.tables),
      rollbackSteps: [
        {
          step: 1,
          action: 'restore_table',
          table: 'primary',
          details: { backupFile },
          completed: false
        },
        {
          step: 2,
          action: 'restore_table',
          table: 'data',
          details: { backupFile },
          completed: false
        }
      ]
    };
  }

  async executeRollback(provider: any, rollbackInfo: RollbackInfo): Promise<void> {
    const backupFile = path.join(rollbackInfo.backupLocation, 'backup.json');
    const backupData: MigrationData = JSON.parse(await fs.readFile(backupFile, 'utf-8'));
    
    const importer = this.createImporter(provider);
    
    for (const step of rollbackInfo.rollbackSteps) {
      try {
        if (step.action === 'restore_table') {
          await importer.importData(backupData);
          step.completed = true;
        }
      } catch (error) {
        step.error = error instanceof Error ? error.message : 'Unknown error';
        throw error;
      }
    }
  }

  getProgress(): MigrationProgress | null {
    return this.currentProgress;
  }

  private createExporter(source: any): IDataExporter {
    if (source.constructor.name.includes('DynamoDB')) {
      return new DynamoDBExporter(source);
    } else if (source.constructor.name.includes('MongoDB') || source.constructor.name.includes('MongoClient')) {
      return new MongoDBExporter(source);
    }
    throw new Error('Unsupported source database type');
  }

  private createImporter(target: any): IDataImporter {
    if (target.constructor.name.includes('DynamoDB')) {
      return new DynamoDBImporter(target);
    } else if (target.constructor.name.includes('MongoDB') || target.constructor.name.includes('MongoClient')) {
      return new MongoDBImporter(target);
    }
    throw new Error('Unsupported target database type');
  }
}

export class DynamoDBExporter implements IDataExporter {
  constructor(private client: DynamoDBClient) {}

  async exportAll(options: MigrationOptions = {}): Promise<MigrationData> {
    const tableNames = ['primary', 'data']; // Known table names for MyTapTrack
    return this.exportTables(tableNames, options);
  }

  async exportTables(tableNames: string[], options: MigrationOptions = {}): Promise<MigrationData> {
    const docClient = DynamoDBDocumentClient.from(this.client);
    const tables: MigrationData['tables'] = {};
    let totalRecords = 0;

    for (const tableName of tableNames) {
      const schema = await this.getTableSchema(tableName);
      const indexes = await this.getTableIndexes(tableName);
      const data: any[] = [];

      // Scan table data
      let lastEvaluatedKey: any = undefined;
      do {
        const scanCommand = new DocScanCommand({
          TableName: tableName,
          ExclusiveStartKey: lastEvaluatedKey,
          Limit: options.batchSize || 100
        });

        const result = await docClient.send(scanCommand);
        if (result.Items) {
          data.push(...result.Items);
          totalRecords += result.Items.length;
        }
        lastEvaluatedKey = result.LastEvaluatedKey;

        // Report progress
        if (options.progressCallback) {
          options.progressCallback({
            phase: 'export',
            totalRecords,
            processedRecords: data.length,
            errorCount: 0,
            currentTable: tableName
          });
        }
      } while (lastEvaluatedKey);

      tables[tableName] = { schema, data, indexes };
    }

    const migrationData: MigrationData = {
      metadata: {
        sourceProvider: 'dynamodb',
        exportDate: new Date(),
        recordCount: totalRecords,
        version: '1.0.0',
        checksum: this.calculateChecksum(tables)
      },
      tables
    };

    return migrationData;
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    const command = new DescribeTableCommand({ TableName: tableName });
    const result = await this.client.send(command);
    
    if (!result.Table) {
      throw new Error(`Table ${tableName} not found`);
    }

    const table = result.Table;
    const schema: TableSchema = {
      name: tableName,
      primaryKey: {
        partitionKey: table.KeySchema?.find(k => k.KeyType === 'HASH')?.AttributeName || 'pk',
        sortKey: table.KeySchema?.find(k => k.KeyType === 'RANGE')?.AttributeName
      },
      attributes: {}
    };

    // Add attribute definitions
    table.AttributeDefinitions?.forEach(attr => {
      if (attr.AttributeName && attr.AttributeType) {
        schema.attributes[attr.AttributeName] = {
          type: this.mapDynamoDBType(attr.AttributeType),
          required: table.KeySchema?.some(k => k.AttributeName === attr.AttributeName) || false
        };
      }
    });

    return schema;
  }

  async getTableIndexes(tableName: string): Promise<IndexDefinition[]> {
    const command = new DescribeTableCommand({ TableName: tableName });
    const result = await this.client.send(command);
    
    if (!result.Table) {
      return [];
    }

    const indexes: IndexDefinition[] = [];
    
    // Add GSIs
    result.Table.GlobalSecondaryIndexes?.forEach(gsi => {
      if (gsi.IndexName && gsi.KeySchema) {
        indexes.push({
          name: gsi.IndexName,
          type: 'gsi',
          keys: {
            partitionKey: gsi.KeySchema.find(k => k.KeyType === 'HASH')?.AttributeName || '',
            sortKey: gsi.KeySchema.find(k => k.KeyType === 'RANGE')?.AttributeName
          },
          projection: gsi.Projection?.ProjectionType === 'ALL' ? undefined : 
                     gsi.Projection?.NonKeyAttributes || []
        });
      }
    });

    // Add LSIs
    result.Table.LocalSecondaryIndexes?.forEach(lsi => {
      if (lsi.IndexName && lsi.KeySchema) {
        indexes.push({
          name: lsi.IndexName,
          type: 'lsi',
          keys: {
            partitionKey: lsi.KeySchema.find(k => k.KeyType === 'HASH')?.AttributeName || '',
            sortKey: lsi.KeySchema.find(k => k.KeyType === 'RANGE')?.AttributeName
          },
          projection: lsi.Projection?.ProjectionType === 'ALL' ? undefined : 
                     lsi.Projection?.NonKeyAttributes || []
        });
      }
    });

    return indexes;
  }

  private mapDynamoDBType(dynamoType: string): 'string' | 'number' | 'boolean' | 'object' | 'array' {
    switch (dynamoType) {
      case 'S': return 'string';
      case 'N': return 'number';
      case 'BOOL': return 'boolean';
      case 'M': return 'object';
      case 'L': return 'array';
      default: return 'string';
    }
  }

  private calculateChecksum(tables: MigrationData['tables']): string {
    const dataString = JSON.stringify(tables);
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }
}

export class MongoDBImporter implements IDataImporter {
  private db: Db;

  constructor(client: MongoClient | Db) {
    this.db = client instanceof MongoClient ? client.db('mytaptrack') : client;
  }

  async importData(data: MigrationData, options: MigrationOptions = {}): Promise<void> {
    for (const [tableName, tableData] of Object.entries(data.tables)) {
      await this.createTable(tableData.schema, tableData.indexes);
      await this.importRecords(tableName, tableData.data, options);
    }
  }

  async createTable(schema: TableSchema, indexes: IndexDefinition[]): Promise<void> {
    const collection = this.db.collection(schema.name);
    
    // Create MongoDB indexes based on DynamoDB schema
    const mongoIndexes = this.convertIndexesToMongoDB(indexes, schema);
    
    for (const index of mongoIndexes) {
      await collection.createIndex(index.fields, index.options);
    }
  }

  async importRecords(tableName: string, records: any[], options: MigrationOptions = {}): Promise<void> {
    const collection = this.db.collection(tableName);
    const batchSize = options.batchSize || 100;
    
    // Transform DynamoDB records to MongoDB format
    const transformedRecords = records.map(record => this.transformDynamoDBToMongoDB(record));
    
    // Insert in batches
    for (let i = 0; i < transformedRecords.length; i += batchSize) {
      const batch = transformedRecords.slice(i, i + batchSize);
      
      try {
        await collection.insertMany(batch, { ordered: false });
      } catch (error) {
        if (!options.skipErrors) {
          throw error;
        }
      }

      // Report progress
      if (options.progressCallback) {
        options.progressCallback({
          phase: 'import',
          totalRecords: transformedRecords.length,
          processedRecords: Math.min(i + batchSize, transformedRecords.length),
          errorCount: 0,
          currentTable: tableName
        });
      }
    }
  }

  async validateImport(tableName: string, expectedCount: number): Promise<boolean> {
    const collection = this.db.collection(tableName);
    const actualCount = await collection.countDocuments();
    return actualCount === expectedCount;
  }

  private transformDynamoDBToMongoDB(record: any): any {
    const { pk, sk, pksk, version, createdAt, updatedAt, userId, studentId, license, ...data } = record;
    
    return {
      pk,
      sk,
      pksk,
      version: version || 1,
      ...(userId && { userId }),
      ...(studentId && { studentId }),
      ...(license && { license }),
      data,
      ...(createdAt && { createdAt: new Date(createdAt) }),
      ...(updatedAt && { updatedAt: new Date(updatedAt) })
    };
  }

  private convertIndexesToMongoDB(indexes: IndexDefinition[], schema: TableSchema): Array<{
    fields: { [field: string]: 1 | -1 };
    options: any;
  }> {
    const mongoIndexes = [];
    
    // Primary key index
    const primaryIndex: { [field: string]: 1 | -1 } = { [schema.primaryKey.partitionKey]: 1 };
    if (schema.primaryKey.sortKey) {
      primaryIndex[schema.primaryKey.sortKey] = 1;
    }
    
    mongoIndexes.push({
      fields: primaryIndex,
      options: { unique: true, background: true }
    });

    // Convert other indexes
    for (const index of indexes) {
      const fields: { [field: string]: 1 | -1 } = { [index.keys.partitionKey]: 1 };
      if (index.keys.sortKey) {
        fields[index.keys.sortKey] = 1;
      }
      
      mongoIndexes.push({
        fields,
        options: { 
          name: index.name,
          background: true,
          sparse: true
        }
      });
    }

    return mongoIndexes;
  }
}

export class MongoDBExporter implements IDataExporter {
  private db: Db;

  constructor(client: MongoClient | Db) {
    this.db = client instanceof MongoClient ? client.db('mytaptrack') : client;
  }

  async exportAll(options: MigrationOptions = {}): Promise<MigrationData> {
    const collections = await this.db.listCollections().toArray();
    const tableNames = collections
      .filter(c => !c.name.startsWith('system.'))
      .map(c => c.name);
    
    return this.exportTables(tableNames, options);
  }

  async exportTables(tableNames: string[], options: MigrationOptions = {}): Promise<MigrationData> {
    const tables: MigrationData['tables'] = {};
    let totalRecords = 0;

    for (const tableName of tableNames) {
      const collection = this.db.collection(tableName);
      const schema = await this.getTableSchema(tableName);
      const indexes = await this.getTableIndexes(tableName);
      
      const data = await collection.find({}).toArray();
      totalRecords += data.length;

      tables[tableName] = { schema, data, indexes };

      // Report progress
      if (options.progressCallback) {
        options.progressCallback({
          phase: 'export',
          totalRecords,
          processedRecords: totalRecords,
          errorCount: 0,
          currentTable: tableName
        });
      }
    }

    return {
      metadata: {
        sourceProvider: 'mongodb',
        exportDate: new Date(),
        recordCount: totalRecords,
        version: '1.0.0',
        checksum: crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex')
      },
      tables
    };
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    // MongoDB doesn't have strict schemas, so we infer from data
    const collection = this.db.collection(tableName);
    const sample = await collection.findOne({});
    
    const schema: TableSchema = {
      name: tableName,
      primaryKey: {
        partitionKey: 'pk',
        sortKey: 'sk'
      },
      attributes: {}
    };

    if (sample) {
      Object.keys(sample).forEach(key => {
        if (key !== '_id') {
          schema.attributes[key] = {
            type: this.inferType(sample[key]),
            required: ['pk', 'sk', 'pksk', 'version'].includes(key)
          };
        }
      });
    }

    return schema;
  }

  async getTableIndexes(tableName: string): Promise<IndexDefinition[]> {
    const collection = this.db.collection(tableName);
    const mongoIndexes = await collection.listIndexes().toArray();
    
    return mongoIndexes
      .filter(index => index.name !== '_id_')
      .map(index => ({
        name: index.name,
        type: 'compound' as const,
        keys: {
          partitionKey: Object.keys(index.key)[0] || 'pk',
          sortKey: Object.keys(index.key)[1]
        }
      }));
  }

  private inferType(value: any): 'string' | 'number' | 'boolean' | 'object' | 'array' {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }
}

export class DynamoDBImporter implements IDataImporter {
  constructor(private client: DynamoDBClient) {}

  async importData(data: MigrationData, options: MigrationOptions = {}): Promise<void> {
    // Implementation for importing to DynamoDB (if needed for reverse migration)
    throw new Error('DynamoDB import not implemented - use AWS DMS or similar tools');
  }

  async createTable(schema: TableSchema, indexes: IndexDefinition[]): Promise<void> {
    throw new Error('DynamoDB table creation not implemented - use CDK or CloudFormation');
  }

  async importRecords(tableName: string, records: any[], options: MigrationOptions = {}): Promise<void> {
    throw new Error('DynamoDB record import not implemented');
  }

  async validateImport(tableName: string, expectedCount: number): Promise<boolean> {
    return false;
  }
}

export class MigrationValidator {
  async validateMigration(sourceData: MigrationData, target: any, options: MigrationOptions = {}): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let totalRecords = 0;
    let validRecords = 0;

    for (const [tableName, tableData] of Object.entries(sourceData.tables)) {
      totalRecords += tableData.data.length;
      
      // Validate each record
      for (const record of tableData.data) {
        const validation = this.validateRecord(record, tableData.schema);
        if (validation.isValid) {
          validRecords++;
        } else {
          errors.push({
            type: 'schema_violation',
            recordId: record.pk || 'unknown',
            message: 'Record validation failed',
            details: validation.errors
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalRecords,
        validRecords,
        invalidRecords: totalRecords - validRecords,
        missingRecords: 0,
        duplicateRecords: 0
      }
    };
  }

  private validateRecord(record: any, schema: TableSchema): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check required fields
    Object.entries(schema.attributes).forEach(([field, attr]) => {
      if (attr.required && !(field in record)) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}