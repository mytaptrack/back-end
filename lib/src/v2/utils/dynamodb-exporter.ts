/**
 * DynamoDB Data Exporter
 * Exports data from DynamoDB for migration purposes
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

export class DynamoDBExporter implements IDataExporter {
  private logger: any;

  constructor(private provider: IDataAccessLayer) {
    this.logger = LoggerFactory.getLogger('DynamoDBExporter');
  }

  /**
   * Export all data from DynamoDB
   */
  async exportAll(options: MigrationOptions = {}): Promise<MigrationData> {
    this.logger.info('Starting DynamoDB data export', { options });

    try {
      const migrationData: MigrationData = {
        metadata: {
          sourceProvider: 'dynamodb',
          exportDate: new Date(),
          recordCount: 0,
          version: '1.0.0',
          checksum: '' // Will be calculated by migration manager
        },
        tables: {}
      };

      // Get list of tables to export
      const tableNames = await this.getTableNames();
      
      for (const tableName of tableNames) {
        this.logger.info('Exporting table', { tableName });

        const schema = await this.getTableSchema(tableName);
        const indexes = await this.getTableIndexes(tableName);
        const data = await this.exportTableData(tableName, options);

        migrationData.tables[tableName] = {
          schema,
          data,
          indexes
        };

        migrationData.metadata.recordCount += data.length;

        this.logger.info('Table export completed', { 
          tableName, 
          recordCount: data.length 
        });
      }

      this.logger.info('DynamoDB export completed', { 
        totalTables: tableNames.length,
        totalRecords: migrationData.metadata.recordCount 
      });

      return migrationData;
    } catch (error) {
      this.logger.error('DynamoDB export failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Export specific tables
   */
  async exportTables(tableNames: string[], options: MigrationOptions = {}): Promise<MigrationData> {
    this.logger.info('Starting selective DynamoDB export', { tableNames, options });

    const migrationData: MigrationData = {
      metadata: {
        sourceProvider: 'dynamodb',
        exportDate: new Date(),
        recordCount: 0,
        version: '1.0.0',
        checksum: ''
      },
      tables: {}
    };

    for (const tableName of tableNames) {
      const schema = await this.getTableSchema(tableName);
      const indexes = await this.getTableIndexes(tableName);
      const data = await this.exportTableData(tableName, options);

      migrationData.tables[tableName] = {
        schema,
        data,
        indexes
      };

      migrationData.metadata.recordCount += data.length;
    }

    return migrationData;
  }

  /**
   * Get table schema information
   */
  async getTableSchema(tableName: string): Promise<TableSchema> {
    this.logger.debug('Getting table schema', { tableName });

    // In a real implementation, this would use AWS SDK to describe the table
    // For now, we'll return a schema based on the MyTapTrack data model
    const schema: TableSchema = {
      name: tableName,
      primaryKey: {
        partitionKey: 'pk',
        sortKey: 'sk'
      },
      attributes: {
        pk: { type: 'string', required: true },
        sk: { type: 'string', required: true },
        pksk: { type: 'string', required: false },
        userId: { type: 'string', required: false },
        usk: { type: 'string', required: false },
        license: { type: 'string', required: false },
        version: { type: 'number', required: false },
        createdAt: { type: 'string', required: false },
        updatedAt: { type: 'string', required: false }
      }
    };

    return schema;
  }

  /**
   * Get table indexes
   */
  async getTableIndexes(tableName: string): Promise<IndexDefinition[]> {
    this.logger.debug('Getting table indexes', { tableName });

    // Return common indexes used in MyTapTrack
    const indexes: IndexDefinition[] = [
      {
        name: 'primary',
        type: 'primary',
        keys: {
          partitionKey: 'pk',
          sortKey: 'sk'
        }
      },
      {
        name: 'pksk-index',
        type: 'gsi',
        keys: {
          partitionKey: 'pksk'
        }
      },
      {
        name: 'user-index',
        type: 'gsi',
        keys: {
          partitionKey: 'userId',
          sortKey: 'usk'
        }
      }
    ];

    return indexes;
  }

  /**
   * Export data from a specific table
   */
  private async exportTableData(tableName: string, options: MigrationOptions): Promise<any[]> {
    const batchSize = options.batchSize || 1000;
    const allRecords: any[] = [];
    let lastEvaluatedKey: any = undefined;

    do {
      const scanInput: UnifiedScanInput = {
        limit: batchSize,
        startKey: lastEvaluatedKey
      };

      try {
        const result = await this.provider.scan(scanInput);
        
        if (result.items && result.items.length > 0) {
          // Transform DynamoDB items for migration
          const transformedItems = result.items.map(item => this.transformDynamoDBItem(item));
          allRecords.push(...transformedItems);

          this.logger.debug('Scanned batch', { 
            tableName, 
            batchSize: result.items.length,
            totalSoFar: allRecords.length 
          });
        }

        lastEvaluatedKey = result.token;

        // Call progress callback if provided
        if (options.progressCallback) {
          options.progressCallback({
            phase: 'export',
            totalRecords: 0, // Unknown for scan
            processedRecords: allRecords.length,
            errorCount: 0,
            currentTable: tableName
          });
        }

      } catch (error) {
        this.logger.error('Error scanning table', { tableName, error: error.message });
        
        if (!options.skipErrors) {
          throw error;
        }
        
        // Skip this batch and continue
        break;
      }

    } while (lastEvaluatedKey);

    return allRecords;
  }

  /**
   * Transform DynamoDB item for migration
   */
  private transformDynamoDBItem(item: any): any {
    // DynamoDB items are already in the correct format for our abstraction layer
    // Just ensure consistent field types
    const transformed = { ...item };

    // Ensure dates are properly formatted
    if (transformed.createdAt && typeof transformed.createdAt === 'string') {
      transformed.createdAt = new Date(transformed.createdAt);
    }
    if (transformed.updatedAt && typeof transformed.updatedAt === 'string') {
      transformed.updatedAt = new Date(transformed.updatedAt);
    }

    // Ensure version is a number
    if (transformed.version && typeof transformed.version === 'string') {
      transformed.version = parseInt(transformed.version, 10);
    }

    return transformed;
  }

  /**
   * Get list of table names to export
   */
  private async getTableNames(): Promise<string[]> {
    // In a real implementation, this would list all tables in the DynamoDB account
    // For MyTapTrack, we know the main tables
    return ['primary-table', 'data-table'];
  }
}