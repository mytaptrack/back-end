#!/usr/bin/env node

/**
 * Index Creation Script
 * Creates all required indexes for MongoDB collections
 */

import { MongoClient, Db } from 'mongodb';

interface IndexSpec {
  collection: string;
  name: string;
  fields: { [field: string]: 1 | -1 };
  options?: {
    unique?: boolean;
    sparse?: boolean;
    background?: boolean;
    expireAfterSeconds?: number;
  };
}

export class IndexManager {
  private db: Db;

  constructor(client: MongoClient, databaseName: string = 'mytaptrack') {
    this.db = client.db(databaseName);
  }

  async createAllIndexes(): Promise<void> {
    const indexes = this.getRequiredIndexes();
    
    console.log(`Creating ${indexes.length} indexes across ${this.getUniqueCollections(indexes).length} collections...`);

    for (const indexSpec of indexes) {
      await this.createIndex(indexSpec);
    }

    console.log('All indexes created successfully');
  }

  async createIndex(indexSpec: IndexSpec): Promise<void> {
    try {
      const collection = this.db.collection(indexSpec.collection);
      
      // Check if index already exists
      const existingIndexes = await collection.listIndexes().toArray();
      const indexExists = existingIndexes.some(idx => idx.name === indexSpec.name);
      
      if (indexExists) {
        console.log(`Index '${indexSpec.name}' already exists on collection '${indexSpec.collection}'`);
        return;
      }

      await collection.createIndex(indexSpec.fields, {
        name: indexSpec.name,
        ...indexSpec.options
      });
      
      console.log(`Created index '${indexSpec.name}' on collection '${indexSpec.collection}'`);
    } catch (error) {
      console.error(`Failed to create index '${indexSpec.name}' on collection '${indexSpec.collection}':`, error);
      throw error;
    }
  }

  async validateIndexes(): Promise<{ valid: boolean; missing: string[]; extra: string[] }> {
    const requiredIndexes = this.getRequiredIndexes();
    const missing: string[] = [];
    const extra: string[] = [];

    // Group required indexes by collection
    const indexesByCollection = requiredIndexes.reduce((acc, idx) => {
      if (!acc[idx.collection]) acc[idx.collection] = [];
      acc[idx.collection].push(idx);
      return acc;
    }, {} as { [collection: string]: IndexSpec[] });

    // Check each collection
    for (const [collectionName, expectedIndexes] of Object.entries(indexesByCollection)) {
      try {
        const collection = this.db.collection(collectionName);
        const existingIndexes = await collection.listIndexes().toArray();
        const existingIndexNames = existingIndexes.map(idx => idx.name);

        // Check for missing indexes
        for (const expectedIndex of expectedIndexes) {
          if (!existingIndexNames.includes(expectedIndex.name)) {
            missing.push(`${collectionName}.${expectedIndex.name}`);
          }
        }

        // Check for extra indexes (excluding default _id_ index)
        const expectedIndexNames = expectedIndexes.map(idx => idx.name);
        for (const existingIndexName of existingIndexNames) {
          if (existingIndexName !== '_id_' && !expectedIndexNames.includes(existingIndexName)) {
            extra.push(`${collectionName}.${existingIndexName}`);
          }
        }
      } catch (error) {
        console.warn(`Could not validate indexes for collection '${collectionName}':`, error);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      extra
    };
  }

  async dropAllIndexes(excludeDefault: boolean = true): Promise<void> {
    const collections = ['primary', 'data', 'migrations'];
    
    for (const collectionName of collections) {
      try {
        const collection = this.db.collection(collectionName);
        const indexes = await collection.listIndexes().toArray();
        
        for (const index of indexes) {
          if (excludeDefault && index.name === '_id_') {
            continue;
          }
          
          await collection.dropIndex(index.name);
          console.log(`Dropped index '${index.name}' from collection '${collectionName}'`);
        }
      } catch (error) {
        console.warn(`Could not drop indexes for collection '${collectionName}':`, error);
      }
    }
  }

  private getRequiredIndexes(): IndexSpec[] {
    return [
      // Primary collection indexes
      {
        collection: 'primary',
        name: 'pk_sk_index',
        fields: { pk: 1, sk: 1 },
        options: { unique: true, background: true }
      },
      {
        collection: 'primary',
        name: 'pksk_index',
        fields: { pksk: 1 },
        options: { background: true }
      },
      {
        collection: 'primary',
        name: 'userId_index',
        fields: { userId: 1 },
        options: { sparse: true, background: true }
      },
      {
        collection: 'primary',
        name: 'studentId_index',
        fields: { studentId: 1 },
        options: { sparse: true, background: true }
      },
      {
        collection: 'primary',
        name: 'license_index',
        fields: { license: 1 },
        options: { sparse: true, background: true }
      },
      {
        collection: 'primary',
        name: 'email_index',
        fields: { 'data.email': 1 },
        options: { sparse: true, background: true }
      },
      {
        collection: 'primary',
        name: 'createdAt_index',
        fields: { createdAt: 1 },
        options: { sparse: true, background: true }
      },
      {
        collection: 'primary',
        name: 'updatedAt_index',
        fields: { updatedAt: 1 },
        options: { sparse: true, background: true }
      },
      {
        collection: 'primary',
        name: 'license_pk_index',
        fields: { license: 1, pk: 1 },
        options: { sparse: true, background: true }
      },
      {
        collection: 'primary',
        name: 'userId_license_index',
        fields: { userId: 1, license: 1 },
        options: { sparse: true, background: true }
      },
      {
        collection: 'primary',
        name: 'studentId_license_index',
        fields: { studentId: 1, license: 1 },
        options: { sparse: true, background: true }
      },

      // Data collection indexes
      {
        collection: 'data',
        name: 'pk_sk_index',
        fields: { pk: 1, sk: 1 },
        options: { unique: true, background: true }
      },
      {
        collection: 'data',
        name: 'pksk_index',
        fields: { pksk: 1 },
        options: { background: true }
      },
      {
        collection: 'data',
        name: 'timestamp_index',
        fields: { timestamp: 1 },
        options: { sparse: true, background: true }
      },
      {
        collection: 'data',
        name: 'createdAt_index',
        fields: { createdAt: 1 },
        options: { sparse: true, background: true }
      },
      {
        collection: 'data',
        name: 'pk_timestamp_index',
        fields: { pk: 1, timestamp: 1 },
        options: { background: true }
      },
      {
        collection: 'data',
        name: 'pk_createdAt_index',
        fields: { pk: 1, createdAt: 1 },
        options: { background: true }
      },

      // Migration collection indexes
      {
        collection: 'migrations',
        name: 'migrationId_index',
        fields: { migrationId: 1 },
        options: { unique: true, background: true }
      },
      {
        collection: 'migrations',
        name: 'status_index',
        fields: { status: 1 },
        options: { background: true }
      },
      {
        collection: 'migrations',
        name: 'createdAt_index',
        fields: { createdAt: 1 },
        options: { background: true }
      }
    ];
  }

  private getUniqueCollections(indexes: IndexSpec[]): string[] {
    return [...new Set(indexes.map(idx => idx.collection))];
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: create-indexes <command> [options]

Commands:
  create                    Create all required indexes
  validate                  Validate existing indexes
  drop                      Drop all indexes (except _id_)
  recreate                  Drop and recreate all indexes

Options:
  --mongo-url <url>         MongoDB connection string (default: mongodb://localhost:27017)
  --database <name>         Database name (default: mytaptrack)
  --help, -h                Show this help message

Examples:
  # Create all indexes
  create-indexes create --mongo-url mongodb://admin:password@localhost:27017

  # Validate indexes
  create-indexes validate --database mytaptrack_test

  # Recreate all indexes
  create-indexes recreate --mongo-url mongodb://admin:password@localhost:27017
    `);
    process.exit(0);
  }

  const mongoUrl = getArg('--mongo-url') || 'mongodb://localhost:27017';
  const database = getArg('--database') || 'mytaptrack';

  function getArg(name: string): string | undefined {
    const index = args.indexOf(name);
    return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
  }

  try {
    const client = new MongoClient(mongoUrl);
    await client.connect();

    const indexManager = new IndexManager(client, database);

    switch (command) {
      case 'create':
        await indexManager.createAllIndexes();
        break;

      case 'validate':
        const validation = await indexManager.validateIndexes();
        console.log(`Index validation: ${validation.valid ? 'PASSED' : 'FAILED'}`);
        
        if (validation.missing.length > 0) {
          console.log('Missing indexes:');
          validation.missing.forEach(idx => console.log(`  - ${idx}`));
        }
        
        if (validation.extra.length > 0) {
          console.log('Extra indexes:');
          validation.extra.forEach(idx => console.log(`  - ${idx}`));
        }
        
        if (!validation.valid) {
          process.exit(1);
        }
        break;

      case 'drop':
        await indexManager.dropAllIndexes();
        console.log('All indexes dropped');
        break;

      case 'recreate':
        console.log('Dropping existing indexes...');
        await indexManager.dropAllIndexes();
        console.log('Creating new indexes...');
        await indexManager.createAllIndexes();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }

    await client.close();
    console.log('Operation completed successfully');
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}