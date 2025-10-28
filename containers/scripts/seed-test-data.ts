#!/usr/bin/env node

/**
 * Test Data Seeding Script
 * Creates realistic test data for different environments (development, testing, staging)
 */

import { MongoClient, Db } from 'mongodb';
import * as fs from 'fs/promises';

interface SeedingOptions {
  environment: 'development' | 'testing' | 'staging';
  userCount?: number;
  studentCount?: number;
  deviceCount?: number;
  daysOfData?: number;
  clearExisting?: boolean;
  progressCallback?: (progress: SeedingProgress) => void;
}

interface SeedingProgress {
  phase: 'preparation' | 'users' | 'students' | 'devices' | 'timeseries' | 'cleanup';
  current: number;
  total: number;
  message: string;
}

interface TestDataConfig {
  licenses: string[];
  userRoles: string[];
  studentGrades: string[];
  deviceModels: string[];
  appCategories: string[];
}

export class TestDataSeeder {
  private db: Db;
  private config: TestDataConfig;

  constructor(client: MongoClient, databaseName: string = 'mytaptrack') {
    this.db = client.db(databaseName);
    this.config = this.getTestDataConfig();
  }

  async seedData(options: SeedingOptions): Promise<void> {
    const {
      environment,
      userCount = this.getDefaultUserCount(environment),
      studentCount = this.getDefaultStudentCount(environment),
      deviceCount = this.getDefaultDeviceCount(environment),
      daysOfData = this.getDefaultDaysOfData(environment),
      clearExisting = false,
      progressCallback
    } = options;

    console.log(`Seeding ${environment} data...`);
    console.log(`Users: ${userCount}, Students: ${studentCount}, Devices: ${deviceCount}`);
    console.log(`Days of data: ${daysOfData}`);

    try {
      // Clear existing data if requested
      if (clearExisting) {
        progressCallback?.({
          phase: 'preparation',
          current: 0,
          total: 1,
          message: 'Clearing existing data'
        });
        await this.clearExistingData();
      }

      // Generate licenses
      const licenses = this.generateLicenses(environment);
      await this.seedLicenses(licenses);

      // Generate and seed users
      progressCallback?.({
        phase: 'users',
        current: 0,
        total: userCount,
        message: 'Generating users'
      });
      const users = this.generateUsers(userCount, licenses, environment);
      await this.seedUsers(users, progressCallback);

      // Generate and seed students
      progressCallback?.({
        phase: 'students',
        current: 0,
        total: studentCount,
        message: 'Generating students'
      });
      const students = this.generateStudents(studentCount, users, licenses, environment);
      await this.seedStudents(students, progressCallback);

      // Generate and seed devices
      progressCallback?.({
        phase: 'devices',
        current: 0,
        total: deviceCount,
        message: 'Generating devices'
      });
      const devices = this.generateDevices(deviceCount, students, licenses, environment);
      await this.seedDevices(devices, progressCallback);

      // Generate and seed apps
      const apps = this.generateApps(licenses, environment);
      await this.seedApps(apps);

      // Generate time-series data
      if (daysOfData > 0) {
        progressCallback?.({
          phase: 'timeseries',
          current: 0,
          total: daysOfData,
          message: 'Generating time-series data'
        });
        await this.seedTimeSeriesData(students, devices, daysOfData, progressCallback);
      }

      // Create summary record
      await this.createSeedingSummary(environment, {
        userCount: users.length,
        studentCount: students.length,
        deviceCount: devices.length,
        appCount: apps.length,
        daysOfData
      });

      console.log(`${environment} data seeding completed successfully`);

    } catch (error) {
      console.error('Data seeding failed:', error);
      throw error;
    }
  }

  private async clearExistingData(): Promise<void> {
    const collections = ['primary', 'data'];
    
    for (const collectionName of collections) {
      const collection = this.db.collection(collectionName);
      await collection.deleteMany({});
      console.log(`Cleared collection: ${collectionName}`);
    }
  }

  private generateLicenses(environment: string): any[] {
    const baseId = environment === 'development' ? 'dev' : 
                   environment === 'testing' ? 'test' : 'staging';
    
    return [
      {
        pk: `L#${baseId}-license-001`,
        sk: 'P',
        pksk: `L#${baseId}-license-001#P`,
        version: 1,
        license: `${baseId}-license-001`,
        data: {
          name: `${environment.charAt(0).toUpperCase() + environment.slice(1)} License`,
          type: environment,
          status: 'active',
          maxUsers: environment === 'development' ? 50 : 
                   environment === 'testing' ? 100 : 500,
          maxStudents: environment === 'development' ? 200 : 
                      environment === 'testing' ? 500 : 2000,
          maxDevices: environment === 'development' ? 200 : 
                     environment === 'testing' ? 500 : 2000,
          features: {
            realTimeTracking: true,
            reports: true,
            alerts: true,
            dataExport: environment !== 'development'
          },
          expiresAt: new Date('2025-12-31'),
          settings: {
            dataRetentionDays: environment === 'development' ? 90 : 365,
            reportScheduling: true
          }
        },
        createdAt: this.randomDate(30),
        updatedAt: this.randomDate(5)
      }
    ];
  }

  private generateUsers(count: number, licenses: any[], environment: string): any[] {
    const users = [];
    const license = licenses[0].license;

    // Always create admin user
    users.push({
      pk: 'U#admin001',
      sk: 'P',
      pksk: 'U#admin001#P',
      version: 1,
      userId: 'admin001',
      license,
      data: {
        email: `admin@${environment}.mytaptrack.com`,
        firstName: 'System',
        lastName: 'Administrator',
        role: 'admin',
        status: 'active',
        preferences: {
          timezone: 'America/New_York',
          notifications: true,
          theme: 'light'
        },
        permissions: ['all']
      },
      createdAt: this.randomDate(30),
      updatedAt: this.randomDate(1)
    });

    // Generate regular users
    for (let i = 1; i < count; i++) {
      const userId = `user${String(i).padStart(3, '0')}`;
      const role = this.randomChoice(this.config.userRoles);
      
      users.push({
        pk: `U#${userId}`,
        sk: 'P',
        pksk: `U#${userId}#P`,
        version: 1,
        userId,
        license,
        data: {
          email: `${userId}@${environment}.mytaptrack.com`,
          firstName: this.randomFirstName(),
          lastName: this.randomLastName(),
          role,
          status: Math.random() > 0.1 ? 'active' : 'inactive',
          preferences: {
            timezone: this.randomChoice(['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles']),
            notifications: Math.random() > 0.3,
            theme: this.randomChoice(['light', 'dark'])
          },
          permissions: this.getPermissionsForRole(role)
        },
        createdAt: this.randomDate(60),
        updatedAt: this.randomDate(10)
      });
    }

    return users;
  }

  private generateStudents(count: number, users: any[], licenses: any[], environment: string): any[] {
    const students = [];
    const license = licenses[0].license;
    const teachers = users.filter(u => u.data.role === 'teacher');
    const parents = users.filter(u => u.data.role === 'parent');

    for (let i = 0; i < count; i++) {
      const studentId = `student${String(i + 1).padStart(3, '0')}`;
      const teacher = teachers.length > 0 ? this.randomChoice(teachers) : null;
      const parent = parents.length > 0 ? this.randomChoice(parents) : null;
      
      students.push({
        pk: `S#${studentId}`,
        sk: 'P',
        pksk: `S#${studentId}#P`,
        version: 1,
        studentId,
        license,
        data: {
          firstName: this.randomFirstName(),
          lastName: this.randomLastName(),
          grade: this.randomChoice(this.config.studentGrades),
          dateOfBirth: this.randomDateOfBirth(),
          status: Math.random() > 0.05 ? 'active' : 'inactive',
          parentId: parent?.userId,
          teacherId: teacher?.userId,
          settings: {
            trackingEnabled: Math.random() > 0.1,
            alertsEnabled: Math.random() > 0.2,
            dataSharing: Math.random() > 0.3
          },
          academicInfo: {
            enrollmentDate: this.randomDate(365),
            currentGPA: (Math.random() * 3 + 1).toFixed(2),
            specialNeeds: Math.random() > 0.8
          }
        },
        createdAt: this.randomDate(180),
        updatedAt: this.randomDate(30)
      });
    }

    return students;
  }

  private generateDevices(count: number, students: any[], licenses: any[], environment: string): any[] {
    const devices = [];
    const license = licenses[0].license;

    for (let i = 0; i < count; i++) {
      const deviceId = `device${String(i + 1).padStart(3, '0')}`;
      const serialNumber = `MTT${environment.toUpperCase()}${String(i + 1).padStart(6, '0')}`;
      const assignedStudent = i < students.length ? students[i] : null;
      
      devices.push({
        pk: `D#${deviceId}`,
        sk: 'P',
        pksk: `D#${deviceId}#P`,
        version: 1,
        license,
        data: {
          deviceId,
          serialNumber,
          model: this.randomChoice(this.config.deviceModels),
          status: Math.random() > 0.05 ? 'active' : 'inactive',
          batteryLevel: Math.floor(Math.random() * 100),
          lastSeen: this.randomDate(1),
          assignedTo: assignedStudent?.studentId,
          settings: {
            sampleRate: this.randomChoice([15, 30, 60]),
            transmissionInterval: this.randomChoice([300, 600, 900]),
            powerSaveMode: Math.random() > 0.5
          },
          hardware: {
            firmwareVersion: this.randomChoice(['2.1.0', '2.1.1', '2.2.0']),
            calibrationDate: this.randomDate(90),
            warrantyExpires: this.futureDate(365)
          }
        },
        createdAt: this.randomDate(200),
        updatedAt: this.randomDate(7)
      });
    }

    return devices;
  }

  private generateApps(licenses: any[], environment: string): any[] {
    const apps: any[] = [];
    const license = licenses[0].license;
    const appNames = [
      'Math Explorer', 'Reading Adventures', 'Science Lab', 'History Quest',
      'Art Studio', 'Music Maker', 'Coding Basics', 'Language Learning'
    ];

    appNames.forEach((name, i) => {
      const appId = `app${String(i + 1).padStart(3, '0')}`;
      
      apps.push({
        pk: `A#${appId}`,
        sk: 'P',
        pksk: `A#${appId}#P`,
        version: 1,
        license,
        data: {
          appId,
          name,
          type: 'educational',
          category: this.randomChoice(this.config.appCategories),
          status: Math.random() > 0.1 ? 'active' : 'inactive',
          version: `${Math.floor(Math.random() * 3) + 1}.${Math.floor(Math.random() * 5)}.${Math.floor(Math.random() * 10)}`,
          settings: {
            trackingEnabled: true,
            dataCollection: {
              interactions: true,
              timeSpent: true,
              performance: Math.random() > 0.2
            },
            ageRestriction: {
              minAge: Math.floor(Math.random() * 5) + 5,
              maxAge: Math.floor(Math.random() * 5) + 15
            }
          }
        },
        createdAt: this.randomDate(100),
        updatedAt: this.randomDate(20)
      });
    });

    return apps;
  }

  private async seedLicenses(licenses: any[]): Promise<void> {
    const collection = this.db.collection('primary');
    await collection.insertMany(licenses);
    console.log(`Seeded ${licenses.length} licenses`);
  }

  private async seedUsers(users: any[], progressCallback?: (progress: SeedingProgress) => void): Promise<void> {
    const collection = this.db.collection('primary');
    const batchSize = 50;

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await collection.insertMany(batch);
      
      progressCallback?.({
        phase: 'users',
        current: Math.min(i + batchSize, users.length),
        total: users.length,
        message: `Inserted ${Math.min(i + batchSize, users.length)} users`
      });
    }

    console.log(`Seeded ${users.length} users`);
  }

  private async seedStudents(students: any[], progressCallback?: (progress: SeedingProgress) => void): Promise<void> {
    const collection = this.db.collection('primary');
    const batchSize = 50;

    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);
      await collection.insertMany(batch);
      
      progressCallback?.({
        phase: 'students',
        current: Math.min(i + batchSize, students.length),
        total: students.length,
        message: `Inserted ${Math.min(i + batchSize, students.length)} students`
      });
    }

    console.log(`Seeded ${students.length} students`);
  }

  private async seedDevices(devices: any[], progressCallback?: (progress: SeedingProgress) => void): Promise<void> {
    const collection = this.db.collection('primary');
    const batchSize = 50;

    for (let i = 0; i < devices.length; i += batchSize) {
      const batch = devices.slice(i, i + batchSize);
      await collection.insertMany(batch);
      
      progressCallback?.({
        phase: 'devices',
        current: Math.min(i + batchSize, devices.length),
        total: devices.length,
        message: `Inserted ${Math.min(i + batchSize, devices.length)} devices`
      });
    }

    console.log(`Seeded ${devices.length} devices`);
  }

  private async seedApps(apps: any[]): Promise<void> {
    const collection = this.db.collection('primary');
    await collection.insertMany(apps);
    console.log(`Seeded ${apps.length} apps`);
  }

  private async seedTimeSeriesData(
    students: any[], 
    devices: any[], 
    daysOfData: number, 
    progressCallback?: (progress: SeedingProgress) => void
  ): Promise<void> {
    const dataCollection = this.db.collection('data');
    const batchSize = 100;
    let totalInserted = 0;

    for (let day = 0; day < daysOfData; day++) {
      const timeSeriesData: any[] = [];
      const date = new Date();
      date.setDate(date.getDate() - day);

      // Generate hourly data for each student and device
      for (let hour = 6; hour < 22; hour++) { // School hours + some extra
        const timestamp = new Date(date);
        timestamp.setHours(hour, 0, 0, 0);

        // Student activity data
        students.forEach(student => {
          if (Math.random() > 0.1) { // 90% chance of data
            timeSeriesData.push({
              pk: `SD#${student.studentId}`,
              sk: `T#${timestamp.toISOString()}`,
              pksk: `SD#${student.studentId}#T#${timestamp.toISOString()}`,
              version: 1,
              timestamp,
              data: {
                studentId: student.studentId,
                activityLevel: Math.floor(Math.random() * 100),
                focusScore: Math.floor(Math.random() * 100),
                engagementTime: Math.floor(Math.random() * 3600),
                interactions: Math.floor(Math.random() * 50),
                mood: this.randomChoice(['happy', 'neutral', 'frustrated', 'excited']),
                location: this.randomChoice(['classroom', 'library', 'cafeteria', 'playground'])
              },
              createdAt: timestamp
            });
          }
        });

        // Device telemetry data
        devices.forEach(device => {
          if (Math.random() > 0.05) { // 95% chance of data
            timeSeriesData.push({
              pk: `DT#${device.data.deviceId}`,
              sk: `T#${timestamp.toISOString()}`,
              pksk: `DT#${device.data.deviceId}#T#${timestamp.toISOString()}`,
              version: 1,
              timestamp,
              data: {
                deviceId: device.data.deviceId,
                batteryLevel: Math.max(0, device.data.batteryLevel - Math.floor(Math.random() * 5)),
                signalStrength: -40 - Math.floor(Math.random() * 40),
                temperature: 20 + Math.floor(Math.random() * 15),
                accelerometer: {
                  x: Math.random() * 2 - 1,
                  y: Math.random() * 2 - 1,
                  z: Math.random() * 2 - 1
                },
                connectivity: this.randomChoice(['wifi', 'cellular', 'bluetooth']),
                errorCount: Math.floor(Math.random() * 3)
              },
              createdAt: timestamp
            });
          }
        });
      }

      // Insert in batches
      for (let i = 0; i < timeSeriesData.length; i += batchSize) {
        const batch = timeSeriesData.slice(i, i + batchSize);
        await dataCollection.insertMany(batch);
        totalInserted += batch.length;
      }

      progressCallback?.({
        phase: 'timeseries',
        current: day + 1,
        total: daysOfData,
        message: `Generated data for day ${day + 1}/${daysOfData} (${totalInserted} records)`
      });
    }

    console.log(`Seeded ${totalInserted} time-series data points`);
  }

  private async createSeedingSummary(environment: string, summary: any): Promise<void> {
    const collection = this.db.collection('migrations');
    
    await collection.insertOne({
      migrationId: `seed-${environment}-${Date.now()}`,
      status: 'completed',
      sourceProvider: 'seeder',
      targetProvider: 'mongodb',
      recordCount: summary.userCount + summary.studentCount + summary.deviceCount + summary.appCount,
      errorCount: 0,
      createdAt: new Date(),
      completedAt: new Date(),
      metadata: {
        type: 'test_data_seeding',
        environment,
        summary
      }
    });
  }

  // Helper methods
  private getTestDataConfig(): TestDataConfig {
    return {
      licenses: ['dev-license-001', 'test-license-001', 'staging-license-001'],
      userRoles: ['admin', 'teacher', 'parent', 'student', 'observer'],
      studentGrades: ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
      deviceModels: ['TapTracker-v1', 'TapTracker-v2', 'TapTracker-Pro', 'TapTracker-Mini'],
      appCategories: ['mathematics', 'reading', 'science', 'history', 'art', 'music', 'coding', 'language']
    };
  }

  private getDefaultUserCount(environment: string): number {
    switch (environment) {
      case 'development': return 10;
      case 'testing': return 25;
      case 'staging': return 50;
      default: return 10;
    }
  }

  private getDefaultStudentCount(environment: string): number {
    switch (environment) {
      case 'development': return 20;
      case 'testing': return 100;
      case 'staging': return 200;
      default: return 20;
    }
  }

  private getDefaultDeviceCount(environment: string): number {
    switch (environment) {
      case 'development': return 15;
      case 'testing': return 75;
      case 'staging': return 150;
      default: return 15;
    }
  }

  private getDefaultDaysOfData(environment: string): number {
    switch (environment) {
      case 'development': return 7;
      case 'testing': return 30;
      case 'staging': return 90;
      default: return 7;
    }
  }

  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private randomDate(daysAgo: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo));
    return date;
  }

  private futureDate(daysFromNow: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + Math.floor(Math.random() * daysFromNow));
    return date;
  }

  private randomDateOfBirth(): string {
    const year = 2010 + Math.floor(Math.random() * 10); // Ages 4-14
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private randomFirstName(): string {
    const names = [
      'Alice', 'Bob', 'Charlie', 'Diana', 'Edward', 'Fiona', 'George', 'Hannah',
      'Ian', 'Julia', 'Kevin', 'Laura', 'Michael', 'Nancy', 'Oliver', 'Patricia',
      'Quinn', 'Rachel', 'Samuel', 'Teresa', 'Ulysses', 'Victoria', 'William', 'Xara',
      'Yolanda', 'Zachary'
    ];
    return this.randomChoice(names);
  }

  private randomLastName(): string {
    const names = [
      'Anderson', 'Brown', 'Clark', 'Davis', 'Evans', 'Foster', 'Garcia', 'Harris',
      'Johnson', 'King', 'Lee', 'Miller', 'Nelson', 'Parker', 'Quinn', 'Roberts',
      'Smith', 'Taylor', 'Wilson', 'Young'
    ];
    return this.randomChoice(names);
  }

  private getPermissionsForRole(role: string): string[] {
    switch (role) {
      case 'admin': return ['all'];
      case 'teacher': return ['read_students', 'write_students', 'read_reports'];
      case 'parent': return ['read_own_students', 'read_own_reports'];
      case 'observer': return ['read_reports'];
      default: return ['read_own_data'];
    }
  }
}

import { getConfig, getMongoUrl, getDbName } from './config';

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: seed-test-data [options]

Options:
  --environment <env>       Environment (development|testing|staging) (default: development)
  --mongo-url <url>         MongoDB connection string (default: mongodb://localhost:27017)
  --database <name>         Database name (default: mytaptrack)
  --users <count>           Number of users to create
  --students <count>        Number of students to create
  --devices <count>         Number of devices to create
  --days <count>            Days of time-series data to generate
  --clear                   Clear existing data before seeding
  --help, -h                Show this help message

Examples:
  # Seed development data
  seed-test-data --environment development

  # Seed testing data with custom counts
  seed-test-data --environment testing --users 50 --students 200 --devices 150

  # Clear and reseed
  seed-test-data --environment development --clear
    `);
    process.exit(0);
  }

  const environment = (args[args.indexOf('--environment') + 1] || 'development') as 'development' | 'testing' | 'staging';
  const config = getConfig();
  
  function getArg(name: string): string | undefined {
    const index = args.indexOf(name);
    return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
  }
  
  const mongoUrl = getArg('--mongo-url') || getMongoUrl();
  const database = getArg('--database') || getDbName();
  const userCount = args.includes('--users') ? parseInt(args[args.indexOf('--users') + 1]) : undefined;
  const studentCount = args.includes('--students') ? parseInt(args[args.indexOf('--students') + 1]) : undefined;
  const deviceCount = args.includes('--devices') ? parseInt(args[args.indexOf('--devices') + 1]) : undefined;
  const daysOfData = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : undefined;
  const clearExisting = args.includes('--clear');

  try {
    const client = new MongoClient(mongoUrl);
    await client.connect();

    const seeder = new TestDataSeeder(client, database);
    
    await seeder.seedData({
      environment,
      userCount,
      studentCount,
      deviceCount,
      daysOfData,
      clearExisting,
      progressCallback: (progress) => {
        console.log(`${progress.phase}: ${progress.current}/${progress.total} - ${progress.message}`);
      }
    });

    await client.close();
    console.log('Test data seeding completed successfully');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}