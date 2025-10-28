/**
 * MongoDB Database Initialization Script
 * Creates the MyTapTrack database with required collections and indexes
 */

// Switch to the mytaptrack database
db = db.getSiblingDB('mytaptrack');

print('Initializing MyTapTrack MongoDB database...');

// Create collections with validation schemas
print('Creating collections...');

// Primary data collection - stores all entity data
db.createCollection('primary', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['pk', 'sk', 'pksk', 'version'],
      properties: {
        pk: {
          bsonType: 'string',
          description: 'Primary key - required'
        },
        sk: {
          bsonType: 'string',
          description: 'Sort key - required'
        },
        pksk: {
          bsonType: 'string',
          description: 'Composite key for indexing - required'
        },
        version: {
          bsonType: 'int',
          minimum: 1,
          description: 'Version for optimistic locking - required'
        },
        userId: {
          bsonType: 'string',
          description: 'User identifier - optional'
        },
        studentId: {
          bsonType: 'string',
          description: 'Student identifier - optional'
        },
        license: {
          bsonType: 'string',
          description: 'License identifier - optional'
        },
        data: {
          bsonType: 'object',
          description: 'Entity data - optional'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Creation timestamp - optional'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'Last update timestamp - optional'
        }
      }
    }
  }
});

// Data collection - stores time-series and analytical data
db.createCollection('data', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['pk', 'sk', 'pksk', 'version'],
      properties: {
        pk: {
          bsonType: 'string',
          description: 'Primary key - required'
        },
        sk: {
          bsonType: 'string',
          description: 'Sort key - required'
        },
        pksk: {
          bsonType: 'string',
          description: 'Composite key for indexing - required'
        },
        version: {
          bsonType: 'int',
          minimum: 1,
          description: 'Version for optimistic locking - required'
        },
        timestamp: {
          bsonType: 'date',
          description: 'Data timestamp - optional'
        },
        data: {
          bsonType: 'object',
          description: 'Time-series data - optional'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Creation timestamp - optional'
        }
      }
    }
  }
});

// Migration tracking collection
db.createCollection('migrations', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['migrationId', 'status', 'createdAt'],
      properties: {
        migrationId: {
          bsonType: 'string',
          description: 'Migration identifier - required'
        },
        status: {
          bsonType: 'string',
          enum: ['pending', 'running', 'completed', 'failed', 'rolled_back'],
          description: 'Migration status - required'
        },
        sourceProvider: {
          bsonType: 'string',
          description: 'Source database provider'
        },
        targetProvider: {
          bsonType: 'string',
          description: 'Target database provider'
        },
        recordCount: {
          bsonType: 'int',
          minimum: 0,
          description: 'Number of records migrated'
        },
        errorCount: {
          bsonType: 'int',
          minimum: 0,
          description: 'Number of errors during migration'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Migration start time - required'
        },
        completedAt: {
          bsonType: 'date',
          description: 'Migration completion time'
        },
        metadata: {
          bsonType: 'object',
          description: 'Migration metadata'
        }
      }
    }
  }
});

print('Collections created successfully.');

// Create indexes for optimal query performance
print('Creating indexes...');

// Primary collection indexes
db.primary.createIndex({ pk: 1, sk: 1 }, { 
  name: 'pk_sk_index', 
  unique: true,
  background: true 
});

db.primary.createIndex({ pksk: 1 }, { 
  name: 'pksk_index',
  background: true 
});

db.primary.createIndex({ userId: 1 }, { 
  name: 'userId_index',
  sparse: true,
  background: true 
});

db.primary.createIndex({ studentId: 1 }, { 
  name: 'studentId_index',
  sparse: true,
  background: true 
});

db.primary.createIndex({ license: 1 }, { 
  name: 'license_index',
  sparse: true,
  background: true 
});

db.primary.createIndex({ 'data.email': 1 }, { 
  name: 'email_index',
  sparse: true,
  background: true 
});

db.primary.createIndex({ createdAt: 1 }, { 
  name: 'createdAt_index',
  sparse: true,
  background: true 
});

db.primary.createIndex({ updatedAt: 1 }, { 
  name: 'updatedAt_index',
  sparse: true,
  background: true 
});

// Compound indexes for common query patterns
db.primary.createIndex({ license: 1, pk: 1 }, { 
  name: 'license_pk_index',
  sparse: true,
  background: true 
});

db.primary.createIndex({ userId: 1, license: 1 }, { 
  name: 'userId_license_index',
  sparse: true,
  background: true 
});

db.primary.createIndex({ studentId: 1, license: 1 }, { 
  name: 'studentId_license_index',
  sparse: true,
  background: true 
});

// Data collection indexes
db.data.createIndex({ pk: 1, sk: 1 }, { 
  name: 'pk_sk_index', 
  unique: true,
  background: true 
});

db.data.createIndex({ pksk: 1 }, { 
  name: 'pksk_index',
  background: true 
});

db.data.createIndex({ timestamp: 1 }, { 
  name: 'timestamp_index',
  sparse: true,
  background: true 
});

db.data.createIndex({ createdAt: 1 }, { 
  name: 'createdAt_index',
  sparse: true,
  background: true 
});

// Time-based compound indexes for data queries
db.data.createIndex({ pk: 1, timestamp: 1 }, { 
  name: 'pk_timestamp_index',
  background: true 
});

db.data.createIndex({ pk: 1, createdAt: 1 }, { 
  name: 'pk_createdAt_index',
  background: true 
});

// Migration collection indexes
db.migrations.createIndex({ migrationId: 1 }, { 
  name: 'migrationId_index', 
  unique: true,
  background: true 
});

db.migrations.createIndex({ status: 1 }, { 
  name: 'status_index',
  background: true 
});

db.migrations.createIndex({ createdAt: 1 }, { 
  name: 'createdAt_index',
  background: true 
});

print('Indexes created successfully.');

// Create database user for application access
print('Creating application user...');

db.createUser({
  user: 'mytaptrack_app',
  pwd: 'mytaptrack_app_password',
  roles: [
    {
      role: 'readWrite',
      db: 'mytaptrack'
    }
  ]
});

print('Application user created successfully.');

print('MyTapTrack MongoDB database initialization completed successfully.');