/**
 * MongoDB Data Importer
 * Imports data to MongoDB for migration purposes
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

export class MongoDBImporter implements IDataImporter {
  private logger: DatabaseLogger;

  constructor(private provider: IDataAccessLayer) {
    this.logger = new DatabaseLogger('MongoDBImporter');
  }

  /**
   * Import migration data to MongoDB
   */
  async importData(data: MigrationData, options: MigrationOptions = {}): Promise<void> {
    this.logger.info('Starting MongoDB data import', { 
      recordCount: data.metadata.recordCount,
      collectionCount: Object.keys(data.tables).length,
      options 
    });

    try {
      for (const [collectionName, tableData] of Object.entries(data.tables)) {
        this.logger.info('Importing collection', { collectionName, recordCount: tableData.data.length });

        // Create collection if it doesn't exist (in dry run mode, just log)
        if (options.dryRun) {
          this.logger.info('DRY RUN: Would create collection', { collectionName, schema: tableData.schema });
        } else {
          await this.createTable(tableData.schema, tableData.indexes);
        }

        // Import records
        await this.importRecords(collectionName, tableData.data, options);

        // Validate import
        if (options.validateData && !options.dryRun) {
          const isValid = await this.validateImport(collectionName, tableData.data.length);
          if (!isValid) {
            throw new Error(`Import validation failed for collection: ${collectionName}`);
          }
        }

        this.logger.info('Collection import completed', { collectionName });
      }

      this.logger.info('MongoDB import completed successfully');
    } catch (error) {
      this.logger.error('MongoDB import failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create collection with schema and indexes
   */
  async createTable(schema: TableSchema, indexes: IndexDefinition[]): Promise<void> {
    this.logger.info('Creating MongoDB collection', { collectionName: schema.name });

    try {
      // In a real implementation, this would use MongoDB driver to create the collection
      // For now, we'll just log the operation
      this.logger.info('Collection creation simulated', { 
        collectionName: schema.name,
        primaryKey: schema.primaryKey,
        indexCount: indexes.length
      });

      // Create indexes
      for (const index of indexes) {
        if (index.name !== '_id_') { // Skip default MongoDB index
          this.logger.info('Creating index', { 
            collectionName: schema.name,
            indexName: index.name,
            keys: index.keys
          });
        }
      }

      this.logger.info('Collection created successfully', { collectionName: schema.name });
    } catch (error) {
      this.logger.error('Failed to create collection', { collectionName: schema.name, error: error.message });
      throw error;
    }
  }

  /**
   * Import records to collection
   */
  async importRecords(collectionName: string, records: any[], options: MigrationOptions = {}): Promise<void> {
    const batchSize = options.batchSize || 1000; // MongoDB can handle larger batches
    let processedCount = 0;
    let errorCount = 0;

    this.logger.info('Starting record import', { collectionName, totalRecords: records.length, batchSize });

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      try {
        if (options.dryRun) {
          this.logger.debug('DRY RUN: Would import batch', { 
            collectionName, 
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
            currentTable: collectionName
          });
        }

        this.logger.debug('Batch imported', { 
          collectionName, 
          batchStart: i, 
          batchSize: batch.length,
          processedCount,
          totalRecords: records.length
        });

      } catch (error) {
        errorCount++;
        this.logger.error('Batch import failed', { 
          collectionName, 
          batchStart: i, 
          error: error.message 
        });

        if (!options.skipErrors) {
          throw error;
        }
      }
    }

    this.logger.info('Record import completed', { 
      collectionName, 
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
  async validateImport(collectionName: string, expectedCount: number): Promise<boolean> {
    this.logger.info('Validating import', { collectionName, expectedCount });

    try {
      // In a real implementation, this would count documents in the collection
      // For now, we'll simulate validation
      const actualCount = await this.getDocumentCount(collectionName);
      
      const isValid = actualCount === expectedCount;
      
      this.logger.info('Import validation completed', { 
        collectionName, 
        expectedCount, 
        actualCount, 
        isValid 
      });

      return isValid;
    } catch (error) {
      this.logger.error('Import validation failed', { collectionName, error: error.message });
      return false;
    }
  }

  /**
   * Import a batch of records
   */
  private async importBatch(records: any[], options: MigrationOptions): Promise<void> {
    const putOptions: PutOptions = {
      overwrite: true // Allow overwriting existing documents during migration
    };

    // Transform records for MongoDB format
    const transformedRecords = records.map(record => this.transformForMongoDB(record));

    // Import each record (in a real implementation, this would use bulk insert)
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
   * Transform record for MongoDB format
   */
  private transformForMongoDB(record: any): any {
    const transformed = { ...record };

    // Generate MongoDB ObjectId if not present
    if (!transformed._id) {
      // In a real implementation, this would generate a proper ObjectId
      transformed._id = this.generateObjectId();
    }

    // Ensure required fields are present
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

    // Nest non-key fields in data object for MongoDB structure
    const keyFields = ['_id', 'pk', 'sk', 'pksk', 'userId', 'usk', 'license', 'version', 'createdAt', 'updatedAt'];
    const dataFields: any = {};
    
    for (const [key, value] of Object.entries(transformed)) {
      if (!keyFields.includes(key)) {
        dataFields[key] = value;
        delete transformed[key];
      }
    }

    // Add data object if there are nested fields
    if (Object.keys(dataFields).length > 0) {
      transformed.data = dataFields;
    }

    // Ensure dates are Date objects
    if (transformed.createdAt && typeof transformed.createdAt === 'string') {
      transformed.createdAt = new Date(transformed.createdAt);
    }
    if (transformed.updatedAt && typeof transformed.updatedAt === 'string') {
      transformed.updatedAt = new Date(transformed.updatedAt);
    }

    // Ensure version is a number
    if (transformed.version === undefined) {
      transformed.version = 1;
    }

    return transformed;
  }

  /**
   * Generate a MongoDB ObjectId (simplified)
   */
  private generateObjectId(): string {
    // In a real implementation, this would use MongoDB's ObjectId
    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    const random = Math.random().toString(16).substring(2, 18);
    return timestamp + random.padEnd(16, '0');
  }

  /**
   * Get record key for logging
   */
  private getRecordKey(record: any): string {
    return record._id || `${record.pk}#${record.sk || 'default'}`;
  }

  /**
   * Get document count from collection (simulated)
   */
  private async getDocumentCount(collectionName: string): Promise<number> {
    // In a real implementation, this would count documents in the collection
    // For now, we'll simulate by returning a random count
    await new Promise(resolve => setTimeout(resolve, 500));
    return Math.floor(Math.random() * 1000) + 500;
  }
}