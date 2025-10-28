/**
 * MongoDB Development Data Seeding Script
 * Seeds the database with sample data for development and testing
 */

// Switch to the mytaptrack database
db = db.getSiblingDB('mytaptrack');

print('Seeding development data...');

// Helper function to generate UUIDs (simplified for demo)
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Helper function to create timestamps
function createTimestamp(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
}

// Sample license data
const sampleLicense = 'dev-license-001';

// Sample users
const users = [
  {
    pk: 'U#user001',
    sk: 'P',
    pksk: 'U#user001#P',
    version: 1,
    userId: 'user001',
    license: sampleLicense,
    data: {
      email: 'admin@mytaptrack.dev',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      status: 'active',
      preferences: {
        timezone: 'America/New_York',
        notifications: true
      }
    },
    createdAt: createTimestamp(30),
    updatedAt: createTimestamp(1)
  },
  {
    pk: 'U#user002',
    sk: 'P',
    pksk: 'U#user002#P',
    version: 1,
    userId: 'user002',
    license: sampleLicense,
    data: {
      email: 'teacher@mytaptrack.dev',
      firstName: 'Jane',
      lastName: 'Teacher',
      role: 'teacher',
      status: 'active',
      preferences: {
        timezone: 'America/New_York',
        notifications: true
      }
    },
    createdAt: createTimestamp(25),
    updatedAt: createTimestamp(2)
  },
  {
    pk: 'U#user003',
    sk: 'P',
    pksk: 'U#user003#P',
    version: 1,
    userId: 'user003',
    license: sampleLicense,
    data: {
      email: 'parent@mytaptrack.dev',
      firstName: 'John',
      lastName: 'Parent',
      role: 'parent',
      status: 'active',
      preferences: {
        timezone: 'America/New_York',
        notifications: false
      }
    },
    createdAt: createTimestamp(20),
    updatedAt: createTimestamp(3)
  }
];

// Sample students
const students = [
  {
    pk: 'S#student001',
    sk: 'P',
    pksk: 'S#student001#P',
    version: 1,
    studentId: 'student001',
    license: sampleLicense,
    data: {
      firstName: 'Alice',
      lastName: 'Student',
      grade: '5',
      dateOfBirth: '2013-05-15',
      status: 'active',
      parentId: 'user003',
      teacherId: 'user002',
      deviceId: 'device001',
      settings: {
        trackingEnabled: true,
        alertsEnabled: true
      }
    },
    createdAt: createTimestamp(15),
    updatedAt: createTimestamp(1)
  },
  {
    pk: 'S#student002',
    sk: 'P',
    pksk: 'S#student002#P',
    version: 1,
    studentId: 'student002',
    license: sampleLicense,
    data: {
      firstName: 'Bob',
      lastName: 'Student',
      grade: '4',
      dateOfBirth: '2014-08-22',
      status: 'active',
      parentId: 'user003',
      teacherId: 'user002',
      deviceId: 'device002',
      settings: {
        trackingEnabled: true,
        alertsEnabled: false
      }
    },
    createdAt: createTimestamp(12),
    updatedAt: createTimestamp(2)
  }
];

// Sample devices
const devices = [
  {
    pk: 'D#device001',
    sk: 'P',
    pksk: 'D#device001#P',
    version: 1,
    license: sampleLicense,
    data: {
      deviceId: 'device001',
      serialNumber: 'MTT001234567',
      model: 'TapTracker-v2',
      status: 'active',
      batteryLevel: 85,
      lastSeen: createTimestamp(0),
      assignedTo: 'student001',
      settings: {
        sampleRate: 30,
        transmissionInterval: 300
      }
    },
    createdAt: createTimestamp(15),
    updatedAt: createTimestamp(0)
  },
  {
    pk: 'D#device002',
    sk: 'P',
    pksk: 'D#device002#P',
    version: 1,
    license: sampleLicense,
    data: {
      deviceId: 'device002',
      serialNumber: 'MTT001234568',
      model: 'TapTracker-v2',
      status: 'active',
      batteryLevel: 92,
      lastSeen: createTimestamp(0),
      assignedTo: 'student002',
      settings: {
        sampleRate: 30,
        transmissionInterval: 300
      }
    },
    createdAt: createTimestamp(12),
    updatedAt: createTimestamp(0)
  }
];

// Sample license configuration
const licenseConfig = {
  pk: `L#${sampleLicense}`,
  sk: 'P',
  pksk: `L#${sampleLicense}#P`,
  version: 1,
  license: sampleLicense,
  data: {
    name: 'Development License',
    type: 'development',
    status: 'active',
    maxUsers: 100,
    maxStudents: 500,
    maxDevices: 500,
    features: {
      realTimeTracking: true,
      reports: true,
      alerts: true,
      dataExport: true
    },
    expiresAt: new Date('2025-12-31'),
    settings: {
      dataRetentionDays: 365,
      reportScheduling: true
    }
  },
  createdAt: createTimestamp(30),
  updatedAt: createTimestamp(5)
};

// Sample app configurations
const apps = [
  {
    pk: 'A#app001',
    sk: 'P',
    pksk: 'A#app001#P',
    version: 1,
    license: sampleLicense,
    data: {
      appId: 'app001',
      name: 'Math Learning App',
      type: 'educational',
      category: 'mathematics',
      status: 'active',
      version: '1.2.3',
      settings: {
        trackingEnabled: true,
        dataCollection: {
          interactions: true,
          timeSpent: true,
          performance: true
        }
      }
    },
    createdAt: createTimestamp(20),
    updatedAt: createTimestamp(3)
  }
];

// Insert sample data
print('Inserting users...');
db.primary.insertMany(users);

print('Inserting students...');
db.primary.insertMany(students);

print('Inserting devices...');
db.primary.insertMany(devices);

print('Inserting license configuration...');
db.primary.insertOne(licenseConfig);

print('Inserting app configurations...');
db.primary.insertMany(apps);

// Generate sample time-series data
print('Generating sample time-series data...');

const timeSeriesData = [];
const now = new Date();

// Generate data for the last 7 days
for (let day = 0; day < 7; day++) {
  for (let hour = 0; hour < 24; hour++) {
    const timestamp = new Date(now);
    timestamp.setDate(timestamp.getDate() - day);
    timestamp.setHours(hour, 0, 0, 0);

    // Student activity data
    students.forEach(student => {
      timeSeriesData.push({
        pk: `SD#${student.studentId}`,
        sk: `T#${timestamp.toISOString()}`,
        pksk: `SD#${student.studentId}#T#${timestamp.toISOString()}`,
        version: 1,
        timestamp: timestamp,
        data: {
          studentId: student.studentId,
          activityLevel: Math.floor(Math.random() * 100),
          focusScore: Math.floor(Math.random() * 100),
          engagementTime: Math.floor(Math.random() * 3600), // seconds
          interactions: Math.floor(Math.random() * 50),
          deviceBattery: 80 + Math.floor(Math.random() * 20)
        },
        createdAt: timestamp
      });
    });

    // Device telemetry data
    devices.forEach(device => {
      timeSeriesData.push({
        pk: `DT#${device.data.deviceId}`,
        sk: `T#${timestamp.toISOString()}`,
        pksk: `DT#${device.data.deviceId}#T#${timestamp.toISOString()}`,
        version: 1,
        timestamp: timestamp,
        data: {
          deviceId: device.data.deviceId,
          batteryLevel: 70 + Math.floor(Math.random() * 30),
          signalStrength: -40 - Math.floor(Math.random() * 40),
          temperature: 20 + Math.floor(Math.random() * 15),
          accelerometer: {
            x: Math.random() * 2 - 1,
            y: Math.random() * 2 - 1,
            z: Math.random() * 2 - 1
          }
        },
        createdAt: timestamp
      });
    });
  }
}

// Insert time-series data in batches
const batchSize = 100;
for (let i = 0; i < timeSeriesData.length; i += batchSize) {
  const batch = timeSeriesData.slice(i, i + batchSize);
  db.data.insertMany(batch);
}

print(`Inserted ${timeSeriesData.length} time-series data points.`);

// Create sample migration record
const sampleMigration = {
  migrationId: 'seed-data-migration',
  status: 'completed',
  sourceProvider: 'seed',
  targetProvider: 'mongodb',
  recordCount: users.length + students.length + devices.length + apps.length + 1 + timeSeriesData.length,
  errorCount: 0,
  createdAt: createTimestamp(0),
  completedAt: new Date(),
  metadata: {
    type: 'development_seed',
    description: 'Initial development data seeding',
    collections: ['primary', 'data'],
    dataTypes: ['users', 'students', 'devices', 'license', 'apps', 'timeseries']
  }
};

db.migrations.insertOne(sampleMigration);

print('Development data seeding completed successfully.');
print(`Total records inserted: ${sampleMigration.recordCount}`);