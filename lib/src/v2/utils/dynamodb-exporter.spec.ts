/**
 * DynamoDB Exporter Tests
 */

import { DynamoDBExporter } from './dynamodb-exporter';
import { IDataAccessLayer } from '../types/database-abstraction';
import { MigrationOptions } from '../types/migration';

describe('DynamoDBExporter', () => {
  let exporter: DynamoDBExporter;
  let mockProvider: jest.Mocked<IDataAccessLayer>;

  beforeEach(() => {
    mockProvider = {
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

    exporter = new DynamoDBExporter(mockProvider);
  });

  describe('exportAll', () => {
    it('should export all data from DynamoDB', async () => {
      const mockScanResult = {
        items: [
          { pk: 'user#123', sk: 'profile', name: 'Test User', version: 1 },
          { pk: 'user#456', sk: 'profile', name: 'Another User', version: 1 }
        ],
        token: undefined
      };

      mockProvider.scan.mockResolvedValue(mockScanResult);

      const result = await exporter.exportAll();

      expect(result.metadata.sourceProvider).toBe('dynamodb');
      expect(result.metadata.recordCount).toBe(4); // 2 records × 2 tables
      expect(result.tables).toBeDefined();
      expect(Object.keys(result.tables)).toContain('primary-table');
      expect(Object.keys(result.tables)).toContain('data-table');
    });

    it('should handle pagination during export', async () => {
      const firstBatch = {
        items: [
          { pk: 'user#123', sk: 'profile', name: 'Test User' }
        ],
        token: 'next-page-token'
      };

      const secondBatch = {
        items: [
          { pk: 'user#456', sk: 'profile', name: 'Another User' }
        ],
        token: undefined
      };

      mockProvider.scan
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce(secondBatch)
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce(secondBatch);

      const result = await exporter.exportAll();

      expect(mockProvider.scan).toHaveBeenCalledTimes(4); // 2 tables × 2 calls each
      expect(result.metadata.recordCount).toBe(4); // 2 records × 2 tables
    });

    it('should call progress callback during export', async () => {
      const progressCallback = jest.fn();
      const options: MigrationOptions = { progressCallback };

      const mockScanResult = {
        items: [
          { pk: 'user#123', sk: 'profile', name: 'Test User' }
        ],
        token: undefined
      };

      mockProvider.scan.mockResolvedValue(mockScanResult);

      await exporter.exportAll(options);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'export',
          processedRecords: expect.any(Number),
          errorCount: 0
        })
      );
    });

    it('should handle scan errors gracefully when skipErrors is true', async () => {
      const options: MigrationOptions = { skipErrors: true };

      mockProvider.scan
        .mockRejectedValueOnce(new Error('Scan failed'))
        .mockResolvedValue({ items: [], token: undefined });

      const result = await exporter.exportAll(options);

      expect(result.metadata.recordCount).toBe(0);
      // Should not throw error due to skipErrors: true
    });

    it('should throw error when scan fails and skipErrors is false', async () => {
      mockProvider.scan.mockRejectedValue(new Error('Scan failed'));

      await expect(exporter.exportAll()).rejects.toThrow('Scan failed');
    });
  });

  describe('exportTables', () => {
    it('should export specific tables', async () => {
      const mockScanResult = {
        items: [
          { pk: 'user#123', sk: 'profile', name: 'Test User' }
        ],
        token: undefined
      };

      mockProvider.scan.mockResolvedValue(mockScanResult);

      const result = await exporter.exportTables(['primary-table']);

      expect(result.tables).toHaveProperty('primary-table');
      expect(result.tables).not.toHaveProperty('data-table');
      expect(result.metadata.recordCount).toBe(1);
    });
  });

  describe('getTableSchema', () => {
    it('should return table schema', async () => {
      const schema = await exporter.getTableSchema('test-table');

      expect(schema.name).toBe('test-table');
      expect(schema.primaryKey.partitionKey).toBe('pk');
      expect(schema.primaryKey.sortKey).toBe('sk');
      expect(schema.attributes).toHaveProperty('pk');
      expect(schema.attributes).toHaveProperty('sk');
      expect(schema.attributes.pk.type).toBe('string');
      expect(schema.attributes.pk.required).toBe(true);
    });
  });

  describe('getTableIndexes', () => {
    it('should return table indexes', async () => {
      const indexes = await exporter.getTableIndexes('test-table');

      expect(indexes).toHaveLength(3);
      expect(indexes[0].name).toBe('primary');
      expect(indexes[0].type).toBe('primary');
      expect(indexes[1].name).toBe('pksk-index');
      expect(indexes[1].type).toBe('gsi');
      expect(indexes[2].name).toBe('user-index');
      expect(indexes[2].type).toBe('gsi');
    });
  });

  describe('data transformation', () => {
    it('should transform DynamoDB items correctly', async () => {
      const mockScanResult = {
        items: [
          {
            pk: 'user#123',
            sk: 'profile',
            name: 'Test User',
            createdAt: '2023-01-01T00:00:00.000Z',
            updatedAt: '2023-01-02T00:00:00.000Z',
            version: '1'
          }
        ],
        token: undefined
      };

      mockProvider.scan.mockResolvedValue(mockScanResult);

      const result = await exporter.exportAll();
      const exportedItem = result.tables['primary-table'].data[0];

      expect(exportedItem.createdAt).toBeInstanceOf(Date);
      expect(exportedItem.updatedAt).toBeInstanceOf(Date);
      expect(exportedItem.version).toBe(1);
      expect(typeof exportedItem.version).toBe('number');
    });

    it('should handle missing optional fields', async () => {
      const mockScanResult = {
        items: [
          {
            pk: 'user#123',
            sk: 'profile',
            name: 'Test User'
            // Missing createdAt, updatedAt, version
          }
        ],
        token: undefined
      };

      mockProvider.scan.mockResolvedValue(mockScanResult);

      const result = await exporter.exportAll();
      const exportedItem = result.tables['primary-table'].data[0];

      expect(exportedItem.pk).toBe('user#123');
      expect(exportedItem.sk).toBe('profile');
      expect(exportedItem.name).toBe('Test User');
      // Should not throw errors for missing optional fields
    });
  });

  describe('batch processing', () => {
    it('should respect batch size option', async () => {
      const options: MigrationOptions = { batchSize: 5 };

      const mockScanResult = {
        items: Array.from({ length: 5 }, (_, i) => ({
          pk: `user#${i}`,
          sk: 'profile',
          name: `User ${i}`
        })),
        token: undefined
      };

      mockProvider.scan.mockResolvedValue(mockScanResult);

      await exporter.exportAll(options);

      expect(mockProvider.scan).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 })
      );
    });

    it('should use default batch size when not specified', async () => {
      const mockScanResult = {
        items: [],
        token: undefined
      };

      mockProvider.scan.mockResolvedValue(mockScanResult);

      await exporter.exportAll();

      expect(mockProvider.scan).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 1000 })
      );
    });
  });
});