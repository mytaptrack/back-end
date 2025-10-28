/**
 * Configuration utility for database scripts
 * Loads environment variables from .env files
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment-specific .env file
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = `.env.${nodeEnv}`;

// Load .env first (as defaults)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Then load environment-specific file (overrides defaults)
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

export interface DatabaseConfig {
  mongoUrl: string;
  mongoDb: string;
  testMongoUrl?: string;
  testDbName?: string;
  awsRegion: string;
  awsProfile?: string;
  backupDirectory: string;
  logLevel: string;
  nodeEnv: string;
}

export function getConfig(): DatabaseConfig {
  return {
    mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017',
    mongoDb: process.env.MONGO_DB || 'mytaptrack',
    testMongoUrl: process.env.TEST_MONGO_URL,
    testDbName: process.env.TEST_DB_NAME,
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    awsProfile: process.env.AWS_PROFILE,
    backupDirectory: process.env.BACKUP_DIRECTORY || './backups',
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development'
  };
}

export function getMongoUrl(useTestDb: boolean = false): string {
  const config = getConfig();
  
  if (useTestDb && config.testMongoUrl) {
    return config.testMongoUrl;
  }
  
  return config.mongoUrl;
}

export function getDbName(useTestDb: boolean = false): string {
  const config = getConfig();
  
  if (useTestDb && config.testDbName) {
    return config.testDbName;
  }
  
  return config.mongoDb;
}

export function validateConfig(): void {
  const config = getConfig();
  const errors: string[] = [];

  if (!config.mongoUrl) {
    errors.push('MONGO_URL is required');
  }

  if (!config.mongoDb) {
    errors.push('MONGO_DB is required');
  }

  if (config.nodeEnv === 'test' && !config.testMongoUrl) {
    errors.push('TEST_MONGO_URL is required for test environment');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Auto-validate configuration on import
try {
  validateConfig();
} catch (error) {
  console.warn('Configuration validation warning:', error instanceof Error ? error.message : error);
}