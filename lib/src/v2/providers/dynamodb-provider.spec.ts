/**
 * DynamoDB Provider Tests
 * Comprehensive test suite for DynamoDB provider implementation
 */

import { DynamoDBProvider } from './dynamodb-provider';
import { 
  DatabaseKey, 
  DynamoDBConfig, 
  UnifiedUpdateInput,
  TransactionOperation 
} from '../types/database-abstraction';
import { 
  ConnectionError, 
  ValidationError, 
  ItemNotFoundError 
} from '../types/database-errors';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('DynamoDBProvider', () => {
  let provider: DynamoDBProvider;
  let mockConfig: DynamoDBConfig;

  beforeEach(() => {
    mockConfig = {
      region: 'us-east-1',
      primaryTable: 'test-primary-table',
      dataTable: 'test-data-table',
      consistentRead: true
    };

    provider = new DynamoDBProvider(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should initialize with correct provider type', () => {
      expect(provider.getProviderType()).toBe('dynamodb');
    });

    it('should handle connection lifecycle', async () => {
      // Mock successful connection
      const mockSend = jest.fn().mockResolvedValue({});
      (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
        send: mockSend
      });

      await provider.connect();
      expect(provider.isConnected()).toBe(true);

      await provider.disconnect();
      expect(provider.isConnected()).toBe(false);
    });

    it('should handle connection errors', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('Connection failed'));
      (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
        send: mockSend
      });

      await expect(provider.connect()).rejects.toThrow(ConnectionError);
    });
  });

  describe('CRUD Operations', () => {
    beforeEach(async () => {
      // Mock successful connection
      const mockSend = jest.fn().mockResolvedValue({});
      (provider as any).connectionManager = {
        isConnected: () => true,
        getDocumentClient: () => ({ send: mockSend })
      };
    });

    describe('get', () => {
      it('should retrieve an item successfully', async () => {
        const mockItem = { pk: 'test', sk: 'item', data: 'value' };
        const mockSend = jest.fn().mockResolvedValue({ Item: mockItem });
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const key: DatabaseKey = { primary: 'test', sort: 'item' };
        const result = await provider.get(key);

        expect(result).toEqual(mockItem);
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.objectContaining({
            TableName: mockConfig.primaryTable,
            Key: { pk: 'test', sk: 'item' }
          })
        }));
      });

      it('should return null for non-existent item', async () => {
        const mockSend = jest.fn().mockResolvedValue({});
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const key: DatabaseKey = { primary: 'nonexistent' };
        const result = await provider.get(key);

        expect(result).toBeNull();
      });

      it('should validate key before operation', async () => {
        const invalidKey = {} as DatabaseKey;
        
        await expect(provider.get(invalidKey)).rejects.toThrow(ValidationError);
      });

      it('should handle projection options', async () => {
        const mockSend = jest.fn().mockResolvedValue({ Item: { pk: 'test' } });
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const key: DatabaseKey = { primary: 'test' };
        const options = { projection: ['pk', 'data'] };
        
        await provider.get(key, options);

        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.objectContaining({
            ProjectionExpression: 'pk, data'
          })
        }));
      });
    });

    describe('put', () => {
      it('should put an item successfully', async () => {
        const mockSend = jest.fn().mockResolvedValue({});
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const data = { pk: 'test', sk: 'item', data: 'value' };
        await provider.put(data);

        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.objectContaining({
            TableName: mockConfig.primaryTable,
            Item: data
          })
        }));
      });

      it('should handle ensureNotExists option', async () => {
        const mockSend = jest.fn().mockResolvedValue({});
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const data = { pk: 'test', sk: 'item', data: 'value' };
        const options = { ensureNotExists: true };
        
        await provider.put(data, options);

        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.objectContaining({
            ConditionExpression: 'attribute_not_exists(pk)'
          })
        }));
      });

      it('should validate data before operation', async () => {
        await expect(provider.put(null)).rejects.toThrow(ValidationError);
        await expect(provider.put(undefined)).rejects.toThrow(ValidationError);
      });
    });

    describe('update', () => {
      it('should update an item successfully', async () => {
        const mockSend = jest.fn().mockResolvedValue({});
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const updateInput: UnifiedUpdateInput = {
          key: { primary: 'test', sort: 'item' },
          updates: { data: 'new_value', status: 'updated' }
        };

        await provider.update(updateInput);

        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.objectContaining({
            TableName: mockConfig.primaryTable,
            Key: { pk: 'test', sk: 'item' },
            UpdateExpression: expect.stringContaining('SET')
          })
        }));
      });

      it('should handle increment fields', async () => {
        const mockSend = jest.fn().mockResolvedValue({});
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const updateInput: UnifiedUpdateInput = {
          key: { primary: 'test', sort: 'item' },
          updates: {},
          incrementFields: { counter: 1, score: 10 }
        };

        await provider.update(updateInput);

        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.objectContaining({
            UpdateExpression: expect.stringContaining('ADD')
          })
        }));
      });

      it('should handle list operations', async () => {
        const mockSend = jest.fn().mockResolvedValue({});
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const updateInput: UnifiedUpdateInput = {
          key: { primary: 'test', sort: 'item' },
          updates: {},
          appendToList: { tags: ['new_tag'] }
        };

        await provider.update(updateInput);

        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.objectContaining({
            UpdateExpression: expect.stringContaining('list_append')
          })
        }));
      });
    });

    describe('delete', () => {
      it('should delete an item successfully', async () => {
        const mockSend = jest.fn().mockResolvedValue({});
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const key: DatabaseKey = { primary: 'test', sort: 'item' };
        await provider.delete(key);

        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.objectContaining({
            TableName: mockConfig.primaryTable,
            Key: { pk: 'test', sk: 'item' }
          })
        }));
      });
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      const mockSend = jest.fn().mockResolvedValue({ Items: [] });
      (provider as any).connectionManager = {
        isConnected: () => true,
        getDocumentClient: () => ({ send: mockSend })
      };
    });

    describe('query', () => {
      it('should execute query successfully', async () => {
        const mockItems = [
          { pk: 'test', sk: 'item1', data: 'value1' },
          { pk: 'test', sk: 'item2', data: 'value2' }
        ];
        const mockSend = jest.fn().mockResolvedValue({ Items: mockItems });
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const queryInput = {
          keyCondition: {
            field: 'pk',
            operator: '=' as const,
            value: 'test'
          }
        };

        const result = await provider.query(queryInput);

        expect(result).toEqual(mockItems);
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.objectContaining({
            TableName: mockConfig.primaryTable
          })
        }));
      });

      it('should handle pagination', async () => {
        const mockSend = jest.fn()
          .mockResolvedValueOnce({ 
            Items: [{ pk: 'test', sk: 'item1' }], 
            LastEvaluatedKey: { pk: 'test', sk: 'item1' } 
          })
          .mockResolvedValueOnce({ 
            Items: [{ pk: 'test', sk: 'item2' }] 
          });
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const queryInput = {
          keyCondition: {
            field: 'pk',
            operator: '=' as const,
            value: 'test'
          }
        };

        const result = await provider.query(queryInput);

        expect(result).toHaveLength(2);
        expect(mockSend).toHaveBeenCalledTimes(2);
      });
    });

    describe('scan', () => {
      it('should execute scan successfully', async () => {
        const mockItems = [
          { pk: 'test1', sk: 'item1', data: 'value1' },
          { pk: 'test2', sk: 'item2', data: 'value2' }
        ];
        const mockSend = jest.fn().mockResolvedValue({ Items: mockItems });
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const scanInput = {
          limit: 10
        };

        const result = await provider.scan(scanInput);

        expect(result.items).toEqual(mockItems);
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.objectContaining({
            TableName: mockConfig.primaryTable,
            Limit: 10
          })
        }));
      });
    });

    describe('batchGet', () => {
      it('should execute batch get successfully', async () => {
        const mockItems = [
          { pk: 'test1', sk: 'item1', data: 'value1' },
          { pk: 'test2', sk: 'item2', data: 'value2' }
        ];
        const mockSend = jest.fn().mockResolvedValue({ 
          Responses: { [mockConfig.primaryTable]: mockItems } 
        });
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const keys: DatabaseKey[] = [
          { primary: 'test1', sort: 'item1' },
          { primary: 'test2', sort: 'item2' }
        ];

        const result = await provider.batchGet(keys);

        expect(result).toEqual(mockItems);
      });

      it('should handle empty key array', async () => {
        const result = await provider.batchGet([]);
        expect(result).toEqual([]);
      });

      it('should handle large batches', async () => {
        const mockSend = jest.fn().mockResolvedValue({ 
          Responses: { [mockConfig.primaryTable]: [] } 
        });
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        // Create 150 keys to test batching (should be split into 2 batches)
        const keys: DatabaseKey[] = Array.from({ length: 150 }, (_, i) => ({
          primary: `test${i}`,
          sort: `item${i}`
        }));

        await provider.batchGet(keys);

        // Should be called twice due to 100-item batch limit
        expect(mockSend).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Transaction Operations', () => {
    beforeEach(async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      (provider as any).connectionManager = {
        isConnected: () => true,
        getDocumentClient: () => ({ send: mockSend })
      };
    });

    describe('beginTransaction', () => {
      it('should create a new transaction', async () => {
        const transaction = await provider.beginTransaction();
        
        expect(transaction).toBeDefined();
        expect(transaction.isActive()).toBe(true);
      });
    });

    describe('executeTransaction', () => {
      it('should execute transaction operations successfully', async () => {
        const mockSend = jest.fn().mockResolvedValue({});
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const operations: TransactionOperation[] = [
          {
            type: 'put',
            data: { pk: 'test1', sk: 'item1', data: 'value1' }
          },
          {
            type: 'update',
            updates: {
              key: { primary: 'test2', sort: 'item2' },
              updates: { data: 'updated_value' }
            }
          },
          {
            type: 'delete',
            key: { primary: 'test3', sort: 'item3' }
          }
        ];

        await provider.executeTransaction(operations);

        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.objectContaining({
            TransactItems: expect.arrayContaining([
              expect.objectContaining({ Put: expect.any(Object) }),
              expect.objectContaining({ Update: expect.any(Object) }),
              expect.objectContaining({ Delete: expect.any(Object) })
            ])
          })
        }));
      });

      it('should handle empty operations array', async () => {
        await provider.executeTransaction([]);
        // Should not throw and should not call DynamoDB
      });

      it('should reject transactions with too many operations', async () => {
        const operations: TransactionOperation[] = Array.from({ length: 26 }, (_, i) => ({
          type: 'put',
          data: { pk: `test${i}`, sk: `item${i}`, data: `value${i}` }
        }));

        await expect(provider.executeTransaction(operations)).rejects.toThrow(ValidationError);
      });
    });

    describe('Transaction lifecycle', () => {
      it('should handle transaction commit', async () => {
        const mockSend = jest.fn().mockResolvedValue({});
        
        (provider as any).connectionManager.getDocumentClient = jest.fn().mockReturnValue({
          send: mockSend
        });

        const transaction = await provider.beginTransaction();
        
        await transaction.put({ pk: 'test', sk: 'item', data: 'value' });
        await transaction.commit();

        expect(transaction.isActive()).toBe(false);
      });

      it('should handle transaction rollback', async () => {
        const transaction = await provider.beginTransaction();
        
        await transaction.put({ pk: 'test', sk: 'item', data: 'value' });
        await transaction.rollback();

        expect(transaction.isActive()).toBe(false);
      });

      it('should prevent operations on inactive transaction', async () => {
        const transaction = await provider.beginTransaction();
        await transaction.rollback();

        await expect(transaction.put({ pk: 'test', sk: 'item' })).rejects.toThrow();
      });
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when connected', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      (provider as any).connectionManager = {
        isConnected: () => true,
        healthCheck: async () => ({
          healthy: true,
          provider: 'dynamodb',
          connectionStatus: 'connected' as const,
          lastSuccessfulOperation: new Date(),
          metrics: {
            averageResponseTime: 50,
            errorRate: 0,
            connectionCount: 1
          }
        })
      };

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.provider).toBe('dynamodb');
      expect(health.connectionStatus).toBe('connected');
    });
  });

  describe('Error Handling', () => {
    it('should translate DynamoDB errors correctly', async () => {
      const dynamoError = {
        name: 'ResourceNotFoundException',
        message: 'Table not found'
      };
      
      const mockSend = jest.fn().mockRejectedValue(dynamoError);
      (provider as any).connectionManager = {
        isConnected: () => true,
        getDocumentClient: () => ({ send: mockSend })
      };

      const key: DatabaseKey = { primary: 'test' };
      
      await expect(provider.get(key)).rejects.toThrow();
    });

    it('should validate connection before operations', async () => {
      (provider as any).connectionManager = {
        isConnected: () => false
      };

      const key: DatabaseKey = { primary: 'test' };
      
      await expect(provider.get(key)).rejects.toThrow(ConnectionError);
    });
  });

  describe('Native Operations', () => {
    it('should execute native DynamoDB operations', async () => {
      const mockSend = jest.fn().mockResolvedValue({ Item: { pk: 'test' } });
      (provider as any).connectionManager = {
        isConnected: () => true,
        getDocumentClient: () => ({ send: mockSend })
      };

      const nativeCommand = { /* mock DynamoDB command */ };
      const result = await provider.executeNative(nativeCommand);

      expect(mockSend).toHaveBeenCalledWith(nativeCommand);
      expect(result).toEqual({ Item: { pk: 'test' } });
    });
  });
});