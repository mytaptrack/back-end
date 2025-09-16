/**
 * MongoDB provider tests
 * Comprehensive test suite for MongoDB database provider implementation
 */

import { MongoDBProvider } from './mongodb-provider';
import { MongoDBConfig, DatabaseKey, UnifiedUpdateInput } from '../types/database-abstraction';
import { 
  ConnectionError, 
  ValidationError, 
  ItemNotFoundError,
  DuplicateKeyError 
} from '../types/database-errors';

// Mock MongoDB client
jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    close: jest.fn(),
    db: jest.fn().mockReturnValue({
      admin: jest.fn().mockReturnValue({
        ping: jest.fn()
      }),
      collection: jest.fn().mockReturnValue({
        findOne: jest.fn(),
        replaceOne: jest.fn(),
        insertOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
        deleteOne: jest.fn(),
        find: jest.fn().mockReturnValue({
          project: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          toArray: jest.fn()
        })
      })
    }),
    startSession: jest.fn().mockReturnValue({
      withTransaction: jest.fn(),
      endSession: jest.fn(),
      abortTransaction: jest.fn()
    })
  }))
}));

describe('MongoDBProvider', () => {
  let provider: MongoDBProvider;
  let mockConfig: MongoDBConfig;

  beforeEach(() => {
    mockConfig = {
      connectionString: 'mongodb://localhost:27017',
      database: 'test_db',
      collections: {
        primary: 'primary_collection',
        data: 'data_collection'
      },
      options: {
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000
      }
    };

    provider = new MongoDBProvider(mockConfig);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (provider.isConnected()) {
      await provider.disconnect();
    }
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      await provider.connect();
      expect(provider.isConnected()).toBe(true);
      expect(provider.getProviderType()).toBe('mongodb');
    });

    it('should disconnect successfully', async () => {
      await provider.connect();
      await provider.disconnect();
      expect(provider.isConnected()).toBe(false);
    });

    it('should handle connection errors', async () => {
      const mockClient = require('mongodb').MongoClient;
      mockClient.mockImplementationOnce(() => ({
        connect: jest.fn().mockRejectedValue(new Error('Connection failed'))
      }));

      const errorProvider = new MongoDBProvider(mockConfig);
      await expect(errorProvider.connect()).rejects.toThrow(ConnectionError);
    });

    it('should perform health check', async () => {
      await provider.connect();
      const health = await provider.healthCheck();
      
      expect(health.provider).toBe('mongodb');
      expect(health.healthy).toBe(true);
      expect(health.connectionStatus).toBe('connected');
    });
  });

  describe('CRUD Operations', () => {
    beforeEach(async () => {
      await provider.connect();
    });

    describe('get', () => {
      it('should retrieve a document successfully', async () => {
        const key: DatabaseKey = { primary: 'user123', sort: 'profile' };
        const mockDocument = { pk: 'user123', sk: 'profile', name: 'John Doe' };

        const mockCollection = {
          findOne: jest.fn().mockResolvedValue(mockDocument)
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        const result = await provider.get(key);
        
        expect(result).toEqual({ pk: 'user123', sk: 'profile', name: 'John Doe' });
        expect(mockCollection.findOne).toHaveBeenCalledWith(
          { pk: 'user123', sk: 'profile' },
          { projection: undefined }
        );
      });

      it('should return null for non-existent document', async () => {
        const key: DatabaseKey = { primary: 'nonexistent', sort: 'item' };

        const mockCollection = {
          findOne: jest.fn().mockResolvedValue(null)
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        const result = await provider.get(key);
        expect(result).toBeNull();
      });

      it('should apply projection options', async () => {
        const key: DatabaseKey = { primary: 'user123', sort: 'profile' };
        const options = { projection: ['name', 'email'] };

        const mockCollection = {
          findOne: jest.fn().mockResolvedValue({ name: 'John', email: 'john@example.com' })
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        await provider.get(key, options);
        
        expect(mockCollection.findOne).toHaveBeenCalledWith(
          { pk: 'user123', sk: 'profile' },
          { projection: { name: 1, email: 1 } }
        );
      });

      it('should validate key before operation', async () => {
        const invalidKey = { primary: '' } as DatabaseKey;
        
        await expect(provider.get(invalidKey)).rejects.toThrow(ValidationError);
      });
    });

    describe('put', () => {
      it('should insert a new document successfully', async () => {
        const data = { pk: 'user123', sk: 'profile', name: 'John Doe' };

        const mockCollection = {
          replaceOne: jest.fn().mockResolvedValue({ matchedCount: 0, upsertedCount: 1 })
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        await provider.put(data);
        
        expect(mockCollection.replaceOne).toHaveBeenCalled();
        const [query, document, options] = mockCollection.replaceOne.mock.calls[0];
        
        expect(query).toEqual({ pk: 'user123', sk: 'profile' });
        expect(document).toMatchObject({
          pk: 'user123',
          sk: 'profile',
          pksk: 'user123#profile',
          name: 'John Doe'
        });
        expect(document.createdAt).toBeInstanceOf(Date);
        expect(document.updatedAt).toBeInstanceOf(Date);
        expect(options.upsert).toBe(true);
      });

      it('should handle ensureNotExists option', async () => {
        const data = { pk: 'user123', sk: 'profile', name: 'John Doe' };
        const options = { ensureNotExists: true };

        const mockCollection = {
          insertOne: jest.fn().mockResolvedValue({ insertedId: 'new_id' })
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        await provider.put(data, options);
        
        expect(mockCollection.insertOne).toHaveBeenCalled();
      });

      it('should handle duplicate key error', async () => {
        const data = { pk: 'user123', sk: 'profile', name: 'John Doe' };

        const mockCollection = {
          insertOne: jest.fn().mockRejectedValue({ code: 11000, message: 'Duplicate key' })
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        await expect(provider.put(data, { ensureNotExists: true })).rejects.toThrow(DuplicateKeyError);
      });

      it('should validate data before operation', async () => {
        await expect(provider.put(null as any)).rejects.toThrow(ValidationError);
        await expect(provider.put(undefined as any)).rejects.toThrow(ValidationError);
      });
    });

    describe('update', () => {
      it('should update a document successfully', async () => {
        const input: UnifiedUpdateInput = {
          key: { primary: 'user123', sort: 'profile' },
          updates: { name: 'Jane Doe', email: 'jane@example.com' }
        };

        const mockCollection = {
          findOneAndUpdate: jest.fn().mockResolvedValue({
            value: { pk: 'user123', sk: 'profile', name: 'Jane Doe', email: 'jane@example.com' }
          })
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        const result = await provider.update(input);
        
        expect(mockCollection.findOneAndUpdate).toHaveBeenCalled();
        const [query, updateDoc] = mockCollection.findOneAndUpdate.mock.calls[0];
        
        expect(query).toEqual({ pk: 'user123', sk: 'profile' });
        expect(updateDoc.$set).toMatchObject({
          name: 'Jane Doe',
          email: 'jane@example.com'
        });
        expect(updateDoc.$set.updatedAt).toBeInstanceOf(Date);
        expect(result).toEqual({ pk: 'user123', sk: 'profile', name: 'Jane Doe', email: 'jane@example.com' });
      });

      it('should handle increment fields', async () => {
        const input: UnifiedUpdateInput = {
          key: { primary: 'user123', sort: 'stats' },
          updates: {},
          incrementFields: { loginCount: 1, score: 10 }
        };

        const mockCollection = {
          findOneAndUpdate: jest.fn().mockResolvedValue({ value: null })
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        await provider.update(input);
        
        const [, updateDoc] = mockCollection.findOneAndUpdate.mock.calls[0];
        expect(updateDoc.$inc).toEqual({ loginCount: 1, score: 10 });
      });

      it('should handle list operations', async () => {
        const input: UnifiedUpdateInput = {
          key: { primary: 'user123', sort: 'preferences' },
          updates: {},
          appendToList: { tags: ['new-tag'] },
          removeFromList: { oldTags: ['old-tag'] }
        };

        const mockCollection = {
          findOneAndUpdate: jest.fn().mockResolvedValue({ value: null })
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        await provider.update(input);
        
        const [, updateDoc] = mockCollection.findOneAndUpdate.mock.calls[0];
        expect(updateDoc.$push).toEqual({ tags: { $each: ['new-tag'] } });
        expect(updateDoc.$pullAll).toEqual({ oldTags: ['old-tag'] });
      });
    });

    describe('delete', () => {
      it('should delete a document successfully', async () => {
        const key: DatabaseKey = { primary: 'user123', sort: 'profile' };

        const mockCollection = {
          deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        await provider.delete(key);
        
        expect(mockCollection.deleteOne).toHaveBeenCalledWith({ pk: 'user123', sk: 'profile' });
      });

      it('should throw error when document not found', async () => {
        const key: DatabaseKey = { primary: 'nonexistent', sort: 'item' };

        const mockCollection = {
          deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 })
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        await expect(provider.delete(key)).rejects.toThrow(ItemNotFoundError);
      });
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      await provider.connect();
    });

    describe('query', () => {
      it('should execute query successfully', async () => {
        const input = {
          keyCondition: {
            field: 'pk',
            operator: '=' as const,
            value: 'user123'
          },
          limit: 10
        };

        const mockDocuments = [
          { pk: 'user123', sk: 'profile', name: 'John' },
          { pk: 'user123', sk: 'settings', theme: 'dark' }
        ];

        const mockCursor = {
          project: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          toArray: jest.fn().mockResolvedValue(mockDocuments)
        };

        const mockCollection = {
          find: jest.fn().mockReturnValue(mockCursor)
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        const results = await provider.query(input);
        
        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({ pk: 'user123', sk: 'profile', name: 'John' });
        expect(mockCollection.find).toHaveBeenCalledWith({ pk: 'user123' });
        expect(mockCursor.limit).toHaveBeenCalledWith(10);
      });

      it('should handle begins_with operator', async () => {
        const input = {
          keyCondition: {
            field: 'sk',
            operator: 'begins_with' as const,
            value: 'profile'
          }
        };

        const mockCursor = {
          project: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          toArray: jest.fn().mockResolvedValue([])
        };

        const mockCollection = {
          find: jest.fn().mockReturnValue(mockCursor)
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        await provider.query(input);
        
        expect(mockCollection.find).toHaveBeenCalledWith({
          sk: { $regex: '^profile' }
        });
      });

      it('should handle between operator', async () => {
        const input = {
          keyCondition: {
            field: 'timestamp',
            operator: 'between' as const,
            value: '2023-01-01',
            value2: '2023-12-31'
          }
        };

        const mockCursor = {
          project: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          toArray: jest.fn().mockResolvedValue([])
        };

        const mockCollection = {
          find: jest.fn().mockReturnValue(mockCursor)
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        await provider.query(input);
        
        expect(mockCollection.find).toHaveBeenCalledWith({
          timestamp: { $gte: '2023-01-01', $lte: '2023-12-31' }
        });
      });
    });

    describe('scan', () => {
      it('should execute scan successfully', async () => {
        const input = {
          filterCondition: {
            field: 'status',
            operator: '=' as const,
            value: 'active'
          },
          limit: 5
        };

        const mockDocuments = [
          { pk: 'user1', sk: 'profile', status: 'active' },
          { pk: 'user2', sk: 'profile', status: 'active' }
        ];

        const mockCursor = {
          project: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          toArray: jest.fn().mockResolvedValue(mockDocuments)
        };

        const mockCollection = {
          find: jest.fn().mockReturnValue(mockCursor)
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        const result = await provider.scan(input);
        
        expect(result.items).toHaveLength(2);
        expect(result.items[0]).toEqual({ pk: 'user1', sk: 'profile', status: 'active' });
        expect(mockCollection.find).toHaveBeenCalledWith({ status: 'active' });
        expect(mockCursor.limit).toHaveBeenCalledWith(5);
      });

      it('should return pagination token when limit reached', async () => {
        const input = { limit: 2 };

        const mockDocuments = [
          { pk: 'user1', sk: 'profile' },
          { pk: 'user2', sk: 'profile' }
        ];

        const mockCursor = {
          project: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          toArray: jest.fn().mockResolvedValue(mockDocuments)
        };

        const mockCollection = {
          find: jest.fn().mockReturnValue(mockCursor)
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        const result = await provider.scan(input);
        
        expect(result.items).toHaveLength(2);
        expect(result.token).toEqual({ skip: 2 });
      });
    });

    describe('batchGet', () => {
      it('should retrieve multiple documents', async () => {
        const keys: DatabaseKey[] = [
          { primary: 'user1', sort: 'profile' },
          { primary: 'user2', sort: 'profile' }
        ];

        const mockDocuments = [
          { pk: 'user1', sk: 'profile', name: 'John' },
          { pk: 'user2', sk: 'profile', name: 'Jane' }
        ];

        const mockCursor = {
          project: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          toArray: jest.fn().mockResolvedValue(mockDocuments)
        };

        const mockCollection = {
          find: jest.fn().mockReturnValue(mockCursor)
        };
        
        provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollection)
        });

        const results = await provider.batchGet(keys);
        
        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({ pk: 'user1', sk: 'profile', name: 'John' });
        expect(mockCollection.find).toHaveBeenCalledWith({
          $or: [
            { pk: 'user1', sk: 'profile' },
            { pk: 'user2', sk: 'profile' }
          ]
        });
      });

      it('should return empty array for empty keys', async () => {
        const results = await provider.batchGet([]);
        expect(results).toEqual([]);
      });
    });
  });

  describe('Transaction Operations', () => {
    beforeEach(async () => {
      await provider.connect();
    });

    it('should begin transaction successfully', async () => {
      const transaction = await provider.beginTransaction();
      
      expect(transaction).toBeDefined();
      expect(transaction.isActive()).toBe(true);
    });

    it('should execute transaction operations', async () => {
      const operations = [
        {
          type: 'put' as const,
          data: { pk: 'user1', sk: 'profile', name: 'John' }
        },
        {
          type: 'delete' as const,
          key: { primary: 'user2', sort: 'profile' }
        }
      ];

      const mockSession = {
        withTransaction: jest.fn().mockImplementation(async (fn) => await fn()),
        endSession: jest.fn()
      };

      provider['connectionManager'].getClient = jest.fn().mockReturnValue({
        startSession: jest.fn().mockReturnValue(mockSession)
      });

      const mockCollection = {
        replaceOne: jest.fn().mockResolvedValue({}),
        deleteOne: jest.fn().mockResolvedValue({})
      };
      
      provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue(mockCollection)
      });

      await provider.executeTransaction(operations);
      
      expect(mockSession.withTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should handle empty transaction operations', async () => {
      await expect(provider.executeTransaction([])).resolves.not.toThrow();
    });
  });

  describe('Native Operations', () => {
    beforeEach(async () => {
      await provider.connect();
    });

    it('should execute native MongoDB operations', async () => {
      const mockDatabase = {
        collection: jest.fn().mockReturnValue({
          aggregate: jest.fn().mockResolvedValue([{ count: 5 }])
        })
      };
      
      provider['connectionManager'].getDatabase = jest.fn().mockReturnValue(mockDatabase);

      const nativeOperation = (db: any) => {
        return db.collection('test').aggregate([{ $count: 'count' }]);
      };

      const result = await provider.executeNative(nativeOperation);
      
      expect(result).toEqual([{ count: 5 }]);
      expect(mockDatabase.collection).toHaveBeenCalledWith('test');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await provider.connect();
    });

    it('should validate connection before operations', async () => {
      await provider.disconnect();
      
      const key: DatabaseKey = { primary: 'test', sort: 'item' };
      
      await expect(provider.get(key)).rejects.toThrow(ConnectionError);
    });

    it('should translate MongoDB errors correctly', async () => {
      const mockCollection = {
        findOne: jest.fn().mockRejectedValue({ code: 50, message: 'Timeout' })
      };
      
      provider['connectionManager'].getDatabase = jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue(mockCollection)
      });

      const key: DatabaseKey = { primary: 'test', sort: 'item' };
      
      await expect(provider.get(key)).rejects.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should validate MongoDB availability', () => {
      expect(() => {
        require('mongodb');
      }).not.toThrow();
    });

    it('should use correct configuration', () => {
      expect(provider.getConfig()).toEqual(mockConfig);
      expect(provider.getProviderType()).toBe('mongodb');
    });
  });
});