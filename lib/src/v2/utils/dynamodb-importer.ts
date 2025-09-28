/**
 * DynamoDB Data Importer
 * Imports data to DynamoDB for migration purposes
 */

import { 
  IDataImporter, 
  MigrationData, 
  MigrationOptions, 
  TableSchema, 
  IndexDefinition 
} from '../types/migration';
import { IDataAccessLayer, PutOptions } from '../types/database-abstraction';
import { DatabaseLogger } from './database-logger';

export class DynamoDBImporter implements IDataImporter {
  private logger: DatabaseLogger;

  constructor(private provider: IDataAccessLayer) {
    this.logger = new DatabaseLogger('DynamoDBImporter');
  }

  /**
   * Import migration data to DynamoDB
   */
  async importData(data: MigrationData, options: MigrationOptions = {}): Promise<void> {
    this.logger.info('Starting DynamoDB data import', { 
      recordCount: data.metadata.recordCount,
      tableCount: Object.keys(data.tables).length,
      options 
    });

    try {
      for (const [tableName, tableData] of Object.entries(data.tables)) {
        this.logger.info('Importing table', { tableName, recordCount: tableData.data.length });

        // Create table if it doesn't exist (in dry run mode, just log)
        if (options.dryRun) {
          this.logger.info('DRY RUN: Would create table', { tableName, schema: tableData.schema });
        } else {
          await this.createTable(tableData.schema, tableData.indexes);
        }

        // Import records
        await this.importRecords(tableName, tableData.data, options);

        // Validate import
        if (options.validateData && !options.dryRun) {
          const isValid = await this.validateImport(tableName, tableData.data.length);
          if (!isValid) {
            throw new Error(`Import validation failed for table: ${tableName}`);
          }
        }

        this.logger.info('Table import completed', { tableName });
      }

      this.logger.info('DynamoDB import completed successfully');
    } catch (error) {
      this.logger.error('DynamoDB import failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create table with schema and indexes
   */
  async createTable(schema: TableSchema, indexes: IndexDefinition[]): Promise<void> {
    this.logger.info('Creating DynamoDB table', { tableName: schema.name });

    try {
      // In a real implementation, this would use AWS SDK to create the table
      // For now, we'll just log the operation
      this.logger.info('Table creation simulated', { 
        tableName: schema.name,
        primaryKey: schema.primaryKey,
        indexCount: indexes.length
      });

      // Simulate table creation time
      await new Promise(resolve => setTimeout(resolve, 1000));

      this.logger.info('Table created successfully', { tableName: schema.name });
    } catch (error) {
      this.logger.error('Failed to create table', { tableName: schema.name, error: error.message });
      throw error;
    }
  }

  /**
   * Import records to table
   */
  async importRecords(tableName: string, records: any[], options: MigrationOptions = {}): Promise<void> {
    const batchSize = options.batchSize || 25; // DynamoDB batch write limit
    let processedCount = 0;
    let errorCount = 0;

    this.logger.info('Starting record import', { tableName, totalRecords: records.length, batchSize });

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      try {
        if (options.dryRun) {
          this.logger.debug('DRY RUN: Would import batch', { 
            tableName, 
            batchStart: i, 
            batchSize: batch.length 
          });
        } else {
          await this.importBatch(batch, options);
        }

        processedCount += batch.length;

        // Call progress callback if provided
        if (options.progressCallback) {
          options.progressCallback({
            phase: 'import',
            totalRecords: records.length,
            processedRecords: processedCount,
            errorCount,
            currentTable: tableName
          });
        }

        this.logger.debug('Batch imported', { 
          tableName, 
          batchStart: i, 
          batchSize: batch.length,
          processedCount,
          totalRecords: records.length
        });

      } catch (error) {
        errorCount++;
        this.logger.error('Batch import failed', { 
          tableName, 
          batchStart: i, 
          error: error.message 
        });

        if (!options.skipErrors) {
          throw error;
        }
      }
    }

    this.logger.info('Record import completed', { 
      tableName, 
      totalRecords: records.length,
      processedCount,
      errorCount
    });

    if (errorCount > 0 && !options.skipErrors) {
      throw new Error(`Import completed with ${errorCount} errors`);
    }
  }

  /**
   * Validate imported data
   */
  async validateImport(tableName: string, expectedCount: number): Promise<boolean> {
    this.logger.info('Validating import', { tableName, expectedCount });

    try {
      // In a real implementation, this would scan the table to count records
      // For now, we'll simulate validation
      const actualCount = await this.getRecordCount(tableName);
      
      const isValid = actualCount === expectedCount;
      
      this.logger.info('Import validation completed', { 
        tableName, 
        expectedCount, 
        actualCount, 
        isValid 
      });

      return isValid;
    } catch (error) {
      this.logger.error('Import validation failed', { tableName, error: error.message });
      return false;
    }
  }

  /**
   * Import a batch of records
   */
  private async importBatch(records: any[], options: MigrationOptions): Promise<void> {
    const putOptions: PutOptions = {
      overwrite: true // Allow overwriting existing records during migration
    };

    // Transform records for DynamoDB format
    const transformedRecords = records.map(record => this.transformForDynamoDB(record));

    // Import each record (in a real implementation, this would use batch write)
    for (const record of transformedRecords) {
      try {
        await this.provider.put(record, putOptions);
      } catch (error) {
        this.logger.error('Failed to import record', { 
          recordKey: this.getRecordKey(record), 
          error: error.message 
        });
        
        if (!options.skipErrors) {
          throw error;
        }
      }
    }
  }

  /**
   * Transform record for DynamoDB format
   */
  private transformForDynamoDB(record: any): any {
    const transformed = { ...record };

    // Remove MongoDB-specific fields
    delete transformed._id;

    // Ensure required DynamoDB fields are present
    if (!transformed.pk) {
      throw new Error('Record missing required pk field');
    }

    if (!transformed.sk) {
      transformed.sk = 'default';
    }

    // Generate pksk if not present
    if (!transformed.pksk) {
      transformed.pksk = `${transformed.pk}#${transformed.sk}`;
    }

    // Ensure dates are in ISO string format
    if (transformed.createdAt && transformed.createdAt instanceof Date) {
      transformed.createdAt = transformed.createdAt.toISOString();
    }
    if (transformed.updatedAt && transformed.updatedAt instanceof Date) {
      transformed.updatedAt = transformed.updatedAt.toISOString();
    }

    // Ensure version is a number
    if (transformed.version === undefined) {
      transformed.version = 1;
    }

    // Remove nested data structure if present (flatten for DynamoDB)
    if (transformed.data && typeof transformed.data === 'object') {
      Object.assign(transformed, transformed.data);
      delete transformed.data;
    }

    return transformed;
  }

  /**
   * Get record key for logging
   */
  private getRecordKey(record: any): string {
    return `${record.pk}#${record.sk || 'default'}`;
  }

  /**
   * Get record count from table (simulated)
   */
  private async getRecordCount(tableName: string): Promise<number> {
    // In a real implementation, this would scan the table to count records
    // For now, we'll simulate by returning a random count
    await new Promise(resolve => setTimeout(resolve, 500));
    return Math.floor(Math.random() * 1000) + 500;
  }
}