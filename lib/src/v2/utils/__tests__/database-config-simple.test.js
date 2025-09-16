/**
 * Simple tests for database configuration management system
 */

const { 
  DatabaseConfigHelper, 
  DatabaseConfigPresets 
} = require('../database-config-helper');
const { 
  DatabaseProviderFactory 
} = require('../database-factory');

describe('Database Configuration Management', () => {
  describe('DatabaseConfigHelper', () => {
    it('should create DynamoDB configuration', () => {
      const config = DatabaseConfigHelper.createDynamoDBConfig({
        primaryTable: 'test-primary',
        dataTable: 'test-data',
        region: 'us-west-2'
      });

      expect(config.provider).toBe('dynamodb');
      expect(config.dynamodb.region).toBe('us-west-2');
      expect(config.dynamodb.primaryTable).toBe('test-primary');
      expect(config.dynamodb.dataTable).toBe('test-data');
    });

    it('should create MongoDB configuration', () => {
      const config = DatabaseConfigHelper.createMongoDBConfig({
        connectionString: 'mongodb://localhost:27017',
        database: 'test-db'
      });

      expect(config.provider).toBe('mongodb');
      expect(config.mongodb.connectionString).toBe('mongodb://localhost:27017');
      expect(config.mongodb.database).toBe('test-db');
    });

    it('should validate environment for DynamoDB', () => {
      const result = DatabaseConfigHelper.validateEnvironmentForProvider('dynamodb');
      
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('missing');
      expect(Array.isArray(result.missing)).toBe(true);
    });

    it('should validate environment for MongoDB', () => {
      const result = DatabaseConfigHelper.validateEnvironmentForProvider('mongodb');
      
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('missing');
      expect(Array.isArray(result.missing)).toBe(true);
    });

    it('should generate environment template', () => {
      const template = DatabaseConfigHelper.generateEnvironmentTemplate('dynamodb');
      
      expect(template).toHaveProperty('DB_PROVIDER');
      expect(template.DB_PROVIDER).toBe('dynamodb');
      expect(template).toHaveProperty('DYNAMODB_REGION');
      expect(template).toHaveProperty('DYNAMODB_PRIMARY_TABLE');
    });
  });

  describe('DatabaseConfigPresets', () => {
    it('should create development preset', () => {
      const config = DatabaseConfigPresets.development('dynamodb');
      
      expect(config.provider).toBe('dynamodb');
      expect(config.dynamodb.primaryTable).toBe('dev-primary');
      expect(config.dynamodb.dataTable).toBe('dev-data');
    });

    it('should create testing preset', () => {
      const config = DatabaseConfigPresets.testing('mongodb');
      
      expect(config.provider).toBe('mongodb');
      expect(config.migration.enabled).toBe(true);
    });
  });

  describe('DatabaseProviderFactory', () => {
    it('should return supported providers', () => {
      const providers = DatabaseProviderFactory.getSupportedProviders();
      
      expect(Array.isArray(providers)).toBe(true);
      expect(providers).toContain('dynamodb');
      expect(providers).toContain('mongodb');
    });

    it('should check if provider is supported', () => {
      expect(DatabaseProviderFactory.isProviderSupported('dynamodb')).toBe(true);
      expect(DatabaseProviderFactory.isProviderSupported('mongodb')).toBe(true);
      expect(DatabaseProviderFactory.isProviderSupported('invalid')).toBe(false);
    });
  });
});