/**
 * Jest global setup
 * Runs once before all tests
 */

import { MongoClient } from 'mongodb';

import { getConfig } from '../config';

export default async function globalSetup() {
  console.log('Setting up test environment...');
  
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Load configuration
  const config = getConfig();
  
  // Set dynamic test database name
  process.env.TEST_DB_NAME = 'mytaptrack_test_' + Date.now();
  
  // Verify MongoDB connection
  try {
    const mongoUrl = config.testMongoUrl || config.mongoUrl;
    const client = new MongoClient(mongoUrl);
    await client.connect();
    
    // Test basic operations
    const db = client.db(process.env.TEST_DB_NAME);
    await db.collection('test').insertOne({ test: true });
    await db.collection('test').deleteOne({ test: true });
    
    await client.close();
    console.log('MongoDB connection verified');
  } catch (error) {
    console.error('Failed to connect to MongoDB for testing:', error);
    console.error('Make sure MongoDB is running and accessible at:', config.testMongoUrl || config.mongoUrl);
    throw error;
  }
}