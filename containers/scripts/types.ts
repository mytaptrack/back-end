/**
 * Local type definitions for migration scripts
 * Simplified versions of the types from the main lib
 */

// Migration system types
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

export interface IndexDefinition {
  name: string;
  type: 'primary' | 'gsi' | 'lsi' | 'compound' | 'text';
  keys: {
    partitionKey: string;
    sortKey?: string;
  };
  projection?: string[];
}

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

export interface ValidationError {
  type: 'missing_record' | 'data_mismatch' | 'schema_violation' | 'integrity_check_failed';
  recordId: string;
  message: string;
  details: any;
}

export interface ValidationWarning {
  type: 'performance' | 'data_transformation' | 'index_missing';
  message: string;
  details: any;
}

export interface MigrationOptions {
  batchSize?: number;
  includeIndexes?: boolean;
  validateData?: boolean;
  transformData?: boolean;
  skipErrors?: boolean;
  dryRun?: boolean;
  progressCallback?: (progress: MigrationProgress) => void;
}

export interface MigrationProgress {
  phase: 'export' | 'import' | 'validation' | 'rollback';
  totalRecords: number;
  processedRecords: number;
  errorCount: number;
  currentTable?: string;
  estimatedTimeRemaining?: number;
}

export interface RollbackInfo {
  migrationId: string;
  timestamp: Date;
  backupLocation: string;
  affectedTables: string[];
  rollbackSteps: RollbackStep[];
}

export interface RollbackStep {
  step: number;
  action: 'restore_table' | 'delete_records' | 'restore_indexes';
  table: string;
  details: any;
  completed: boolean;
  error?: string;
}

export interface IMigrationManager {
  exportData(source: any, options?: MigrationOptions): Promise<MigrationData>;
  importData(target: any, data: MigrationData, options?: MigrationOptions): Promise<void>;
  validateMigration(source: any, target: any, options?: MigrationOptions): Promise<ValidationResult>;
  createRollbackPoint(provider: any, migrationId: string): Promise<RollbackInfo>;
  executeRollback(provider: any, rollbackInfo: RollbackInfo): Promise<void>;
  getProgress(): MigrationProgress | null;
}

export interface IDataExporter {
  exportAll(options?: MigrationOptions): Promise<MigrationData>;
  exportTables(tableNames: string[], options?: MigrationOptions): Promise<MigrationData>;
  getTableSchema(tableName: string): Promise<TableSchema>;
  getTableIndexes(tableName: string): Promise<IndexDefinition[]>;
}

export interface IDataImporter {
  importData(data: MigrationData, options?: MigrationOptions): Promise<void>;
  createTable(schema: TableSchema, indexes: IndexDefinition[]): Promise<void>;
  importRecords(tableName: string, records: any[], options?: MigrationOptions): Promise<void>;
  validateImport(tableName: string, expectedCount: number): Promise<boolean>;
}