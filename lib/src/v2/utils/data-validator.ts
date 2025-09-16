/**
 * Data validation and consistency checking utilities
 * Provides comprehensive validation across both database providers
 */

import {
  BaseStorageModel,
  ValidationResult,
  ValidationFieldError,
  ConsistencyCheckResult,
  ConsistencyIssue,
  LicensedStorageModel,
  UserStorageModel,
  StudentStorageModel,
  UserStudentStorageModel
} from '../types/storage-models';

export interface ValidationRule<T> {
  name: string;
  validate: (data: T) => ValidationFieldError[];
}

export interface ConsistencyRule<T> {
  name: string;
  check: (data: T) => ConsistencyIssue[];
}

export class DataValidator {
  private validationRules: Map<string, ValidationRule<any>[]> = new Map();
  private consistencyRules: Map<string, ConsistencyRule<any>[]> = new Map();

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Validate data against all applicable rules
   */
  validate<T extends BaseStorageModel>(data: T, modelType?: string): ValidationResult {
    const errors: ValidationFieldError[] = [];
    
    // Apply base validation rules
    errors.push(...this.validateBaseModel(data));
    
    // Apply type-specific validation rules
    if (modelType && this.validationRules.has(modelType)) {
      const rules = this.validationRules.get(modelType)!;
      rules.forEach(rule => {
        errors.push(...rule.validate(data));
      });
    }
    
    // Auto-detect model type and apply rules
    const detectedType = this.detectModelType(data);
    if (detectedType && detectedType !== modelType && this.validationRules.has(detectedType)) {
      const rules = this.validationRules.get(detectedType)!;
      rules.forEach(rule => {
        errors.push(...rule.validate(data));
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check data consistency against all applicable rules
   */
  checkConsistency<T extends BaseStorageModel>(data: T, modelType?: string): ConsistencyCheckResult {
    const issues: ConsistencyIssue[] = [];
    
    // Apply base consistency rules
    issues.push(...this.checkBaseConsistency(data));
    
    // Apply type-specific consistency rules
    if (modelType && this.consistencyRules.has(modelType)) {
      const rules = this.consistencyRules.get(modelType)!;
      rules.forEach(rule => {
        issues.push(...rule.check(data));
      });
    }
    
    // Auto-detect model type and apply rules
    const detectedType = this.detectModelType(data);
    if (detectedType && detectedType !== modelType && this.consistencyRules.has(detectedType)) {
      const rules = this.consistencyRules.get(detectedType)!;
      rules.forEach(rule => {
        issues.push(...rule.check(data));
      });
    }

    return {
      isConsistent: issues.filter(i => i.severity === 'error').length === 0,
      issues
    };
  }

  /**
   * Add custom validation rule for a specific model type
   */
  addValidationRule<T>(modelType: string, rule: ValidationRule<T>): void {
    if (!this.validationRules.has(modelType)) {
      this.validationRules.set(modelType, []);
    }
    this.validationRules.get(modelType)!.push(rule);
  }

  /**
   * Add custom consistency rule for a specific model type
   */
  addConsistencyRule<T>(modelType: string, rule: ConsistencyRule<T>): void {
    if (!this.consistencyRules.has(modelType)) {
      this.consistencyRules.set(modelType, []);
    }
    this.consistencyRules.get(modelType)!.push(rule);
  }

  /**
   * Validate base model requirements
   */
  private validateBaseModel(data: BaseStorageModel): ValidationFieldError[] {
    const errors: ValidationFieldError[] = [];

    // Required fields validation
    if (!data.pk || typeof data.pk !== 'string') {
      errors.push({
        field: 'pk',
        message: 'Primary key (pk) is required and must be a string',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    if (!data.sk || typeof data.sk !== 'string') {
      errors.push({
        field: 'sk',
        message: 'Sort key (sk) is required and must be a string',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    if (typeof data.version !== 'number' || data.version < 1) {
      errors.push({
        field: 'version',
        message: 'Version must be a positive number',
        code: 'INVALID_TYPE'
      });
    }

    // Composite key validation
    if (data.pk && data.sk) {
      const expectedPksk = `${data.pk}#${data.sk}`;
      if (data.pksk && data.pksk !== expectedPksk) {
        errors.push({
          field: 'pksk',
          message: `Composite key (pksk) must match pk#sk format. Expected: ${expectedPksk}, Got: ${data.pksk}`,
          code: 'CONSTRAINT_VIOLATION'
        });
      }
    }

    // Timestamp validation
    if (data.createdAt) {
      if (!(data.createdAt instanceof Date) && typeof data.createdAt !== 'string') {
        errors.push({
          field: 'createdAt',
          message: 'createdAt must be a Date object or ISO string',
          code: 'INVALID_TYPE'
        });
      } else if (typeof data.createdAt === 'string') {
        try {
          new Date(data.createdAt);
        } catch {
          errors.push({
            field: 'createdAt',
            message: 'createdAt string must be a valid ISO date',
            code: 'INVALID_FORMAT'
          });
        }
      }
    }

    if (data.updatedAt) {
      if (!(data.updatedAt instanceof Date) && typeof data.updatedAt !== 'string') {
        errors.push({
          field: 'updatedAt',
          message: 'updatedAt must be a Date object or ISO string',
          code: 'INVALID_TYPE'
        });
      } else if (typeof data.updatedAt === 'string') {
        try {
          new Date(data.updatedAt);
        } catch {
          errors.push({
            field: 'updatedAt',
            message: 'updatedAt string must be a valid ISO date',
            code: 'INVALID_FORMAT'
          });
        }
      }
    }

    return errors;
  }

  /**
   * Check base model consistency
   */
  private checkBaseConsistency(data: BaseStorageModel): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    // Check timestamp consistency
    if (data.createdAt && data.updatedAt) {
      const createdDate = data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt);
      const updatedDate = data.updatedAt instanceof Date ? data.updatedAt : new Date(data.updatedAt);
      
      if (updatedDate < createdDate) {
        issues.push({
          type: 'constraint_violation',
          field: 'updatedAt',
          message: 'updatedAt cannot be earlier than createdAt',
          severity: 'error'
        });
      }
    }

    // Check key format consistency
    if (data.pk && data.sk) {
      // Validate key patterns based on existing conventions
      if (data.pk.startsWith('U#') && !data.sk.match(/^(P|S#.*|T#.*)$/)) {
        issues.push({
          type: 'constraint_violation',
          field: 'sk',
          message: 'User records should have sk pattern matching P, S#*, or T#*',
          severity: 'warning'
        });
      }

      if (data.pk.startsWith('S#') && !data.sk.match(/^(P|C|D|T#.*|U#.*)$/)) {
        issues.push({
          type: 'constraint_violation',
          field: 'sk',
          message: 'Student records should have sk pattern matching P, C, D, T#*, or U#*',
          severity: 'warning'
        });
      }
    }

    return issues;
  }

  /**
   * Detect model type based on data structure
   */
  private detectModelType(data: BaseStorageModel): string | null {
    // Check for user model
    if ('userId' in data && 'usk' in data) {
      if ('studentId' in data && 'tsk' in data) {
        return 'UserStudentStorageModel';
      }
      return 'UserStorageModel';
    }

    // Check for student model
    if ('studentId' in data && 'tsk' in data && 'lpk' in data && 'lsk' in data) {
      return 'StudentStorageModel';
    }

    // Check for licensed model
    if ('license' in data) {
      return 'LicensedStorageModel';
    }

    return 'BaseStorageModel';
  }

  /**
   * Initialize default validation and consistency rules
   */
  private initializeDefaultRules(): void {
    // Licensed model validation
    this.addValidationRule<LicensedStorageModel>('LicensedStorageModel', {
      name: 'license_validation',
      validate: (data) => {
        const errors: ValidationFieldError[] = [];
        if (!data.license || typeof data.license !== 'string') {
          errors.push({
            field: 'license',
            message: 'License is required and must be a string',
            code: 'MISSING_REQUIRED_FIELD'
          });
        }
        return errors;
      }
    });

    // User model validation
    this.addValidationRule<UserStorageModel>('UserStorageModel', {
      name: 'user_validation',
      validate: (data) => {
        const errors: ValidationFieldError[] = [];
        if (!data.userId || typeof data.userId !== 'string') {
          errors.push({
            field: 'userId',
            message: 'User ID is required and must be a string',
            code: 'MISSING_REQUIRED_FIELD'
          });
        }
        if (!data.usk || typeof data.usk !== 'string') {
          errors.push({
            field: 'usk',
            message: 'User sort key (usk) is required and must be a string',
            code: 'MISSING_REQUIRED_FIELD'
          });
        }
        return errors;
      }
    });

    // Student model validation
    this.addValidationRule<StudentStorageModel>('StudentStorageModel', {
      name: 'student_validation',
      validate: (data) => {
        const errors: ValidationFieldError[] = [];
        if (!data.studentId || typeof data.studentId !== 'string') {
          errors.push({
            field: 'studentId',
            message: 'Student ID is required and must be a string',
            code: 'MISSING_REQUIRED_FIELD'
          });
        }
        if (!data.tsk || typeof data.tsk !== 'string') {
          errors.push({
            field: 'tsk',
            message: 'Team sort key (tsk) is required and must be a string',
            code: 'MISSING_REQUIRED_FIELD'
          });
        }
        if (!data.lpk || typeof data.lpk !== 'string') {
          errors.push({
            field: 'lpk',
            message: 'License primary key (lpk) is required and must be a string',
            code: 'MISSING_REQUIRED_FIELD'
          });
        }
        if (!data.lsk || typeof data.lsk !== 'string') {
          errors.push({
            field: 'lsk',
            message: 'License sort key (lsk) is required and must be a string',
            code: 'MISSING_REQUIRED_FIELD'
          });
        }
        return errors;
      }
    });

    // User consistency rules
    this.addConsistencyRule<UserStorageModel>('UserStorageModel', {
      name: 'user_key_consistency',
      check: (data) => {
        const issues: ConsistencyIssue[] = [];
        
        // Check pk format for user records
        if (!data.pk.startsWith('U#')) {
          issues.push({
            type: 'constraint_violation',
            field: 'pk',
            message: 'User records should have pk starting with U#',
            severity: 'warning'
          });
        }

        // Check if userId matches pk
        if (data.pk !== `U#${data.userId}`) {
          issues.push({
            type: 'constraint_violation',
            field: 'pk',
            message: `Primary key should match U#{userId} format. Expected: U#${data.userId}, Got: ${data.pk}`,
            severity: 'error'
          });
        }

        return issues;
      }
    });

    // Student consistency rules
    this.addConsistencyRule<StudentStorageModel>('StudentStorageModel', {
      name: 'student_key_consistency',
      check: (data) => {
        const issues: ConsistencyIssue[] = [];
        
        // Check pk format for student records
        if (!data.pk.startsWith('S#')) {
          issues.push({
            type: 'constraint_violation',
            field: 'pk',
            message: 'Student records should have pk starting with S#',
            severity: 'warning'
          });
        }

        // Check if studentId matches pk
        if (data.pk !== `S#${data.studentId}`) {
          issues.push({
            type: 'constraint_violation',
            field: 'pk',
            message: `Primary key should match S#{studentId} format. Expected: S#${data.studentId}, Got: ${data.pk}`,
            severity: 'error'
          });
        }

        return issues;
      }
    });
  }

  /**
   * Validate cross-provider data consistency
   * Ensures data maintains consistency when moving between providers
   */
  validateCrossProviderConsistency<T extends BaseStorageModel>(
    dynamoData: T,
    mongoData: T
  ): ConsistencyCheckResult {
    const issues: ConsistencyIssue[] = [];

    // Check core fields match
    const coreFields = ['pk', 'sk', 'pksk', 'version'];
    coreFields.forEach(field => {
      if ((dynamoData as any)[field] !== (mongoData as any)[field]) {
        issues.push({
          type: 'constraint_violation',
          field,
          message: `Field ${field} differs between providers: DynamoDB=${(dynamoData as any)[field]}, MongoDB=${(mongoData as any)[field]}`,
          severity: 'error'
        });
      }
    });

    // Check timestamps (allowing for small differences due to transformation)
    if (dynamoData.createdAt && mongoData.createdAt) {
      const dynamoTime = dynamoData.createdAt instanceof Date ? dynamoData.createdAt.getTime() : new Date(dynamoData.createdAt).getTime();
      const mongoTime = mongoData.createdAt instanceof Date ? mongoData.createdAt.getTime() : new Date(mongoData.createdAt).getTime();
      
      if (Math.abs(dynamoTime - mongoTime) > 1000) { // Allow 1 second difference
        issues.push({
          type: 'constraint_violation',
          field: 'createdAt',
          message: 'createdAt timestamps differ significantly between providers',
          severity: 'warning'
        });
      }
    }

    return {
      isConsistent: issues.filter(i => i.severity === 'error').length === 0,
      issues
    };
  }
}