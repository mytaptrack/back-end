/**
 * Database Schema Validator
 * Validates MongoDB collections against expected schema and indexes
 */

import { MongoClient, Db, Collection } from 'mongodb';
import * as fs from 'fs/promises';

interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaError[];
  warnings: SchemaWarning[];
  collections: CollectionValidationResult[];
}

interface SchemaError {
  type: 'missing_collection' | 'missing_index' | 'invalid_schema' | 'constraint_violation';
  collection?: string;
  field?: string;
  message: string;
  details?: any;
}

interface SchemaWarning {
  type: 'performance' | 'index_suggestion' | 'data_inconsistency';
  collection?: string;
  message: string;
  details?: any;
}

interface CollectionValidationResult {
  name: string;
  exists: boolean;
  documentCount: number;
  indexes: IndexValidationResult[];
  sampleValidation: DocumentValidationResult;
}

interface IndexValidationResult {
  name: string;
  exists: boolean;
  definition: any;
  performance: {
    selectivity: number;
    usage: number;
  };
}

interface DocumentValidationResult {
  sampleSize: number;
  validDocuments: number;
  invalidDocuments: number;
  commonErrors: string[];
}

interface ExpectedSchema {
  collections: {
    [collectionName: string]: {
      required: boolean;
      indexes: ExpectedIndex[];
      validation: DocumentValidation;
    };
  };
}

interface ExpectedIndex {
  name: string;
  fields: { [field: string]: 1 | -1 };
  options?: {
    unique?: boolean;
    sparse?: boolean;
    background?: boolean;
    expireAfterSeconds?: number;
  };
}

interface DocumentValidation {
  requiredFields: string[];
  fieldTypes: { [field: string]: string };
  constraints: { [field: string]: any };
}

export class DatabaseSchemaValidator {
  private db: Db;
  private expectedSchema: ExpectedSchema;

  constructor(client: MongoClient, databaseName: string = 'mytaptrack') {
    this.db = client.db(databaseName);
    this.expectedSchema = this.getExpectedSchema();
  }

  async validateSchema(): Promise<SchemaValidationResult> {
    const errors: SchemaError[] = [];
    const warnings: SchemaWarning[] = [];
    const collections: CollectionValidationResult[] = [];

    console.log('Starting database schema validation...');

    // Get existing collections
    const existingCollections = await this.db.listCollections().toArray();
    const existingCollectionNames = existingCollections.map(c => c.name);

    // Validate each expected collection
    for (const [collectionName, expectedConfig] of Object.entries(this.expectedSchema.collections)) {
      console.log(`Validating collection: ${collectionName}`);

      const collectionExists = existingCollectionNames.includes(collectionName);
      
      if (!collectionExists && expectedConfig.required) {
        errors.push({
          type: 'missing_collection',
          collection: collectionName,
          message: `Required collection '${collectionName}' does not exist`
        });
        
        collections.push({
          name: collectionName,
          exists: false,
          documentCount: 0,
          indexes: [],
          sampleValidation: {
            sampleSize: 0,
            validDocuments: 0,
            invalidDocuments: 0,
            commonErrors: []
          }
        });
        continue;
      }

      if (!collectionExists) {
        warnings.push({
          type: 'data_inconsistency',
          collection: collectionName,
          message: `Optional collection '${collectionName}' does not exist`
        });
        continue;
      }

      // Validate collection
      const collection = this.db.collection(collectionName);
      const documentCount = await collection.countDocuments();
      
      // Validate indexes
      const indexValidation = await this.validateCollectionIndexes(collection, expectedConfig.indexes);
      
      // Validate document structure
      const documentValidation = await this.validateDocumentStructure(collection, expectedConfig.validation);

      collections.push({
        name: collectionName,
        exists: true,
        documentCount,
        indexes: indexValidation.results,
        sampleValidation: documentValidation
      });

      errors.push(...indexValidation.errors);
      warnings.push(...indexValidation.warnings);
    }

    // Check for unexpected collections
    for (const collectionName of existingCollectionNames) {
      if (!collectionName.startsWith('system.') && !this.expectedSchema.collections[collectionName]) {
        warnings.push({
          type: 'data_inconsistency',
          collection: collectionName,
          message: `Unexpected collection '${collectionName}' found`
        });
      }
    }

    const result: SchemaValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      collections
    };

    console.log(`Schema validation completed. Valid: ${result.valid}, Errors: ${errors.length}, Warnings: ${warnings.length}`);
    
    return result;
  }

  private async validateCollectionIndexes(
    collection: Collection, 
    expectedIndexes: ExpectedIndex[]
  ): Promise<{
    results: IndexValidationResult[];
    errors: SchemaError[];
    warnings: SchemaWarning[];
  }> {
    const errors: SchemaError[] = [];
    const warnings: SchemaWarning[] = [];
    const results: IndexValidationResult[] = [];

    // Get existing indexes
    const existingIndexes = await collection.listIndexes().toArray();
    const existingIndexNames = existingIndexes.map(idx => idx.name);

    // Validate each expected index
    for (const expectedIndex of expectedIndexes) {
      const exists = existingIndexNames.includes(expectedIndex.name);
      
      if (!exists) {
        errors.push({
          type: 'missing_index',
          collection: collection.collectionName,
          message: `Required index '${expectedIndex.name}' is missing`,
          details: expectedIndex
        });
      }

      const existingIndex = existingIndexes.find(idx => idx.name === expectedIndex.name);
      
      results.push({
        name: expectedIndex.name,
        exists,
        definition: existingIndex || expectedIndex,
        performance: {
          selectivity: exists ? await this.calculateIndexSelectivity(collection, expectedIndex) : 0,
          usage: 0 // Would need to query MongoDB stats for actual usage
        }
      });

      // Check index definition matches
      if (exists && existingIndex) {
        const definitionMatches = this.compareIndexDefinitions(expectedIndex, existingIndex);
        if (!definitionMatches) {
          warnings.push({
            type: 'index_suggestion',
            collection: collection.collectionName,
            message: `Index '${expectedIndex.name}' definition differs from expected`,
            details: { expected: expectedIndex, actual: existingIndex }
          });
        }
      }
    }

    // Check for unexpected indexes
    for (const existingIndex of existingIndexes) {
      if (existingIndex.name !== '_id_' && !expectedIndexes.some(exp => exp.name === existingIndex.name)) {
        warnings.push({
          type: 'performance',
          collection: collection.collectionName,
          message: `Unexpected index '${existingIndex.name}' found`,
          details: existingIndex
        });
      }
    }

    return { results, errors, warnings };
  }

  private async validateDocumentStructure(
    collection: Collection,
    validation: DocumentValidation
  ): Promise<DocumentValidationResult> {
    const sampleSize = Math.min(100, await collection.countDocuments());
    const documents = await collection.find({}).limit(sampleSize).toArray();
    
    let validDocuments = 0;
    let invalidDocuments = 0;
    const commonErrors: string[] = [];
    const errorCounts: { [error: string]: number } = {};

    for (const doc of documents) {
      const docErrors = this.validateDocument(doc, validation);
      
      if (docErrors.length === 0) {
        validDocuments++;
      } else {
        invalidDocuments++;
        docErrors.forEach(error => {
          errorCounts[error] = (errorCounts[error] || 0) + 1;
        });
      }
    }

    // Get most common errors
    const sortedErrors = Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([error]) => error);

    return {
      sampleSize,
      validDocuments,
      invalidDocuments,
      commonErrors: sortedErrors
    };
  }

  private validateDocument(doc: any, validation: DocumentValidation): string[] {
    const errors: string[] = [];

    // Check required fields
    for (const field of validation.requiredFields) {
      if (!(field in doc) || doc[field] === null || doc[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check field types
    for (const [field, expectedType] of Object.entries(validation.fieldTypes)) {
      if (field in doc && doc[field] !== null && doc[field] !== undefined) {
        const actualType = this.getFieldType(doc[field]);
        if (actualType !== expectedType) {
          errors.push(`Field '${field}' has type '${actualType}', expected '${expectedType}'`);
        }
      }
    }

    // Check constraints
    for (const [field, constraint] of Object.entries(validation.constraints)) {
      if (field in doc && doc[field] !== null && doc[field] !== undefined) {
        const constraintErrors = this.validateConstraint(doc[field], constraint, field);
        errors.push(...constraintErrors);
      }
    }

    return errors;
  }

  private getFieldType(value: any): string {
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return typeof value;
  }

  private validateConstraint(value: any, constraint: any, fieldName: string): string[] {
    const errors: string[] = [];

    if (constraint.minLength && typeof value === 'string' && value.length < constraint.minLength) {
      errors.push(`Field '${fieldName}' length ${value.length} is less than minimum ${constraint.minLength}`);
    }

    if (constraint.maxLength && typeof value === 'string' && value.length > constraint.maxLength) {
      errors.push(`Field '${fieldName}' length ${value.length} exceeds maximum ${constraint.maxLength}`);
    }

    if (constraint.min && typeof value === 'number' && value < constraint.min) {
      errors.push(`Field '${fieldName}' value ${value} is less than minimum ${constraint.min}`);
    }

    if (constraint.max && typeof value === 'number' && value > constraint.max) {
      errors.push(`Field '${fieldName}' value ${value} exceeds maximum ${constraint.max}`);
    }

    if (constraint.pattern && typeof value === 'string' && !new RegExp(constraint.pattern).test(value)) {
      errors.push(`Field '${fieldName}' does not match pattern ${constraint.pattern}`);
    }

    return errors;
  }

  private async calculateIndexSelectivity(collection: Collection, index: ExpectedIndex): Promise<number> {
    try {
      const totalDocs = await collection.countDocuments();
      if (totalDocs === 0) return 1;

      // Get distinct values for the first field in the index
      const firstField = Object.keys(index.fields)[0];
      const distinctValues = await collection.distinct(firstField);
      
      return distinctValues.length / totalDocs;
    } catch {
      return 0;
    }
  }

  private compareIndexDefinitions(expected: ExpectedIndex, actual: any): boolean {
    // Compare field definitions
    const expectedFields = JSON.stringify(expected.fields);
    const actualFields = JSON.stringify(actual.key);
    
    if (expectedFields !== actualFields) {
      return false;
    }

    // Compare options (simplified)
    if (expected.options?.unique !== actual.unique) {
      return false;
    }

    return true;
  }

  private getExpectedSchema(): ExpectedSchema {
    return {
      collections: {
        primary: {
          required: true,
          indexes: [
            {
              name: 'pk_sk_index',
              fields: { pk: 1, sk: 1 },
              options: { unique: true, background: true }
            },
            {
              name: 'pksk_index',
              fields: { pksk: 1 },
              options: { background: true }
            },
            {
              name: 'userId_index',
              fields: { userId: 1 },
              options: { sparse: true, background: true }
            },
            {
              name: 'studentId_index',
              fields: { studentId: 1 },
              options: { sparse: true, background: true }
            },
            {
              name: 'license_index',
              fields: { license: 1 },
              options: { sparse: true, background: true }
            },
            {
              name: 'email_index',
              fields: { 'data.email': 1 },
              options: { sparse: true, background: true }
            },
            {
              name: 'createdAt_index',
              fields: { createdAt: 1 },
              options: { sparse: true, background: true }
            },
            {
              name: 'license_pk_index',
              fields: { license: 1, pk: 1 },
              options: { sparse: true, background: true }
            }
          ],
          validation: {
            requiredFields: ['pk', 'sk', 'pksk', 'version'],
            fieldTypes: {
              pk: 'string',
              sk: 'string',
              pksk: 'string',
              version: 'number',
              userId: 'string',
              studentId: 'string',
              license: 'string',
              data: 'object',
              createdAt: 'date',
              updatedAt: 'date'
            },
            constraints: {
              version: { min: 1 },
              pk: { minLength: 1 },
              sk: { minLength: 1 },
              pksk: { minLength: 1 }
            }
          }
        },
        data: {
          required: true,
          indexes: [
            {
              name: 'pk_sk_index',
              fields: { pk: 1, sk: 1 },
              options: { unique: true, background: true }
            },
            {
              name: 'pksk_index',
              fields: { pksk: 1 },
              options: { background: true }
            },
            {
              name: 'timestamp_index',
              fields: { timestamp: 1 },
              options: { sparse: true, background: true }
            },
            {
              name: 'pk_timestamp_index',
              fields: { pk: 1, timestamp: 1 },
              options: { background: true }
            }
          ],
          validation: {
            requiredFields: ['pk', 'sk', 'pksk', 'version'],
            fieldTypes: {
              pk: 'string',
              sk: 'string',
              pksk: 'string',
              version: 'number',
              timestamp: 'date',
              data: 'object',
              createdAt: 'date'
            },
            constraints: {
              version: { min: 1 },
              pk: { minLength: 1 },
              sk: { minLength: 1 },
              pksk: { minLength: 1 }
            }
          }
        },
        migrations: {
          required: false,
          indexes: [
            {
              name: 'migrationId_index',
              fields: { migrationId: 1 },
              options: { unique: true, background: true }
            },
            {
              name: 'status_index',
              fields: { status: 1 },
              options: { background: true }
            },
            {
              name: 'createdAt_index',
              fields: { createdAt: 1 },
              options: { background: true }
            }
          ],
          validation: {
            requiredFields: ['migrationId', 'status', 'createdAt'],
            fieldTypes: {
              migrationId: 'string',
              status: 'string',
              sourceProvider: 'string',
              targetProvider: 'string',
              recordCount: 'number',
              errorCount: 'number',
              createdAt: 'date',
              completedAt: 'date',
              metadata: 'object'
            },
            constraints: {
              recordCount: { min: 0 },
              errorCount: { min: 0 }
            }
          }
        }
      }
    };
  }

  async generateValidationReport(result: SchemaValidationResult): Promise<string> {
    const report = [];
    
    report.push('# Database Schema Validation Report');
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push(`Overall Status: ${result.valid ? 'VALID' : 'INVALID'}`);
    report.push('');

    // Summary
    report.push('## Summary');
    report.push(`- Collections validated: ${result.collections.length}`);
    report.push(`- Errors found: ${result.errors.length}`);
    report.push(`- Warnings: ${result.warnings.length}`);
    report.push('');

    // Errors
    if (result.errors.length > 0) {
      report.push('## Errors');
      result.errors.forEach(error => {
        report.push(`- **${error.type}** (${error.collection || 'global'}): ${error.message}`);
      });
      report.push('');
    }

    // Warnings
    if (result.warnings.length > 0) {
      report.push('## Warnings');
      result.warnings.forEach(warning => {
        report.push(`- **${warning.type}** (${warning.collection || 'global'}): ${warning.message}`);
      });
      report.push('');
    }

    // Collection details
    report.push('## Collection Details');
    result.collections.forEach(collection => {
      report.push(`### ${collection.name}`);
      report.push(`- Exists: ${collection.exists}`);
      report.push(`- Document count: ${collection.documentCount}`);
      report.push(`- Indexes: ${collection.indexes.length}`);
      report.push(`- Valid documents: ${collection.sampleValidation.validDocuments}/${collection.sampleValidation.sampleSize}`);
      
      if (collection.sampleValidation.commonErrors.length > 0) {
        report.push('- Common validation errors:');
        collection.sampleValidation.commonErrors.forEach(error => {
          report.push(`  - ${error}`);
        });
      }
      report.push('');
    });

    return report.join('\n');
  }
}

import { getConfig, getMongoUrl, getDbName } from './config';

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: database-schema-validator [options]

Options:
  --mongo-url <url>         MongoDB connection string (default: mongodb://localhost:27017)
  --database <name>         Database name (default: mytaptrack)
  --output <file>           Output validation report to file
  --help, -h                Show this help message

Examples:
  # Validate local database
  database-schema-validator

  # Validate remote database with report
  database-schema-validator --mongo-url mongodb://user:pass@host:27017 --output validation-report.md
    `);
    process.exit(0);
  }

  const config = getConfig();
  const mongoUrl = args[args.indexOf('--mongo-url') + 1] || getMongoUrl();
  const database = args[args.indexOf('--database') + 1] || getDbName();
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : undefined;

  try {
    const client = new MongoClient(mongoUrl);
    await client.connect();

    const validator = new DatabaseSchemaValidator(client, database);
    const result = await validator.validateSchema();

    // Generate report
    const report = await validator.generateValidationReport(result);
    
    if (outputFile) {
      await fs.writeFile(outputFile, report);
      console.log(`Validation report saved to: ${outputFile}`);
    } else {
      console.log(report);
    }

    await client.close();
    
    process.exit(result.valid ? 0 : 1);
  } catch (error) {
    console.error('Validation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}