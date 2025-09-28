# Migration System

The migration system provides comprehensive utilities for migrating data between different database providers (DynamoDB and MongoDB) in the MyTapTrack data access abstraction layer.

## Overview

The migration system consists of several key components:

- **MigrationManager**: Main orchestrator for migration operations
- **Data Exporters**: Provider-specific data export utilities
- **Data Importers**: Provider-specific data import utilities
- **Validation System**: Data integrity and consistency validation
- **Rollback System**: Ability to revert migrations if issues occur

## Key Features

### ✅ Complete Data Migration
- Export data from source database with proper transformation
- Import data to target database with validation
- Support for both DynamoDB ↔ MongoDB migrations

### ✅ Data Integrity Validation
- Checksum verification for data integrity
- Record-by-record validation between source and target
- Comprehensive error reporting and warnings

### ✅ Rollback Capabilities
- Create rollback points before migration
- Detailed rollback execution with step-by-step recovery
- Error handling and partial rollback support

### ✅ Progress Tracking
- Real-time progress callbacks during operations
- Detailed metrics and performance monitoring
- Estimated time remaining calculations

### ✅ Batch Processing
- Configurable batch sizes for optimal performance
- Memory-efficient processing of large datasets
- Error handling with skip-on-error options

### ✅ Dry Run Support
- Test migrations without making actual changes
- Validation and planning before real migration
- Risk assessment and preparation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Migration Manager                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Export Data   │  │   Import Data   │  │  Validate   │ │
│  │                 │  │                 │  │ Migration   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Create Rollback │  │ Execute Rollback│                  │
│  │     Point       │  │                 │                  │
│  └─────────────────┘  └─────────────────┘                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼────────┐ ┌──────▼──────┐ ┌────────▼────────┐
│   DynamoDB     │ │   MongoDB   │ │   Validation    │
│ Exporter/      │ │ Exporter/   │ │    System       │
│ Importer       │ │ Importer    │ │                 │
└────────────────┘ └─────────────┘ └─────────────────┘
```

## Usage Examples

### Basic Migration

```typescript
import { MigrationManager } from '../utils/migration-manager';
import { DynamoDBProvider } from '../providers/dynamodb-provider';
import { MongoDBProvider } from '../providers/mongodb-provider';

const migrationManager = new MigrationManager();
const sourceProvider = new DynamoDBProvider(dynamoConfig);
const targetProvider = new MongoDBProvider(mongoConfig);

// Export data
const exportedData = await migrationManager.exportData(sourceProvider);

// Import data
await migrationManager.importData(targetProvider, exportedData);

// Validate migration
const validation = await migrationManager.validateMigration(
  sourceProvider, 
  targetProvider
);
```

### Migration with Rollback

```typescript
// Create rollback point
const rollbackInfo = await migrationManager.createRollbackPoint(
  sourceProvider,
  'migration-001'
);

try {
  // Perform migration
  const exportedData = await migrationManager.exportData(sourceProvider);
  await migrationManager.importData(targetProvider, exportedData);
  
  // Validate
  const validation = await migrationManager.validateMigration(
    sourceProvider,
    targetProvider
  );
  
  if (!validation.valid) {
    throw new Error('Migration validation failed');
  }
  
} catch (error) {
  // Rollback on error
  await migrationManager.executeRollback(sourceProvider, rollbackInfo);
  throw error;
}
```

### Migration with Progress Tracking

```typescript
const options = {
  batchSize: 1000,
  progressCallback: (progress) => {
    console.log(`${progress.phase}: ${progress.processedRecords}/${progress.totalRecords}`);
    console.log(`Current table: ${progress.currentTable}`);
    console.log(`Errors: ${progress.errorCount}`);
  }
};

await migrationManager.exportData(sourceProvider, options);
```

### Dry Run Migration

```typescript
const dryRunOptions = {
  dryRun: true,
  validateData: true,
  progressCallback: (progress) => {
    console.log(`DRY RUN: ${progress.phase} - ${progress.processedRecords} records`);
  }
};

// This won't make actual changes
await migrationManager.importData(targetProvider, exportedData, dryRunOptions);
```

## Configuration Options

### MigrationOptions

```typescript
interface MigrationOptions {
  batchSize?: number;           // Records per batch (default: 1000)
  includeIndexes?: boolean;     // Include index definitions (default: true)
  validateData?: boolean;       // Validate data during migration (default: false)
  transformData?: boolean;      // Apply data transformations (default: true)
  skipErrors?: boolean;         // Continue on errors (default: false)
  dryRun?: boolean;            // Simulate without changes (default: false)
  progressCallback?: (progress: MigrationProgress) => void;
}
```

### Progress Tracking

```typescript
interface MigrationProgress {
  phase: 'export' | 'import' | 'validation' | 'rollback';
  totalRecords: number;
  processedRecords: number;
  errorCount: number;
  currentTable?: string;
  estimatedTimeRemaining?: number;
}
```

## Data Transformations

### DynamoDB to MongoDB

- Adds MongoDB `_id` field
- Nests non-key fields in `data` object
- Converts date strings to Date objects
- Maintains pk/sk structure for compatibility

### MongoDB to DynamoDB

- Removes MongoDB `_id` field
- Flattens nested `data` object
- Converts Date objects to ISO strings
- Ensures required DynamoDB fields (pk, sk, pksk)

## Error Handling

### Validation Errors

```typescript
interface ValidationError {
  type: 'missing_record' | 'data_mismatch' | 'schema_violation' | 'integrity_check_failed';
  recordId: string;
  message: string;
  details: any;
}
```

### Common Error Types

- **missing_record**: Record exists in source but not in target
- **data_mismatch**: Record data differs between source and target
- **schema_violation**: Record doesn't match expected schema
- **integrity_check_failed**: Checksum or other integrity check failed

### Error Recovery

- **Skip Errors**: Continue processing with `skipErrors: true`
- **Rollback**: Revert to previous state using rollback system
- **Partial Recovery**: Handle individual record failures

## Performance Considerations

### Batch Sizes

- **DynamoDB**: Recommended 25-1000 records per batch
- **MongoDB**: Can handle larger batches (500-2000 records)
- **Memory**: Larger batches use more memory but fewer API calls

### Optimization Tips

1. **Use appropriate batch sizes** for your data size and network
2. **Enable progress callbacks** for long-running migrations
3. **Run dry runs first** to estimate time and identify issues
4. **Create rollback points** before production migrations
5. **Validate data** after migration completion

## Monitoring and Logging

### Built-in Logging

The migration system includes comprehensive logging:

```typescript
// Enable debug logging
process.env.LOG_LEVEL = 'debug';

// Logs include:
// - Migration start/completion
// - Batch processing progress
// - Error details and recovery
// - Performance metrics
// - Rollback operations
```

### Custom Monitoring

```typescript
const options = {
  progressCallback: (progress) => {
    // Send to monitoring system
    metrics.gauge('migration.progress', progress.processedRecords);
    metrics.gauge('migration.errors', progress.errorCount);
    
    // Log to external system
    logger.info('Migration progress', progress);
  }
};
```

## Best Practices

### Pre-Migration

1. **Backup your data** before starting migration
2. **Run dry runs** to identify potential issues
3. **Test with small datasets** first
4. **Verify connectivity** to both source and target
5. **Plan for downtime** if required

### During Migration

1. **Monitor progress** using callbacks
2. **Watch for errors** and handle appropriately
3. **Keep rollback info** for emergency recovery
4. **Validate incrementally** if possible

### Post-Migration

1. **Run full validation** to ensure data integrity
2. **Test application functionality** with new database
3. **Monitor performance** of the new system
4. **Keep rollback capability** until confident
5. **Clean up old data** only after validation

## Troubleshooting

### Common Issues

#### Migration Fails with "Checksum Mismatch"
- **Cause**: Data was modified during export/import
- **Solution**: Ensure data is not being modified during migration

#### "Record Missing in Target"
- **Cause**: Import failed for specific records
- **Solution**: Check error logs, use `skipErrors: true` for non-critical data

#### "Connection Timeout"
- **Cause**: Network issues or large batch sizes
- **Solution**: Reduce batch size, check network connectivity

#### "Memory Issues"
- **Cause**: Batch size too large for available memory
- **Solution**: Reduce batch size, increase available memory

### Debug Mode

```typescript
// Enable detailed logging
process.env.LOG_LEVEL = 'debug';
process.env.MIGRATION_DEBUG = 'true';

// This will log:
// - Individual record processing
// - Transformation details
// - Network request/response details
// - Memory usage statistics
```

## Testing

### Unit Tests

```bash
npm test -- migration-manager.spec.ts
npm test -- dynamodb-exporter.spec.ts
npm test -- mongodb-importer.spec.ts
```

### Integration Tests

```bash
# Test with real databases (requires setup)
npm run test:integration -- migration
```

### Test Data

The migration system includes test utilities for creating sample data:

```typescript
import { createTestMigrationData } from '../utils/test-helpers';

const testData = createTestMigrationData({
  recordCount: 1000,
  tableCount: 2,
  includeIndexes: true
});
```

## Security Considerations

### Data Protection

- **Encryption**: All data is encrypted in transit and at rest
- **Access Control**: Requires appropriate database permissions
- **Audit Logging**: All operations are logged for compliance
- **Credential Management**: Uses secure credential storage

### Network Security

- **TLS/SSL**: All database connections use encryption
- **VPC**: Supports VPC-only database access
- **Firewall**: Respects database firewall rules
- **Authentication**: Uses database-native authentication

## Migration Checklist

### Pre-Migration Checklist

- [ ] Backup source database
- [ ] Test connectivity to both databases
- [ ] Run dry run migration
- [ ] Estimate migration time
- [ ] Plan for application downtime
- [ ] Prepare rollback procedures
- [ ] Set up monitoring and alerting

### Migration Checklist

- [ ] Create rollback point
- [ ] Start migration with progress monitoring
- [ ] Monitor for errors and performance
- [ ] Validate data integrity
- [ ] Test application functionality
- [ ] Update application configuration
- [ ] Monitor system performance

### Post-Migration Checklist

- [ ] Full data validation completed
- [ ] Application testing passed
- [ ] Performance monitoring active
- [ ] Rollback procedures tested
- [ ] Documentation updated
- [ ] Team training completed
- [ ] Old database cleanup scheduled

## Support and Maintenance

### Regular Maintenance

- **Monitor logs** for migration-related issues
- **Update batch sizes** based on performance
- **Test rollback procedures** periodically
- **Review error patterns** and improve handling

### Version Compatibility

The migration system is designed to be backward compatible:

- **Schema versions** are tracked in migration metadata
- **Data transformations** are versioned and upgradeable
- **API compatibility** is maintained across versions

For additional support or questions about the migration system, refer to the main documentation or contact the development team.