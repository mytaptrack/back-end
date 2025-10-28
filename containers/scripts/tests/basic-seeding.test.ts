/**
 * Basic tests for database seeding functionality
 */

import { MongoClient, Db } from 'mongodb';

describe('Basic Database Seeding', () => {
  let client: MongoClient;
  let db: Db;
  const testDbName = 'mytaptrack_basic_test_' + Date.now();

  beforeAll(async () => {
    client = await global.testUtils.connectToTestDB();
    db = client.db(testDbName);
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

  it('should connect to MongoDB and create collections', async () => {
    // Test basic MongoDB operations
    await db.createCollection('test');
    const collections = await db.listCollections().toArray();

    expect(collections.some(c => c.name === 'test')).toBe(true);
  });

  it('should insert and retrieve documents', async () => {
    const testDoc = {
      pk: 'TEST#001',
      sk: 'P',
      pksk: 'TEST#001#P',
      version: 1,
      data: { test: true },
      createdAt: new Date()
    };

    await db.collection('primary').insertOne(testDoc);
    const retrieved = await db.collection('primary').findOne({ pk: 'TEST#001' });

    expect(retrieved).toBeDefined();
    expect(retrieved?.pk).toBe('TEST#001');
    expect(retrieved?.sk).toBe('P');
    expect(retrieved?.version).toBe(1);
  });

  it('should validate document structure', async () => {
    const validDoc = global.testUtils.generateTestData.user('test1');

    // Check that generated test data has required fields
    expect(validDoc.pk).toBeDefined();
    expect(validDoc.sk).toBeDefined();
    expect(validDoc.pksk).toBeDefined();
    expect(validDoc.version).toBeDefined();
    expect(typeof validDoc.pk).toBe('string');
    expect(typeof validDoc.sk).toBe('string');
    expect(typeof validDoc.pksk).toBe('string');
    expect(typeof validDoc.version).toBe('number');
  });

  it('should create indexes', async () => {
    await db.collection('primary').createIndex({ pk: 1, sk: 1 }, { name: 'pk_sk_index' });

    const indexes = await db.collection('primary').listIndexes().toArray();
    const pkSkIndex = indexes.find(idx => idx.name === 'pk_sk_index');

    expect(pkSkIndex).toBeDefined();
    expect(pkSkIndex?.key).toEqual({ pk: 1, sk: 1 });
  });

  it('should handle batch operations', async () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      global.testUtils.generateTestData.user(`user${i}`)
    );

    await db.collection('primary').insertMany(docs);
    const count = await db.collection('primary').countDocuments();

    expect(count).toBe(10);
  });

  it('should query documents by patterns', async () => {
    // Insert different types of documents
    await db.collection('primary').insertMany([
      global.testUtils.generateTestData.user('user1'),
      global.testUtils.generateTestData.student('student1'),
      global.testUtils.generateTestData.device('device1')
    ]);

    // Query users only
    const users = await db.collection('primary').find({ pk: /^U#/ }).toArray();
    expect(users).toHaveLength(1);
    expect(users[0].pk).toBe('U#user1');

    // Query students only
    const students = await db.collection('primary').find({ pk: /^S#/ }).toArray();
    expect(students).toHaveLength(1);
    expect(students[0].pk).toBe('S#student1');

    // Query devices only
    const devices = await db.collection('primary').find({ pk: /^D#/ }).toArray();
    expect(devices).toHaveLength(1);
    expect(devices[0].pk).toBe('D#device1');
  });

  it('should handle time-series data', async () => {
    const timeSeriesDoc = {
      pk: 'SD#student1',
      sk: 'T#2023-01-01T10:00:00.000Z',
      pksk: 'SD#student1#T#2023-01-01T10:00:00.000Z',
      version: 1,
      timestamp: new Date('2023-01-01T10:00:00.000Z'),
      data: {
        activityLevel: 75,
        focusScore: 85,
        engagementTime: 1800
      },
      createdAt: new Date()
    };

    await db.collection('data').insertOne(timeSeriesDoc);

    // Query by time range
    const startTime = new Date('2023-01-01T09:00:00.000Z');
    const endTime = new Date('2023-01-01T11:00:00.000Z');

    const timeRangeData = await db.collection('data').find({
      timestamp: { $gte: startTime, $lte: endTime }
    }).toArray();

    expect(timeRangeData).toHaveLength(1);
    expect(timeRangeData[0].data.activityLevel).toBe(75);
  });

  it('should validate data types', async () => {
    const user = global.testUtils.generateTestData.user('test1');

    // Validate field types
    expect(typeof user.pk).toBe('string');
    expect(typeof user.sk).toBe('string');
    expect(typeof user.pksk).toBe('string');
    expect(typeof user.version).toBe('number');
    expect(typeof user.userId).toBe('string');
    expect(typeof user.license).toBe('string');
    expect(typeof user.data).toBe('object');
    expect(user.createdAt instanceof Date).toBe(true);
    expect(user.updatedAt instanceof Date).toBe(true);

    // Validate nested data structure
    expect(typeof user.data.email).toBe('string');
    expect(typeof user.data.firstName).toBe('string');
    expect(typeof user.data.lastName).toBe('string');
    expect(typeof user.data.role).toBe('string');
    expect(typeof user.data.status).toBe('string');
  });
});