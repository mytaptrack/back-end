/**
 * Migration Manager Tests
 */

import { MigrationManager } from './migration-manager';
import { DynamoDBProvider } from '../providers/dynamodb-provider';
import { MongoDBProvider } from '../providers/mongodb-provider';
import { MigrationData, MigrationOptions, ValidationResult } from '../types/migration';
import { IDataAccessLayer } from '../types/database-abstraction';

// Mock the providers
jest.mock('../providers/dynamodb-provider');
jest.mock('../providers/mongodb-provider');
jest.mock('./dynamodb-exporter');
jest.mock('./mongodb-exporter');
jest.mock('./dynamodb-importer');
jest.mock('./mongodb-importer');

describe('MigrationManager', () => {
  let migrationManager: MigrationManager;
  let mockDynamoDBProvider: jest.Mocked<IDataAccessLayer>;
  let mockMongoDBProvider: jest.Mocked<IDataAccessLayer>;

  beforeEach(() => {
    migrationManager = new MigrationManager();
    
    mockDynamoDBProvider = {
      getProviderType: jest.fn().mockReturnValue('dynamodb'),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      get: jest.fn(),
      put: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      query: jest.fn(),
      scan: jest.fn(),
      batchGet: jest.fn(),
      beginTransaction: jest.fn(),
      executeNative: jest.fn()
    } as jest.Mocked<IDataAccessLayer>;

    mockMongoDBProvider = {
      getProviderType: jest.fn().mockReturnValue('mongodb'),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      get: jest.fn(),
      put: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      query: jest.fn(),
      scan: jest.fn(),
      batchGet: jest.fn(),
      beginTransaction: jest.fn(),
      executeNative: jest.fn()
    } as jest.Mocked<IDataAccessLayer>;
  });

  describe('exportData', () => {
    it('should export data from DynamoDB provider', async () => {
      const mockExportData: MigrationData = {
        metadata: {
          sourceProvider: 'dynamodb',
          exportDate: new Date(),
          recordCount: 100,
          version: '1.0.0',
          checksum: 'test-checksum'
        },
        tables: {
          'test-table': {
            schema: {
              name: 'test-table',
              primaryKey: { partitionKey: 'pk', sortKey: 'sk' },
              attributes: {
                pk: { type: 'string', required: true },
                sk: { type: 'string', required: true }
              }
            },
            data: [
              { pk: 'user#123', sk: 'profile', name: 'Test User' }
            ],
            indexes: []
          }
        }
      };

      // Mock the createExporter method to return a mock exporter
      const mockExporter = {
        exportAll: jest.fn().mockResolvedValue(mockExportData)
      };
      
      jest.spyOn(migrationManager as any, 'createExporter').mockReturnValue(mockExporter);

      const result = await migrationManager.exportData(mockDynamoDBProvider);

      expect(result).toBeDefined();
      expect(result.metadata.sourceProvider).toBe('dynamodb');
      expect(result.metadata.recordCount).toBe(100);
      expect(result.metadata.checksum).toBeDefined();
    });

    it('should export data from MongoDB provider', async () => {
      const mockExportData: MigrationData = {
        metadata: {
          sourceProvider: 'mongodb',
          exportDate: new Date(),
          recordCount: 50,
          version: '1.0.0',
          checksum: 'test-checksum'
        },
        tables: {
          'test-collection': {
            schema: {
              name: 'test-collection',
              primaryKey: { partitionKey: 'pk', sortKey: 'sk' },
              attributes: {
                _id: { type: 'string', required: true },
                pk: { type: 'string', required: true },
                sk: { type: 'string', required: true }
              }
            },
            data: [
              { _id: '507f1f77bcf86cd799439011', pk: 'user#123', sk: 'profile', name: 'Test User' }
            ],
            indexes: []
          }
        }
      };

      const mockExporter = {
        exportAll: jest.fn().mockResolvedValue(mockExportData)
      };
      
      jest.spyOn(migrationManager as any, 'createExporter').mockReturnValue(mockExporter);

      const result = await migrationManager.exportData(mockMongoDBProvider);

      expect(result).toBeDefined();
      expect(result.metadata.sourceProvider).toBe('mongodb');
      expect(result.metadata.recordCount).toBe(50);
    });

    it('should handle export errors', async () => {
      const mockExporter = {
        exportAll: jest.fn().mockRejectedValue(new Error('Export failed'))
      };
      
      jest.spyOn(migrationManager as any, 'createExporter').mockReturnValue(mockExporter);

      await expect(migrationManager.exportData(mockDynamoDBProvider))
        .rejects.toThrow('Export failed');
    });
  });

  describe('importData', () => {
    let mockMigrationData: MigrationData;

    beforeEach(() => {
      mockMigrationData = {
        metadata: {
          sourceProvider: 'dynamodb',
          exportDate: new Date(),
          recordCount: 10,
          version: '1.0.0',
          checksum: 'valid-checksum'
        },
        tables: {
          'test-table': {
            schema: {
              name: 'test-table',
              primaryKey: { partitionKey: 'pk', sortKey: 'sk' },
              attributes: {
                pk: { type: 'string', required: true },
                sk: { type: 'string', required: true }
              }
            },
            data: [
              { pk: 'user#123', sk: 'profile', name: 'Test User' }
            ],
            indexes: []
          }
        }
      };
    });

    it('should import data to MongoDB provider', async () => {
      const mockImporter = {
        importData: jest.fn().mockResolvedValue(undefined)
      };
      
      jest.spyOn(migrationManager as any, 'createImporter').mockReturnValue(mockImporter);

      // Mock checksum calculation to match
      jest.spyOn(migrationManager as any, 'calculateChecksum')
        .mockReturnValue('valid-checksum');

      await migrationManager.importData(mockMongoDBProvider, mockMigrationData);

      expect(mockImporter.importData).toHaveBeenCalledWith(mockMigrationData, {});
    });

    it('should import data to DynamoDB provider', async () => {
      const mockImporter = {
        importData: jest.fn().mockResolvedValue(undefined)
      };
      
      jest.spyOn(migrationManager as any, 'createImporter').mockReturnValue(mockImporter);

      // Mock checksum calculation to match
      jest.spyOn(migrationManager as any, 'calculateChecksum')
        .mockReturnValue('valid-checksum');

      await migrationManager.importData(mockDynamoDBProvider, mockMigrationData);

      expect(mockImporter.importData).toHaveBeenCalledWith(mockMigrationData, {});
    });

    it('should validate data integrity before import', async () => {
      const invalidData = { ...mockMigrationData };
      invalidData.metadata.checksum = 'invalid-checksum';

      jest.spyOn(migrationManager as any, 'calculateChecksum')
        .mockReturnValue('valid-checksum');

      await expect(migrationManager.importData(mockMongoDBProvider, invalidData))
        .rejects.toThrow('Data integrity check failed: checksum mismatch');
    });

    it('should handle import errors', async () => {
      const mockImporter = {
        importData: jest.fn().mockRejectedValue(new Error('Import failed'))
      };
      
      jest.spyOn(migrationManager as any, 'createImporter').mockReturnValue(mockImporter);

      // Mock checksum calculation to match so we get past integrity check
      jest.spyOn(migrationManager as any, 'calculateChecksum')
        .mockReturnValue('valid-checksum');

      await expect(migrationManager.importData(mockMongoDBProvider, mockMigrationData))
        .rejects.toThrow('Import failed');
    });
  });

  describe('validateMigration', () => {
    it('should validate successful migration', async () => {
      const sourceData: MigrationData = {
        metadata: {
          sourceProvider: 'dynamodb',
          exportDate: new Date(),
          recordCount: 2,
          version: '1.0.0',
          checksum: 'source-checksum'
        },
        tables: {
          'test-table': {
            schema: {
              name: 'test-table',
              primaryKey: { partitionKey: 'pk', sortKey: 'sk' },
              attributes: {}
            },
            data: [
              { pk: 'user#123', sk: 'profile', name: 'Test User' },
              { pk: 'user#456', sk: 'profile', name: 'Another User' }
            ],
            indexes: []
          }
        }
      };

      const targetData: MigrationData = {
        ...sourceData,
        metadata: {
          ...sourceData.metadata,
          sourceProvider: 'mongodb',
          checksum: 'target-checksum'
        }
      };

      // Mock exportData to return different data for each provider
      jest.spyOn(migrationManager, 'exportData')
        .mockResolvedValueOnce(sourceData)
        .mockResolvedValueOnce(targetData);

      const result = await migrationManager.validateMigration(
        mockDynamoDBProvider,
        mockMongoDBProvider
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.totalRecords).toBe(2);
      expect(result.summary.validRecords).toBe(2);
    });

    it('should detect missing records', async () => {
      const sourceData: MigrationData = {
        metadata: {
          sourceProvider: 'dynamodb',
          exportDate: new Date(),
          recordCount: 2,
          version: '1.0.0',
          checksum: 'source-checksum'
        },
        tables: {
          'test-table': {
            schema: {
              name: 'test-table',
              primaryKey: { partitionKey: 'pk', sortKey: 'sk' },
              attributes: {}
            },
            data: [
              { pk: 'user#123', sk: 'profile', name: 'Test User' },
              { pk: 'user#456', sk: 'profile', name: 'Another User' }
            ],
            indexes: []
          }
        }
      };

      const targetData: MigrationData = {
        ...sourceData,
        metadata: {
          ...sourceData.metadata,
          sourceProvider: 'mongodb',
          recordCount: 1,
          checksum: 'target-checksum'
        },
        tables: {
          'test-table': {
            ...sourceData.tables['test-table'],
            data: [
              { pk: 'user#123', sk: 'profile', name: 'Test User' }
            ]
          }
        }
      };

      jest.spyOn(migrationManager, 'exportData')
        .mockResolvedValueOnce(sourceData)
        .mockResolvedValueOnce(targetData);

      const result = await migrationManager.validateMigration(
        mockDynamoDBProvider,
        mockMongoDBProvider
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('missing_record');
    });

    it('should handle validation errors', async () => {
      jest.spyOn(migrationManager, 'exportData')
        .mockRejectedValue(new Error('Export failed during validation'));

      await expect(migrationManager.validateMigration(
        mockDynamoDBProvider,
        mockMongoDBProvider
      )).rejects.toThrow('Export failed during validation');
    });
  });

  describe('rollback functionality', () => {
    it('should create rollback point', async () => {
      const mockExportData: MigrationData = {
        metadata: {
          sourceProvider: 'dynamodb',
          exportDate: new Date(),
          recordCount: 10,
          version: '1.0.0',
          checksum: 'backup-checksum'
        },
        tables: {
          'table1': { schema: {} as any, data: [1, 2, 3], indexes: [] },
          'table2': { schema: {} as any, data: [4, 5], indexes: [] }
        }
      };

      jest.spyOn(migrationManager, 'exportData')
        .mockResolvedValue(mockExportData);

      const rollbackInfo = await migrationManager.createRollbackPoint(
        mockDynamoDBProvider,
        'test-migration-123'
      );

      expect(rollbackInfo.migrationId).toBe('test-migration-123');
      expect(rollbackInfo.affectedTables).toEqual(['table1', 'table2']);
      expect(rollbackInfo.rollbackSteps).toHaveLength(2);
      expect(rollbackInfo.backupLocation).toContain('rollback-test-migration-123');
    });

    it('should execute rollback successfully', async () => {
      const rollbackInfo = {
        migrationId: 'test-migration-123',
        timestamp: new Date(),
        backupLocation: 'rollback-test-migration-123-12345.json',
        affectedTables: ['table1', 'table2'],
        rollbackSteps: [
          {
            step: 1,
            action: 'restore_table' as const,
            table: 'table1',
            details: { recordCount: 5 },
            completed: false
          },
          {
            step: 2,
            action: 'restore_table' as const,
            table: 'table2',
            details: { recordCount: 3 },
            completed: false
          }
        ]
      };

      await migrationManager.executeRollback(mockDynamoDBProvider, rollbackInfo);

      expect(rollbackInfo.rollbackSteps[0].completed).toBe(true);
      expect(rollbackInfo.rollbackSteps[1].completed).toBe(true);
    });

    it('should handle partial rollback failures', async () => {
      const rollbackInfo = {
        migrationId: 'test-migration-123',
        timestamp: new Date(),
        backupLocation: 'rollback-test-migration-123-12345.json',
        affectedTables: ['table1'],
        rollbackSteps: [
          {
            step: 1,
            action: 'restore_table' as const,
            table: 'table1',
            details: { recordCount: 5 },
            completed: false
          }
        ]
      };

      // Mock executeRollbackStep to fail
      jest.spyOn(migrationManager as any, 'executeRollbackStep')
        .mockRejectedValue(new Error('Rollback step failed'));

      await expect(migrationManager.executeRollback(mockDynamoDBProvider, rollbackInfo))
        .rejects.toThrow('Rollback partially failed');

      expect(rollbackInfo.rollbackSteps[0].completed).toBe(false);
      expect(rollbackInfo.rollbackSteps[0].error).toBe('Rollback step failed');
    });
  });

  describe('progress tracking', () => {
    it('should track export progress', async () => {
      const options: MigrationOptions = {
        progressCallback: jest.fn()
      };

      const mockExporter = {
        exportAll: jest.fn().mockImplementation(async (opts) => {
          // Simulate progress callback
          if (opts.progressCallback) {
            opts.progressCallback({
              phase: 'export',
              totalRecords: 100,
              processedRecords: 50,
              errorCount: 0,
              currentTable: 'test-table'
            });
          }
          return {
            metadata: {
              sourceProvider: 'dynamodb',
              exportDate: new Date(),
              recordCount: 100,
              version: '1.0.0',
              checksum: 'test-checksum'
            },
            tables: {}
          };
        })
      };

      jest.spyOn(migrationManager as any, 'createExporter').mockReturnValue(mockExporter);

      await migrationManager.exportData(mockDynamoDBProvider, options);

      expect(options.progressCallback).toHaveBeenCalled();
    });

    it('should return current progress', () => {
      expect(migrationManager.getProgress()).toBeNull();

      // Progress would be set during actual operations
      // This is tested indirectly through the operation tests
    });
  });
});