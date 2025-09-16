/**
 * Database utility functions for key transformations and query building
 * Provides helper functions for working with the database abstraction layer
 */

import { 
  DatabaseKey, 
  UnifiedQueryInput, 
  UnifiedScanInput, 
  KeyCondition, 
  FilterCondition,
  UnifiedUpdateInput 
} from '../types/database-abstraction';
import { DalKey, QueryInput as DynamoQueryInput, ScanInput as DynamoScanInput, UpdateInput as DynamoUpdateInput } from '../dals/dal';
import { ValidationError } from '../types/database-errors';

// Key transformation utilities
export class DatabaseKeyUtils {
  /**
   * Convert a unified DatabaseKey to DynamoDB DalKey format
   */
  static toDynamoDBKey(key: DatabaseKey): DalKey {
    if (!key.primary) {
      throw new ValidationError('Primary key is required');
    }

    return {
      pk: String(key.primary),
      sk: key.sort ? String(key.sort) : undefined
    } as DalKey;
  }

  /**
   * Convert a DynamoDB DalKey to unified DatabaseKey format
   */
  static fromDynamoDBKey(dalKey: DalKey): DatabaseKey {
    return {
      primary: dalKey.pk,
      sort: dalKey.sk
    };
  }

  /**
   * Convert a unified DatabaseKey to MongoDB document ID format
   */
  static toMongoDBKey(key: DatabaseKey): any {
    if (!key.primary) {
      throw new ValidationError('Primary key is required');
    }

    if (key.sort) {
      // For composite keys, create a compound key
      return {
        pk: String(key.primary),
        sk: String(key.sort)
      };
    }

    return { pk: String(key.primary) };
  }

  /**
   * Generate a composite key string for indexing
   */
  static generateCompositeKey(primary: string | number, sort?: string | number): string {
    if (sort !== undefined) {
      return `${primary}#${sort}`;
    }
    return String(primary);
  }

  /**
   * Parse a composite key string back to components
   */
  static parseCompositeKey(compositeKey: string): { primary: string, sort?: string } {
    const parts = compositeKey.split('#');
    return {
      primary: parts[0],
      sort: parts.length > 1 ? parts[1] : undefined
    };
  }
}

// Query transformation utilities
export class QueryTransformUtils {
  /**
   * Convert unified query input to DynamoDB query format
   */
  static toDynamoDBQuery(input: UnifiedQueryInput): DynamoQueryInput {
    const result: DynamoQueryInput = {
      keyExpression: '',
      attributeNames: {},
      attributeValues: {}
    };

    // Build key condition expression
    if (input.keyCondition) {
      const keyCondition = this.buildDynamoDBKeyCondition(input.keyCondition, result.attributeNames!, result.attributeValues!);
      result.keyExpression = keyCondition;
    }

    // Build filter expression
    if (input.filterCondition) {
      result.filterExpression = this.buildDynamoDBFilterCondition(input.filterCondition, result.attributeNames!, result.attributeValues!);
    }

    // Add projection
    if (input.projection && input.projection.length > 0) {
      result.projectionExpression = input.projection.map(field => `#${field}`).join(', ');
      input.projection.forEach(field => {
        result.attributeNames![`#${field}`] = field;
      });
    }

    // Add other options
    if (input.indexName) result.indexName = input.indexName as any;
    if (input.limit) result.limit = input.limit;

    return result;
  }

  /**
   * Convert unified scan input to DynamoDB scan format
   */
  static toDynamoDBScan(input: UnifiedScanInput): DynamoScanInput {
    const result: DynamoScanInput = {
      token: input.startKey
    };

    const attributeNames: Record<string, string> = {};
    const attributeValues: Record<string, any> = {};

    // Build filter expression
    if (input.filterCondition) {
      result.filterExpression = this.buildDynamoDBFilterCondition(input.filterCondition, attributeNames, attributeValues);
      result.attributeNames = attributeNames;
      result.attributeValues = attributeValues;
    }

    // Add projection
    if (input.projection && input.projection.length > 0) {
      result.projectionExpression = input.projection.map(field => `#${field}`).join(', ');
      input.projection.forEach(field => {
        attributeNames[`#${field}`] = field;
      });
      result.attributeNames = attributeNames;
    }

    // Add other options
    if (input.indexName) result.indexName = input.indexName as any;

    return result;
  }

  /**
   * Convert unified update input to DynamoDB update format
   */
  static toDynamoDBUpdate(input: UnifiedUpdateInput): DynamoUpdateInput {
    const key = DatabaseKeyUtils.toDynamoDBKey(input.key);
    const attributeNames: Record<string, string> = {};
    const attributeValues: Record<string, any> = {};
    const updateExpressions: string[] = [];

    // Build SET expressions for regular updates
    if (input.updates && Object.keys(input.updates).length > 0) {
      const setExpressions: string[] = [];
      Object.entries(input.updates).forEach(([field, value]) => {
        const nameKey = `#${field}`;
        const valueKey = `:${field}`;
        attributeNames[nameKey] = field;
        attributeValues[valueKey] = value;
        setExpressions.push(`${nameKey} = ${valueKey}`);
      });
      if (setExpressions.length > 0) {
        updateExpressions.push(`SET ${setExpressions.join(', ')}`);
      }
    }

    // Build ADD expressions for increments
    if (input.incrementFields && Object.keys(input.incrementFields).length > 0) {
      const addExpressions: string[] = [];
      Object.entries(input.incrementFields).forEach(([field, value]) => {
        const nameKey = `#${field}_inc`;
        const valueKey = `:${field}_inc`;
        attributeNames[nameKey] = field;
        attributeValues[valueKey] = value;
        addExpressions.push(`${nameKey} ${valueKey}`);
      });
      if (addExpressions.length > 0) {
        updateExpressions.push(`ADD ${addExpressions.join(', ')}`);
      }
    }

    // Build condition expression
    let conditionExpression: string | undefined;
    if (input.condition) {
      conditionExpression = this.buildDynamoDBFilterCondition(input.condition, attributeNames, attributeValues);
    }

    return {
      key,
      updateExpression: updateExpressions.join(' '),
      attributeNames: Object.keys(attributeNames).length > 0 ? attributeNames : undefined,
      attributeValues: Object.keys(attributeValues).length > 0 ? attributeValues : undefined,
      condition: conditionExpression
    };
  }

  /**
   * Build DynamoDB key condition expression
   */
  private static buildDynamoDBKeyCondition(
    condition: KeyCondition, 
    attributeNames: Record<string, string>, 
    attributeValues: Record<string, any>
  ): string {
    const nameKey = `#${condition.field}`;
    const valueKey = `:${condition.field}`;
    
    attributeNames[nameKey] = condition.field;
    attributeValues[valueKey] = condition.value;

    switch (condition.operator) {
      case '=':
        return `${nameKey} = ${valueKey}`;
      case 'begins_with':
        return `begins_with(${nameKey}, ${valueKey})`;
      case 'between':
        if (condition.value2 === undefined) {
          throw new ValidationError('Between operator requires two values');
        }
        const valueKey2 = `:${condition.field}_2`;
        attributeValues[valueKey2] = condition.value2;
        return `${nameKey} BETWEEN ${valueKey} AND ${valueKey2}`;
      default:
        throw new ValidationError(`Unsupported key condition operator: ${condition.operator}`);
    }
  }

  /**
   * Build DynamoDB filter condition expression
   */
  private static buildDynamoDBFilterCondition(
    condition: FilterCondition, 
    attributeNames: Record<string, string>, 
    attributeValues: Record<string, any>
  ): string {
    const nameKey = `#${condition.field}`;
    attributeNames[nameKey] = condition.field;

    switch (condition.operator) {
      case '=':
      case '!=':
      case '<':
      case '<=':
      case '>':
      case '>=':
        const valueKey = `:${condition.field}`;
        attributeValues[valueKey] = condition.value;
        const operator = condition.operator === '!=' ? '<>' : condition.operator;
        return `${nameKey} ${operator} ${valueKey}`;
      
      case 'contains':
        const containsValueKey = `:${condition.field}`;
        attributeValues[containsValueKey] = condition.value;
        return `contains(${nameKey}, ${containsValueKey})`;
      
      case 'exists':
        return `attribute_exists(${nameKey})`;
      
      case 'not_exists':
        return `attribute_not_exists(${nameKey})`;
      
      case 'in':
        if (!condition.values || condition.values.length === 0) {
          throw new ValidationError('IN operator requires values array');
        }
        const inValueKeys = condition.values.map((_, index) => {
          const key = `:${condition.field}_${index}`;
          attributeValues[key] = condition.values![index];
          return key;
        });
        return `${nameKey} IN (${inValueKeys.join(', ')})`;
      
      default:
        throw new ValidationError(`Unsupported filter condition operator: ${condition.operator}`);
    }
  }
}

// Data transformation utilities
export class DataTransformUtils {
  /**
   * Transform data for DynamoDB storage (maintains existing structure)
   */
  static toDynamoDBFormat(data: any): any {
    // DynamoDB format is already the expected format
    return data;
  }

  /**
   * Transform data from DynamoDB format to unified format
   */
  static fromDynamoDBFormat(data: any): any {
    // DynamoDB format is already the expected format
    return data;
  }

  /**
   * Transform data for MongoDB storage
   */
  static toMongoDBFormat(data: any): any {
    if (!data) return data;

    const { pk, sk, ...otherFields } = data;
    
    return {
      pk,
      sk,
      pksk: DatabaseKeyUtils.generateCompositeKey(pk, sk),
      data: otherFields,
      createdAt: data.createdAt || new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Transform data from MongoDB format to unified format
   */
  static fromMongoDBFormat(data: any): any {
    if (!data) return data;

    const { _id, data: nestedData, ...baseFields } = data;
    
    return {
      ...baseFields,
      ...nestedData
    };
  }

  /**
   * Validate data structure for storage
   */
  static validateDataStructure(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Data must be a non-null object');
    }

    if (!data.pk) {
      throw new ValidationError('Data must have a pk (primary key) field');
    }

    if (Array.isArray(data)) {
      throw new ValidationError('Data cannot be an array');
    }
  }

  /**
   * Sanitize data for storage (remove undefined values, etc.)
   */
  static sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized: any = {};
    
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          sanitized[key] = this.sanitizeData(value);
        } else {
          sanitized[key] = value;
        }
      }
    });

    return sanitized;
  }
}

// Validation utilities
export class ValidationUtils {
  /**
   * Validate database key structure
   */
  static validateDatabaseKey(key: DatabaseKey): void {
    if (!key) {
      throw new ValidationError('Database key is required');
    }

    if (!key.primary) {
      throw new ValidationError('Primary key is required');
    }

    if (typeof key.primary !== 'string' && typeof key.primary !== 'number') {
      throw new ValidationError('Primary key must be a string or number');
    }

    if (key.sort !== undefined && typeof key.sort !== 'string' && typeof key.sort !== 'number') {
      throw new ValidationError('Sort key must be a string or number');
    }
  }

  /**
   * Validate query input structure
   */
  static validateQueryInput(input: UnifiedQueryInput): void {
    if (!input) {
      throw new ValidationError('Query input is required');
    }

    if (input.keyCondition) {
      this.validateKeyCondition(input.keyCondition);
    }

    if (input.filterCondition) {
      this.validateFilterCondition(input.filterCondition);
    }

    if (input.limit !== undefined && (input.limit <= 0 || !Number.isInteger(input.limit))) {
      throw new ValidationError('Limit must be a positive integer');
    }
  }

  /**
   * Validate key condition structure
   */
  static validateKeyCondition(condition: KeyCondition): void {
    if (!condition.field) {
      throw new ValidationError('Key condition field is required');
    }

    if (!['=', 'begins_with', 'between'].includes(condition.operator)) {
      throw new ValidationError(`Invalid key condition operator: ${condition.operator}`);
    }

    if (condition.value === undefined) {
      throw new ValidationError('Key condition value is required');
    }

    if (condition.operator === 'between' && condition.value2 === undefined) {
      throw new ValidationError('Between operator requires two values');
    }
  }

  /**
   * Validate filter condition structure
   */
  static validateFilterCondition(condition: FilterCondition): void {
    if (!condition.field) {
      throw new ValidationError('Filter condition field is required');
    }

    const validOperators = ['=', '!=', '<', '<=', '>', '>=', 'contains', 'exists', 'not_exists', 'in'];
    if (!validOperators.includes(condition.operator)) {
      throw new ValidationError(`Invalid filter condition operator: ${condition.operator}`);
    }

    const operatorsRequiringValue = ['=', '!=', '<', '<=', '>', '>=', 'contains'];
    if (operatorsRequiringValue.includes(condition.operator) && condition.value === undefined) {
      throw new ValidationError(`Operator ${condition.operator} requires a value`);
    }

    if (condition.operator === 'in' && (!condition.values || condition.values.length === 0)) {
      throw new ValidationError('IN operator requires a non-empty values array');
    }
  }
}