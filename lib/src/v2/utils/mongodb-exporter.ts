/**
 * MongoDB Data Exporter
 * Exports data from MongoDB for migration purposes
 */

import { 
  IDataExporter, 
  MigrationData, 
  MigrationOptions, 
  TableSchema, 
  IndexDefinition 
} from '../types/migration';
import { IDataAccessLayer, UnifiedScanInput } from '../types/database-abstraction';
import { LoggerFactory } from './database-logger';

export class MongoDBExporter implements IDataExporter {
  private logger: any;

  constructor(private provider: IDataAccessLayer) {
    this.logger = LoggerFactory.getLogger('MongoDBExporter');
  }

  /**
   * Export all data from MongoDB
   */
  async exportAll(options: MigrationOptions = {}): Promise<MigrationData> {
    this.logger.info('Starting MongoDB data export', { options });

    try {
      const migrationData: MigrationData = {
        metadata: {
          sourceProvider: 'mongodb',
          exportDate: new Date(),
          recordCount: 0,
          version: '1.0.0',
          checksum: '' // Will be calculated by migration manager
        },
        tables: {}
      };

      // Get list of collections to export
      const collectionNames = await this.getCollectionNames();
      
      for (const collectionName of collectionNames) {
        this.logger.info('Exporting collection', { collectionName });

        const schema = await this.getTableSchema(collectionName);
        const indexes = await this.getTableIndexes(collectionName);
        const data = await this.exportCollectionData(collectionName, options);

        migrationData.tables[collectionName] = {
          schema,
          data,
          indexes
        };

        migrationData.metadata.recordCount += data.length;

        this.logger.info('Collection export completed', { 
          collectionName, 
          recordCount: data.length 
        });
      }

      this.logger.info('MongoDB export completed', { 
        totalCollections: collectionNames.length,
        totalRecords: migrationData.metadata.recordCount 
      });

      return migrationData;
    } catch (error) {
      this.logger.error('MongoDB export failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Export specific collections
   */
  async exportTables(collectionNames: string[], options: MigrationOptions = {}): Promise<MigrationData> {
    this.logger.info('Starting selective MongoDB export', { collectionNames, options });

    const migrationData: MigrationData = {
      metadata: {
        sourceProvider: 'mongodb',
        exportDate: new Date(),
        recordCount: 0,
        version: '1.0.0',
        checksum: ''
      },
      tables: {}
    };

    for (const collectionName of collectionNames) {
      const schema = await this.getTableSchema(collectionName);
      const indexes = await this.getTableIndexes(collectionName);
      const data = await this.exportCollectionData(collectionName, options);

      migrationData.tables[collectionName] = {
        schema,
        data,
        indexes
      };

      migrationData.metadata.recordCount += data.length;
    }

    return migrationData;
  }

  /**
   * Get collection schema information
   */
  async getTableSchema(collectionName: string): Promise<TableSchema> {
    this.logger.debug('Getting collection schema', { collectionName });

    // MongoDB collections are schema-less, but we can infer schema from the data model
    const schema: TableSchema = {
      name: collectionName,
      primaryKey: {
        partitionKey: 'pk',
        sortKey: 'sk'
      },
      attributes: {
        _id: { type: 'string', required: true },
        pk: { type: 'string', required: true },
        sk: { type: 'string', required: true },
        pksk: { type: 'string', required: false },
        userId: { type: 'string', required: false },
        usk: { type: 'string', required: false },
        license: { type: 'string', required: false },
        data: { type: 'object', required: false },
        version: { type: 'number', required: false },
        createdAt: { type: 'string', required: false },
        updatedAt: { type: 'string', required: false }
      }
    };

    return schema;
  }

  /**
   * Get collection indexes
   */
  async getTableIndexes(collectionName: string): Promise<IndexDefinition[]> {
    this.logger.debug('Getting collection indexes', { collectionName });

    // Return common indexes used in MongoDB collections
    const indexes: IndexDefinition[] = [
      {
        name: '_id_',
        type: 'primary',
        keys: {
          partitionKey: '_id'
        }
      },
      {
        name: 'pk_sk_compound',
        type: 'compound',
        keys: {
          partitionKey: 'pk',
          sortKey: 'sk'
        }
      },
      {
        name: 'pksk_index',
        type: 'compound',
        keys: {
          partitionKey: 'pksk'
        }
      },
      {
        name: 'user_index',
        type: 'compound',
        keys: {
          partitionKey: 'userId',
          sortKey: 'usk'
        }
      }
    ];

    return indexes;
  }

  /**
   * Export data from a specific collection
   */
  private async exportCollectionData(collectionName: string, options: MigrationOptions): Promise<any[]> {
    const batchSize = options.batchSize || 1000;
    const allRecords: any[] = [];
    let skip = 0;

    while (true) {
      const scanInput: UnifiedScanInput = {
        limit: batchSize,
        startKey: { skip }
      };

      try {
        const result = await this.provider.scan(scanInput);
        
        if (!result.items || result.items.length === 0) {
          break; // No more records
        }

        // Transform MongoDB documents for migration
        const transformedItems = result.items.map(item => this.transformMongoDBDocument(item));
        allRecords.push(...transformedItems);

        this.logger.debug('Scanned batch', { 
          collectionName, 
          batchSize: result.items.length,
          totalSoFar: allRecords.length 
        });

        // Call progress callback if provided
        if (options.progressCallback) {
          options.progressCallback({
            phase: 'export',
            totalRecords: 0, // Unknown for scan
            processedRecords: allRecords.length,
            errorCount: 0,
            currentTable: collectionName
          });
        }

        // If we got fewer items than requested, we're done
        if (result.items.length < batchSize) {
          break;
        }

        skip += batchSize;

      } catch (error) {
        this.logger.error('Error scanning collection', { collectionName, error: error.message });
        
        if (!options.skipErrors) {
          throw error;
        }
        
        // Skip this batch and continue
        break;
      }
    }

    return allRecords;
  }

  /**
   * Transform MongoDB document for migration
   */
  private transformMongoDBDocument(document: any): any {
    const transformed = { ...document };

    // Convert MongoDB ObjectId to string if present
    if (transformed._id && typeof transformed._id === 'object' && transformed._id.toString) {
      transformed._id = transformed._id.toString();
    }

    // Flatten nested data structure if present
    if (transformed.data && typeof transformed.data === 'object') {
      // Merge data fields into the main document for compatibility
      Object.assign(transformed, transformed.data);
    }

    // Ensure dates are properly formatted
    if (transformed.createdAt) {
      transformed.createdAt = new Date(transformed.createdAt);
    }
    if (transformed.updatedAt) {
      transformed.updatedAt = new Date(transformed.updatedAt);
    }

    // Ensure version is a number
    if (transformed.version && typeof transformed.version === 'string') {
      transformed.version = parseInt(transformed.version, 10);
    }

    return transformed;
  }

  /**
   * Get list of collection names to export
   */
  private async getCollectionNames(): Promise<string[]> {
    // In a real implementation, this would list all collections in the MongoDB database
    // For MyTapTrack, we know the main collections
    return ['primary-collection', 'data-collection'];
  }
}