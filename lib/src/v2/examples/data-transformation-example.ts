/**
 * Data transformation layer usage examples
 * Demonstrates how to use the storage models and transformers
 */

import {
  BaseStorageModel,
  UserStorageModel,
  StudentStorageModel,
  TransformationOptions
} from '../types/storage-models';

import { DynamoDBTransformer } from '../utils/dynamodb-transformer';
import { MongoDBTransformer } from '../utils/mongodb-transformer';
import { DataValidator } from '../utils/data-validator';
import { TransformationManager } from '../utils/transformation-manager';

// Example: Basic data transformation
export async function basicTransformationExample() {
  console.log('=== Basic Data Transformation Example ===');
  
  // Sample user data
  const userData: UserStorageModel = {
    pk: 'U#user123',
    sk: 'P',
    pksk: 'U#user123#P',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    license: 'license123',
    userId: 'user123',
    usk: 'P'
  };

  // Create transformation manager
  const manager = new TransformationManager({
    validateInput: true,
    validateOutput: true,
    strictMode: true
  });

  try {
    // Transform for DynamoDB
    console.log('Transforming for DynamoDB...');
    const dynamoResult = manager.transformForProvider(userData, 'dynamodb', 'UserStorageModel');
    console.log('DynamoDB transformation successful:', dynamoResult.validation.isValid);
    console.log('DynamoDB data:', JSON.stringify(dynamoResult.data, null, 2));

    // Transform for MongoDB
    console.log('\nTransforming for MongoDB...');
    const mongoResult = manager.transformForProvider(userData, 'mongodb', 'UserStorageModel');
    console.log('MongoDB transformation successful:', mongoResult.validation.isValid);
    console.log('MongoDB data structure:', {
      pk: mongoResult.data.pk,
      sk: mongoResult.data.sk,
      userId: (mongoResult.data as any).userId,
      hasNestedData: 'data' in mongoResult.data
    });

  } catch (error) {
    console.error('Transformation failed:', error);
  }
}

// Example: Cross-provider data migration
export async function crossProviderMigrationExample() {
  console.log('\n=== Cross-Provider Migration Example ===');
  
  const studentData: StudentStorageModel = {
    pk: 'S#student456',
    sk: 'P',
    pksk: 'S#student456#P',
    version: 1,
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date(),
    license: 'license456',
    studentId: 'student456',
    tsk: 'T#user123',
    lpk: 'L#license456',
    lsk: 'P'
  };

  const manager = new TransformationManager();

  try {
    // Simulate data coming from DynamoDB
    console.log('Preparing DynamoDB data...');
    const dynamoData = manager.prepareForStorage(studentData, 'dynamodb');
    
    // Migrate from DynamoDB to MongoDB
    console.log('Migrating from DynamoDB to MongoDB...');
    const migrationResult = manager.transformBetweenProviders(
      dynamoData,
      'dynamodb',
      'mongodb',
      'StudentStorageModel'
    );
    
    console.log('Migration successful:', migrationResult.validation.isValid);
    console.log('Migration consistency:', migrationResult.consistency.isConsistent);
    
    if (migrationResult.consistency.issues.length > 0) {
      console.log('Migration issues:', migrationResult.consistency.issues);
    }

    // Verify data integrity
    const reversedData = manager.reverseTransformFromProvider(
      migrationResult.data,
      'mongodb',
      'StudentStorageModel'
    );
    
    console.log('Data integrity check:');
    console.log('Original studentId:', studentData.studentId);
    console.log('Migrated studentId:', reversedData.data.studentId);
    console.log('Match:', studentData.studentId === reversedData.data.studentId);

  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Example: Batch processing with validation
export async function batchProcessingExample() {
  console.log('\n=== Batch Processing Example ===');
  
  // Sample batch of mixed data
  const batchData: BaseStorageModel[] = [
    {
      pk: 'U#user1',
      sk: 'P',
      pksk: 'U#user1#P',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      pk: 'U#user2',
      sk: 'P',
      pksk: 'U#user2#P',
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      pk: '', // Invalid data
      sk: 'P',
      pksk: '#P',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const manager = new TransformationManager();

  try {
    console.log('Processing batch of', batchData.length, 'records...');
    
    // Batch transform to MongoDB
    const results = manager.batchTransform(batchData, 'mongodb');
    
    // Get statistics
    const stats = manager.getTransformationStats(results);
    console.log('Batch processing statistics:', stats);
    
    // Process results
    results.forEach((result, index) => {
      if (result.validation.isValid) {
        console.log(`Record ${index + 1}: ✓ Valid`);
      } else {
        console.log(`Record ${index + 1}: ✗ Invalid -`, result.validation.errors[0]?.message);
      }
    });

  } catch (error) {
    console.error('Batch processing failed:', error);
  }
}

// Example: Custom validation rules
export async function customValidationExample() {
  console.log('\n=== Custom Validation Example ===');
  
  const validator = new DataValidator();
  
  // Add custom validation rule for user data
  validator.addValidationRule<UserStorageModel>('UserStorageModel', {
    name: 'email_validation',
    validate: (data) => {
      const errors = [];
      
      // Check if user has email in nested data
      if ('email' in data && typeof (data as any).email === 'string') {
        const email = (data as any).email;
        if (!email.includes('@')) {
          errors.push({
            field: 'email',
            message: 'Email must contain @ symbol',
            code: 'INVALID_EMAIL_FORMAT'
          });
        }
      }
      
      return errors;
    }
  });

  // Add custom consistency rule
  validator.addConsistencyRule<UserStorageModel>('UserStorageModel', {
    name: 'license_consistency',
    check: (data) => {
      const issues = [];
      
      // Check if license format matches expected pattern
      if (data.license && !data.license.startsWith('license')) {
        issues.push({
          type: 'constraint_violation' as const,
          field: 'license',
          message: 'License should start with "license" prefix',
          severity: 'warning' as const
        });
      }
      
      return issues;
    }
  });

  // Test custom validation
  const testData: UserStorageModel & { email: string } = {
    pk: 'U#user123',
    sk: 'P',
    pksk: 'U#user123#P',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    license: 'invalid_license_format',
    userId: 'user123',
    usk: 'P',
    email: 'invalid-email'
  };

  console.log('Testing custom validation...');
  const validation = validator.validate(testData, 'UserStorageModel');
  console.log('Validation result:', validation.isValid);
  console.log('Validation errors:', validation.errors);

  const consistency = validator.checkConsistency(testData, 'UserStorageModel');
  console.log('Consistency result:', consistency.isConsistent);
  console.log('Consistency issues:', consistency.issues);
}

// Example: MongoDB index management
export async function mongoIndexExample() {
  console.log('\n=== MongoDB Index Management Example ===');
  
  const mongoTransformer = new MongoDBTransformer<UserStorageModel>();
  
  // Get recommended indexes
  const indexes = mongoTransformer.getRecommendedIndexes();
  
  console.log('Recommended MongoDB indexes:');
  indexes.forEach((index, i) => {
    console.log(`${i + 1}. ${index.name}:`);
    console.log('   Fields:', JSON.stringify(index.fields));
    console.log('   Options:', JSON.stringify(index.options || {}));
  });

  // Example of how you might create these indexes in MongoDB
  console.log('\nExample MongoDB index creation commands:');
  indexes.forEach(index => {
    const optionsStr = index.options ? `, ${JSON.stringify(index.options)}` : '';
    console.log(`db.collection.createIndex(${JSON.stringify(index.fields)}${optionsStr})`);
  });
}

// Example: Error handling and recovery
export async function errorHandlingExample() {
  console.log('\n=== Error Handling Example ===');
  
  const manager = new TransformationManager({ strictMode: true });
  
  // Test with invalid data
  const invalidData = {
    pk: '', // Missing required field
    sk: 'P',
    version: 'invalid' // Wrong type
  } as any;

  try {
    console.log('Attempting to transform invalid data...');
    const result = manager.transformForProvider(invalidData, 'dynamodb');
    console.log('Unexpected success:', result);
  } catch (error) {
    console.log('Expected error caught:', error instanceof Error ? error.message : error);
  }

  // Test with recoverable data
  const recoverableData: BaseStorageModel = {
    pk: 'U#user123',
    sk: 'P',
    pksk: '', // Will be auto-generated
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  try {
    console.log('Attempting to transform recoverable data...');
    const result = manager.transformForProvider(recoverableData, 'dynamodb');
    console.log('Recovery successful:', result.validation.isValid);
    console.log('Auto-generated pksk:', result.data.pksk);
  } catch (error) {
    console.error('Recovery failed:', error);
  }
}

// Run all examples
export async function runAllExamples() {
  console.log('Data Transformation Layer Examples\n');
  
  await basicTransformationExample();
  await crossProviderMigrationExample();
  await batchProcessingExample();
  await customValidationExample();
  await mongoIndexExample();
  await errorHandlingExample();
  
  console.log('\n=== All examples completed ===');
}

// Export for use in other modules
export {
  TransformationManager,
  DataValidator,
  DynamoDBTransformer,
  MongoDBTransformer
};

// If running directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}