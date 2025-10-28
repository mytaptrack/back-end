/**
 * Jest global teardown
 * Runs once after all tests
 */

import { MongoClient } from 'mongodb';
import { getConfig } from '../config';

export default async function globalTeardown() {
  console.log('Cleaning up test environment...');
  
  // Clean up test databases
  const config = getConfig();
  const mongoUrl = config.testMongoUrl || config.mongoUrl;
  
  if (mongoUrl && process.env.TEST_DB_NAME) {
    try {
      const client = new MongoClient(mongoUrl);
      await client.connect();
      
      // Drop test database
      await client.db(process.env.TEST_DB_NAME).dropDatabase();
      
      // Clean up any other test databases that might have been created
      const admin = client.db().admin();
      const databases = await admin.listDatabases();
      
      for (const db of databases.databases) {
        if (db.name.startsWith('mytaptrack_test_')) {
          await client.db(db.name).dropDatabase();
          console.log(`Cleaned up test database: ${db.name}`);
        }
      }
      
      await client.close();
      console.log('Test cleanup completed');
    } catch (error) {
      console.error('Error during test cleanup:', error);
    }
  }
}