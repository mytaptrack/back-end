/**
 * Data transformation layer tests
 * Tests for storage models, transformers, and validation
 */

import {
  BaseStorageModel,
  LicensedStorageModel,
  UserStorageModel,
  StudentStorageModel,
  DynamoDBDocument,
  MongoDBDocument
} from '../types/storage-models';

import { DynamoDBTransformer } from './dynamodb-transformer';
import { MongoDBTransformer } from './mongodb-transformer';
import { DataValidator } from './data-validator';
import { TransformationManager } from './transformation-manager';

describe('Data Transformation Layer', () => {
  
  // Test data
  const baseTestData: BaseStorageModel = {
    pk: 'U#user123',
    sk: 'P',
    pksk: 'U#user123#P',
    version: 1,
    createdAt: new Date('2023-01-01T00:00:00Z'),
    updatedAt: new Date('2023-01-01T00:00:00Z')
  };

  const userTestData: UserStorageModel = {
    ...baseTestData,
    license: 'license123',
    userId: 'user123',
    usk: 'P'
  };

  const studentTestData: StudentStorageModel = {
    pk: 'S#student123',
    sk: 'P',
    pksk: 'S#student123#P',
    version: 1,
    createdAt: new Date('2023-01-01T00:00:00Z'),
    updatedAt: new Date('2023-01-01T00:00:00Z'),
    license: 'license123',
    studentId: 'student123',
    tsk: 'T#user123',
    lpk: 'L#license123',
    lsk: 'P'
  };

  describe('DynamoDBTransformer', () => {
    let transformer: DynamoDBTransformer<UserStorageModel>;

    beforeEach(() => {
      transformer = new DynamoDBTransformer({ validateInput: true, validateOutput: true });
    });

    it('should transform data maintaining DynamoDB structure', () => {
      const result = transformer.transform(userTestData);
      
      expect(result.pk).toBe(userTestData.pk);
      expect(result.sk).toBe(userTestData.sk);
      expect(result.pksk).toBe(userTestData.pksk);
      expect(result.version).toBe(userTestData.version);
      expect(result.license).toBe(userTestData.license);
      expect(result.userId).toBe(userTestData.userId);
      expect(result.usk).toBe(userTestData.usk);
    });

    it('should reverse transform data correctly', () => {
      const transformed = transformer.transform(userTestData);
      const reversed = transformer.reverse(transformed);
      
      expect(reversed.pk).toBe(userTestData.pk);
      expect(reversed.sk).toBe(userTestData.sk);
      expect(reversed.userId).toBe(userTestData.userId);
      expect(reversed.license).toBe(userTestData.license);
    });

    it('should validate required fields', () => {
      const invalidData = { ...userTestData, pk: '' };
      const validation = transformer.validate(invalidData);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0].field).toBe('pk');
    });

    it('should check consistency', () => {
      const inconsistentData = { ...userTestData, pksk: 'wrong#format' };
      const consistency = transformer.checkConsistency(inconsistentData);
      
      expect(consistency.isConsistent).toBe(false);
      expect(consistency.issues.length).toBeGreaterThan(0);
    });

    it('should prepare data for storage by removing undefined values', () => {
      const dataWithUndefined = { ...userTestData, undefinedField: undefined };
      const prepared = transformer.prepareForStorage(dataWithUndefined);
      
      expect(prepared).not.toHaveProperty('undefinedField');
    });
  });

  describe('MongoDBTransformer', () => {
    let transformer: MongoDBTransformer<UserStorageModel>;

    beforeEach(() => {
      transformer = new MongoDBTransformer({ validateInput: true, validateOutput: true });
    });

    it('should transform data to MongoDB nested structure', () => {
      const result = transformer.transform(userTestData);
      
      expect(result.pk).toBe(userTestData.pk);
      expect(result.sk).toBe(userTestData.sk);
      expect(result.pksk).toBe(userTestData.pksk);
      expect(result.version).toBe(userTestData.version);
      expect(result.userId).toBe(userTestData.userId);
      expect(result.license).toBe(userTestData.license);
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
    });

    it('should reverse transform MongoDB document correctly', () => {
      const transformed = transformer.transform(userTestData);
      const reversed = transformer.reverse(transformed);
      
      expect(reversed.pk).toBe(userTestData.pk);
      expect(reversed.sk).toBe(userTestData.sk);
      expect(reversed.userId).toBe(userTestData.userId);
      expect(reversed.license).toBe(userTestData.license);
      expect(reversed.usk).toBe(userTestData.usk);
    });

    it('should validate MongoDB document structure', () => {
      const invalidDoc: MongoDBDocument = {
        pk: 'test',
        sk: 'test',
        pksk: 'test#test',
        version: 1,
        data: null as any // Invalid data field
      };
      
      const validation = transformer.validateMongoDocument(invalidDoc);
      expect(validation.isValid).toBe(false);
    });

    it('should provide recommended indexes', () => {
      const indexes = transformer.getRecommendedIndexes();
      
      expect(indexes).toBeInstanceOf(Array);
      expect(indexes.length).toBeGreaterThan(0);
      expect(indexes[0]).toHaveProperty('name');
      expect(indexes[0]).toHaveProperty('fields');
    });

    it('should handle nested data correctly', () => {
      const complexData = {
        ...userTestData,
        nestedObject: {
          field1: 'value1',
          field2: { subField: 'subValue' }
        },
        arrayField: [1, 2, 3]
      };
      
      const transformed = transformer.transform(complexData);
      const reversed = transformer.reverse(transformed);
      
      expect(reversed.nestedObject).toEqual(complexData.nestedObject);
      expect(reversed.arrayField).toEqual(complexData.arrayField);
    });
  });

  describe('DataValidator', () => {
    let validator: DataValidator;

    beforeEach(() => {
      validator = new DataValidator();
    });

    it('should validate base model requirements', () => {
      const invalidData = { ...baseTestData, pk: '', version: -1 };
      const validation = validator.validate(invalidData);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should detect model type automatically', () => {
      const userValidation = validator.validate(userTestData);
      const studentValidation = validator.validate(studentTestData);
      
      expect(userValidation.isValid).toBe(true);
      expect(studentValidation.isValid).toBe(true);
    });

    it('should check consistency across providers', () => {
      const dynamoData = { ...userTestData };
      const mongoData = { ...userTestData, version: 2 }; // Different version
      
      const consistency = validator.validateCrossProviderConsistency(dynamoData, mongoData);
      
      expect(consistency.isConsistent).toBe(false);
      expect(consistency.issues.length).toBeGreaterThan(0);
    });

    it('should validate timestamp consistency', () => {
      const invalidData = {
        ...userTestData,
        createdAt: new Date('2023-01-02T00:00:00Z'),
        updatedAt: new Date('2023-01-01T00:00:00Z') // Earlier than created
      };
      
      const consistency = validator.checkConsistency(invalidData);
      
      expect(consistency.isConsistent).toBe(false);
      expect(consistency.issues.some(i => i.field === 'updatedAt')).toBe(true);
    });

    it('should allow custom validation rules', () => {
      validator.addValidationRule('CustomModel', {
        name: 'custom_validation',
        validate: (data) => {
          if (!data.customField) {
            return [{
              field: 'customField',
              message: 'Custom field is required',
              code: 'MISSING_CUSTOM_FIELD'
            }];
          }
          return [];
        }
      });

      const customData = { ...userTestData, customField: undefined };
      const validation = validator.validate(customData, 'CustomModel');
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.code === 'MISSING_CUSTOM_FIELD')).toBe(true);
    });
  });

  describe('TransformationManager', () => {
    let manager: TransformationManager;

    beforeEach(() => {
      manager = new TransformationManager({ validateInput: true, validateOutput: true });
    });

    it('should transform data for DynamoDB provider', () => {
      const result = manager.transformForProvider(userTestData, 'dynamodb', 'UserStorageModel');
      
      expect(result.validation.isValid).toBe(true);
      expect(result.data.pk).toBe(userTestData.pk);
      expect(result.data.sk).toBe(userTestData.sk);
    });

    it('should transform data for MongoDB provider', () => {
      const result = manager.transformForProvider(userTestData, 'mongodb', 'UserStorageModel');
      
      expect(result.validation.isValid).toBe(true);
      expect(result.data.pk).toBe(userTestData.pk);
      expect((result.data as MongoDBDocument).data).toBeDefined();
    });

    it('should transform between providers', () => {
      // First transform to MongoDB
      const mongoResult = manager.transformForProvider(userTestData, 'mongodb', 'UserStorageModel');
      
      // Then transform from MongoDB to DynamoDB
      const dynamoResult = manager.transformBetweenProviders(
        mongoResult.data,
        'mongodb',
        'dynamodb',
        'UserStorageModel'
      );
      
      expect(dynamoResult.validation.isValid).toBe(true);
      expect(dynamoResult.data.pk).toBe(userTestData.pk);
    });

    it('should prepare data for storage', () => {
      const prepared = manager.prepareForStorage(userTestData, 'dynamodb', 'UserStorageModel');
      
      expect(prepared.pk).toBe(userTestData.pk);
      expect(prepared.version).toBe(userTestData.version);
    });

    it('should batch transform multiple records', () => {
      const records = [userTestData, studentTestData];
      const results = manager.batchTransform(records, 'mongodb');
      
      expect(results).toHaveLength(2);
      expect(results[0].validation.isValid).toBe(true);
      expect(results[1].validation.isValid).toBe(true);
    });

    it('should provide transformation statistics', () => {
      const records = [userTestData, { ...userTestData, pk: '' }]; // One valid, one invalid
      const results = manager.batchTransform(records, 'dynamodb');
      const stats = manager.getTransformationStats(results);
      
      expect(stats.total).toBe(2);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(1);
    });

    it('should get MongoDB indexes', () => {
      const indexes = manager.getMongoDBIndexes();
      
      expect(indexes).toBeInstanceOf(Array);
      expect(indexes.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    let manager: TransformationManager;

    beforeEach(() => {
      manager = new TransformationManager();
    });

    it('should maintain data integrity through round-trip transformations', () => {
      // Original -> DynamoDB -> MongoDB -> DynamoDB -> Original
      const step1 = manager.transformForProvider(userTestData, 'dynamodb');
      const step2 = manager.transformBetweenProviders(step1.data, 'dynamodb', 'mongodb');
      const step3 = manager.transformBetweenProviders(step2.data, 'mongodb', 'dynamodb');
      const final = manager.reverseTransformFromProvider(step3.data, 'dynamodb');
      
      expect(final.data.pk).toBe(userTestData.pk);
      expect(final.data.sk).toBe(userTestData.sk);
      expect(final.data.userId).toBe(userTestData.userId);
      expect(final.data.license).toBe(userTestData.license);
    });

    it('should handle complex nested data structures', () => {
      const complexData = {
        ...userTestData,
        complexField: {
          level1: {
            level2: {
              array: [{ id: 1, name: 'test' }],
              date: new Date(),
              number: 42
            }
          }
        }
      };

      const mongoResult = manager.transformForProvider(complexData, 'mongodb');
      const reversed = manager.reverseTransformFromProvider(mongoResult.data, 'mongodb');
      
      expect(reversed.data.complexField).toEqual(complexData.complexField);
    });

    it('should validate consistency across all transformations', () => {
      const dynamoResult = manager.transformForProvider(userTestData, 'dynamodb');
      const mongoResult = manager.transformForProvider(userTestData, 'mongodb');
      
      const dynamoReversed = manager.reverseTransformFromProvider(dynamoResult.data, 'dynamodb');
      const mongoReversed = manager.reverseTransformFromProvider(mongoResult.data, 'mongodb');
      
      const consistency = manager.validateCrossProviderConsistency(
        dynamoReversed.data,
        mongoReversed.data
      );
      
      expect(consistency.isConsistent).toBe(true);
    });
  });
});