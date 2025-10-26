// MongoDB Initialization Script for MyTapTrack Development

// Switch to the development database
db = db.getSiblingDB('mytaptrack_dev');

// Create collections with validation (relaxed for development)
db.createCollection('primary_data');
db.createCollection('data'); // Maps to AWS DynamoDB "data" table
db.createCollection('secondary_data');
db.createCollection('cache');

// Create basic indexes
db.primary_data.createIndex({ pk: 1, sk: 1 }, { unique: true, name: 'pk_sk_unique' });
db.primary_data.createIndex({ pk: 1 }, { name: 'pk_index' });
db.primary_data.createIndex({ sk: 1 }, { name: 'sk_index' });
db.primary_data.createIndex({ createdAt: 1 }, { name: 'created_at_index' });

// Indexes for data collection (maps to AWS DynamoDB "data" table)
db.data.createIndex({ pk: 1, sk: 1 }, { unique: true, name: 'pk_sk_unique' });
db.data.createIndex({ pk: 1 }, { name: 'pk_index' });
db.data.createIndex({ sk: 1 }, { name: 'sk_index' });
db.data.createIndex({ createdAt: 1 }, { name: 'created_at_index' });

db.secondary_data.createIndex({ pk: 1, sk: 1 }, { unique: true, name: 'pk_sk_unique' });
db.secondary_data.createIndex({ pk: 1 }, { name: 'pk_index' });
db.secondary_data.createIndex({ sk: 1 }, { name: 'sk_index' });

db.cache.createIndex({ key: 1 }, { unique: true, name: 'cache_key_unique' });

// Insert sample data for development
db.primary_data.insertMany([
  {
    pk: 'U#dev-user-1',
    sk: 'P',
    userId: 'dev-user-1',
    email: 'dev@mytaptrack.com',
    license: 'dev-license',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    pk: 'S#dev-student-1',
    sk: 'P',
    studentId: 'dev-student-1',
    userId: 'dev-user-1',
    name: 'Dev Student',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    pk: 'A#dev-app-1',
    sk: 'P',
    appId: 'dev-app-1',
    appName: 'Dev App',
    userId: 'dev-user-1',
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print('MongoDB initialization completed for MyTapTrack development environment');
print('Sample data inserted for testing');