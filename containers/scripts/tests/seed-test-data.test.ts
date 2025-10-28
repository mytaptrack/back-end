/**
 * Tests for TestDataSeeder
 */

import { MongoClient, Db } from 'mongodb';
import { TestDataSeeder } from '../seed-test-data';

describe('TestDataSeeder', () => {
  let client: MongoClient;
  let db: Db;
  let seeder: TestDataSeeder;
  const testDbName = 'mytaptrack_seeder_test_' + Date.now();

  beforeAll(async () => {
    client = await global.testUtils.connectToTestDB();
    db = client.db(testDbName);
    seeder = new TestDataSeeder(client, testDbName);
  });

  afterAll(async () => {
    await global.testUtils.cleanupTestDB(client, testDbName);
    await client.close();
  });

  beforeEach(async () => {
    // Clean collections before each test
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
    }
  });

  describe('seedData', () => {
    it('should seed development data with default counts', async () => {
      await seeder.seedData({
        environment: 'development',
        userCount: 3,
        studentCount: 5,
        deviceCount: 4,
        daysOfData: 1
      });

      // Verify users
      const users = await db.collection('primary').find({ pk: /^U#/ }).toArray();
      expect(users).toHaveLength(3);
      users.forEach(user => {
        expect(user.pk).toBeDefined();
        expect(user.sk).toBeDefined();
        expect(user.pksk).toBeDefined();
        expect(user.version).toBeDefined();
        expect(user.data.email).toMatch(/@development\.mytaptrack\.com$/);
      });

      // Verify students
      const students = await db.collection('primary').find({ pk: /^S#/ }).toArray();
      expect(students).toHaveLength(5);
      students.forEach(student => {
        expect(student.pk).toBeDefined();
        expect(student.sk).toBeDefined();
        expect(student.pksk).toBeDefined();
        expect(student.version).toBeDefined();
        expect(student.data.firstName).toBeDefined();
        expect(student.data.grade).toBeDefined();
      });

      // Verify devices
      const devices = await db.collection('primary').find({ pk: /^D#/ }).toArray();
      expect(devices).toHaveLength(4);
      devices.forEach(device => {
        expect(device.pk).toBeDefined();
        expect(device.sk).toBeDefined();
        expect(device.pksk).toBeDefined();
        expect(device.version).toBeDefined();
        expect(device.data.serialNumber).toMatch(/^MTTDEVELOPMENT\d{6}$/);
      });

      // Verify license
      const licenses = await db.collection('primary').find({ pk: /^L#/ }).toArray();
      expect(licenses).toHaveLength(1);
      expect(licenses[0].data.type).toBe('development');

      // Verify apps
      const apps = await db.collection('primary').find({ pk: /^A#/ }).toArray();
      expect(apps.length).toBeGreaterThan(0);

      // Verify time-series data
      const timeSeriesData = await db.collection('data').find({}).toArray();
      expect(timeSeriesData.length).toBeGreaterThan(0);
      timeSeriesData.forEach(record => {
        expect(record.pk).toBeDefined();
        expect(record.sk).toBeDefined();
        expect(record.pksk).toBeDefined();
        expect(record.version).toBeDefined();
        expect(record.timestamp).toBeInstanceOf(Date);
      });

      // Verify migration record
      const migrations = await db.collection('migrations').find({}).toArray();
      expect(migrations).toHaveLength(1);
      expect(migrations[0].status).toBe('completed');
    });

    it('should seed testing data with higher counts', async () => {
      await seeder.seedData({
        environment: 'testing',
        userCount: 10,
        studentCount: 20,
        deviceCount: 15,
        daysOfData: 2
      });

      const users = await db.collection('primary').find({ pk: /^U#/ }).toArray();
      const students = await db.collection('primary').find({ pk: /^S#/ }).toArray();
      const devices = await db.collection('primary').find({ pk: /^D#/ }).toArray();

      expect(users).toHaveLength(10);
      expect(students).toHaveLength(20);
      expect(devices).toHaveLength(15);

      // Verify environment-specific data
      users.forEach(user => {
        expect(user.data.email).toMatch(/@testing\.mytaptrack\.com$/);
      });

      const license = await db.collection('primary').findOne({ pk: /^L#/ });
      expect(license.data.type).toBe('testing');
      expect(license.data.maxUsers).toBe(100);
    });

    it('should clear existing data when clearExisting is true', async () => {
      // Insert some initial data
      await db.collection('primary').insertOne(global.testUtils.generateTestData.user('existing'));
      await db.collection('data').insertOne({
        pk: 'TEST#existing',
        sk: 'T#2023-01-01T00:00:00.000Z',
        pksk: 'TEST#existing#T#2023-01-01T00:00:00.000Z',
        version: 1,
        timestamp: new Date(),
        data: { test: true }
      });

      const initialPrimaryCount = await db.collection('primary').countDocuments();
      const initialDataCount = await db.collection('data').countDocuments();
      expect(initialPrimaryCount).toBe(1);
      expect(initialDataCount).toBe(1);

      // Seed with clearExisting
      await seeder.seedData({
        environment: 'development',
        userCount: 2,
        studentCount: 2,
        deviceCount: 2,
        daysOfData: 0,
        clearExisting: true
      });

      // Verify old data is cleared and new data is present
      const existingUser = await db.collection('primary').findOne({ userId: 'existing' });
      expect(existingUser).toBeNull();

      const newUsers = await db.collection('primary').find({ pk: /^U#/ }).toArray();
      expect(newUsers.length).toBeGreaterThan(0);
    });

    it('should generate realistic time-series data', async () => {
      await seeder.seedData({
        environment: 'development',
        userCount: 1,
        studentCount: 2,
        deviceCount: 2,
        daysOfData: 3
      });

      const studentData = await db.collection('data').find({ pk: /^SD#/ }).toArray();
      const deviceData = await db.collection('data').find({ pk: /^DT#/ }).toArray();

      expect(studentData.length).toBeGreaterThan(0);
      expect(deviceData.length).toBeGreaterThan(0);

      // Verify student data structure
      const sampleStudentData = studentData[0];
      expect(sampleStudentData.data.activityLevel).toBeGreaterThanOrEqual(0);
      expect(sampleStudentData.data.activityLevel).toBeLessThanOrEqual(100);
      expect(sampleStudentData.data.focusScore).toBeGreaterThanOrEqual(0);
      expect(sampleStudentData.data.focusScore).toBeLessThanOrEqual(100);
      expect(sampleStudentData.data.engagementTime).toBeGreaterThanOrEqual(0);

      // Verify device data structure
      const sampleDeviceData = deviceData[0];
      expect(sampleDeviceData.data.batteryLevel).toBeGreaterThanOrEqual(0);
      expect(sampleDeviceData.data.batteryLevel).toBeLessThanOrEqual(100);
      expect(sampleDeviceData.data.signalStrength).toBeLessThan(0);
      expect(sampleDeviceData.data.accelerometer).toBeDefined();
      expect(sampleDeviceData.data.accelerometer.x).toBeGreaterThanOrEqual(-1);
      expect(sampleDeviceData.data.accelerometer.x).toBeLessThanOrEqual(1);
    });

    it('should handle progress callbacks', async () => {
      const progressUpdates: any[] = [];
      
      await seeder.seedData({
        environment: 'development',
        userCount: 3,
        studentCount: 3,
        deviceCount: 3,
        daysOfData: 1,
        progressCallback: (progress) => {
          progressUpdates.push({ ...progress });
        }
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Verify we got updates for different phases
      const phases = progressUpdates.map(p => p.phase);
      expect(phases).toContain('users');
      expect(phases).toContain('students');
      expect(phases).toContain('devices');
      expect(phases).toContain('timeseries');

      // Verify progress tracking
      const userUpdates = progressUpdates.filter(p => p.phase === 'users');
      expect(userUpdates.length).toBeGreaterThan(0);
      expect(userUpdates[userUpdates.length - 1].current).toBe(3);
      expect(userUpdates[userUpdates.length - 1].total).toBe(3);
    });

    it('should create valid user roles and permissions', async () => {
      await seeder.seedData({
        environment: 'development',
        userCount: 10,
        studentCount: 0,
        deviceCount: 0,
        daysOfData: 0
      });

      const users = await db.collection('primary').find({ pk: /^U#/ }).toArray();
      
      // Should have admin user
      const adminUser = users.find(u => u.data.role === 'admin');
      expect(adminUser).toBeDefined();
      expect(adminUser.data.permissions).toContain('all');

      // Check role distribution
      const roles = users.map(u => u.data.role);
      const uniqueRoles = [...new Set(roles)];
      expect(uniqueRoles.length).toBeGreaterThan(1);

      // Verify role-based permissions
      users.forEach(user => {
        expect(user.data.permissions).toBeDefined();
        expect(Array.isArray(user.data.permissions)).toBe(true);
        
        if (user.data.role === 'admin') {
          expect(user.data.permissions).toContain('all');
        } else if (user.data.role === 'teacher') {
          expect(user.data.permissions).toContain('read_students');
        }
      });
    });

    it('should generate valid student-teacher-parent relationships', async () => {
      await seeder.seedData({
        environment: 'development',
        userCount: 10,
        studentCount: 5,
        deviceCount: 0,
        daysOfData: 0
      });

      const users = await db.collection('primary').find({ pk: /^U#/ }).toArray();
      const students = await db.collection('primary').find({ pk: /^S#/ }).toArray();
      
      const teachers = users.filter(u => u.data.role === 'teacher');
      const parents = users.filter(u => u.data.role === 'parent');

      if (teachers.length > 0 && students.length > 0) {
        const studentsWithTeachers = students.filter(s => s.data.teacherId);
        expect(studentsWithTeachers.length).toBeGreaterThan(0);
        
        // Verify teacher IDs are valid
        studentsWithTeachers.forEach(student => {
          const teacherExists = teachers.some(t => t.userId === student.data.teacherId);
          expect(teacherExists).toBe(true);
        });
      }

      if (parents.length > 0 && students.length > 0) {
        const studentsWithParents = students.filter(s => s.data.parentId);
        expect(studentsWithParents.length).toBeGreaterThan(0);
        
        // Verify parent IDs are valid
        studentsWithParents.forEach(student => {
          const parentExists = parents.some(p => p.userId === student.data.parentId);
          expect(parentExists).toBe(true);
        });
      }
    });
  });

  describe('environment-specific configurations', () => {
    it('should use correct default counts for development', async () => {
      await seeder.seedData({ environment: 'development' });

      const users = await db.collection('primary').find({ pk: /^U#/ }).toArray();
      const students = await db.collection('primary').find({ pk: /^S#/ }).toArray();
      const devices = await db.collection('primary').find({ pk: /^D#/ }).toArray();

      expect(users).toHaveLength(10);
      expect(students).toHaveLength(20);
      expect(devices).toHaveLength(15);
    });

    it('should use correct default counts for testing', async () => {
      await seeder.seedData({ environment: 'testing' });

      const users = await db.collection('primary').find({ pk: /^U#/ }).toArray();
      const students = await db.collection('primary').find({ pk: /^S#/ }).toArray();
      const devices = await db.collection('primary').find({ pk: /^D#/ }).toArray();

      expect(users).toHaveLength(25);
      expect(students).toHaveLength(100);
      expect(devices).toHaveLength(75);
    });

    it('should use correct default counts for staging', async () => {
      await seeder.seedData({ environment: 'staging' });

      const users = await db.collection('primary').find({ pk: /^U#/ }).toArray();
      const students = await db.collection('primary').find({ pk: /^S#/ }).toArray();
      const devices = await db.collection('primary').find({ pk: /^D#/ }).toArray();

      expect(users).toHaveLength(50);
      expect(students).toHaveLength(200);
      expect(devices).toHaveLength(150);
    });
  });

  describe('data validation', () => {
    it('should generate valid email addresses', async () => {
      await seeder.seedData({
        environment: 'development',
        userCount: 5,
        studentCount: 0,
        deviceCount: 0,
        daysOfData: 0
      });

      const users = await db.collection('primary').find({ pk: /^U#/ }).toArray();
      
      users.forEach(user => {
        expect(user.data.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        expect(user.data.email).toMatch(/@development\.mytaptrack\.com$/);
      });
    });

    it('should generate valid device serial numbers', async () => {
      await seeder.seedData({
        environment: 'testing',
        userCount: 0,
        studentCount: 0,
        deviceCount: 5,
        daysOfData: 0
      });

      const devices = await db.collection('primary').find({ pk: /^D#/ }).toArray();
      
      devices.forEach(device => {
        expect(device.data.serialNumber).toMatch(/^MTTTESTING\d{6}$/);
        expect(device.data.deviceId).toMatch(/^device\d{3}$/);
        expect(device.data.batteryLevel).toBeGreaterThanOrEqual(0);
        expect(device.data.batteryLevel).toBeLessThanOrEqual(100);
      });
    });

    it('should generate valid student grades', async () => {
      await seeder.seedData({
        environment: 'development',
        userCount: 0,
        studentCount: 10,
        deviceCount: 0,
        daysOfData: 0
      });

      const students = await db.collection('primary').find({ pk: /^S#/ }).toArray();
      const validGrades = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
      
      students.forEach(student => {
        expect(validGrades).toContain(student.data.grade);
        expect(student.data.dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });
});