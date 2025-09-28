/**
 * Migration Manager Implementation
 * Handles data migration between DynamoDB and MongoDB providers
 */

import { createHash } from 'crypto';
import { 
  IMigrationManager, 
  MigrationData, 
  MigrationOptions, 
  MigrationProgress, 
  ValidationResult, 
  ValidationError, 
  ValidationWarning,
  RollbackInfo,
  RollbackStep,
  IDataExporter,
  IDataImporter
} from '../types/migration';
import { IDataAccessLayer } from '../types/database-abstraction';
import { DatabaseLogger } from './database-logger';
import { DynamoDBExporter } from './dynamodb-exporter';
import { MongoDBExporter } from './mongodb-exporter';
import { DynamoDBImporter } from './dynamodb-importer';
import { MongoDBImporter } from './mongodb-importer';

export class MigrationManager implements IMigrationManager {
  private logger: DatabaseLogger;
  private currentProgress: MigrationProgress | null = null;

  constructor() {
    this.logger = new DatabaseLogger('MigrationManager');
  }

  /**
   * Export data from source database
   */
  async exportData(source: IDataAccessLayer, options: MigrationOptions = {}): Promise<MigrationData> {
    this.logger.info('Starting data export', { provider: source.getProviderType(), options });

    try {
      this.currentProgress = {
        phase: 'export',
        totalRecords: 0,
        processedRecords: 0,
        errorCount: 0
      };

      const exporter = this.createExporter(source);
      const migrationData = await exporter.exportAll(options);

      // Calculate checksum for data integrity
      migrationData.metadata.checksum = this.calculateChecksum(migrationData);
      migrationData.metadata.version = '1.0.0';

      this.logger.info('Data export completed', {
        recordCount: migrationData.metadata.recordCount,
        checksum: migrationData.metadata.checksum
      });

      return migrationData;
    } catch (error) {
      this.logger.error('Data export failed', { error: error.message });
      throw error;
    } finally {
      this.currentProgress = null;
    }
  }

  /**
   * Import data to target database
   */
  async importData(
    target: IDataAccessLayer, 
    data: MigrationData, 
    options: MigrationOptions = {}
  ): Promise<void> {
    this.logger.info('Starting data import', { 
      provider: target.getProviderType(), 
      recordCount: data.metadata.recordCount,
      options 
    });

    try {
      // Validate data integrity
      const calculatedChecksum = this.calculateChecksum(data);
      if (calculatedChecksum !== data.metadata.checksum) {
        throw new Error('Data integrity check failed: checksum mismatch');
      }

      this.currentProgress = {
        phase: 'import',
        totalRecords: data.metadata.recordCount,
        processedRecords: 0,
        errorCount: 0
      };

      const importer = this.createImporter(target);
      await importer.importData(data, options);

      this.logger.info('Data import completed successfully');
    } catch (error) {
      this.logger.error('Data import failed', { error: error.message });
      throw error;
    } finally {
      this.currentProgress = null;
    }
  }

  /**
   * Validate migration between source and target
   */
  async validateMigration(
    source: IDataAccessLayer,
    target: IDataAccessLayer,
    options: MigrationOptions = {}
  ): Promise<ValidationResult> {
    this.logger.info('Starting migration validation', {
      sourceProvider: source.getProviderType(),
      targetProvider: target.getProviderType()
    });

    try {
      this.currentProgress = {
        phase: 'validation',
        totalRecords: 0,
        processedRecords: 0,
        errorCount: 0
      };

      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        summary: {
          totalRecords: 0,
          validRecords: 0,
          invalidRecords: 0,
          missingRecords: 0,
          duplicateRecords: 0
        }
      };

      // Export data from both sources for comparison
      const sourceData = await this.exportData(source, options);
      const targetData = await this.exportData(target, options);

      // Validate record counts
      if (sourceData.metadata.recordCount !== targetData.metadata.recordCount) {
        result.errors.push({
          type: 'missing_record',
          recordId: 'TOTAL_COUNT',
          message: `Record count mismatch: source=${sourceData.metadata.recordCount}, target=${targetData.metadata.recordCount}`,
          details: { sourceCount: sourceData.metadata.recordCount, targetCount: targetData.metadata.recordCount }
        });
      }

      // Validate each table
      for (const tableName of Object.keys(sourceData.tables)) {
        const sourceTable = sourceData.tables[tableName];
        const targetTable = targetData.tables[tableName];

        if (!targetTable) {
          result.errors.push({
            type: 'missing_record',
            recordId: tableName,
            message: `Table missing in target: ${tableName}`,
            details: { tableName }
          });
          continue;
        }

        // Validate records in table
        await this.validateTableRecords(sourceTable.data, targetTable.data, tableName, result);
      }

      // Update summary
      result.summary.totalRecords = sourceData.metadata.recordCount;
      result.summary.invalidRecords = result.errors.length;
      result.summary.validRecords = result.summary.totalRecords - result.summary.invalidRecords;
      result.valid = result.errors.length === 0;

      this.logger.info('Migration validation completed', {
        valid: result.valid,
        errorCount: result.errors.length,
        warningCount: result.warnings.length
      });

      return result;
    } catch (error) {
      this.logger.error('Migration validation failed', { error: error.message });
      throw error;
    } finally {
      this.currentProgress = null;
    }
  }

  /**
   * Create rollback point before migration
   */
  async createRollbackPoint(provider: IDataAccessLayer, migrationId: string): Promise<RollbackInfo> {
    this.logger.info('Creating rollback point', { migrationId, provider: provider.getProviderType() });

    try {
      // Export current state for rollback
      const backupData = await this.exportData(provider);
      const backupLocation = `rollback-${migrationId}-${Date.now()}.json`;

      // Store backup data (in real implementation, this would be stored in S3 or similar)
      // For now, we'll just log the location
      this.logger.info('Backup data exported', { backupLocation, recordCount: backupData.metadata.recordCount });

      const rollbackInfo: RollbackInfo = {
        migrationId,
        timestamp: new Date(),
        backupLocation,
        affectedTables: Object.keys(backupData.tables),
        rollbackSteps: Object.keys(backupData.tables).map((tableName, index) => ({
          step: index + 1,
          action: 'restore_table',
          table: tableName,
          details: { recordCount: backupData.tables[tableName].data.length },
          completed: false
        }))
      };

      return rollbackInfo;
    } catch (error) {
      this.logger.error('Failed to create rollback point', { error: error.message, migrationId });
      throw error;
    }
  }

  /**
   * Execute rollback to previous state
   */
  async executeRollback(provider: IDataAccessLayer, rollbackInfo: RollbackInfo): Promise<void> {
    this.logger.info('Starting rollback execution', { 
      migrationId: rollbackInfo.migrationId,
      provider: provider.getProviderType()
    });

    try {
      this.currentProgress = {
        phase: 'rollback',
        totalRecords: rollbackInfo.rollbackSteps.length,
        processedRecords: 0,
        errorCount: 0
      };

      // In a real implementation, we would restore from the backup location
      // For now, we'll simulate the rollback process
      for (const step of rollbackInfo.rollbackSteps) {
        try {
          this.logger.info('Executing rollback step', { step: step.step, action: step.action, table: step.table });

          // Simulate rollback action
          await this.executeRollbackStep(provider, step);

          step.completed = true;
          this.currentProgress!.processedRecords++;

          this.logger.info('Rollback step completed', { step: step.step });
        } catch (error) {
          step.error = error.message;
          this.currentProgress!.errorCount++;
          this.logger.error('Rollback step failed', { step: step.step, error: error.message });

          // Continue with other steps even if one fails
        }
      }

      const completedSteps = rollbackInfo.rollbackSteps.filter(s => s.completed).length;
      const failedSteps = rollbackInfo.rollbackSteps.filter(s => s.error).length;

      this.logger.info('Rollback execution completed', {
        totalSteps: rollbackInfo.rollbackSteps.length,
        completedSteps,
        failedSteps
      });

      if (failedSteps > 0) {
        throw new Error(`Rollback partially failed: ${failedSteps} steps failed out of ${rollbackInfo.rollbackSteps.length}`);
      }
    } catch (error) {
      this.logger.error('Rollback execution failed', { error: error.message });
      throw error;
    } finally {
      this.currentProgress = null;
    }
  }

  /**
   * Get current migration progress
   */
  getProgress(): MigrationProgress | null {
    return this.currentProgress;
  }

  /**
   * Create appropriate exporter for the provider
   */
  private createExporter(provider: IDataAccessLayer): IDataExporter {
    const providerType = provider.getProviderType();
    
    switch (providerType) {
      case 'dynamodb':
        return new DynamoDBExporter(provider);
      case 'mongodb':
        return new MongoDBExporter(provider);
      default:
        throw new Error(`Unsupported provider type for export: ${providerType}`);
    }
  }

  /**
   * Create appropriate importer for the provider
   */
  private createImporter(provider: IDataAccessLayer): IDataImporter {
    const providerType = provider.getProviderType();
    
    switch (providerType) {
      case 'dynamodb':
        return new DynamoDBImporter(provider);
      case 'mongodb':
        return new MongoDBImporter(provider);
      default:
        throw new Error(`Unsupported provider type for import: ${providerType}`);
    }
  }

  /**
   * Calculate checksum for data integrity verification
   */
  private calculateChecksum(data: MigrationData): string {
    const dataString = JSON.stringify(data.tables);
    return createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Validate records between source and target tables
   */
  private async validateTableRecords(
    sourceRecords: any[],
    targetRecords: any[],
    tableName: string,
    result: ValidationResult
  ): Promise<void> {
    const sourceMap = new Map();
    const targetMap = new Map();

    // Create maps for efficient lookup
    sourceRecords.forEach(record => {
      const key = this.generateRecordKey(record);
      sourceMap.set(key, record);
    });

    targetRecords.forEach(record => {
      const key = this.generateRecordKey(record);
      targetMap.set(key, record);
    });

    // Check for missing records in target
    for (const [key, sourceRecord] of sourceMap) {
      if (!targetMap.has(key)) {
        result.errors.push({
          type: 'missing_record',
          recordId: key,
          message: `Record missing in target table ${tableName}`,
          details: { tableName, recordKey: key }
        });
        result.summary.missingRecords++;
      } else {
        // Validate record data
        const targetRecord = targetMap.get(key);
        if (!this.recordsEqual(sourceRecord, targetRecord)) {
          result.errors.push({
            type: 'data_mismatch',
            recordId: key,
            message: `Data mismatch in table ${tableName}`,
            details: { tableName, recordKey: key, source: sourceRecord, target: targetRecord }
          });
        }
      }
    }

    // Check for extra records in target
    for (const [key] of targetMap) {
      if (!sourceMap.has(key)) {
        result.warnings.push({
          type: 'data_transformation',
          message: `Extra record found in target table ${tableName}`,
          details: { tableName, recordKey: key }
        });
      }
    }
  }

  /**
   * Generate a unique key for record comparison
   */
  private generateRecordKey(record: any): string {
    // Use pk and sk if available, otherwise use a hash of the record
    if (record.pk && record.sk) {
      return `${record.pk}#${record.sk}`;
    } else if (record.pk) {
      return record.pk;
    } else {
      return createHash('md5').update(JSON.stringify(record)).digest('hex');
    }
  }

  /**
   * Compare two records for equality
   */
  private recordsEqual(record1: any, record2: any): boolean {
    // Simple deep comparison - in production, this might need more sophisticated logic
    return JSON.stringify(record1) === JSON.stringify(record2);
  }

  /**
   * Execute a single rollback step
   */
  private async executeRollbackStep(provider: IDataAccessLayer, step: RollbackStep): Promise<void> {
    switch (step.action) {
      case 'restore_table':
        // In a real implementation, this would restore table data from backup
        this.logger.info('Simulating table restore', { table: step.table });
        break;
      case 'delete_records':
        // Delete records that were added during migration
        this.logger.info('Simulating record deletion', { table: step.table });
        break;
      case 'restore_indexes':
        // Restore original indexes
        this.logger.info('Simulating index restoration', { table: step.table });
        break;
      default:
        throw new Error(`Unknown rollback action: ${step.action}`);
    }

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}