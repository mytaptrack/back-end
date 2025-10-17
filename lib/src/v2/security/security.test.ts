/**
 * Security Module Tests
 * Comprehensive tests for all security components
 */

import {
  DefaultAccessControlProvider,
  createSecurityContext,
  createOperationDefinition,
  createResourceDefinition
} from './access-control';

import {
  FieldEncryption,
  DefaultKeyManager,
  createFieldEncryption
} from './field-encryption';

import {
  DefaultAuditLogger,
  createAuditLogger
} from './audit-logger';

import {
  DefaultCredentialManager,
  createCredentialManager,
  createDatabaseCredentials
} from './credential-manager';

import {
  DefaultTLSEnforcement,
  TLS_PROFILES
} from './tls-enforcement';

import {
  SecureDataAccessLayer,
  createSecureDAL
} from './secure-dal';

// Mock DAL for testing
class MockDAL {
  async connect() {}
  async disconnect() {}
  isConnected() { return true; }
  getProviderType() { return 'dynamodb' as const; }
  async healthCheck() {
    return {
      healthy: true,
      provider: 'dynamodb' as const,
      connectionStatus: 'connected' as const,
      metrics: { averageResponseTime: 10, errorRate: 0, connectionCount: 1 }
    };
  }
  async get(key: any) { return { id: key.primary, data: 'test' }; }
  async put(data: any) {}
  async update(input: any) {}
  async delete(key: any) {}
  async query(input: any) { return [{ id: '1', data: 'test' }]; }
  async scan(input: any) { return { items: [{ id: '1', data: 'test' }] }; }
  async batchGet(keys: any[]) { return keys.map(k => ({ id: k.primary, data: 'test' })); }
  async beginTransaction() { return new MockTransaction(); }
  async executeTransaction(operations: any[]) {}
  async executeNative(operation: any) { return {}; }
}

class MockTransaction {
  async get(key: any) { return { id: key.primary, data: 'test' }; }
  async put(data: any) {}
  async update(input: any) {}
  async delete(key: any) {}
  async conditionCheck(key: any, condition: any) {}
  async commit() {}
  async rollback() {}
  isActive() { return true; }
}

describe('Security Module Tests', () => {
  describe('Access Control', () => {
    let accessControl: DefaultAccessControlProvider;

    beforeEach(() => {
      accessControl = new DefaultAccessControlProvider();
    });

    test('should allow admin access to all resources', async () => {
      const context = createSecurityContext('user1', 'admin');
      const operation = createOperationDefinition(
        'read',
        createResourceDefinition('record', 'test-record')
      );

      const result = await accessControl.validateAccess(operation, context);
      expect(result.allowed).toBe(true);
    });

    test('should deny access for insufficient permissions', async () => {
      const context = createSecurityContext('user1', 'readonly');
      const operation = createOperationDefinition(
        'write',
        createResourceDefinition('record', 'test-record')
      );

      const result = await accessControl.validateAccess(operation, context);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Missing required permission');
    });

    test('should validate field-level access', async () => {
      const context = createSecurityContext('user1', 'user');
      const fieldAccess = await accessControl.validateFieldAccess(
        ['ssn', 'name'],
        'read',
        context
      );

      expect(fieldAccess.ssn).toBe(false); // SSN restricted to admin
      expect(fieldAccess.name).toBe(true);  // Name allowed for all
    });

    test('should manage user permissions', async () => {
      accessControl.setUserPermissions('user1', ['read:own', 'write:own']);
      
      const hasPermission = await accessControl.hasPermission('read:own', 
        createSecurityContext('user1'));
      expect(hasPermission).toBe(true);
    });
  });

  describe('Field Encryption', () => {
    let fieldEncryption: FieldEncryption;

    beforeEach(() => {
      fieldEncryption = createFieldEncryption();
    });

    test('should encrypt and decrypt field values', async () => {
      const originalValue = 'sensitive-data';
      const fieldName = 'ssn';

      const encrypted = await fieldEncryption.encryptField(originalValue, fieldName);
      expect(encrypted.encrypted).toBe(true);
      expect(encrypted.value).not.toBe(originalValue);

      const decrypted = await fieldEncryption.decryptField(encrypted, fieldName);
      expect(decrypted).toBe(originalValue);
    });

    test('should encrypt multiple fields in an object', async () => {
      const data = {
        name: 'John Doe',
        ssn: '123-45-6789',
        email: 'john@example.com'
      };

      const encrypted = await fieldEncryption.encryptFields(data, ['ssn', 'email']);
      
      expect(encrypted.name).toBe('John Doe'); // Not encrypted
      expect(fieldEncryption.isEncryptedField(encrypted.ssn)).toBe(true);
      expect(fieldEncryption.isEncryptedField(encrypted.email)).toBe(true);
    });

    test('should decrypt multiple fields in an object', async () => {
      const data = {
        name: 'John Doe',
        ssn: '123-45-6789',
        email: 'john@example.com'
      };

      const encrypted = await fieldEncryption.encryptFields(data, ['ssn', 'email']);
      const decrypted = await fieldEncryption.decryptFields(encrypted);

      expect(decrypted.name).toBe('John Doe');
      expect(decrypted.ssn).toBe('123-45-6789');
      expect(decrypted.email).toBe('john@example.com');
    });

    test('should identify encrypted fields', () => {
      const encryptedField = {
        encrypted: true,
        value: 'encrypted-data',
        metadata: {
          algorithm: 'aes-256-cbc',
          iv: 'iv-data',
          salt: 'salt-data',
          version: 1
        }
      };

      expect(fieldEncryption.isEncryptedField(encryptedField)).toBe(true);
      expect(fieldEncryption.isEncryptedField('plain-text')).toBe(false);
    });
  });

  describe('Audit Logger', () => {
    let auditLogger: DefaultAuditLogger;

    beforeEach(() => {
      auditLogger = createAuditLogger();
    });

    test('should log database operations', async () => {
      const context = createSecurityContext('user1', 'admin');
      
      await auditLogger.logDatabaseOperation(
        'READ',
        'GET_RECORD',
        { type: 'record', identifier: 'test-record' },
        context,
        { success: true, duration: 100 }
      );

      const logs = await auditLogger.queryLogs({});
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('READ');
      expect(logs[0].operation).toBe('GET_RECORD');
      expect(logs[0].userId).toBe('user1');
    });

    test('should log authentication events', async () => {
      const context = createSecurityContext('user1');
      
      await auditLogger.logAuthenticationEvent(true, context);

      const logs = await auditLogger.queryLogs({ eventType: 'AUTHENTICATION' });
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('SUCCESS');
    });

    test('should log authorization events', async () => {
      const context = createSecurityContext('user1', 'user');
      
      await auditLogger.logAuthorizationEvent(
        'READ',
        'test-resource',
        false,
        context,
        'Insufficient permissions'
      );

      const logs = await auditLogger.queryLogs({ eventType: 'AUTHORIZATION' });
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('FAILURE');
      expect(logs[0].metadata?.reason).toBe('Insufficient permissions');
    });

    test('should generate audit statistics', async () => {
      // Create a fresh audit logger for this test
      const testAuditLogger = createAuditLogger();
      const context = createSecurityContext('user1');
      
      // Log some events
      await testAuditLogger.logDatabaseOperation('READ', 'GET', 
        { type: 'record', identifier: 'test' }, context, { success: true });
      await testAuditLogger.logDatabaseOperation('WRITE', 'PUT', 
        { type: 'record', identifier: 'test' }, context, { success: false });

      // Use a time range that includes the events we just logged
      const timeRange = {
        start: new Date(Date.now() - 60 * 1000), // 1 minute ago
        end: new Date(Date.now() + 60 * 1000)    // 1 minute from now
      };

      const stats = await testAuditLogger.getAuditStatistics(timeRange);
      expect(stats.totalEvents).toBe(2);
      expect(stats.eventsByType.READ).toBe(1);
      expect(stats.eventsByType.WRITE).toBe(1);
      expect(stats.errorRate).toBe(50);
    });

    test('should filter logs by criteria', async () => {
      const context1 = createSecurityContext('user1');
      const context2 = createSecurityContext('user2');

      await auditLogger.logDatabaseOperation('READ', 'GET', 
        { type: 'record', identifier: 'test' }, context1, { success: true });
      await auditLogger.logDatabaseOperation('WRITE', 'PUT', 
        { type: 'record', identifier: 'test' }, context2, { success: true });

      const user1Logs = await auditLogger.queryLogs({ userId: 'user1' });
      expect(user1Logs).toHaveLength(1);
      expect(user1Logs[0].userId).toBe('user1');

      const readLogs = await auditLogger.queryLogs({ eventType: 'READ' });
      expect(readLogs).toHaveLength(1);
      expect(readLogs[0].eventType).toBe('READ');
    });
  });

  describe('Credential Manager', () => {
    let credentialManager: DefaultCredentialManager;

    beforeEach(() => {
      credentialManager = createCredentialManager();
    });

    test('should store and retrieve credentials', async () => {
      const credentials = createDatabaseCredentials('mongodb', {
        connectionString: 'mongodb://localhost:27017/test',
        database: 'test'
      });

      const id = await credentialManager.storeCredential(
        'test-db',
        'database',
        credentials
      );

      const retrieved = await credentialManager.getCredential('test-db');
      expect(retrieved.type).toBe('mongodb');
      expect(retrieved.database).toBe('test');
    });

    test('should encrypt credentials by default', async () => {
      const secret = 'super-secret-password';
      
      await credentialManager.storeCredential('test-secret', 'secret', secret);
      
      // The stored credential should be encrypted
      const credentials = await credentialManager.exportCredentials(true);
      const storedCred = credentials.find(c => c.name === 'test-secret');
      expect(storedCred?.encrypted).toBe(true);
      expect(storedCred?.value).not.toBe(secret);

      // But retrieval should return the original value
      const retrieved = await credentialManager.getCredential('test-secret');
      expect(retrieved).toBe(secret);
    });

    test('should validate credential formats', () => {
      const validDbCred = { type: 'mongodb', connectionString: 'mongodb://localhost' };
      const invalidDbCred = { type: 'invalid' };

      expect(credentialManager.validateCredential('database', validDbCred)).toBe(true);
      expect(credentialManager.validateCredential('database', invalidDbCred)).toBe(false);
      expect(credentialManager.validateCredential('api_key', 'valid-key')).toBe(true);
      expect(credentialManager.validateCredential('api_key', '')).toBe(false);
    });

    test('should manage credential lifecycle', async () => {
      const id = await credentialManager.storeCredential(
        'test-cred',
        'api_key',
        'initial-key'
      );

      // Update credential
      await credentialManager.updateCredential('test-cred', 'updated-key');
      const updated = await credentialManager.getCredential('test-cred');
      expect(updated).toBe('updated-key');

      // Rotate credential
      await credentialManager.rotateCredential('test-cred', 'rotated-key');
      const rotated = await credentialManager.getCredential('test-cred');
      expect(rotated).toBe('rotated-key');

      // Delete credential
      await credentialManager.deleteCredential('test-cred');
      const exists = await credentialManager.hasCredential('test-cred');
      expect(exists).toBe(false);
    });

    test('should list credentials without exposing values', async () => {
      await credentialManager.storeCredential('cred1', 'api_key', 'key1');
      await credentialManager.storeCredential('cred2', 'secret', 'secret1');

      const list = await credentialManager.listCredentials();
      expect(list).toHaveLength(2);
      expect(list.every(c => !('value' in c))).toBe(true);

      const apiKeys = await credentialManager.listCredentials('api_key');
      expect(apiKeys).toHaveLength(1);
      expect(apiKeys[0].type).toBe('api_key');
    });
  });

  describe('TLS Enforcement', () => {
    let tlsEnforcement: DefaultTLSEnforcement;

    beforeEach(() => {
      tlsEnforcement = new DefaultTLSEnforcement();
    });

    test('should validate TLS configurations', async () => {
      const secureConfig = TLS_PROFILES.SECURE;
      const validation = await tlsEnforcement.validateTLSConfig(secureConfig);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      const insecureConfig = {
        enabled: true,
        minVersion: 'TLSv1.0', // Insecure
        rejectUnauthorized: false,
        verifyMode: 'none' as const
      };
      const insecureValidation = await tlsEnforcement.validateTLSConfig(insecureConfig);
      expect(insecureValidation.valid).toBe(false);
      expect(insecureValidation.errors.length).toBeGreaterThan(0);
    });

    test('should provide recommended configurations', () => {
      const mongoConfig = tlsEnforcement.getRecommendedConfig('mongodb');
      expect(mongoConfig.enabled).toBe(true);
      expect(mongoConfig.minVersion).toBe('TLSv1.2');
      expect(mongoConfig.rejectUnauthorized).toBe(true);

      const mysqlConfig = tlsEnforcement.getRecommendedConfig('mysql');
      expect(mysqlConfig.enabled).toBe(true);
      expect(mysqlConfig.verifyMode).toBe('required');
    });

    test('should create TLS options from configuration', async () => {
      const config = TLS_PROFILES.SECURE;
      const options = await tlsEnforcement.createTLSOptions(config);
      
      expect(options.minVersion).toBe('TLSv1.2');
      expect(options.maxVersion).toBe('TLSv1.3');
      expect(options.rejectUnauthorized).toBe(true);
      expect(options.ciphers).toBeDefined();
    });

    test('should monitor TLS health', async () => {
      const health = await tlsEnforcement.monitorTLSHealth();
      
      expect(health).toHaveProperty('connectionsSecure');
      expect(health).toHaveProperty('connectionsInsecure');
      expect(health).toHaveProperty('certificateExpirations');
      expect(health).toHaveProperty('weakCiphers');
      expect(Array.isArray(health.certificateExpirations)).toBe(true);
      expect(Array.isArray(health.weakCiphers)).toBe(true);
    });
  });

  describe('Secure DAL Integration', () => {
    let secureDAL: SecureDataAccessLayer;
    let mockDAL: MockDAL;
    let accessControl: DefaultAccessControlProvider;
    let auditLogger: DefaultAuditLogger;
    let fieldEncryption: FieldEncryption;

    beforeEach(() => {
      mockDAL = new MockDAL();
      accessControl = new DefaultAccessControlProvider();
      auditLogger = createAuditLogger();
      fieldEncryption = createFieldEncryption();

      secureDAL = createSecureDAL(mockDAL as any, {
        accessControl: {
          enabled: true,
          provider: accessControl
        },
        auditLogging: {
          enabled: true,
          provider: auditLogger,
          logAllOperations: true,
          logDataAccess: true
        },
        fieldEncryption: {
          enabled: true,
          provider: fieldEncryption,
          encryptionProfiles: ['PII'],
          fieldsToEncrypt: ['ssn', 'creditCard']
        }
      });
    });

    test('should enforce access control on operations', async () => {
      const context = createSecurityContext('user1', 'readonly');
      
      // Should allow read
      await expect(secureDAL.get({ primary: 'test' }, undefined, context))
        .resolves.toBeDefined();

      // Should deny write
      await expect(secureDAL.put({ id: 'test', data: 'value' }, undefined, context))
        .rejects.toThrow('Access denied');
    });

    test('should encrypt sensitive fields automatically', async () => {
      const context = createSecurityContext('user1', 'admin');
      const data = {
        id: 'user1',
        name: 'John Doe',
        ssn: '123-45-6789',
        email: 'john@example.com'
      };

      // Mock the put method to capture the encrypted data
      const originalPut = mockDAL.put;
      let capturedData: any;
      mockDAL.put = async (data: any) => {
        capturedData = data;
        return originalPut.call(mockDAL, data);
      };

      await secureDAL.put(data, undefined, context);

      // SSN should be encrypted (it's in the fieldsToEncrypt list)
      expect(fieldEncryption.isEncryptedField(capturedData.ssn)).toBe(true);
      // Name should not be encrypted
      expect(capturedData.name).toBe('John Doe');
    });

    test('should decrypt fields on retrieval', async () => {
      const context = createSecurityContext('user1', 'admin');
      
      // Mock encrypted data
      const encryptedSSN = await fieldEncryption.encryptField('123-45-6789', 'ssn');
      const mockData = {
        id: 'user1',
        name: 'John Doe',
        ssn: encryptedSSN,
        data: 'test'
      };

      // Mock the get method to return encrypted data
      mockDAL.get = async () => mockData;

      const result = await secureDAL.get({ primary: 'user1' }, undefined, context) as any;

      // SSN should be decrypted
      expect(result.ssn).toBe('123-45-6789');
      expect(result.name).toBe('John Doe');
    });

    test('should log all operations for audit', async () => {
      const context = createSecurityContext('user1', 'admin');
      
      await secureDAL.get({ primary: 'test' }, undefined, context);
      await secureDAL.put({ id: 'test', data: 'value' }, undefined, context);

      const logs = await auditLogger.queryLogs({});
      expect(logs.length).toBeGreaterThanOrEqual(4); // 2 operations + 2 authorization events
      
      const operationLogs = logs.filter(log => 
        log.eventType === 'READ' || log.eventType === 'CREATE'
      );
      expect(operationLogs).toHaveLength(2);
    });

    test('should handle transactions securely', async () => {
      const context = createSecurityContext('user1', 'admin');
      
      const transaction = await secureDAL.beginTransaction(context);
      
      await transaction.put({ id: 'test1', data: 'value1' });
      await transaction.put({ id: 'test2', data: 'value2' });
      await transaction.commit();

      const logs = await auditLogger.queryLogs({ eventType: 'TRANSACTION_START' });
      expect(logs).toHaveLength(1);
    });

    test('should validate batch operations', async () => {
      const context = createSecurityContext('user1', 'admin');
      const keys = [{ primary: 'test1' }, { primary: 'test2' }];
      
      const results = await secureDAL.batchGet(keys, undefined, context);
      expect(results).toHaveLength(2);

      const logs = await auditLogger.queryLogs({ eventType: 'BATCH_READ' });
      expect(logs).toHaveLength(1);
    });

    test('should allow configuration updates', () => {
      const newConfig = {
        accessControl: {
          enabled: false,
          provider: accessControl
        }
      };

      secureDAL.updateSecurityConfig(newConfig);
      const config = secureDAL.getSecurityConfig();
      
      expect(config.accessControl?.enabled).toBe(false);
    });
  });
});