// MongoDB Initialization Script for MyTapTrack Testing

// Switch to the test database
db = db.getSiblingDB('mytaptrack_test');

// Create collections
db.createCollection('primary_data');
db.createCollection('data'); // Maps to AWS DynamoDB "data" table
db.createCollection('secondary_data');
db.createCollection('cache');

// Create minimal indexes for testing
db.primary_data.createIndex({ pk: 1, sk: 1 }, { unique: true, name: 'pk_sk_unique' });
db.data.createIndex({ pk: 1, sk: 1 }, { unique: true, name: 'pk_sk_unique' });
db.secondary_data.createIndex({ pk: 1, sk: 1 }, { unique: true, name: 'pk_sk_unique' });
db.cache.createIndex({ key: 1 }, { unique: true, name: 'cache_key_unique' });

print('MongoDB initialization completed for MyTapTrack test environment');