/**
 * Tests for DatabaseSchemaValidator
 */

import { MongoClient, Db } from 'mongodb';
import { DatabaseSchemaValidator } from '../database-schema-validator';

describe('DatabaseSchemaValidator', () => {
  let client: MongoClient;
  let db: Db;
  let validator: DatabaseSchemaValidator;
  const testDbName = 'mytaptrack_validator_test_' + Date.now();

  beforeAll(async () => {
    client = await global.testUtils.connectToTestDB();
    db = client.db(testDbName);
    validator = new DatabaseSchemaValidator(client, testDbName);
  });

  afterAll(async () => {
    await global.testUtils.cleanupTestDB(client, testDbName);
    await client.close();
  });

  beforeEach(async () => {
    // Clean collections before each test
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.dropCollection(collection.name);
    }
  });

  describe('validateSchema', () => {
    it('should validate empty database and report missing collections', async () => {
      const result = await validator.validateSchema();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Should report missing required collections
      const missingCollectionErrors = result.errors.filter(e => e.type === 'missing_collection');
      expect(missingCollectionErrors.length).toBeGreaterThan(0);
      
      const missingCollectionNames = missingCollectionErrors.map(e => e.collection);
      expect(missingCollectionNames).toContain('primary');
      expect(missingCollectionNames).toContain('data');
    });

    it('should validate collections with missing indexes', async () => {
      // Create collections without indexes
      await db.createCollection('primary');
      await db.createCollection('data');
      await db.createCollection('migrations');

      // Insert some valid documents
      await db.collection('primary').insertOne(global.testUtils.generateTestData.user('test1'));
      await db.collection('data').insertOne({
        pk: 'SD#test1',
        sk: 'T#2023-01-01T00:00:00.000Z',
        pksk: 'SD#test1#T#2023-01-01T00:00:00.000Z',
        version: 1,
        timestamp: new Date(),
        data: { activityLevel: 50 }
      });

      const result = await validator.validateSchema();

      expect(result.valid).toBe(false);
      expect(result.collections).toHaveLength(3);
      
      // All collections should exist
      result.collections.forEach(collection => {
        expect(collection.exists).toBe(true);
      });

      // Should report missing indexes
      const missingIndexErrors = result.errors.filter(e => e.type === 'missing_index');
      expect(missingIndexErrors.length).toBeGreaterThan(0);
    });

    it('should validate collections with proper indexes', async () => {
      // Create collections with required indexes
      await db.createCollection('primary');
      await db.createCollection('data');
      await db.createCollection('migrations');

      // Create required indexes
      await db.collection('primary').createIndex({ pk: 1, sk: 1 }, { name: 'pk_sk_index', unique: true });
      await db.collection('primary').createIndex({ pksk: 1 }, { name: 'pksk_index' });
      await db.collection('primary').createIndex({ userId: 1 }, { name: 'userId_index', sparse: true });
      await db.collection('primary').createIndex({ studentId: 1 }, { name: 'studentId_index', sparse: true });
      await db.collection('primary').createIndex({ license: 1 }, { name: 'license_index', sparse: true });
      await db.collection('primary').createIndex({ 'data.email': 1 }, { name: 'email_index', sparse: true });
      await db.collection('primary').createIndex({ createdAt: 1 }, { name: 'createdAt_index', sparse: true });
      await db.collection('primary').createIndex({ license: 1, pk: 1 }, { name: 'license_pk_index', sparse: true });

      await db.collection('data').createIndex({ pk: 1, sk: 1 }, { name: 'pk_sk_index', unique: true });
      await db.collection('data').createIndex({ pksk: 1 }, { name: 'pksk_index' });
      await db.collection('data').createIndex({ timestamp: 1 }, { name: 'timestamp_index', sparse: true });
      await db.collection('data').createIndex({ pk: 1, timestamp: 1 }, { name: 'pk_timestamp_index' });

      await db.collection('migrations').createIndex({ migrationId: 1 }, { name: 'migrationId_index', unique: true });
      await db.collection('migrations').createIndex({ status: 1 }, { name: 'status_index' });
      await db.collection('migrations').createIndex({ createdAt: 1 }, { name: 'createdAt_index' });

      // Insert valid documents
      await db.collection('primary').insertOne(global.testUtils.generateTestData.user('test1'));
      await db.collection('data').insertOne({
        pk: 'SD#test1',
        sk: 'T#2023-01-01T00:00:00.000Z',
        pksk: 'SD#test1#T#2023-01-01T00:00:00.000Z',
        version: 1,
        timestamp: new Date(),
        data: { activityLevel: 50 }
      });
      await db.collection('migrations').insertOne({
        migrationId: 'test-migration',
        status: 'completed',
        createdAt: new Date()
      });

      const result = await validator.validateSchema();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.collections).toHaveLength(3);

      // Verify collection details
      const primaryCollection = result.collections.find(c => c.name === 'primary');
      expect(primaryCollection?.exists).toBe(true);
      expect(primaryCollection?.documentCount).toBe(1);
      expect(primaryCollection?.sampleValidation.validDocuments).toBe(1);
      expect(primaryCollection?.sampleValidation.invalidDocuments).toBe(0);
    });

    it('should detect invalid document structures', async () => {
      await db.createCollection('primary');
      
      // Insert invalid documents (missing required fields)
      await db.collection('primary').insertMany([
        { pk: 'U#test1', sk: 'P' }, // missing pksk and version
        { pk: 'U#test2', version: 1 }, // missing sk and pksk
        { invalidField: 'test' } // completely invalid
      ]);

      const result = await validator.validateSchema();

      expect(result.valid).toBe(false);
      
      const primaryCollection = result.collections.find(c => c.name === 'primary');
      expect(primaryCollection?.sampleValidation.invalidDocuments).toBeGreaterThan(0);
      expect(primaryCollection?.sampleValidation.commonErrors.length).toBeGreaterThan(0);
    });

    it('should handle unexpected collections', async () => {
      // Create expected collections
      await db.createCollection('primary');
      await db.createCollection('data');
      
      // Create unexpected collection
      await db.createCollection('unexpected_collection');
      await db.collection('unexpected_collection').insertOne({ test: true });

      const result = await validator.validateSchema();

      const unexpectedCollectionWarnings = result.warnings.filter(w => 
        w.type === 'data_inconsistency' && w.message.includes('unexpected_collection')
      );
      expect(unexpectedCollectionWarnings.length).toBeGreaterThan(0);
    });

    it('should validate document field types', async () => {
      await db.createCollection('primary');
      
      // Insert documents with wrong field types
      await db.collection('primary').insertMany([
        {
          pk: 'U#test1',
          sk: 'P',
          pksk: 'U#test1#P',
          version: '1', // should be number
          userId: 123, // should be string
          createdAt: 'invalid-date' // should be Date
        }
      ]);

      const result = await validator.validateSchema();

      const primaryCollection = result.collections.find(c => c.name === 'primary');
      expect(primaryCollection?.sampleValidation.invalidDocuments).toBeGreaterThan(0);
      expect(primaryCollection?.sampleValidation.commonErrors.some(error => 
        error.includes('type') && error.includes('expected')
      )).toBe(true);
    });

    it('should validate field constraints', async () => {
      await db.createCollection('primary');
      
      // Insert documents that violate constraints
      await db.collection('primary').insertMany([
        {
          pk: '', // violates minLength constraint
          sk: 'P',
          pksk: 'U#test1#P',
          version: 0 // violates min constraint (should be >= 1)
        }
      ]);

      const result = await validator.validateSchema();

      const primaryCollection = result.collections.find(c => c.name === 'primary');
      expect(primaryCollection?.sampleValidation.invalidDocuments).toBeGreaterThan(0);
    });

    it('should calculate index selectivity', async () => {
      await db.createCollection('primary');
      await db.collection('primary').createIndex({ userId: 1 }, { name: 'userId_index' });
      
      // Insert documents with varying userId values
      const users = Array.from({ length: 10 }, (_, i) => 
        global.testUtils.generateTestData.user(`user${i}`)
      );
      await db.collection('primary').insertMany(users);

      const result = await validator.validateSchema();

      const primaryCollection = result.collections.find(c => c.name === 'primary');
      const userIdIndex = primaryCollection?.indexes.find(idx => idx.name === 'userId_index');
      
      expect(userIdIndex?.performance.selectivity).toBeGreaterThan(0);
      expect(userIdIndex?.performance.selectivity).toBeLessThanOrEqual(1);
    });
  });

  describe('generateValidationReport', () => {
    it('should generate a comprehensive validation report', async () => {
      // Create a scenario with both errors and warnings
      await db.createCollection('primary');
      await db.createCollection('unexpected_collection');
      
      // Insert some valid and invalid documents
      await db.collection('primary').insertMany([
        global.testUtils.generateTestData.user('valid1'),
        { pk: 'invalid', sk: 'P' } // missing required fields
      ]);

      const result = await validator.validateSchema();
      const report = await validator.generateValidationReport(result);

      expect(report).toContain('# Database Schema Validation Report');
      expect(report).toContain('Overall Status:');
      expect(report).toContain('## Summary');
      expect(report).toContain('## Errors');
      expect(report).toContain('## Collection Details');
      
      // Should contain specific collection information
      expect(report).toContain('### primary');
      expect(report).toContain('Document count:');
      expect(report).toContain('Valid documents:');
    });

    it('should generate report for valid schema', async () => {
      // Create complete valid setup with all required collections and indexes
      await db.createCollection('primary');
      await db.createCollection('data');
      await db.createCollection('migrations');

      // Create all required indexes for primary collection
      await db.collection('primary').createIndex({ pk: 1, sk: 1 }, { name: 'pk_sk_index', unique: true });
      await db.collection('primary').createIndex({ pksk: 1 }, { name: 'pksk_index' });
      await db.collection('primary').createIndex({ userId: 1 }, { name: 'userId_index', sparse: true });
      await db.collection('primary').createIndex({ studentId: 1 }, { name: 'studentId_index', sparse: true });
      await db.collection('primary').createIndex({ license: 1 }, { name: 'license_index', sparse: true });
      await db.collection('primary').createIndex({ 'data.email': 1 }, { name: 'email_index', sparse: true });
      await db.collection('primary').createIndex({ createdAt: 1 }, { name: 'createdAt_index', sparse: true });
      await db.collection('primary').createIndex({ license: 1, pk: 1 }, { name: 'license_pk_index', sparse: true });

      // Create all required indexes for data collection
      await db.collection('data').createIndex({ pk: 1, sk: 1 }, { name: 'pk_sk_index', unique: true });
      await db.collection('data').createIndex({ pksk: 1 }, { name: 'pksk_index' });
      await db.collection('data').createIndex({ timestamp: 1 }, { name: 'timestamp_index', sparse: true });
      await db.collection('data').createIndex({ pk: 1, timestamp: 1 }, { name: 'pk_timestamp_index' });

      // Create all required indexes for migrations collection
      await db.collection('migrations').createIndex({ migrationId: 1 }, { name: 'migrationId_index', unique: true });
      await db.collection('migrations').createIndex({ status: 1 }, { name: 'status_index' });
      await db.collection('migrations').createIndex({ createdAt: 1 }, { name: 'createdAt_index' });

      // Insert valid test data
      await db.collection('primary').insertOne(global.testUtils.generateTestData.user('test1'));

      const result = await validator.validateSchema();
      const report = await validator.generateValidationReport(result);

      expect(report).toContain('Overall Status: VALID');
      expect(report).toContain('Errors found: 0');
    });
  });

  describe('edge cases', () => {
    it('should handle empty collections', async () => {
      await db.createCollection('primary');
      await db.createCollection('data');
      await db.createCollection('migrations');

      const result = await validator.validateSchema();

      result.collections.forEach(collection => {
        expect(collection.exists).toBe(true);
        expect(collection.documentCount).toBe(0);
        expect(collection.sampleValidation.sampleSize).toBe(0);
      });
    });

    it('should handle collections with only invalid documents', async () => {
      await db.createCollection('primary');
      
      // Insert only invalid documents
      await db.collection('primary').insertMany([
        { invalid: true },
        { also: 'invalid' },
        { completely: 'wrong' }
      ]);

      const result = await validator.validateSchema();

      const primaryCollection = result.collections.find(c => c.name === 'primary');
      expect(primaryCollection?.sampleValidation.validDocuments).toBe(0);
      expect(primaryCollection?.sampleValidation.invalidDocuments).toBe(3);
    });

    it('should handle large collections efficiently', async () => {
      await db.createCollection('primary');
      
      // Insert many documents (but validator should only sample)
      const manyUsers = Array.from({ length: 200 }, (_, i) => 
        global.testUtils.generateTestData.user(`user${i}`)
      );
      await db.collection('primary').insertMany(manyUsers);

      const startTime = Date.now();
      const result = await validator.validateSchema();
      const endTime = Date.now();

      // Should complete reasonably quickly even with many documents
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds

      const primaryCollection = result.collections.find(c => c.name === 'primary');
      expect(primaryCollection?.documentCount).toBe(200);
      expect(primaryCollection?.sampleValidation.sampleSize).toBeLessThanOrEqual(100); // Should sample, not read all
    });
  });
});