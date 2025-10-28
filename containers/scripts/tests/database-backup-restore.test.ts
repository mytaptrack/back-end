/**
 * Tests for DatabaseBackupManager
 */

import { MongoClient, Db } from 'mongodb';
import { DatabaseBackupManager } from '../database-backup-restore';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('DatabaseBackupManager', () => {
  let client: MongoClient;
  let db: Db;
  let backupManager: DatabaseBackupManager;
  const testDbName = 'mytaptrack_backup_test_' + Date.now();
  const testBackupDir = './test-backups-' + Date.now();

  beforeAll(async () => {
    client = await global.testUtils.connectToTestDB();
    db = client.db(testDbName);
    backupManager = new DatabaseBackupManager(client, testDbName);
    
    // Create test backup directory
    await fs.mkdir(testBackupDir, { recursive: true });
  });

  afterAll(async () => {
    await global.testUtils.cleanupTestDB(client, testDbName);
    await client.close();
    
    // Clean up test backup directory
    try {
      await fs.rm(testBackupDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test backup directory:', error);
    }
  });

  beforeEach(async () => {
    // Clean collections before each test
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
    }
    
    // Clean up any existing backup files in test directory
    try {
      const files = await fs.readdir(testBackupDir);
      for (const file of files) {
        if (file.startsWith('backup-')) {
          await fs.rm(path.join(testBackupDir, file), { recursive: true, force: true });
        }
      }
    } catch (error) {
      // Directory might not exist yet, ignore
    }
  });

  describe('createBackup', () => {
    it('should create a backup with all collections', async () => {
      // Setup test data
      await db.collection('primary').insertMany([
        global.testUtils.generateTestData.user('user1'),
        global.testUtils.generateTestData.user('user2'),
        global.testUtils.generateTestData.student('student1')
      ]);
      
      await db.collection('data').insertMany([
        {
          pk: 'SD#student1',
          sk: 'T#2023-01-01T00:00:00.000Z',
          pksk: 'SD#student1#T#2023-01-01T00:00:00.000Z',
          version: 1,
          timestamp: new Date('2023-01-01'),
          data: { activityLevel: 75 }
        }
      ]);

      // Create indexes
      await db.collection('primary').createIndex({ pk: 1, sk: 1 }, { name: 'pk_sk_index' });
      await db.collection('data').createIndex({ timestamp: 1 }, { name: 'timestamp_index' });

      const backupPath = await backupManager.createBackup({
        outputDirectory: testBackupDir,
        includeIndexes: true,
        compress: false
      });

      expect(backupPath).toBeDefined();
      expect(backupPath).toContain(testBackupDir.replace('./', ''));

      // Verify backup files exist
      const metadataPath = path.join(backupPath, 'metadata.json');
      const dataPath = path.join(backupPath, 'data.json');
      const indexPath = path.join(backupPath, 'indexes.json');

      const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
      const dataExists = await fs.access(dataPath).then(() => true).catch(() => false);
      const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);

      expect(metadataExists).toBe(true);
      expect(dataExists).toBe(true);
      expect(indexExists).toBe(true);

      // Verify metadata content
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      expect(metadata.database).toBe(testDbName);
      expect(metadata.totalDocuments).toBe(4); // 3 primary + 1 data
      expect(metadata.collections).toContain('primary');
      expect(metadata.collections).toContain('data');

      // Verify data content
      const backupData = JSON.parse(await fs.readFile(dataPath, 'utf-8'));
      expect(backupData.primary).toBeDefined();
      expect(backupData.primary.length).toBe(3);
      expect(backupData.data).toBeDefined();
      expect(backupData.data.length).toBe(1);

      // Verify index content
      const indexData = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
      expect(indexData.primary).toBeDefined();
      expect(indexData.primary.length).toBeGreaterThan(0);
    });

    it('should create compressed backup', async () => {
      // Setup test data
      await db.collection('primary').insertOne(global.testUtils.generateTestData.user('user1'));

      const backupPath = await backupManager.createBackup({
        outputDirectory: testBackupDir,
        compress: true
      });

      // Verify compressed files exist
      const dataPath = path.join(backupPath, 'data.json.gz');
      const indexPath = path.join(backupPath, 'indexes.json.gz');

      const dataExists = await fs.access(dataPath).then(() => true).catch(() => false);
      const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);

      expect(dataExists).toBe(true);
      expect(indexExists).toBe(true);

      // Verify uncompressed metadata still exists
      const metadataPath = path.join(backupPath, 'metadata.json');
      const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
      expect(metadataExists).toBe(true);
    });

    it('should track progress during backup', async () => {
      // Setup larger dataset
      const users = Array.from({ length: 50 }, (_, i) => 
        global.testUtils.generateTestData.user(`user${i}`)
      );
      await db.collection('primary').insertMany(users);

      const progressUpdates: any[] = [];
      
      await backupManager.createBackup({
        outputDirectory: testBackupDir,
        batchSize: 10,
        progressCallback: (progress) => {
          progressUpdates.push({ ...progress });
        }
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Should have different phases
      const phases = progressUpdates.map(p => p.phase);
      expect(phases).toContain('collections');
      
      // Should track document progress
      const collectionUpdates = progressUpdates.filter(p => p.phase === 'collections');
      expect(collectionUpdates.length).toBeGreaterThan(0);
      expect(collectionUpdates[collectionUpdates.length - 1].processedDocuments).toBe(50);
    });

    it('should backup specific collections only', async () => {
      // Setup data in multiple collections
      await db.collection('primary').insertOne(global.testUtils.generateTestData.user('user1'));
      await db.collection('data').insertOne({
        pk: 'SD#test',
        sk: 'T#2023-01-01T00:00:00.000Z',
        pksk: 'SD#test#T#2023-01-01T00:00:00.000Z',
        version: 1,
        timestamp: new Date(),
        data: { test: true }
      });
      await db.collection('other').insertOne({ other: 'data' });

      const backupPath = await backupManager.createBackup({
        outputDirectory: testBackupDir,
        collections: ['primary'],
        compress: false
      });

      const dataPath = path.join(backupPath, 'data.json');
      const backupData = JSON.parse(await fs.readFile(dataPath, 'utf-8'));

      expect(backupData.primary).toBeDefined();
      expect(backupData.data).toBeUndefined();
      expect(backupData.other).toBeUndefined();
    });
  });

  describe('restoreBackup', () => {
    let backupPath: string;

    beforeEach(async () => {
      // Create a backup to restore from
      await db.collection('primary').insertMany([
        global.testUtils.generateTestData.user('user1'),
        global.testUtils.generateTestData.student('student1')
      ]);
      
      await db.collection('data').insertOne({
        pk: 'SD#student1',
        sk: 'T#2023-01-01T00:00:00.000Z',
        pksk: 'SD#student1#T#2023-01-01T00:00:00.000Z',
        version: 1,
        timestamp: new Date('2023-01-01'),
        data: { activityLevel: 75 }
      });

      // Create indexes
      await db.collection('primary').createIndex({ pk: 1, sk: 1 }, { name: 'pk_sk_index' });

      backupPath = await backupManager.createBackup({
        outputDirectory: testBackupDir,
        includeIndexes: true,
        compress: false
      });

      // Clear the database for restore testing
      await db.collection('primary').deleteMany({});
      await db.collection('data').deleteMany({});
    });

    it('should restore backup successfully', async () => {
      await backupManager.restoreBackup(backupPath, {
        validateAfterRestore: true
      });

      // Verify data was restored
      const primaryDocs = await db.collection('primary').find({}).toArray();
      const dataDocs = await db.collection('data').find({}).toArray();

      expect(primaryDocs.length).toBe(2);
      expect(dataDocs.length).toBe(1);

      // Verify document structure
      const user = primaryDocs.find(doc => doc.pk.startsWith('U#'));
      const student = primaryDocs.find(doc => doc.pk.startsWith('S#'));
      
      // Validate document structure
      expect(user.pk).toBeDefined();
      expect(user.sk).toBeDefined();
      expect(user.pksk).toBeDefined();
      expect(user.version).toBeDefined();
      
      expect(student.pk).toBeDefined();
      expect(student.sk).toBeDefined();
      expect(student.pksk).toBeDefined();
      expect(student.version).toBeDefined();
      
      expect(dataDocs[0].pk).toBeDefined();
      expect(dataDocs[0].sk).toBeDefined();
      expect(dataDocs[0].pksk).toBeDefined();
      expect(dataDocs[0].version).toBeDefined();
    });

    it('should restore with dropExisting option', async () => {
      // Add some existing data
      await db.collection('primary').insertOne(global.testUtils.generateTestData.user('existing'));
      
      const initialCount = await db.collection('primary').countDocuments();
      expect(initialCount).toBe(1);

      await backupManager.restoreBackup(backupPath, {
        dropExisting: true
      });

      // Should only have restored data, not existing data
      const finalDocs = await db.collection('primary').find({}).toArray();
      expect(finalDocs.length).toBe(2);
      
      const existingUser = finalDocs.find(doc => doc.userId === 'existing');
      expect(existingUser).toBeUndefined();
    });

    it('should restore specific collections only', async () => {
      await backupManager.restoreBackup(backupPath, {
        collections: ['primary']
      });

      const primaryDocs = await db.collection('primary').find({}).toArray();
      const dataDocs = await db.collection('data').find({}).toArray();

      expect(primaryDocs.length).toBe(2);
      expect(dataDocs.length).toBe(0); // Should not be restored
    });

    it('should track progress during restore', async () => {
      const progressUpdates: any[] = [];
      
      await backupManager.restoreBackup(backupPath, {
        batchSize: 1,
        progressCallback: (progress) => {
          progressUpdates.push({ ...progress });
        }
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      
      const phases = progressUpdates.map(p => p.phase);
      expect(phases).toContain('collections');
      
      const finalUpdate = progressUpdates[progressUpdates.length - 1];
      expect(finalUpdate.processedDocuments).toBeGreaterThan(0);
    });

    it('should restore compressed backup', async () => {
      // First, ensure we have data to backup
      await db.collection('primary').insertMany([
        global.testUtils.generateTestData.user('user1'),
        global.testUtils.generateTestData.student('student1')
      ]);
      
      // Create compressed backup
      const compressedBackupPath = await backupManager.createBackup({
        outputDirectory: testBackupDir,
        compress: true
      });

      // Clear database
      await db.collection('primary').deleteMany({});
      await db.collection('data').deleteMany({});

      // Restore compressed backup
      await backupManager.restoreBackup(compressedBackupPath);

      const primaryDocs = await db.collection('primary').find({}).toArray();
      expect(primaryDocs.length).toBe(2);
    });

    it('should validate restoration', async () => {
      await backupManager.restoreBackup(backupPath, {
        validateAfterRestore: true
      });

      // If validation fails, it should throw an error
      // If we reach here, validation passed
      const primaryCount = await db.collection('primary').countDocuments();
      const dataCount = await db.collection('data').countDocuments();
      
      expect(primaryCount).toBe(2);
      expect(dataCount).toBe(1);
    });
  });

  describe('listBackups', () => {
    it('should list available backups', async () => {
      // Create multiple backups
      await db.collection('primary').insertOne(global.testUtils.generateTestData.user('user1'));
      
      await backupManager.createBackup({
        outputDirectory: testBackupDir
      });
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await backupManager.createBackup({
        outputDirectory: testBackupDir
      });

      const backups = await backupManager.listBackups(testBackupDir);

      expect(backups.length).toBeGreaterThanOrEqual(2);
      expect(backups[0].database).toBe(testDbName);
      expect(backups[1].database).toBe(testDbName);
      
      // Should be sorted by timestamp (newest first)
      expect(new Date(backups[0].timestamp).getTime()).toBeGreaterThan(
        new Date(backups[1].timestamp).getTime()
      );
    });

    it('should return empty array for non-existent directory', async () => {
      const backups = await backupManager.listBackups('./non-existent-directory');
      expect(backups).toEqual([]);
    });

    it('should ignore invalid backup directories', async () => {
      // Create a directory that looks like a backup but has no metadata
      const invalidBackupDir = path.join(testBackupDir, 'backup-invalid');
      await fs.mkdir(invalidBackupDir, { recursive: true });
      await fs.writeFile(path.join(invalidBackupDir, 'data.json'), '{}');

      // Create a valid backup
      await db.collection('primary').insertOne(global.testUtils.generateTestData.user('user1'));
      await backupManager.createBackup({
        outputDirectory: testBackupDir
      });

      const backups = await backupManager.listBackups(testBackupDir);
      
      // Should have at least one valid backup (ignoring invalid ones)
      expect(backups.length).toBeGreaterThanOrEqual(1);
      expect(backups.every(backup => backup.database === testDbName)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle backup creation errors gracefully', async () => {
      // Try to backup to a path with invalid characters that will cause an error
      const invalidDir = '/dev/null/invalid-backup-path';
      
      await expect(backupManager.createBackup({
        outputDirectory: invalidDir
      })).rejects.toThrow();
    });

    it('should handle restore from non-existent backup', async () => {
      await expect(backupManager.restoreBackup('./non-existent-backup')).rejects.toThrow();
    });

    it('should handle corrupted backup metadata', async () => {
      // Create a backup directory with corrupted metadata
      const corruptedBackupDir = path.join(testBackupDir, 'backup-corrupted');
      await fs.mkdir(corruptedBackupDir, { recursive: true });
      await fs.writeFile(path.join(corruptedBackupDir, 'metadata.json'), 'invalid json');
      await fs.writeFile(path.join(corruptedBackupDir, 'data.json'), '{}');

      await expect(backupManager.restoreBackup(corruptedBackupDir)).rejects.toThrow();
    });

    it('should handle checksum validation failure', async () => {
      // Create a backup
      await db.collection('primary').insertOne(global.testUtils.generateTestData.user('user1'));
      const backupPath = await backupManager.createBackup({
        outputDirectory: testBackupDir,
        compress: false
      });

      // Corrupt the data file
      const dataPath = path.join(backupPath, 'data.json');
      await fs.writeFile(dataPath, '{"corrupted": "data"}');

      // Should fail checksum validation
      await expect(backupManager.restoreBackup(backupPath)).rejects.toThrow(/checksum/i);
    });
  });
});