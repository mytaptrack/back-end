/**
 * Migration system types for data access abstraction layer
 * Supports migration between DynamoDB and MongoDB providers
 */

import { IDataAccessLayer } from './database-abstraction';

/**
 * Migration data structure containing exported data and metadata
 */
export interface MigrationData {
  metadata: {
    sourceProvider: 'dynamodb' | 'mongodb';
    targetProvider?: 'dynamodb' | 'mongodb';
    exportDate: Date;
    recordCount: number;
    version: string;
    checksum: string;
  };
  tables: {
    [tableName: string]: {
      schema: TableSchema;
      data: any[];
      indexes: IndexDefinition[];
    };
  };
}

/**
 * Table schema definition for migration
 */
export interface TableSchema {
  name: string;
  primaryKey: {
    partitionKey: string;
    sortKey?: string;
  };
  attributes: {
    [attributeName: string]: {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required: boolean;
    };
  };
}

/**
 * Index definition for migration
 */
export interface IndexDefinition {
  name: string;
  type: 'primary' | 'gsi' | 'lsi' | 'compound' | 'text';
  keys: {
    partitionKey: string;
    sortKey?: string;
  };
  projection?: string[];
}

/**
 * Migration validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: {
    totalRecords: number;
    validRecords: number;
    invalidRecords: number;
    missingRecords: number;
    duplicateRecords: number;
  };
}

/**
 * Validation error details
 */
export interface ValidationError {
  type: 'missing_record' | 'data_mismatch' | 'schema_violation' | 'integrity_check_failed';
  recordId: string;
  message: string;
  details: any;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  type: 'performance' | 'data_transformation' | 'index_missing';
  message: string;
  details: any;
}

/**
 * Migration options for export/import operations
 */
export interface MigrationOptions {
  batchSize?: number;
  includeIndexes?: boolean;
  validateData?: boolean;
  transformData?: boolean;
  skipErrors?: boolean;
  dryRun?: boolean;
  progressCallback?: (progress: MigrationProgress) => void;
}

/**
 * Migration progress tracking
 */
export interface MigrationProgress {
  phase: 'export' | 'import' | 'validation' | 'rollback';
  totalRecords: number;
  processedRecords: number;
  errorCount: number;
  currentTable?: string;
  estimatedTimeRemaining?: number;
}

/**
 * Migration rollback information
 */
export interface RollbackInfo {
  migrationId: string;
  timestamp: Date;
  backupLocation: string;
  affectedTables: string[];
  rollbackSteps: RollbackStep[];
}

/**
 * Individual rollback step
 */
export interface RollbackStep {
  step: number;
  action: 'restore_table' | 'delete_records' | 'restore_indexes';
  table: string;
  details: any;
  completed: boolean;
  error?: string;
}

/**
 * Migration manager interface
 */
export interface IMigrationManager {
  /**
   * Export data from source database
   */
  exportData(source: IDataAccessLayer, options?: MigrationOptions): Promise<MigrationData>;

  /**
   * Import data to target database
   */
  importData(target: IDataAccessLayer, data: MigrationData, options?: MigrationOptions): Promise<void>;

  /**
   * Validate migration between source and target
   */
  validateMigration(
    source: IDataAccessLayer,
    target: IDataAccessLayer,
    options?: MigrationOptions
  ): Promise<ValidationResult>;

  /**
   * Create rollback point before migration
   */
  createRollbackPoint(provider: IDataAccessLayer, migrationId: string): Promise<RollbackInfo>;

  /**
   * Execute rollback to previous state
   */
  executeRollback(provider: IDataAccessLayer, rollbackInfo: RollbackInfo): Promise<void>;

  /**
   * Get migration progress
   */
  getProgress(): MigrationProgress | null;
}

/**
 * Data exporter interface for provider-specific export logic
 */
export interface IDataExporter {
  /**
   * Export all data from the provider
   */
  exportAll(options?: MigrationOptions): Promise<MigrationData>;

  /**
   * Export specific tables
   */
  exportTables(tableNames: string[], options?: MigrationOptions): Promise<MigrationData>;

  /**
   * Get table schema information
   */
  getTableSchema(tableName: string): Promise<TableSchema>;

  /**
   * Get table indexes
   */
  getTableIndexes(tableName: string): Promise<IndexDefinition[]>;
}

/**
 * Data importer interface for provider-specific import logic
 */
export interface IDataImporter {
  /**
   * Import migration data
   */
  importData(data: MigrationData, options?: MigrationOptions): Promise<void>;

  /**
   * Create table with schema
   */
  createTable(schema: TableSchema, indexes: IndexDefinition[]): Promise<void>;

  /**
   * Import records to table
   */
  importRecords(tableName: string, records: any[], options?: MigrationOptions): Promise<void>;

  /**
   * Validate imported data
   */
  validateImport(tableName: string, expectedCount: number): Promise<boolean>;
}