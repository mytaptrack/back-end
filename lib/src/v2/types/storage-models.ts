/**
 * Base storage model interfaces and data transformation types
 * Provides unified data models that work across different database providers
 */

// Base storage model with common fields required by all entities
export interface BaseStorageModel {
  pk: string;           // Primary key
  sk: string;           // Sort key
  pksk: string;         // Composite key for indexing
  version: number;      // Version for optimistic locking
  createdAt?: Date;     // Creation timestamp
  updatedAt?: Date;     // Last update timestamp
}

// Extended base model with license information
export interface LicensedStorageModel extends BaseStorageModel {
  license: string;      // License identifier
}

// User-specific storage model
export interface UserStorageModel extends LicensedStorageModel {
  userId: string;       // User identifier
  usk: string;          // User sort key
}

// Student-specific storage model
export interface StudentStorageModel extends LicensedStorageModel {
  studentId: string;    // Student identifier
  tsk: string;          // Team sort key
  lpk: string;          // License primary key
  lsk: string;          // License sort key
}

// Combined user-student storage model
export interface UserStudentStorageModel extends UserStorageModel {
  studentId: string;    // Student identifier
  tsk: string;          // Team sort key
}

// Data transformation interfaces for different database providers
export interface IDataTransformer<TInput, TOutput> {
  transform(input: TInput): TOutput;
  reverse(output: TOutput): TInput;
  validate(data: TInput | TOutput): boolean;
}

// Database-specific document structures
export interface DynamoDBDocument extends BaseStorageModel {
  // DynamoDB maintains the existing flat structure
  [key: string]: any;
}

export interface MongoDBDocument {
  _id?: string;         // MongoDB ObjectId
  pk: string;           // Primary key (indexed)
  sk: string;           // Sort key (indexed)
  pksk: string;         // Composite key (indexed)
  userId?: string;      // User identifier (indexed if present)
  studentId?: string;   // Student identifier (indexed if present)
  license?: string;     // License identifier (indexed if present)
  data: {               // Nested document structure
    [key: string]: any;
  };
  version: number;      // Version for optimistic locking
  createdAt?: Date;     // Creation timestamp
  updatedAt?: Date;     // Last update timestamp
}

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationFieldError[];
}

export interface ValidationFieldError {
  field: string;
  message: string;
  code: string;
}

// Data consistency check interface
export interface ConsistencyCheckResult {
  isConsistent: boolean;
  issues: ConsistencyIssue[];
}

export interface ConsistencyIssue {
  type: 'missing_field' | 'invalid_type' | 'constraint_violation' | 'reference_error';
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// Transformation options
export interface TransformationOptions {
  validateInput?: boolean;
  validateOutput?: boolean;
  preserveUnknownFields?: boolean;
  strictMode?: boolean;
}

// Index configuration for MongoDB
export interface MongoDBIndexConfig {
  name: string;
  fields: { [field: string]: 1 | -1 };
  options?: {
    unique?: boolean;
    sparse?: boolean;
    background?: boolean;
    expireAfterSeconds?: number;
  };
}