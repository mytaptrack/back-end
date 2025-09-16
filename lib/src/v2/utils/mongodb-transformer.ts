/**
 * MongoDB data transformer
 * Transforms data to MongoDB nested document structure with proper indexing
 */

import {
  BaseStorageModel,
  MongoDBDocument,
  IDataTransformer,
  ValidationResult,
  ValidationFieldError,
  TransformationOptions,
  ConsistencyCheckResult,
  ConsistencyIssue,
  MongoDBIndexConfig
} from '../types/storage-models';

export class MongoDBTransformer<T extends BaseStorageModel> implements IDataTransformer<T, MongoDBDocument> {
  
  constructor(private options: TransformationOptions = {}) {}

  /**
   * Transform application data to MongoDB document format
   * Creates nested structure with proper indexing fields
   */
  transform(input: T): MongoDBDocument {
    if (this.options.validateInput) {
      const isValid = this.validate(input);
      if (!isValid) {
        throw new Error(`Validation failed: Input data is invalid`);
      }
    }

    // Extract indexable fields
    const indexableFields = this.extractIndexableFields(input);
    
    // Create nested data structure
    const dataFields = this.createDataFields(input);
    
    // Ensure timestamps are properly set
    const now = new Date();
    
    const document: MongoDBDocument = {
      // Core indexable fields at root level
      pk: input.pk,
      sk: input.sk,
      pksk: input.pksk || `${input.pk}#${input.sk}`,
      version: input.version || 1,
      createdAt: input.createdAt || now,
      updatedAt: now,
      
      // Additional indexable fields
      ...indexableFields,
      
      // All other data nested in data object
      data: dataFields
    };

    if (this.options.validateOutput) {
      const validation = this.validateMongoDocument(document);
      if (!validation.isValid) {
        throw new Error(`Output validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }
    }

    return document;
  }

  /**
   * Transform MongoDB document back to application format
   * Flattens nested structure back to original format
   */
  reverse(output: MongoDBDocument): T {
    if (this.options.validateInput) {
      const validation = this.validateMongoDocument(output);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }
    }

    // Start with the nested data
    const result = { ...output.data } as any;
    
    // Add back the core fields
    result.pk = output.pk;
    result.sk = output.sk;
    result.pksk = output.pksk;
    result.version = output.version;
    result.createdAt = output.createdAt;
    result.updatedAt = output.updatedAt;
    
    // Add back any indexable fields that were extracted
    if (output.userId) result.userId = output.userId;
    if (output.studentId) result.studentId = output.studentId;
    if (output.license) result.license = output.license;
    
    // Handle any additional fields that might have been extracted
    Object.keys(output).forEach(key => {
      if (!['_id', 'pk', 'sk', 'pksk', 'version', 'createdAt', 'updatedAt', 'data', 'userId', 'studentId', 'license'].includes(key)) {
        result[key] = output[key];
      }
    });

    return result as T;
  }

  /**
   * Validate application data structure
   */
  validate(data: T): boolean {
    const errors: ValidationFieldError[] = [];

    // Check required fields
    if (!data.pk) {
      errors.push({
        field: 'pk',
        message: 'Primary key (pk) is required',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    if (!data.sk) {
      errors.push({
        field: 'sk',
        message: 'Sort key (sk) is required',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    if (typeof data.version !== 'number') {
      errors.push({
        field: 'version',
        message: 'Version must be a number',
        code: 'INVALID_TYPE'
      });
    }

    // Validate composite key consistency
    if (data.pk && data.sk && data.pksk && data.pksk !== `${data.pk}#${data.sk}`) {
      errors.push({
        field: 'pksk',
        message: 'Composite key (pksk) must match pk#sk format',
        code: 'CONSTRAINT_VIOLATION'
      });
    }

    // Validate timestamps
    if (data.createdAt && !(data.createdAt instanceof Date) && typeof data.createdAt !== 'string') {
      errors.push({
        field: 'createdAt',
        message: 'createdAt must be a Date object or ISO string',
        code: 'INVALID_TYPE'
      });
    }

    if (data.updatedAt && !(data.updatedAt instanceof Date) && typeof data.updatedAt !== 'string') {
      errors.push({
        field: 'updatedAt',
        message: 'updatedAt must be a Date object or ISO string',
        code: 'INVALID_TYPE'
      });
    }

    return errors.length === 0;
  }

  /**
   * Validate MongoDB document structure
   */
  validateMongoDocument(document: MongoDBDocument): ValidationResult {
    const errors: ValidationFieldError[] = [];

    // Check required fields
    if (!document.pk) {
      errors.push({
        field: 'pk',
        message: 'Primary key (pk) is required',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    if (!document.sk) {
      errors.push({
        field: 'sk',
        message: 'Sort key (sk) is required',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    if (!document.data || typeof document.data !== 'object') {
      errors.push({
        field: 'data',
        message: 'Data field must be an object',
        code: 'INVALID_TYPE'
      });
    }

    // Check for MongoDB field name restrictions
    const checkFieldNames = (obj: any, path: string = '') => {
      if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => {
          const fullPath = path ? `${path}.${key}` : key;
          
          // MongoDB field name restrictions
          if (key.startsWith('$')) {
            errors.push({
              field: fullPath,
              message: `Field name '${key}' cannot start with '$'`,
              code: 'CONSTRAINT_VIOLATION'
            });
          }
          
          if (key.includes('.')) {
            errors.push({
              field: fullPath,
              message: `Field name '${key}' cannot contain '.'`,
              code: 'CONSTRAINT_VIOLATION'
            });
          }
          
          // Recursively check nested objects
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            checkFieldNames(obj[key], fullPath);
          }
        });
      }
    };

    checkFieldNames(document.data, 'data');

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check data consistency for MongoDB-specific requirements
   */
  checkConsistency(data: T | MongoDBDocument): ConsistencyCheckResult {
    const issues: ConsistencyIssue[] = [];

    // Check document size (MongoDB has 16MB limit)
    const docSize = JSON.stringify(data).length;
    if (docSize > 15000000) { // Leave some buffer
      issues.push({
        type: 'constraint_violation',
        field: '_document_size',
        message: `Document size (${docSize} bytes) approaches MongoDB limit of 16MB`,
        severity: 'warning'
      });
    }

    // Check nesting depth (MongoDB has practical limits)
    const maxDepth = this.calculateNestingDepth(data);
    if (maxDepth > 100) {
      issues.push({
        type: 'constraint_violation',
        field: '_nesting_depth',
        message: `Document nesting depth (${maxDepth}) is very deep and may cause performance issues`,
        severity: 'warning'
      });
    }

    // Check for potential index key size issues
    if ('pk' in data && typeof data.pk === 'string' && data.pk.length > 1024) {
      issues.push({
        type: 'constraint_violation',
        field: 'pk',
        message: 'Primary key length may cause index size issues in MongoDB',
        severity: 'warning'
      });
    }

    return {
      isConsistent: issues.filter(i => i.severity === 'error').length === 0,
      issues
    };
  }

  /**
   * Extract fields that should be indexed at the root level
   */
  private extractIndexableFields(input: T): Partial<MongoDBDocument> {
    const indexableFields: Partial<MongoDBDocument> = {};
    
    // Common indexable fields based on existing patterns
    const indexableFieldNames = ['userId', 'studentId', 'license', 'usk', 'tsk', 'lpk', 'lsk'];
    
    indexableFieldNames.forEach(fieldName => {
      if (fieldName in input && (input as any)[fieldName] !== undefined) {
        (indexableFields as any)[fieldName] = (input as any)[fieldName];
      }
    });
    
    return indexableFields;
  }

  /**
   * Create the nested data structure
   */
  private createDataFields(input: T): Record<string, any> {
    const dataFields: Record<string, any> = {};
    
    // Fields that should NOT be in the data object (they're at root level)
    const rootLevelFields = ['pk', 'sk', 'pksk', 'version', 'createdAt', 'updatedAt', 'userId', 'studentId', 'license', 'usk', 'tsk', 'lpk', 'lsk'];
    
    Object.keys(input).forEach(key => {
      if (!rootLevelFields.includes(key)) {
        dataFields[key] = (input as any)[key];
      }
    });
    
    return dataFields;
  }

  /**
   * Calculate maximum nesting depth of an object
   */
  private calculateNestingDepth(obj: any, currentDepth: number = 0): number {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      return currentDepth;
    }
    
    let maxDepth = currentDepth;
    Object.values(obj).forEach(value => {
      const depth = this.calculateNestingDepth(value, currentDepth + 1);
      maxDepth = Math.max(maxDepth, depth);
    });
    
    return maxDepth;
  }

  /**
   * Get recommended MongoDB indexes for the transformed data
   */
  getRecommendedIndexes(): MongoDBIndexConfig[] {
    return [
      // Primary compound index for pk/sk queries
      {
        name: 'pk_sk_index',
        fields: { pk: 1, sk: 1 },
        options: { unique: true }
      },
      
      // Composite key index for direct lookups
      {
        name: 'pksk_index',
        fields: { pksk: 1 },
        options: { unique: true }
      },
      
      // User-based queries
      {
        name: 'userId_index',
        fields: { userId: 1, sk: 1 },
        options: { sparse: true }
      },
      
      // Student-based queries
      {
        name: 'studentId_index',
        fields: { studentId: 1, sk: 1 },
        options: { sparse: true }
      },
      
      // License-based queries
      {
        name: 'license_index',
        fields: { license: 1, pk: 1 },
        options: { sparse: true }
      },
      
      // Version for optimistic locking
      {
        name: 'version_index',
        fields: { pk: 1, sk: 1, version: 1 },
        options: { sparse: true }
      },
      
      // Timestamp-based queries
      {
        name: 'createdAt_index',
        fields: { createdAt: 1 },
        options: { sparse: true }
      },
      
      {
        name: 'updatedAt_index',
        fields: { updatedAt: 1 },
        options: { sparse: true }
      }
    ];
  }

  /**
   * Prepare data for MongoDB operations
   */
  prepareForStorage(data: T): MongoDBDocument {
    const transformed = this.transform(data);
    
    // Convert Date objects to proper MongoDB format if needed
    if (transformed.createdAt && typeof transformed.createdAt === 'string') {
      transformed.createdAt = new Date(transformed.createdAt);
    }
    
    if (transformed.updatedAt && typeof transformed.updatedAt === 'string') {
      transformed.updatedAt = new Date(transformed.updatedAt);
    }
    
    return transformed;
  }
}