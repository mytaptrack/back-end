#!/usr/bin/env node

/**
 * Database Backup and Restore Utilities
 * Provides backup and restore functionality for MongoDB databases
 */

import { MongoClient, Db } from 'mongodb';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

interface BackupMetadata {
  timestamp: Date;
  database: string;
  collections: string[];
  totalDocuments: number;
  totalSize: number;
  version: string;
  checksum: string;
}

interface BackupOptions {
  compress?: boolean;
  includeIndexes?: boolean;
  collections?: string[];
  batchSize?: number;
  outputDirectory?: string;
  progressCallback?: (progress: BackupProgress) => void;
}

interface RestoreOptions {
  dropExisting?: boolean;
  collections?: string[];
  batchSize?: number;
  validateAfterRestore?: boolean;
  progressCallback?: (progress: RestoreProgress) => void;
}

interface BackupProgress {
  phase: 'metadata' | 'collections' | 'indexes' | 'compression';
  currentCollection?: string;
  processedCollections: number;
  totalCollections: number;
  processedDocuments: number;
  totalDocuments: number;
}

interface RestoreProgress {
  phase: 'preparation' | 'collections' | 'indexes' | 'validation';
  currentCollection?: string;
  processedCollections: number;
  totalCollections: number;
  processedDocuments: number;
  totalDocuments: number;
}

export class DatabaseBackupManager {
  private client: MongoClient;
  private db: Db;

  constructor(client: MongoClient, databaseName: string = 'mytaptrack') {
    this.client = client;
    this.db = client.db(databaseName);
  }

  async createBackup(options: BackupOptions = {}): Promise<string> {
    const {
      compress = true,
      includeIndexes = true,
      collections,
      batchSize = 1000,
      outputDirectory = './backups',
      progressCallback
    } = options;

    const timestamp = new Date();
    const backupId = `backup-${timestamp.toISOString().replace(/[:.]/g, '-')}`;
    const backupDir = path.join(outputDirectory, backupId);

    console.log(`Creating backup: ${backupId}`);
    console.log(`Output directory: ${backupDir}`);

    try {
      // Create backup directory
      await fs.mkdir(backupDir, { recursive: true });

      // Get collections to backup
      const allCollections = await this.db.listCollections().toArray();
      const collectionsToBackup = collections || 
        allCollections
          .filter(c => !c.name.startsWith('system.'))
          .map(c => c.name);

      console.log(`Collections to backup: ${collectionsToBackup.join(', ')}`);

      let totalDocuments = 0;
      const collectionSizes: { [name: string]: number } = {};

      // Calculate total documents for progress tracking
      for (const collectionName of collectionsToBackup) {
        const collection = this.db.collection(collectionName);
        const count = await collection.countDocuments();
        collectionSizes[collectionName] = count;
        totalDocuments += count;
      }

      progressCallback?.({
        phase: 'metadata',
        processedCollections: 0,
        totalCollections: collectionsToBackup.length,
        processedDocuments: 0,
        totalDocuments
      });

      let processedDocuments = 0;
      const backupData: { [collection: string]: any } = {};
      const indexData: { [collection: string]: any[] } = {};

      // Backup each collection
      for (let i = 0; i < collectionsToBackup.length; i++) {
        const collectionName = collectionsToBackup[i];
        const collection = this.db.collection(collectionName);

        console.log(`Backing up collection: ${collectionName}`);

        progressCallback?.({
          phase: 'collections',
          currentCollection: collectionName,
          processedCollections: i,
          totalCollections: collectionsToBackup.length,
          processedDocuments,
          totalDocuments
        });

        // Backup documents
        const documents: any[] = [];
        const cursor = collection.find({}).batchSize(batchSize);

        for await (const doc of cursor) {
          documents.push(doc);
          processedDocuments++;

          if (processedDocuments % batchSize === 0) {
            progressCallback?.({
              phase: 'collections',
              currentCollection: collectionName,
              processedCollections: i,
              totalCollections: collectionsToBackup.length,
              processedDocuments,
              totalDocuments
            });
          }
        }

        backupData[collectionName] = documents;

        // Backup indexes if requested
        if (includeIndexes) {
          const indexes = await collection.listIndexes().toArray();
          indexData[collectionName] = indexes.filter(idx => idx.name !== '_id_');
        }

        console.log(`Backed up ${documents.length} documents from ${collectionName}`);
      }

      // Create metadata
      const metadata: BackupMetadata = {
        timestamp,
        database: this.db.databaseName,
        collections: collectionsToBackup,
        totalDocuments: processedDocuments,
        totalSize: JSON.stringify(backupData).length,
        version: '1.0.0',
        checksum: this.calculateChecksum(backupData)
      };

      // Save backup files
      const dataFile = path.join(backupDir, 'data.json');
      const indexFile = path.join(backupDir, 'indexes.json');
      const metadataFile = path.join(backupDir, 'metadata.json');

      progressCallback?.({
        phase: 'compression',
        processedCollections: collectionsToBackup.length,
        totalCollections: collectionsToBackup.length,
        processedDocuments,
        totalDocuments
      });

      if (compress) {
        // Compress and save data
        const compressedData = await gzip(JSON.stringify(backupData, null, 2));
        await fs.writeFile(`${dataFile}.gz`, compressedData);

        if (includeIndexes) {
          const compressedIndexes = await gzip(JSON.stringify(indexData, null, 2));
          await fs.writeFile(`${indexFile}.gz`, compressedIndexes);
        }
      } else {
        // Save uncompressed
        await fs.writeFile(dataFile, JSON.stringify(backupData, null, 2));
        
        if (includeIndexes) {
          await fs.writeFile(indexFile, JSON.stringify(indexData, null, 2));
        }
      }

      // Always save metadata uncompressed
      await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));

      console.log(`Backup completed successfully: ${backupDir}`);
      console.log(`Total documents: ${processedDocuments}`);
      console.log(`Compressed: ${compress}`);

      return backupDir;

    } catch (error) {
      console.error('Backup failed:', error);
      throw error;
    }
  }

  async restoreBackup(backupPath: string, options: RestoreOptions = {}): Promise<void> {
    const {
      dropExisting = false,
      collections,
      batchSize = 1000,
      validateAfterRestore = true,
      progressCallback
    } = options;

    console.log(`Restoring backup from: ${backupPath}`);

    try {
      // Load metadata
      const metadataFile = path.join(backupPath, 'metadata.json');
      const metadata: BackupMetadata = JSON.parse(await fs.readFile(metadataFile, 'utf-8'));

      console.log(`Backup timestamp: ${metadata.timestamp}`);
      console.log(`Source database: ${metadata.database}`);
      console.log(`Collections: ${metadata.collections.join(', ')}`);

      // Determine which files to load (compressed or uncompressed)
      const dataFile = path.join(backupPath, 'data.json');
      const compressedDataFile = `${dataFile}.gz`;
      const indexFile = path.join(backupPath, 'indexes.json');
      const compressedIndexFile = `${indexFile}.gz`;

      const useCompressed = await fs.access(compressedDataFile).then(() => true).catch(() => false);

      // Load backup data
      let backupData: { [collection: string]: any[] };
      let indexData: { [collection: string]: any[] } = {};

      progressCallback?.({
        phase: 'preparation',
        processedCollections: 0,
        totalCollections: metadata.collections.length,
        processedDocuments: 0,
        totalDocuments: metadata.totalDocuments
      });

      if (useCompressed) {
        console.log('Loading compressed backup data...');
        const compressedData = await fs.readFile(compressedDataFile);
        const decompressedData = await gunzip(compressedData);
        backupData = JSON.parse(decompressedData.toString());

        // Load indexes if they exist
        try {
          const compressedIndexes = await fs.readFile(compressedIndexFile);
          const decompressedIndexes = await gunzip(compressedIndexes);
          indexData = JSON.parse(decompressedIndexes.toString());
        } catch {
          console.log('No compressed index data found');
        }
      } else {
        console.log('Loading uncompressed backup data...');
        backupData = JSON.parse(await fs.readFile(dataFile, 'utf-8'));

        // Load indexes if they exist
        try {
          indexData = JSON.parse(await fs.readFile(indexFile, 'utf-8'));
        } catch {
          console.log('No index data found');
        }
      }

      // Validate checksum
      const calculatedChecksum = this.calculateChecksum(backupData);
      if (calculatedChecksum !== metadata.checksum) {
        throw new Error('Backup data checksum validation failed');
      }

      console.log('Backup data loaded and validated successfully');

      // Filter collections if specified
      const collectionsToRestore = collections || metadata.collections;
      let processedDocuments = 0;

      // Restore each collection
      for (let i = 0; i < collectionsToRestore.length; i++) {
        const collectionName = collectionsToRestore[i];
        
        if (!backupData[collectionName]) {
          console.warn(`Collection ${collectionName} not found in backup data`);
          continue;
        }

        const documents = backupData[collectionName];
        console.log(`Restoring collection: ${collectionName} (${documents.length} documents)`);

        progressCallback?.({
          phase: 'collections',
          currentCollection: collectionName,
          processedCollections: i,
          totalCollections: collectionsToRestore.length,
          processedDocuments,
          totalDocuments: metadata.totalDocuments
        });

        const collection = this.db.collection(collectionName);

        // Drop existing collection if requested
        if (dropExisting) {
          try {
            await collection.drop();
            console.log(`Dropped existing collection: ${collectionName}`);
          } catch {
            // Collection might not exist, which is fine
          }
        }

        // Insert documents in batches
        for (let j = 0; j < documents.length; j += batchSize) {
          const batch = documents.slice(j, j + batchSize);
          
          try {
            await collection.insertMany(batch, { ordered: false });
            processedDocuments += batch.length;
          } catch (error) {
            console.warn(`Error inserting batch for ${collectionName}:`, error);
            // Continue with next batch
          }

          progressCallback?.({
            phase: 'collections',
            currentCollection: collectionName,
            processedCollections: i,
            totalCollections: collectionsToRestore.length,
            processedDocuments,
            totalDocuments: metadata.totalDocuments
          });
        }

        console.log(`Restored ${documents.length} documents to ${collectionName}`);
      }

      // Restore indexes
      if (Object.keys(indexData).length > 0) {
        console.log('Restoring indexes...');
        
        progressCallback?.({
          phase: 'indexes',
          processedCollections: collectionsToRestore.length,
          totalCollections: collectionsToRestore.length,
          processedDocuments,
          totalDocuments: metadata.totalDocuments
        });

        for (const collectionName of collectionsToRestore) {
          if (indexData[collectionName]) {
            const collection = this.db.collection(collectionName);
            
            for (const indexSpec of indexData[collectionName]) {
              try {
                await collection.createIndex(indexSpec.key, {
                  name: indexSpec.name,
                  ...indexSpec
                });
                console.log(`Created index ${indexSpec.name} on ${collectionName}`);
              } catch (error) {
                console.warn(`Failed to create index ${indexSpec.name} on ${collectionName}:`, error);
              }
            }
          }
        }
      }

      // Validate restoration if requested
      if (validateAfterRestore) {
        console.log('Validating restoration...');
        
        progressCallback?.({
          phase: 'validation',
          processedCollections: collectionsToRestore.length,
          totalCollections: collectionsToRestore.length,
          processedDocuments,
          totalDocuments: metadata.totalDocuments
        });

        for (const collectionName of collectionsToRestore) {
          const collection = this.db.collection(collectionName);
          const actualCount = await collection.countDocuments();
          const expectedCount = backupData[collectionName]?.length || 0;
          
          if (actualCount !== expectedCount) {
            console.warn(`Collection ${collectionName}: expected ${expectedCount} documents, found ${actualCount}`);
          } else {
            console.log(`Collection ${collectionName}: validation passed (${actualCount} documents)`);
          }
        }
      }

      console.log('Backup restoration completed successfully');
      console.log(`Total documents restored: ${processedDocuments}`);

    } catch (error) {
      console.error('Restore failed:', error);
      throw error;
    }
  }

  async listBackups(backupDirectory: string = './backups'): Promise<BackupMetadata[]> {
    try {
      const entries = await fs.readdir(backupDirectory, { withFileTypes: true });
      const backups: BackupMetadata[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('backup-')) {
          try {
            const metadataFile = path.join(backupDirectory, entry.name, 'metadata.json');
            const metadata: BackupMetadata = JSON.parse(await fs.readFile(metadataFile, 'utf-8'));
            backups.push(metadata);
          } catch {
            // Skip invalid backup directories
          }
        }
      }

      return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch {
      return [];
    }
  }

  private calculateChecksum(data: any): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: database-backup-restore <command> [options]

Commands:
  backup                    Create a backup
  restore <backup-path>     Restore from backup
  list                      List available backups

Backup Options:
  --mongo-url <url>         MongoDB connection string (default: mongodb://localhost:27017)
  --database <name>         Database name (default: mytaptrack)
  --output <dir>            Output directory (default: ./backups)
  --collections <list>      Comma-separated list of collections to backup
  --no-compress             Disable compression
  --no-indexes              Skip index backup
  --batch-size <size>       Batch size for operations (default: 1000)

Restore Options:
  --mongo-url <url>         MongoDB connection string (default: mongodb://localhost:27017)
  --database <name>         Database name (default: mytaptrack)
  --collections <list>      Comma-separated list of collections to restore
  --drop-existing           Drop existing collections before restore
  --no-validate             Skip validation after restore
  --batch-size <size>       Batch size for operations (default: 1000)

Examples:
  # Create backup
  database-backup-restore backup --output ./my-backups

  # Restore backup
  database-backup-restore restore ./backups/backup-2023-12-01T10-00-00-000Z

  # List backups
  database-backup-restore list --output ./my-backups
    `);
    process.exit(0);
  }

  const mongoUrl = getArg('--mongo-url') || 'mongodb://localhost:27017';
  const database = getArg('--database') || 'mytaptrack';
  const batchSize = parseInt(getArg('--batch-size') || '1000');

  function getArg(name: string): string | undefined {
    const index = args.indexOf(name);
    return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
  }

  try {
    const client = new MongoClient(mongoUrl);
    await client.connect();

    const backupManager = new DatabaseBackupManager(client, database);

    switch (command) {
      case 'backup': {
        const outputDir = getArg('--output') || './backups';
        const collectionsArg = getArg('--collections');
        const collections = collectionsArg ? collectionsArg.split(',') : undefined;
        
        const options: BackupOptions = {
          compress: !args.includes('--no-compress'),
          includeIndexes: !args.includes('--no-indexes'),
          collections,
          batchSize,
          outputDirectory: outputDir,
          progressCallback: (progress) => {
            const percentage = Math.round((progress.processedDocuments / progress.totalDocuments) * 100);
            console.log(`${progress.phase}: ${progress.processedDocuments}/${progress.totalDocuments} (${percentage}%) - ${progress.currentCollection || ''}`);
          }
        };

        const backupPath = await backupManager.createBackup(options);
        console.log(`Backup created: ${backupPath}`);
        break;
      }

      case 'restore': {
        const backupPath = args[1];
        if (!backupPath) {
          console.error('Backup path is required for restore command');
          process.exit(1);
        }

        const collectionsArg = getArg('--collections');
        const collections = collectionsArg ? collectionsArg.split(',') : undefined;

        const options: RestoreOptions = {
          dropExisting: args.includes('--drop-existing'),
          collections,
          batchSize,
          validateAfterRestore: !args.includes('--no-validate'),
          progressCallback: (progress) => {
            const percentage = Math.round((progress.processedDocuments / progress.totalDocuments) * 100);
            console.log(`${progress.phase}: ${progress.processedDocuments}/${progress.totalDocuments} (${percentage}%) - ${progress.currentCollection || ''}`);
          }
        };

        await backupManager.restoreBackup(backupPath, options);
        console.log('Restore completed successfully');
        break;
      }

      case 'list': {
        const outputDir = getArg('--output') || './backups';
        const backups = await backupManager.listBackups(outputDir);
        
        if (backups.length === 0) {
          console.log('No backups found');
        } else {
          console.log('Available backups:');
          backups.forEach(backup => {
            console.log(`  ${backup.timestamp} - ${backup.database} (${backup.totalDocuments} documents, ${backup.collections.length} collections)`);
          });
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }

    await client.close();
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}