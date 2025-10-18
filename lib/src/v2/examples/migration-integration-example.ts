/**
 * Migration System Integration Example
 * Demonstrates how to use the migration utilities for data migration between providers
 */

import { MigrationManager } from '../utils/migration-manager';
import { DynamoDBProvider } from '../providers/dynamodb-provider';
import { MongoDBProvider } from '../providers/mongodb-provider';
import { DatabaseConfig } from '../types/database-abstraction';
import { MigrationOptions, MigrationProgress } from '../types/migration';

/**
 * Example: Complete migration from DynamoDB to MongoDB
 */
export async function migrateDynamoDBToMongoDB() {
  console.log('Starting DynamoDB to MongoDB migration...');

  // Initialize providers
  const dynamoConfig: DatabaseConfig = {
    provider: 'dynamodb',
    dynamodb: {
      region: 'us-east-1',
      primaryTable: 'MyTapTrack-Primary',
      dataTable: 'MyTapTrack-Data',
      consistentRead: true
    }
  };

  const mongoConfig: DatabaseConfig = {
    provider: 'mongodb',
    mongodb: {
      connectionString: 'mongodb://localhost:27017',
      database: 'mytaptrack',
      collections: {
        primary: 'primary-collection',
        data: 'data-collection'
      }
    }
  };

  const dynamoProvider = new DynamoDBProvider(dynamoConfig.dynamodb!);
  const mongoProvider = new MongoDBProvider(mongoConfig.mongodb!);
  const migrationManager = new MigrationManager();

  try {
    // Connect to both providers
    await dynamoProvider.connect();
    await mongoProvider.connect();

    // Step 1: Create rollback point
    console.log('Creating rollback point...');
    const rollbackInfo = await migrationManager.createRollbackPoint(
      dynamoProvider,
      'dynamo-to-mongo-migration-001'
    );
    console.log('Rollback point created:', rollbackInfo.backupLocation);

    // Step 2: Export data from DynamoDB
    console.log('Exporting data from DynamoDB...');
    const migrationOptions: MigrationOptions = {
      batchSize: 1000,
      validateData: true,
      progressCallback: (progress: MigrationProgress) => {
        console.log(`Export progress: ${progress.processedRecords}/${progress.totalRecords || '?'} records`);
      }
    };

    const exportedData = await migrationManager.exportData(dynamoProvider, migrationOptions);
    console.log(`Exported ${exportedData.metadata.recordCount} records from DynamoDB`);

    // Step 3: Import data to MongoDB
    console.log('Importing data to MongoDB...');
    const importOptions: MigrationOptions = {
      batchSize: 500, // Smaller batches for MongoDB
      validateData: true,
      progressCallback: (progress: MigrationProgress) => {
        console.log(`Import progress: ${progress.processedRecords}/${progress.totalRecords} records`);
      }
    };

    const importResult = await migrationManager.importData(mongoProvider, exportedData, importOptions);
    console.log('Data import completed successfully');

    // Step 4: Validate migration
    console.log('Validating migration...');
    const validationResult = await migrationManager.validateMigration(
      dynamoProvider,
      mongoProvider,
      { validateData: true }
    );

    if (validationResult.valid) {
      console.log('Migration validation passed!');
      console.log(`Validated ${validationResult.summary.validRecords} records`);
    } else {
      console.error('Migration validation failed!');
      console.error(`Errors: ${validationResult.errors.length}`);
      console.error(`Warnings: ${validationResult.warnings.length}`);
      
      // Print first few errors
      validationResult.errors.slice(0, 5).forEach(error => {
        console.error(`- ${error.type}: ${error.message}`);
      });

      // Optionally rollback on validation failure
      console.log('Rolling back due to validation failure...');
      await migrationManager.executeRollback(dynamoProvider, rollbackInfo);
      console.log('Rollback completed');
    }

  } catch (error) {
    console.error('Migration failed:', error.message);
    
    // Attempt rollback on error
    try {
      console.log('Attempting rollback...');
      await migrationManager.executeRollback(dynamoProvider, rollbackInfo);
      console.log('Rollback completed successfully');
    } catch (rollbackError) {
      console.error('Rollback also failed:', rollbackError.message);
    }
  } finally {
    // Cleanup connections
    await dynamoProvider.disconnect();
    await mongoProvider.disconnect();
  }
}

/**
 * Example: Dry run migration to test the process
 */
export async function dryRunMigration() {
  console.log('Starting dry run migration...');

  const dynamoConfig: DatabaseConfig = {
    provider: 'dynamodb',
    dynamodb: {
      region: 'us-east-1',
      primaryTable: 'MyTapTrack-Primary',
      dataTable: 'MyTapTrack-Data'
    }
  };

  const mongoConfig: DatabaseConfig = {
    provider: 'mongodb',
    mongodb: {
      connectionString: 'mongodb://localhost:27017',
      database: 'mytaptrack-test',
      collections: {
        primary: 'primary-collection',
        data: 'data-collection'
      }
    }
  };

  const dynamoProvider = new DynamoDBProvider(dynamoConfig.dynamodb!);
  const mongoProvider = new MongoDBProvider(mongoConfig.mongodb!);
  const migrationManager = new MigrationManager();

  try {
    await dynamoProvider.connect();
    await mongoProvider.connect();

    // Export data
    const exportedData = await migrationManager.exportData(dynamoProvider, {
      batchSize: 100,
      progressCallback: (progress) => {
        console.log(`DRY RUN Export: ${progress.processedRecords} records processed`);
      }
    });

    console.log(`DRY RUN: Would export ${exportedData.metadata.recordCount} records`);

    // Dry run import
    await migrationManager.importData(mongoProvider, exportedData, {
      dryRun: true,
      batchSize: 100,
      progressCallback: (progress) => {
        console.log(`DRY RUN Import: ${progress.processedRecords}/${progress.totalRecords} records`);
      }
    });

    console.log('DRY RUN: Import simulation completed');

    // Validate what the migration would look like
    const validationResult = await migrationManager.validateMigration(
      dynamoProvider,
      mongoProvider
    );

    console.log('DRY RUN Validation Results:');
    console.log(`- Total records: ${validationResult.summary.totalRecords}`);
    console.log(`- Valid records: ${validationResult.summary.validRecords}`);
    console.log(`- Invalid records: ${validationResult.summary.invalidRecords}`);
    console.log(`- Errors: ${validationResult.errors.length}`);
    console.log(`- Warnings: ${validationResult.warnings.length}`);

  } catch (error) {
    console.error('Dry run failed:', error.message);
  } finally {
    await dynamoProvider.disconnect();
    await mongoProvider.disconnect();
  }
}

/**
 * Example: Selective table migration
 */
export async function migrateSpecificTables() {
  console.log('Starting selective table migration...');

  const dynamoProvider = new DynamoDBProvider({
    region: 'us-east-1',
    primaryTable: 'MyTapTrack-Primary',
    dataTable: 'MyTapTrack-Data'
  });

  const mongoProvider = new MongoDBProvider({
    connectionString: 'mongodb://localhost:27017',
    database: 'mytaptrack',
    collections: {
      primary: 'primary-collection',
      data: 'data-collection'
    }
  });

  const migrationManager = new MigrationManager();

  try {
    await dynamoProvider.connect();
    await mongoProvider.connect();

    // Export only specific tables
    const exportedData = await migrationManager.exportData(dynamoProvider, {
      // In a real implementation, you would specify which tables to export
      batchSize: 500
    });

    // Filter to only include user data tables
    const filteredData = {
      ...exportedData,
      tables: Object.fromEntries(
        Object.entries(exportedData.tables).filter(([tableName]) => 
          tableName.includes('user') || tableName.includes('profile')
        )
      )
    };

    // Update record count
    filteredData.metadata.recordCount = Object.values(filteredData.tables)
      .reduce((total, table) => total + table.data.length, 0);

    console.log(`Migrating ${filteredData.metadata.recordCount} records from ${Object.keys(filteredData.tables).length} tables`);

    await migrationManager.importData(mongoProvider, filteredData);

    console.log('Selective migration completed successfully');

  } catch (error) {
    console.error('Selective migration failed:', error.message);
  } finally {
    await dynamoProvider.disconnect();
    await mongoProvider.disconnect();
  }
}

/**
 * Example: Migration with custom progress tracking
 */
export async function migrationWithProgressTracking() {
  console.log('Starting migration with detailed progress tracking...');

  const dynamoProvider = new DynamoDBProvider({
    region: 'us-east-1',
    primaryTable: 'MyTapTrack-Primary',
    dataTable: 'MyTapTrack-Data'
  });

  const mongoProvider = new MongoDBProvider({
    connectionString: 'mongodb://localhost:27017',
    database: 'mytaptrack',
    collections: {
      primary: 'primary-collection',
      data: 'data-collection'
    }
  });

  const migrationManager = new MigrationManager();

  // Custom progress tracking
  let startTime = Date.now();
  const progressCallback = (progress: MigrationProgress) => {
    const elapsed = Date.now() - startTime;
    const rate = progress.processedRecords / (elapsed / 1000);
    const eta = progress.estimatedTimeRemaining || 
      ((progress.totalRecords - progress.processedRecords) / rate);

    console.log(`
Phase: ${progress.phase}
Progress: ${progress.processedRecords}/${progress.totalRecords || '?'} (${Math.round((progress.processedRecords / (progress.totalRecords || 1)) * 100)}%)
Current Table: ${progress.currentTable || 'N/A'}
Rate: ${Math.round(rate)} records/sec
ETA: ${Math.round(eta)} seconds
Errors: ${progress.errorCount}
    `.trim());
  };

  try {
    await dynamoProvider.connect();
    await mongoProvider.connect();

    startTime = Date.now();
    const exportedData = await migrationManager.exportData(dynamoProvider, {
      batchSize: 1000,
      progressCallback
    });

    console.log(`Export completed in ${(Date.now() - startTime) / 1000} seconds`);

    startTime = Date.now();
    await migrationManager.importData(mongoProvider, exportedData, {
      batchSize: 500,
      progressCallback
    });

    console.log(`Import completed in ${(Date.now() - startTime) / 1000} seconds`);

  } catch (error) {
    console.error('Migration with progress tracking failed:', error.message);
  } finally {
    await dynamoProvider.disconnect();
    await mongoProvider.disconnect();
  }
}

// Example usage
if (require.main === module) {
  // Run dry run first
  dryRunMigration()
    .then(() => {
      console.log('Dry run completed successfully');
      // Uncomment to run actual migration
      // return migrateDynamoDBToMongoDB();
    })
    .catch(error => {
      console.error('Example failed:', error);
      process.exit(1);
    });
}