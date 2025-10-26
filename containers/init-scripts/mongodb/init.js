// MongoDB Initialization Script for MyTapTrack Production

// Switch to the mytaptrack database
db = db.getSiblingDB('mytaptrack');

// Create collections with validation
db.createCollection('primary_data', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['pk', 'sk'],
      properties: {
        pk: {
          bsonType: 'string',
          description: 'Partition key - required'
        },
        sk: {
          bsonType: 'string',
          description: 'Sort key - required'
        },
        ttl: {
          bsonType: 'date',
          description: 'Time to live for automatic document expiration'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Document creation timestamp'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'Document last update timestamp'
        }
      }
    }
  }
});

// Create data collection (maps to AWS DynamoDB "data" table)
db.createCollection('data', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['pk', 'sk'],
      properties: {
        pk: {
          bsonType: 'string',
          description: 'Partition key - required'
        },
        sk: {
          bsonType: 'string',
          description: 'Sort key - required'
        },
        ttl: {
          bsonType: 'date',
          description: 'Time to live for automatic document expiration'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Document creation timestamp'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'Document last update timestamp'
        }
      }
    }
  }
});

db.createCollection('secondary_data', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['pk', 'sk'],
      properties: {
        pk: {
          bsonType: 'string',
          description: 'Partition key - required'
        },
        sk: {
          bsonType: 'string',
          description: 'Sort key - required'
        },
        ttl: {
          bsonType: 'date',
          description: 'Time to live for automatic document expiration'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Document creation timestamp'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'Document last update timestamp'
        }
      }
    }
  }
});

// Create indexes for primary_data collection
db.primary_data.createIndex({ pk: 1, sk: 1 }, { unique: true, name: 'pk_sk_unique' });
db.primary_data.createIndex({ pk: 1 }, { name: 'pk_index' });
db.primary_data.createIndex({ sk: 1 }, { name: 'sk_index' });
db.primary_data.createIndex({ ttl: 1 }, { expireAfterSeconds: 0, name: 'ttl_index' });
db.primary_data.createIndex({ createdAt: 1 }, { name: 'created_at_index' });
db.primary_data.createIndex({ updatedAt: 1 }, { name: 'updated_at_index' });

// Create indexes for data collection
db.data.createIndex({ pk: 1, sk: 1 }, { unique: true, name: 'pk_sk_unique' });
db.data.createIndex({ pk: 1 }, { name: 'pk_index' });
db.data.createIndex({ sk: 1 }, { name: 'sk_index' });
db.data.createIndex({ ttl: 1 }, { expireAfterSeconds: 0, name: 'ttl_index' });
db.data.createIndex({ createdAt: 1 }, { name: 'created_at_index' });
db.data.createIndex({ updatedAt: 1 }, { name: 'updated_at_index' });

// Create indexes for secondary_data collection
db.secondary_data.createIndex({ pk: 1, sk: 1 }, { unique: true, name: 'pk_sk_unique' });
db.secondary_data.createIndex({ pk: 1 }, { name: 'pk_index' });
db.secondary_data.createIndex({ sk: 1 }, { name: 'sk_index' });
db.secondary_data.createIndex({ ttl: 1 }, { expireAfterSeconds: 0, name: 'ttl_index' });
db.secondary_data.createIndex({ createdAt: 1 }, { name: 'created_at_index' });
db.secondary_data.createIndex({ updatedAt: 1 }, { name: 'updated_at_index' });

// Create specific indexes for MyTapTrack entities
// User indexes
db.primary_data.createIndex({ 'userId': 1 }, { name: 'user_id_index', sparse: true });
db.primary_data.createIndex({ 'email': 1 }, { name: 'email_index', sparse: true });
db.primary_data.createIndex({ 'license': 1 }, { name: 'license_index', sparse: true });

// Student indexes
db.primary_data.createIndex({ 'studentId': 1 }, { name: 'student_id_index', sparse: true });
db.primary_data.createIndex({ 'userId': 1, 'studentId': 1 }, { name: 'user_student_index', sparse: true });

// Device indexes
db.primary_data.createIndex({ 'deviceId': 1 }, { name: 'device_id_index', sparse: true });
db.primary_data.createIndex({ 'deviceSerial': 1 }, { name: 'device_serial_index', sparse: true });

// App indexes
db.primary_data.createIndex({ 'appId': 1 }, { name: 'app_id_index', sparse: true });
db.primary_data.createIndex({ 'appName': 1 }, { name: 'app_name_index', sparse: true });

// Report indexes
db.primary_data.createIndex({ 'reportId': 1 }, { name: 'report_id_index', sparse: true });
db.primary_data.createIndex({ 'reportType': 1 }, { name: 'report_type_index', sparse: true });

// Create cache collection for Redis-like functionality
db.createCollection('cache', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['key', 'value'],
      properties: {
        key: {
          bsonType: 'string',
          description: 'Cache key - required'
        },
        value: {
          description: 'Cache value - required'
        },
        ttl: {
          bsonType: 'date',
          description: 'Time to live for automatic document expiration'
        }
      }
    }
  }
});

db.cache.createIndex({ key: 1 }, { unique: true, name: 'cache_key_unique' });
db.cache.createIndex({ ttl: 1 }, { expireAfterSeconds: 0, name: 'cache_ttl_index' });

// Create admin user for the application
db.createUser({
  user: 'mytaptrack_app',
  pwd: 'app_password_change_me',
  roles: [
    {
      role: 'readWrite',
      db: 'mytaptrack'
    }
  ]
});

print('MongoDB initialization completed for MyTapTrack production environment');