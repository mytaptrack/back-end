# Data Transformation Layer

The data transformation layer provides a unified interface for transforming data between different database providers (DynamoDB and MongoDB) while maintaining data consistency and validation.

## Overview

This layer consists of several key components:

- **Storage Models**: Base interfaces that define common data structures
- **Transformers**: Provider-specific transformation logic
- **Validator**: Comprehensive data validation and consistency checking
- **Transformation Manager**: Orchestrates transformations between providers

## Key Features

### 1. Base Storage Models

```typescript
import { BaseStorageModel, UserStorageModel, StudentStorageModel } from '../types/storage-models';

// Base model with common fields
const baseData: BaseStorageModel = {
  pk: 'U#user123',
  sk: 'P',
  pksk: 'U#user123#P',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// User-specific model
const userData: UserStorageModel = {
  ...baseData,
  license: 'license123',
  userId: 'user123',
  usk: 'P'
};
```

### 2. Provider-Specific Transformations

#### DynamoDB Transformer
Maintains the existing flat structure while providing validation and consistency checks:

```typescript
import { DynamoDBTransformer } from './dynamodb-transformer';

const transformer = new DynamoDBTransformer({ validateInput: true });
const dynamoDoc = transformer.transform(userData);
// Result: Flat structure compatible with existing DynamoDB schema
```

#### MongoDB Transformer
Creates nested document structure with proper indexing:

```typescript
import { MongoDBTransformer } from './mongodb-transformer';

const transformer = new MongoDBTransformer({ validateInput: true });
const mongoDoc = transformer.transform(userData);
// Result: Nested structure with indexable fields at root level
```

### 3. Unified Transformation Management

```typescript
import { TransformationManager } from './transformation-manager';

const manager = new TransformationManager();

// Transform for specific provider
const result = manager.transformForProvider(userData, 'mongodb', 'UserStorageModel');

// Transform between providers
const migrated = manager.transformBetweenProviders(
  dynamoDoc,
  'dynamodb',
  'mongodb',
  'UserStorageModel'
);

// Batch processing
const results = manager.batchTransform(userArray, 'mongodb');
```

### 4. Data Validation and Consistency

```typescript
import { DataValidator } from './data-validator';

const validator = new DataValidator();

// Validate data structure
const validation = validator.validate(userData, 'UserStorageModel');

// Check consistency
const consistency = validator.checkConsistency(userData);

// Cross-provider consistency
const crossCheck = validator.validateCrossProviderConsistency(dynamoData, mongoData);
```

## Data Structure Mapping

### DynamoDB Structure (Existing)
```json
{
  "pk": "U#user123",
  "sk": "P",
  "pksk": "U#user123#P",
  "version": 1,
  "userId": "user123",
  "license": "license123",
  "usk": "P",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z",
  "otherField": "value"
}
```

### MongoDB Structure (New)
```json
{
  "_id": "ObjectId(...)",
  "pk": "U#user123",
  "sk": "P",
  "pksk": "U#user123#P",
  "version": 1,
  "userId": "user123",
  "license": "license123",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z",
  "data": {
    "usk": "P",
    "otherField": "value"
  }
}
```

## MongoDB Indexes

The MongoDB transformer provides recommended indexes for optimal query performance:

```javascript
// Primary compound index
db.collection.createIndex({ "pk": 1, "sk": 1 }, { unique: true })

// Composite key index
db.collection.createIndex({ "pksk": 1 }, { unique: true })

// User-based queries
db.collection.createIndex({ "userId": 1, "sk": 1 }, { sparse: true })

// Student-based queries
db.collection.createIndex({ "studentId": 1, "sk": 1 }, { sparse: true })

// License-based queries
db.collection.createIndex({ "license": 1, "pk": 1 }, { sparse: true })
```

## Validation Rules

### Built-in Validation
- Required fields (pk, sk, version)
- Data type validation
- Composite key consistency
- Timestamp validation
- Provider-specific constraints

### Custom Validation
```typescript
validator.addValidationRule<UserStorageModel>('UserStorageModel', {
  name: 'custom_validation',
  validate: (data) => {
    const errors = [];
    if (!data.customField) {
      errors.push({
        field: 'customField',
        message: 'Custom field is required',
        code: 'MISSING_CUSTOM_FIELD'
      });
    }
    return errors;
  }
});
```

## Error Handling

The transformation layer provides comprehensive error handling:

```typescript
try {
  const result = manager.transformForProvider(data, 'mongodb');
  if (!result.validation.isValid) {
    console.error('Validation errors:', result.validation.errors);
  }
  if (!result.consistency.isConsistent) {
    console.warn('Consistency issues:', result.consistency.issues);
  }
} catch (error) {
  console.error('Transformation failed:', error.message);
}
```

## Migration Support

The transformation layer supports data migration between providers:

```typescript
// Export from DynamoDB
const dynamoData = await dynamoProvider.scan({ /* query */ });

// Transform to MongoDB format
const mongoResults = manager.batchTransform(dynamoData.items, 'mongodb');

// Import to MongoDB
for (const result of mongoResults) {
  if (result.validation.isValid) {
    await mongoProvider.put(result.data);
  } else {
    console.error('Failed to migrate record:', result.validation.errors);
  }
}
```

## Performance Considerations

### DynamoDB
- Maintains existing flat structure for optimal performance
- No additional transformation overhead
- Compatible with existing indexes and queries

### MongoDB
- Nested structure optimized for MongoDB queries
- Indexable fields at root level for performance
- Recommended indexes for common query patterns

## Testing

Comprehensive test suite validates:
- Data transformation accuracy
- Round-trip data integrity
- Cross-provider consistency
- Validation rule enforcement
- Error handling scenarios

```typescript
// Run tests
npm test -- --testPathPattern=data-transformation.spec.ts
```

## Usage Examples

See `data-transformation-example.ts` for comprehensive usage examples including:
- Basic transformations
- Cross-provider migration
- Batch processing
- Custom validation
- Error handling
- MongoDB index management

## Requirements Satisfied

This implementation satisfies the following requirements from the specification:

- **3.1**: Consistent data models across database providers
- **3.2**: Database-specific query syntax handling
- **3.3**: Consistent relationship handling
- **3.4**: Data validation and consistency checks

The transformation layer ensures that application logic remains unchanged regardless of the underlying database provider while maintaining data integrity and performance characteristics.