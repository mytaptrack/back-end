#!/usr/bin/env node

/**
 * DynamoDB to MongoDB Migration Script
 * Migrates data from AWS DynamoDB tables to MongoDB collections
 */

import { MongoClient } from 'mongodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { MigrationManager } from './migration-manager';
import * as fs from 'fs/promises';
import * as path from 'path';

interface MigrationConfig {
  source: {
    type: 'dynamodb';
    region: string;
    profile?: string;
    tables: string[];
  };
  target: {
    type: 'mongodb';
    connectionString: string;
    database: string;
  };
  options: {
    batchSize: number;
    validateData: boolean;
    createBackup: boolean;
    skipErrors: boolean;
    outputFile?: string;
  };
}

class DynamoDBToMongoDBMigration {
  private migrationManager: MigrationManager;
  private config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
    this.migrationManager = new MigrationManager('./migration-backups');
  }

  async execute(): Promise<void> {
    console.log('Starting DynamoDB to MongoDB migration...');
    console.log(`Source: DynamoDB (${this.config.source.region})`);
    console.log(`Target: MongoDB (${this.config.target.database})`);
    console.log(`Tables: ${this.config.source.tables.join(', ')}`);

    try {
      // Initialize connections
      const dynamoClient = this.createDynamoDBClient();
      const mongoClient = await this.createMongoDBClient();

      // Create backup if requested
      if (this.config.options.createBackup) {
        console.log('Creating backup...');
        await this.migrationManager.createRollbackPoint(mongoClient, `migration-${Date.now()}`);
      }

      // Export data from DynamoDB
      console.log('Exporting data from DynamoDB...');
      const migrationData = await this.migrationManager.exportData(dynamoClient, {
        batchSize: this.config.options.batchSize,
        validateData: this.config.options.validateData,
        progressCallback: this.createProgressCallback('Export')
      });

      console.log(`Exported ${migrationData.metadata.recordCount} records from ${Object.keys(migrationData.tables).length} tables`);

      // Save export data if output file specified
      if (this.config.options.outputFile) {
        await this.saveExportData(migrationData);
      }

      // Import data to MongoDB
      console.log('Importing data to MongoDB...');
      await this.migrationManager.importData(mongoClient, migrationData, {
        batchSize: this.config.options.batchSize,
        validateData: this.config.options.validateData,
        skipErrors: this.config.options.skipErrors,
        progressCallback: this.createProgressCallback('Import')
      });

      // Validate migration
      if (this.config.options.validateData) {
        console.log('Validating migration...');
        const validation = await this.migrationManager.validateMigration(dynamoClient, mongoClient, {
          batchSize: this.config.options.batchSize
        });

        console.log(`Validation result: ${validation.valid ? 'PASSED' : 'FAILED'}`);
        console.log(`Total records: ${validation.summary.totalRecords}`);
        console.log(`Valid records: ${validation.summary.validRecords}`);
        console.log(`Invalid records: ${validation.summary.invalidRecords}`);

        if (validation.errors.length > 0) {
          console.log('Validation errors:');
          validation.errors.forEach(error => {
            console.log(`  - ${error.type}: ${error.message} (Record: ${error.recordId})`);
          });
        }

        if (validation.warnings.length > 0) {
          console.log('Validation warnings:');
          validation.warnings.forEach(warning => {
            console.log(`  - ${warning.type}: ${warning.message}`);
          });
        }
      }

      await mongoClient.close();
      console.log('Migration completed successfully!');

    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  }

  private createDynamoDBClient(): DynamoDBClient {
    const config: any = {
      region: this.config.source.region
    };

    if (this.config.source.profile) {
      // Use AWS profile if specified
      process.env.AWS_PROFILE = this.config.source.profile;
    }

    return new DynamoDBClient(config);
  }

  private async createMongoDBClient(): Promise<MongoClient> {
    const client = new MongoClient(this.config.target.connectionString);
    await client.connect();
    return client;
  }

  private createProgressCallback(phase: string) {
    return (progress: any) => {
      const percentage = Math.round((progress.processedRecords / progress.totalRecords) * 100);
      console.log(`${phase}: ${progress.processedRecords}/${progress.totalRecords} (${percentage}%) - ${progress.currentTable || ''}`);
    };
  }

  private async saveExportData(migrationData: any): Promise<void> {
    if (!this.config.options.outputFile) return;

    const outputPath = path.resolve(this.config.options.outputFile);
    await fs.writeFile(outputPath, JSON.stringify(migrationData, null, 2));
    console.log(`Export data saved to: ${outputPath}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: migrate-dynamodb-to-mongodb [options]

Options:
  --config <file>           Configuration file path (default: migration-config.json)
  --region <region>         AWS region (default: us-east-1)
  --profile <profile>       AWS profile to use
  --mongo-url <url>         MongoDB connection string
  --mongo-db <database>     MongoDB database name (default: mytaptrack)
  --tables <tables>         Comma-separated list of DynamoDB tables (default: primary,data)
  --batch-size <size>       Batch size for operations (default: 100)
  --validate                Validate migration after completion
  --backup                  Create backup before migration
  --skip-errors             Skip errors during import
  --output <file>           Save export data to file
  --help, -h                Show this help message

Examples:
  # Basic migration
  migrate-dynamodb-to-mongodb --mongo-url mongodb://localhost:27017 --region us-east-1

  # Migration with validation and backup
  migrate-dynamodb-to-mongodb --config ./migration-config.json --validate --backup

  # Export only
  migrate-dynamodb-to-mongodb --region us-east-1 --output ./export.json --tables primary
    `);
    process.exit(0);
  }

  // Parse command line arguments
  const config: MigrationConfig = {
    source: {
      type: 'dynamodb',
      region: getArg('--region') || 'us-east-1',
      profile: getArg('--profile'),
      tables: (getArg('--tables') || 'primary,data').split(',')
    },
    target: {
      type: 'mongodb',
      connectionString: getArg('--mongo-url') || 'mongodb://localhost:27017',
      database: getArg('--mongo-db') || 'mytaptrack'
    },
    options: {
      batchSize: parseInt(getArg('--batch-size') || '100'),
      validateData: args.includes('--validate'),
      createBackup: args.includes('--backup'),
      skipErrors: args.includes('--skip-errors'),
      outputFile: getArg('--output')
    }
  };

  // Load config file if specified
  const configFile = getArg('--config');
  if (configFile) {
    try {
      const fileConfig = JSON.parse(await fs.readFile(configFile, 'utf-8'));
      Object.assign(config, fileConfig);
    } catch (error) {
      console.error(`Failed to load config file: ${configFile}`, error);
      process.exit(1);
    }
  }

  function getArg(name: string): string | undefined {
    const index = args.indexOf(name);
    return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
  }

  // Execute migration
  const migration = new DynamoDBToMongoDBMigration(config);
  await migration.execute();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

export { DynamoDBToMongoDBMigration, MigrationConfig };