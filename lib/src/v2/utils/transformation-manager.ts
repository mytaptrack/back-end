/**
 * Transformation manager
 * Coordinates data transformations between different database providers
 */

import {
  BaseStorageModel,
  DynamoDBDocument,
  MongoDBDocument,
  TransformationOptions,
  ValidationResult,
  ConsistencyCheckResult
} from '../types/storage-models';
import { DatabaseProviderType } from '../types/database-abstraction';

import { DynamoDBTransformer } from './dynamodb-transformer';
import { MongoDBTransformer } from './mongodb-transformer';
import { DataValidator } from './data-validator';

export interface TransformationResult<T> {
  data: T;
  validation: ValidationResult;
  consistency: ConsistencyCheckResult;
}

export class TransformationManager {
  private dynamoTransformer: DynamoDBTransformer<any>;
  private mongoTransformer: MongoDBTransformer<any>;
  private validator: DataValidator;

  constructor(options: TransformationOptions = {}) {
    this.dynamoTransformer = new DynamoDBTransformer(options);
    this.mongoTransformer = new MongoDBTransformer(options);
    this.validator = new DataValidator();
  }

  /**
   * Transform data for a specific database provider
   */
  transformForProvider<T extends BaseStorageModel>(
    data: T,
    targetProvider: DatabaseProviderType,
    modelType?: string
  ): TransformationResult<DynamoDBDocument | MongoDBDocument> {
    
    // Validate input data
    const inputValidation = this.validator.validate(data, modelType);
    if (!inputValidation.isValid) {
      throw new Error(`Input validation failed: ${inputValidation.errors.map(e => e.message).join(', ')}`);
    }

    let transformedData: DynamoDBDocument | MongoDBDocument;
    let consistency: ConsistencyCheckResult;

    switch (targetProvider) {
      case 'dynamodb':
        transformedData = this.dynamoTransformer.transform(data);
        consistency = this.dynamoTransformer.checkConsistency(data);
        break;
      
      case 'mongodb':
        transformedData = this.mongoTransformer.transform(data);
        consistency = this.mongoTransformer.checkConsistency(data);
        break;
      
      default:
        throw new Error(`Unsupported database provider: ${targetProvider}`);
    }

    // Validate transformed data
    const outputValidation = this.validator.validate(transformedData as any, modelType);

    return {
      data: transformedData,
      validation: outputValidation,
      consistency
    };
  }

  /**
   * Reverse transform data from a specific database provider
   */
  reverseTransformFromProvider<T extends BaseStorageModel>(
    data: DynamoDBDocument | MongoDBDocument,
    sourceProvider: DatabaseProviderType,
    modelType?: string
  ): TransformationResult<T> {
    
    let transformedData: T;
    let consistency: ConsistencyCheckResult;

    switch (sourceProvider) {
      case 'dynamodb':
        transformedData = this.dynamoTransformer.reverse(data as DynamoDBDocument);
        consistency = this.dynamoTransformer.checkConsistency(transformedData);
        break;
      
      case 'mongodb':
        transformedData = this.mongoTransformer.reverse(data as MongoDBDocument);
        consistency = this.mongoTransformer.checkConsistency(transformedData);
        break;
      
      default:
        throw new Error(`Unsupported database provider: ${sourceProvider}`);
    }

    // Validate transformed data
    const validation = this.validator.validate(transformedData, modelType);

    return {
      data: transformedData,
      validation,
      consistency
    };
  }

  /**
   * Transform data between different database providers
   */
  transformBetweenProviders<T extends BaseStorageModel>(
    data: DynamoDBDocument | MongoDBDocument,
    sourceProvider: DatabaseProviderType,
    targetProvider: DatabaseProviderType,
    modelType?: string
  ): TransformationResult<DynamoDBDocument | MongoDBDocument> {
    
    if (sourceProvider === targetProvider) {
      // No transformation needed, but still validate
      const validation = this.validator.validate(data as any, modelType);
      const consistency = sourceProvider === 'dynamodb' 
        ? this.dynamoTransformer.checkConsistency(data as any)
        : this.mongoTransformer.checkConsistency(data as any);
      
      return {
        data,
        validation,
        consistency
      };
    }

    // First reverse transform from source provider
    const intermediateResult = this.reverseTransformFromProvider<T>(data, sourceProvider, modelType);
    
    if (!intermediateResult.validation.isValid) {
      throw new Error(`Reverse transformation failed: ${intermediateResult.validation.errors.map(e => e.message).join(', ')}`);
    }

    // Then transform to target provider
    return this.transformForProvider(intermediateResult.data, targetProvider, modelType);
  }

  /**
   * Validate data consistency across providers
   */
  validateCrossProviderConsistency<T extends BaseStorageModel>(
    dynamoData: T,
    mongoData: T,
    modelType?: string
  ): ConsistencyCheckResult {
    return this.validator.validateCrossProviderConsistency(dynamoData, mongoData);
  }

  /**
   * Prepare data for storage in a specific provider
   */
  prepareForStorage<T extends BaseStorageModel>(
    data: T,
    provider: DatabaseProviderType,
    modelType?: string
  ): DynamoDBDocument | MongoDBDocument {
    
    const transformResult = this.transformForProvider(data, provider, modelType);
    
    if (!transformResult.validation.isValid) {
      throw new Error(`Data preparation failed: ${transformResult.validation.errors.map(e => e.message).join(', ')}`);
    }

    // Check for critical consistency issues
    const criticalIssues = transformResult.consistency.issues.filter(i => i.severity === 'error');
    if (criticalIssues.length > 0) {
      throw new Error(`Critical consistency issues: ${criticalIssues.map(i => i.message).join(', ')}`);
    }

    // Apply provider-specific preparation
    switch (provider) {
      case 'dynamodb':
        return this.dynamoTransformer.prepareForStorage(data);
      
      case 'mongodb':
        return this.mongoTransformer.prepareForStorage(data);
      
      default:
        throw new Error(`Unsupported database provider: ${provider}`);
    }
  }

  /**
   * Get recommended indexes for MongoDB collections
   */
  getMongoDBIndexes(): any[] {
    return this.mongoTransformer.getRecommendedIndexes();
  }

  /**
   * Batch transform multiple records
   */
  batchTransform<T extends BaseStorageModel>(
    records: T[],
    targetProvider: DatabaseProviderType,
    modelType?: string
  ): Array<TransformationResult<DynamoDBDocument | MongoDBDocument>> {
    
    return records.map(record => {
      try {
        return this.transformForProvider(record, targetProvider, modelType);
      } catch (error) {
        // Return error result for failed transformations
        return {
          data: null as any,
          validation: {
            isValid: false,
            errors: [{
              field: '_transformation',
              message: error instanceof Error ? error.message : 'Unknown transformation error',
              code: 'TRANSFORMATION_ERROR'
            }]
          },
          consistency: {
            isConsistent: false,
            issues: [{
              type: 'constraint_violation',
              field: '_transformation',
              message: 'Transformation failed',
              severity: 'error' as const
            }]
          }
        };
      }
    });
  }

  /**
   * Batch reverse transform multiple records
   */
  batchReverseTransform<T extends BaseStorageModel>(
    records: Array<DynamoDBDocument | MongoDBDocument>,
    sourceProvider: DatabaseProviderType,
    modelType?: string
  ): Array<TransformationResult<T>> {
    
    return records.map(record => {
      try {
        return this.reverseTransformFromProvider<T>(record, sourceProvider, modelType);
      } catch (error) {
        // Return error result for failed transformations
        return {
          data: null as any,
          validation: {
            isValid: false,
            errors: [{
              field: '_transformation',
              message: error instanceof Error ? error.message : 'Unknown transformation error',
              code: 'TRANSFORMATION_ERROR'
            }]
          },
          consistency: {
            isConsistent: false,
            issues: [{
              type: 'constraint_violation',
              field: '_transformation',
              message: 'Reverse transformation failed',
              severity: 'error' as const
            }]
          }
        };
      }
    });
  }

  /**
   * Get transformation statistics for monitoring
   */
  getTransformationStats(results: Array<TransformationResult<any>>): {
    total: number;
    successful: number;
    failed: number;
    validationErrors: number;
    consistencyIssues: number;
  } {
    
    const stats = {
      total: results.length,
      successful: 0,
      failed: 0,
      validationErrors: 0,
      consistencyIssues: 0
    };

    results.forEach(result => {
      if (result.validation.isValid && result.consistency.isConsistent) {
        stats.successful++;
      } else {
        stats.failed++;
      }

      if (!result.validation.isValid) {
        stats.validationErrors++;
      }

      if (!result.consistency.isConsistent) {
        stats.consistencyIssues++;
      }
    });

    return stats;
  }
}