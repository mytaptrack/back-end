# Migration Guide - Database Provider Migration

## Overview

This guide provides comprehensive procedures and best practices for migrating data between DynamoDB and MongoDB using the Data Access Abstraction Layer. The migration utilities ensure data integrity and provide rollback capabilities.

## Table of Contents

- [Migration Overview](#migration-overview)
- [Pre-Migration Planning](#pre-migration-planning)
- [Migration Procedures](#migration-procedures)
- [Data Validation](#data-validation)
- [Rollback Procedures](#rollback-procedures)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Migration Overview

### Supported Migration Paths

1. **DynamoDB to MongoDB**: Migrate from DynamoDB tables to MongoDB collections
2. **MongoDB to DynamoDB**: Migrate from MongoDB collections to DynamoDB tables
3. **Cross-Region Migration**: Migrate between different AWS regions (DynamoDB only)
4. **Partial Migration**: Migrate specific data subsets based on filters

### Migration Components

- **MigrationManager**: Orchestrates the migration process
- **Data Exporters**: Extract data from source databases
- **Data Importers**: Load data into target databases
- **Data Transformers**: Convert data between provider formats
- **Validation Engine**: Ensures data integrity throughout the process

## Pre-Migration Planning

### 1. Assessment and Planning

Before starting any migration, perform a thorough assessment:

```typescript
import { MigrationAssessment } from '@mytaptrack/lib/v2/utils';

const assessment = new MigrationAssessment();

// Analyze source database
const sourceAnalysis = await assessment.analyzeDatabase(sourceProvider);
console.log('Source Database Analysis:', sourceAnalysis);
// Output:
// {
//   provider: 'dynamodb',
//   tableCount: 2,
//   totalItems: 150000,
//   estimatedSize: '2.5GB',
//   indexes: ['GSI1', 'GSI2'],
//   dataTypes: ['string', 'number', 'boolean', 'list', 'map']
// }

// Estimate migration time and resources
const estimate = await assessment.estimateMigration(sourceProvider, targetProvider);
console.log('Migration Estimate:', estimate);
// Output:
// {
//   estimatedDuration: '2 hours 30 minutes',
//   estimatedCost: '$45.00',
//   recommendedBatchSize: 100,
//   parallelWorkers: 4
// }
```

### 2. Environment Preparation

```typescript
// Prepare migration environment
const migrationConfig = {
  source: {
    provider: 'dynamodb',
    config: {
      region: 'us-east-1',
      primaryTable: 'MyTapTrack-Primary',
      dataTable: 'MyTapTrack-Data'
    }
  },
  target: {
    provider: 'mongodb',
    config: {
      connectionString: 'mongodb://localhost:27017',
      database: 'mytaptrack_migrated',
      collections: {
        primary: 'primary_data',
        data: 'data_records'
      }
    }
  },
  options: {
    batchSize: 100,
    parallelWorkers: 4,
    validateData: true,
    createBackup: true,
    dryRun: false
  }
};
```

### 3. Backup Strategy

Always create backups before migration:

```typescript
import { BackupManager } from '@mytaptrack/lib/v2/utils';

const backupManager = new BackupManager();

// Create backup of source data
const backupId = await backupManager.createBackup(sourceProvider, {
  includeIndexes: true,
  compression: true,
  encryption: true
});

console.log(`Backup created with ID: ${backupId}`);
```

## Migration Procedures

### 1. DynamoDB to MongoDB Migration

#### Complete Migration

```typescript
import { MigrationManager } from '@mytaptrack/lib/v2/utils';

async function migrateDynamoDBToMongoDB() {
  const migrationManager = new MigrationManager();
  
  try {
    // Step 1: Initialize providers
    const sourceProvider = DatabaseProviderFactory.create(dynamoConfig);
    const targetProvider = DatabaseProviderFactory.create(mongoConfig);
    
    await sourceProvider.connect();
    await targetProvider.connect();
    
    // Step 2: Export data from DynamoDB
    console.log('Starting data export from DynamoDB...');
    const exportedData = await migrationManager.exportData(sourceProvider, {
      batchSize: 100,
      includeMetadata: true,
      transformData: true
    });
    
    console.log(`Exported ${exportedData.metadata.recordCount} records`);
    
    // Step 3: Import data to MongoDB
    console.log('Starting data import to MongoDB...');
    await migrationManager.importData(targetProvider, exportedData, {
      batchSize: 100,
      createIndexes: true,
      validateSchema: true
    });
    
    // Step 4: Validate migration
    console.log('Validating migration...');
    const validationResult = await migrationManager.validateMigration(
      sourceProvider,
      targetProvider
    );
    
    if (validationResult.isValid) {
      console.log('Migration completed successfully!');
      console.log(`Migrated ${validationResult.recordCount} records`);
    } else {
      console.error('Migration validation failed:', validationResult.errors);
      throw new Error('Migration validation failed');
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await sourceProvider.disconnect();
    await targetProvider.disconnect();
  }
}
```

#### Incremental Migration

```typescript
async function incrementalMigration(lastMigrationTimestamp: Date) {
  const migrationManager = new MigrationManager();
  
  // Export only data modified since last migration
  const exportedData = await migrationManager.exportData(sourceProvider, {
    filter: {
      updatedAt: { gte: lastMigrationTimestamp }
    },
    batchSize: 50
  });
  
  // Import incremental data
  await migrationManager.importData(targetProvider, exportedData, {
    mode: 'upsert', // Update existing records, insert new ones
    batchSize: 50
  });
  
  return exportedData.metadata.recordCount;
}
```

### 2. MongoDB to DynamoDB Migration

```typescript
async function migrateMongoDBToDynamoDB() {
  const migrationManager = new MigrationManager();
  
  try {
    const sourceProvider = DatabaseProviderFactory.create(mongoConfig);
    const targetProvider = DatabaseProviderFactory.create(dynamoConfig);
    
    await sourceProvider.connect();
    await targetProvider.connect();
    
    // Export from MongoDB with data transformation
    const exportedData = await migrationManager.exportData(sourceProvider, {
      transformToDynamoDBFormat: true,
      batchSize: 100
    });
    
    // Import to DynamoDB
    await migrationManager.importData(targetProvider, exportedData, {
      createTables: false, // Tables should already exist
      batchSize: 25, // DynamoDB batch limit
      retryFailedItems: true
    });
    
    // Validate migration
    const validationResult = await migrationManager.validateMigration(
      sourceProvider,
      targetProvider
    );
    
    if (!validationResult.isValid) {
      throw new Error(`Migration validation failed: ${validationResult.errors.join(', ')}`);
    }
    
    console.log('MongoDB to DynamoDB migration completed successfully');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}
```

### 3. Live Migration with Zero Downtime

```typescript
class LiveMigrationManager {
  private sourceProvider: IDataAccessLayer;
  private targetProvider: IDataAccessLayer;
  private migrationManager: MigrationManager;
  private isLiveMigrationActive = false;
  
  constructor(sourceConfig: DatabaseConfig, targetConfig: DatabaseConfig) {
    this.sourceProvider = DatabaseProviderFactory.create(sourceConfig);
    this.targetProvider = DatabaseProviderFactory.create(targetConfig);
    this.migrationManager = new MigrationManager();
  }
  
  async startLiveMigration() {
    try {
      // Phase 1: Initial bulk migration
      console.log('Phase 1: Starting initial bulk migration...');
      await this.performBulkMigration();
      
      // Phase 2: Start dual-write mode
      console.log('Phase 2: Starting dual-write mode...');
      this.isLiveMigrationActive = true;
      
      // Phase 3: Catch-up migration for changes during bulk migration
      console.log('Phase 3: Performing catch-up migration...');
      await this.performCatchUpMigration();
      
      // Phase 4: Final validation and cutover
      console.log('Phase 4: Final validation and cutover...');
      await this.performFinalValidation();
      
      console.log('Live migration completed successfully');
      
    } catch (error) {
      console.error('Live migration failed:', error);
      await this.rollbackMigration();
      throw error;
    }
  }
  
  private async performBulkMigration() {
    const exportedData = await this.migrationManager.exportData(this.sourceProvider);
    await this.migrationManager.importData(this.targetProvider, exportedData);
  }
  
  private async performCatchUpMigration() {
    // Get timestamp from when bulk migration started
    const bulkMigrationStart = new Date(Date.now() - 3600000); // 1 hour ago
    
    const incrementalData = await this.migrationManager.exportData(this.sourceProvider, {
      filter: {
        updatedAt: { gte: bulkMigrationStart }
      }
    });
    
    await this.migrationManager.importData(this.targetProvider, incrementalData, {
      mode: 'upsert'
    });
  }
  
  private async performFinalValidation() {
    const validationResult = await this.migrationManager.validateMigration(
      this.sourceProvider,
      this.targetProvider
    );
    
    if (!validationResult.isValid) {
      throw new Error('Final validation failed');
    }
  }
  
  // Dual-write wrapper for write operations
  async dualWrite(operation: string, ...args: any[]) {
    if (!this.isLiveMigrationActive) {
      return await (this.sourceProvider as any)[operation](...args);
    }
    
    try {
      // Write to both providers
      const [sourceResult, targetResult] = await Promise.allSettled([
        (this.sourceProvider as any)[operation](...args),
        (this.targetProvider as any)[operation](...args)
      ]);
      
      // If source fails, the operation fails
      if (sourceResult.status === 'rejected') {
        throw sourceResult.reason;
      }
      
      // Log target failures but don't fail the operation
      if (targetResult.status === 'rejected') {
        console.error('Target write failed during dual-write:', targetResult.reason);
      }
      
      return sourceResult.value;
      
    } catch (error) {
      console.error('Dual-write operation failed:', error);
      throw error;
    }
  }
}
```

## Data Validation

### 1. Pre-Migration Validation

```typescript
async function validatePreMigration(sourceProvider: IDataAccessLayer) {
  const validator = new DataValidator();
  
  // Check data integrity
  const integrityCheck = await validator.checkDataIntegrity(sourceProvider);
  if (!integrityCheck.isValid) {
    throw new Error(`Data integrity issues found: ${integrityCheck.issues.join(', ')}`);
  }
  
  // Check for unsupported data types
  const compatibilityCheck = await validator.checkCompatibility(sourceProvider, 'mongodb');
  if (!compatibilityCheck.isCompatible) {
    console.warn('Compatibility issues found:', compatibilityCheck.issues);
  }
  
  // Estimate migration complexity
  const complexity = await validator.assessComplexity(sourceProvider);
  console.log('Migration complexity:', complexity);
}
```

### 2. Post-Migration Validation

```typescript
async function validatePostMigration(
  sourceProvider: IDataAccessLayer,
  targetProvider: IDataAccessLayer
) {
  const validator = new MigrationValidator();
  
  // Record count validation
  const recordCountCheck = await validator.validateRecordCounts(
    sourceProvider,
    targetProvider
  );
  
  if (!recordCountCheck.isValid) {
    throw new Error(`Record count mismatch: source=${recordCountCheck.sourceCount}, target=${recordCountCheck.targetCount}`);
  }
  
  // Data integrity validation
  const integrityCheck = await validator.validateDataIntegrity(
    sourceProvider,
    targetProvider,
    {
      sampleSize: 1000,
      checkAllFields: true
    }
  );
  
  if (!integrityCheck.isValid) {
    throw new Error(`Data integrity validation failed: ${integrityCheck.errors.join(', ')}`);
  }
  
  // Performance validation
  const performanceCheck = await validator.validatePerformance(targetProvider);
  if (performanceCheck.averageResponseTime > 100) {
    console.warn(`Target database performance may be degraded: ${performanceCheck.averageResponseTime}ms average response time`);
  }
  
  return {
    recordCount: recordCountCheck.sourceCount,
    integrityScore: integrityCheck.score,
    performanceMetrics: performanceCheck
  };
}
```

### 3. Continuous Validation

```typescript
class ContinuousValidator {
  private sourceProvider: IDataAccessLayer;
  private targetProvider: IDataAccessLayer;
  private validationInterval: NodeJS.Timeout;
  
  constructor(sourceProvider: IDataAccessLayer, targetProvider: IDataAccessLayer) {
    this.sourceProvider = sourceProvider;
    this.targetProvider = targetProvider;
  }
  
  startContinuousValidation(intervalMs: number = 60000) {
    this.validationInterval = setInterval(async () => {
      try {
        await this.performValidationCheck();
      } catch (error) {
        console.error('Continuous validation failed:', error);
      }
    }, intervalMs);
  }
  
  stopContinuousValidation() {
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
    }
  }
  
  private async performValidationCheck() {
    // Sample random records for validation
    const sampleKeys = await this.generateRandomSampleKeys(10);
    
    for (const key of sampleKeys) {
      const sourceRecord = await this.sourceProvider.get(key);
      const targetRecord = await this.targetProvider.get(key);
      
      if (!this.recordsMatch(sourceRecord, targetRecord)) {
        console.error('Record mismatch detected:', { key, sourceRecord, targetRecord });
      }
    }
  }
  
  private recordsMatch(source: any, target: any): boolean {
    // Implement deep comparison logic
    return JSON.stringify(source) === JSON.stringify(target);
  }
}
```

## Rollback Procedures

### 1. Automatic Rollback

```typescript
class MigrationWithRollback {
  private backupId: string;
  private migrationCheckpoints: MigrationCheckpoint[] = [];
  
  async performMigrationWithRollback() {
    try {
      // Create backup before migration
      this.backupId = await this.createBackup();
      
      // Perform migration with checkpoints
      await this.migrateWithCheckpoints();
      
      // Final validation
      await this.validateMigration();
      
      console.log('Migration completed successfully');
      
    } catch (error) {
      console.error('Migration failed, initiating rollback:', error);
      await this.rollback();
      throw error;
    }
  }
  
  private async migrateWithCheckpoints() {
    const batches = await this.createMigrationBatches();
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        // Create checkpoint before processing batch
        const checkpoint = await this.createCheckpoint(i);
        this.migrationCheckpoints.push(checkpoint);
        
        // Process batch
        await this.processBatch(batch);
        
        // Validate batch
        await this.validateBatch(batch);
        
      } catch (error) {
        console.error(`Batch ${i} failed:`, error);
        throw error;
      }
    }
  }
  
  private async rollback() {
    console.log('Starting rollback process...');
    
    try {
      // Rollback to last successful checkpoint
      if (this.migrationCheckpoints.length > 0) {
        const lastCheckpoint = this.migrationCheckpoints[this.migrationCheckpoints.length - 1];
        await this.rollbackToCheckpoint(lastCheckpoint);
      }
      
      // Restore from backup if needed
      if (this.backupId) {
        await this.restoreFromBackup(this.backupId);
      }
      
      console.log('Rollback completed successfully');
      
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError);
      throw new Error('Both migration and rollback failed');
    }
  }
}
```

### 2. Manual Rollback

```typescript
async function manualRollback(backupId: string, targetProvider: IDataAccessLayer) {
  const backupManager = new BackupManager();
  
  try {
    console.log(`Starting manual rollback using backup ${backupId}...`);
    
    // Clear target database
    await targetProvider.clearAllData();
    
    // Restore from backup
    await backupManager.restoreFromBackup(backupId, targetProvider);
    
    // Validate restoration
    const validationResult = await backupManager.validateRestore(backupId, targetProvider);
    
    if (!validationResult.isValid) {
      throw new Error('Backup restoration validation failed');
    }
    
    console.log('Manual rollback completed successfully');
    
  } catch (error) {
    console.error('Manual rollback failed:', error);
    throw error;
  }
}
```

## Best Practices

### 1. Migration Planning

- **Always perform a dry run** before actual migration
- **Create comprehensive backups** of source data
- **Test migration process** in a staging environment
- **Plan for downtime** even with live migration strategies
- **Communicate with stakeholders** about migration timeline and potential impacts

### 2. Performance Optimization

```typescript
// Optimize batch sizes based on data characteristics
const optimizedBatchSize = calculateOptimalBatchSize(dataSize, networkLatency);

// Use parallel processing for large datasets
const migrationConfig = {
  batchSize: optimizedBatchSize,
  parallelWorkers: Math.min(4, Math.ceil(totalRecords / 10000)),
  connectionPoolSize: 10
};

// Monitor and adjust during migration
const performanceMonitor = new MigrationPerformanceMonitor();
performanceMonitor.onSlowBatch((batchInfo) => {
  // Reduce batch size if performance degrades
  if (batchInfo.processingTime > 30000) {
    migrationConfig.batchSize = Math.max(10, migrationConfig.batchSize * 0.8);
  }
});
```

### 3. Error Handling

```typescript
class RobustMigrationManager {
  private maxRetries = 3;
  private retryDelay = 1000;
  
  async migrateWithRetry(batch: any[], attempt: number = 1): Promise<void> {
    try {
      await this.migrateBatch(batch);
    } catch (error) {
      if (attempt < this.maxRetries && this.isRetryableError(error)) {
        console.log(`Batch migration failed, retrying (${attempt}/${this.maxRetries})...`);
        await this.delay(this.retryDelay * attempt);
        return this.migrateWithRetry(batch, attempt + 1);
      }
      
      // Log failed items for manual review
      await this.logFailedBatch(batch, error);
      throw error;
    }
  }
  
  private isRetryableError(error: any): boolean {
    return error instanceof ConnectionError || 
           error.code === 'THROTTLING_EXCEPTION' ||
           error.code === 'SERVICE_UNAVAILABLE';
  }
}
```

### 4. Data Consistency

```typescript
// Implement checksums for data integrity
class DataIntegrityChecker {
  async calculateChecksum(record: any): Promise<string> {
    const normalizedRecord = this.normalizeRecord(record);
    return crypto.createHash('sha256')
      .update(JSON.stringify(normalizedRecord))
      .digest('hex');
  }
  
  async validateRecordIntegrity(
    sourceRecord: any, 
    targetRecord: any
  ): Promise<boolean> {
    const sourceChecksum = await this.calculateChecksum(sourceRecord);
    const targetChecksum = await this.calculateChecksum(targetRecord);
    return sourceChecksum === targetChecksum;
  }
  
  private normalizeRecord(record: any): any {
    // Remove provider-specific fields and normalize data types
    const normalized = { ...record };
    delete normalized._id; // MongoDB specific
    delete normalized.version; // May differ due to updates
    
    // Normalize dates
    Object.keys(normalized).forEach(key => {
      if (normalized[key] instanceof Date) {
        normalized[key] = normalized[key].toISOString();
      }
    });
    
    return normalized;
  }
}
```

### 5. Monitoring and Alerting

```typescript
class MigrationMonitor {
  private metricsCollector: MetricsCollector;
  private alertManager: AlertManager;
  
  constructor() {
    this.metricsCollector = new MetricsCollector();
    this.alertManager = new AlertManager();
  }
  
  async monitorMigration(migrationId: string) {
    const monitor = setInterval(async () => {
      const metrics = await this.collectMigrationMetrics(migrationId);
      
      // Check for performance issues
      if (metrics.averageBatchTime > 60000) {
        await this.alertManager.sendAlert('SLOW_MIGRATION', {
          migrationId,
          averageBatchTime: metrics.averageBatchTime
        });
      }
      
      // Check for error rate
      if (metrics.errorRate > 0.05) {
        await this.alertManager.sendAlert('HIGH_ERROR_RATE', {
          migrationId,
          errorRate: metrics.errorRate
        });
      }
      
      // Check for stalled migration
      if (metrics.timeSinceLastProgress > 300000) {
        await this.alertManager.sendAlert('STALLED_MIGRATION', {
          migrationId,
          timeSinceLastProgress: metrics.timeSinceLastProgress
        });
      }
      
    }, 30000); // Check every 30 seconds
    
    return monitor;
  }
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Memory Issues During Large Migrations

**Problem**: Out of memory errors during large data exports

**Solution**:
```typescript
// Use streaming export for large datasets
const streamingExporter = new StreamingDataExporter();

await streamingExporter.exportData(sourceProvider, {
  batchSize: 100,
  streamToFile: true,
  compressionEnabled: true,
  outputPath: './migration-data.json.gz'
});
```

#### 2. Connection Timeouts

**Problem**: Database connections timing out during long migrations

**Solution**:
```typescript
// Implement connection refresh strategy
class ConnectionManager {
  private lastConnectionRefresh = Date.now();
  private refreshInterval = 300000; // 5 minutes
  
  async ensureConnection(provider: IDataAccessLayer) {
    if (Date.now() - this.lastConnectionRefresh > this.refreshInterval) {
      await provider.disconnect();
      await provider.connect();
      this.lastConnectionRefresh = Date.now();
    }
  }
}
```

#### 3. Data Type Conversion Issues

**Problem**: Incompatible data types between providers

**Solution**:
```typescript
class DataTypeConverter {
  convertDynamoDBToMongoDB(record: any): any {
    const converted = { ...record };
    
    // Convert DynamoDB sets to arrays
    Object.keys(converted).forEach(key => {
      if (converted[key] && converted[key].SS) {
        converted[key] = converted[key].SS; // String set to array
      }
      if (converted[key] && converted[key].NS) {
        converted[key] = converted[key].NS.map(Number); // Number set to array
      }
    });
    
    return converted;
  }
  
  convertMongoDBToDynamoDB(record: any): any {
    const converted = { ...record };
    
    // Convert MongoDB ObjectId to string
    if (converted._id) {
      converted.id = converted._id.toString();
      delete converted._id;
    }
    
    return converted;
  }
}
```

#### 4. Partial Migration Failures

**Problem**: Some records fail to migrate

**Solution**:
```typescript
class PartialFailureHandler {
  private failedRecords: any[] = [];
  
  async handleFailedRecord(record: any, error: Error) {
    this.failedRecords.push({
      record,
      error: error.message,
      timestamp: new Date()
    });
    
    // Log to file for later analysis
    await this.logFailedRecord(record, error);
  }
  
  async retryFailedRecords(targetProvider: IDataAccessLayer) {
    console.log(`Retrying ${this.failedRecords.length} failed records...`);
    
    const retryResults = [];
    
    for (const failedItem of this.failedRecords) {
      try {
        await targetProvider.put(failedItem.record);
        retryResults.push({ success: true, record: failedItem.record });
      } catch (error) {
        retryResults.push({ 
          success: false, 
          record: failedItem.record, 
          error: error.message 
        });
      }
    }
    
    return retryResults;
  }
}
```

### Migration Health Checks

```typescript
class MigrationHealthChecker {
  async performHealthCheck(
    sourceProvider: IDataAccessLayer,
    targetProvider: IDataAccessLayer
  ): Promise<HealthCheckResult> {
    const checks = await Promise.allSettled([
      this.checkSourceConnection(sourceProvider),
      this.checkTargetConnection(targetProvider),
      this.checkDataConsistency(sourceProvider, targetProvider),
      this.checkPerformance(targetProvider)
    ]);
    
    return {
      sourceConnection: checks[0].status === 'fulfilled',
      targetConnection: checks[1].status === 'fulfilled',
      dataConsistency: checks[2].status === 'fulfilled',
      performance: checks[3].status === 'fulfilled',
      overall: checks.every(check => check.status === 'fulfilled')
    };
  }
}
```

This comprehensive migration guide provides the procedures and best practices needed to successfully migrate data between database providers while maintaining data integrity and minimizing downtime.