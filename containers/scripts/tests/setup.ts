/**
 * Jest test setup file
 * Configures test environment and utilities
 */

import { MongoClient } from 'mongodb';

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidDocument(): R;
      toHaveValidIndexes(): R;
    }
  }
}

// Extend expect
declare module 'expect' {
  interface Matchers<R> {
    toBeValidDocument(): R;
    toHaveValidIndexes(): R;
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidDocument(received: any) {
    const pass = received && 
                 typeof received.pk === 'string' && 
                 typeof received.sk === 'string' && 
                 typeof received.pksk === 'string' && 
                 typeof received.version === 'number';
    
    if (pass) {
      return {
        message: () => `Expected document not to be valid`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected document to be valid (have pk, sk, pksk, version fields)`,
        pass: false,
      };
    }
  },

  async toHaveValidIndexes(received: any) {
    if (!received || typeof received.listIndexes !== 'function') {
      return {
        message: () => `Expected a MongoDB collection`,
        pass: false,
      };
    }

    const indexes = await received.listIndexes().toArray();
    const hasRequiredIndexes = indexes.some(idx => idx.name === 'pk_sk_index');
    
    if (hasRequiredIndexes) {
      return {
        message: () => `Expected collection not to have valid indexes`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected collection to have required indexes`,
        pass: false,
      };
    }
  },
});

import { getConfig } from '../config';

// Global test utilities
global.testUtils = {
  async connectToTestDB(): Promise<MongoClient> {
    const config = getConfig();
    const mongoUrl = config.testMongoUrl || config.mongoUrl;
    const client = new MongoClient(mongoUrl);
    await client.connect();
    return client;
  },

  async cleanupTestDB(client: MongoClient, dbName: string): Promise<void> {
    const db = client.db(dbName);
    await db.dropDatabase();
  },

  generateTestData: {
    user: (id: string) => ({
      pk: `U#${id}`,
      sk: 'P',
      pksk: `U#${id}#P`,
      version: 1,
      userId: id,
      license: 'test-license',
      data: {
        email: `${id}@test.com`,
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        status: 'active'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }),

    student: (id: string) => ({
      pk: `S#${id}`,
      sk: 'P',
      pksk: `S#${id}#P`,
      version: 1,
      studentId: id,
      license: 'test-license',
      data: {
        firstName: 'Test',
        lastName: 'Student',
        grade: '5',
        status: 'active'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }),

    device: (id: string) => ({
      pk: `D#${id}`,
      sk: 'P',
      pksk: `D#${id}#P`,
      version: 1,
      license: 'test-license',
      data: {
        deviceId: id,
        serialNumber: `TEST${id}`,
        model: 'TestTracker',
        status: 'active',
        batteryLevel: 85
      },
      createdAt: new Date(),
      updatedAt: new Date()
    })
  }
};

// Declare global types
declare global {
  var testUtils: {
    connectToTestDB(): Promise<MongoClient>;
    cleanupTestDB(client: MongoClient, dbName: string): Promise<void>;
    generateTestData: {
      user: (id: string) => any;
      student: (id: string) => any;
      device: (id: string) => any;
    };
  };
}